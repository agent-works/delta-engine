您提出的这几个问题非常深刻，直击了将会话（Session）模型引入一个无状态架构的核心挑战。这些问题涵盖了**开发者体验、信息架构和系统鲁棒性**三个关键层面。

下面我将逐一进行详细阐述，并提出一套符合 Delta Engine 哲学的、严谨可行的解决方案。

-----

### 1\. 抽象 `session.start`：引入 `stateful: true` 字段

您的提议非常棒，这是一个能极大改善开发者体验（DX）的优雅抽象。将 `session.start` 等底层机制对用户隐藏，是完全符合“组合优于内建”和“简约接口”原则的。

我们可以通过在 `config.yaml` 的工具定义中增加一个布尔字段 `stateful: true` 来实现这一点。

#### **实现方案**

**`config.yaml` 定义演进：**

```yaml
# config.yaml
tools:
  - name: interactive_shell
    description: "启动或在一个持久化的交互式 bash shell 中执行命令。"
    # [核心] 新增 stateful 字段
    stateful: true
    # [核心] command 直接定义要执行的程序
    command: ["bash", "-i"]
    parameters:
      # [可选] 用于在现有会话中执行命令
      - name: command_to_send
        type: string
        description: "要发送到 shell 的命令。如果为空，则启动新会话。"
        inject_as: stdin # 使用 stdin 传递给 session.send
      # [可选] 用于指定会话
      - name: session_id
        type: string
        description: "要操作的会话ID。如果为空，则使用或创建默认会话。"
        inject_as: option
        option_name: "--session-id"
```

**`delta` 引擎的内部行为：**

当引擎遇到一个被调用的、且标记为 `stateful: true` 的工具时，其行为会发生改变：

1.  **首次调用（无 `session_id`）：**

      * 引擎**隐式调用**内部的 `session.start` 逻辑，使用工具定义的 `command` (`["bash", "-i"]`) 来启动进程。
      * 创建一个 `session_id`。
      * `ACTION_RESULT` 的 `observation_content` 将会是：`"Session started with session_id: shell_xyz123. You can now send commands."`

2.  **后续调用（有 `session_id`）：**

      * 当 Agent 在下一次调用该工具时，如果提供了 `session_id` 和 `command_to_send` 参数...
      * 引擎**隐式调用**内部的 `session.send` 逻辑，将 `command_to_send` 的内容发送到指定的会话。
      * `ACTION_RESULT` 返回的是命令的输出，与之前定义的一样。

这个方案将底层的 `session.*` 工具集变成了引擎的内部实现细节，为 Agent 开发者提供了更简洁、更符合直觉的接口。

-----

### 2\. Journal 的记录原则：意图与观察的简洁记录

您的原则非常正确：`journal.jsonl` 是 Agent 的“工作记忆”，必须保持简洁，只记录对上下文推理有价值的信息。

对于状态化会话，Journal 应该记录的是**Agent 的意图 (Intent)** 和 **关键的观察结果 (Observation)**，而不是底层的 I/O 细节。

#### **Journal 记录内容**

1.  **启动会话 (Intent & Observation):**

      * `ACTION_REQUEST`: 记录 Agent **想要启动一个会话**的意图。`tool_name: "interactive_shell"`。
      * `ACTION_RESULT`: 记录会话启动的**关键结果**，即 `session_id`。`observation_content: "Session started with session_id: shell_xyz123."`。这个 ID 是后续交互的唯一凭证，对上下文至关重要。

2.  **发送命令 (Intent & Observation):**

      * `ACTION_REQUEST`: 记录 Agent **想要在会话中执行某条命令**的意图。`tool_name: "interactive_shell"`, `tool_args: { session_id: "...", command_to_send: "ls -F" }`。
      * `ACTION_RESULT`: 记录执行命令后**对 Agent 有用的观察结果**，即 `stdout` 和 `stderr` 的输出。`observation_content: "data.csv report.md .delta/"`。

3.  **终止会话 (Intent & Observation):**

      * 为了明确生命周期，我们最好保留一个独立的、显式的 `session.end` 工具，或者在 stateful 工具中添加一个 `terminate: true` 的参数。显式工具更清晰。
      * `ACTION_REQUEST`: `tool_name: "session.end"`, `tool_args: { session_id: "..." }`。
      * `ACTION_RESULT`: `observation_content: "Session shell_xyz123 terminated."`。

#### **Journal 不记录什么**

  * PID、命名管道的路径、原始的 I/O 流等所有**实现细节**。
  * 这些细节都保存在 CWD 的 `.delta/sessions/<ID>/` 目录下。Journal 中的 `ACTION_RESULT` 可以通过 `execution_ref` 字段链接到这个目录，以供调试和审计，但不会污染 LLM 的上下文。

-----

### 3\. Session 生命周期与恢复策略

这是最关键的鲁棒性设计。我们需要为正常退出、临时退出和意外崩溃设计不同的、但逻辑一致的处理方案。

#### **A. 正常退出 (`delta run` 成功结束)**

  * **策略：** 自动清理。
  * **机制：** `delta` 引擎在主进程中维护一个当前运行创建的所有 `session_id` 的列表。当 `delta run` 即将正常退出时（例如 `status: "COMPLETED"`），它会触发一个清理程序，依次调用内部的 `session.end` 逻辑，终止所有由本次运行启动的后台进程，并清理 CWD 中的会话文件。这确保了不会产生僵尸进程。

#### **B. 临时退出 (Exit Code 101 等待用户输入)**

  * **策略：** 保持会话存活。
  * **机制：** 这种退出是计划内的暂停，而非终止。`delta` 引擎在退出前，**不会**执行会话清理程序。后台的 `bash`, `ssh` 等进程会继续运行。CWD 中的 `.delta/sessions/` 目录和里面的 `pid.txt` 文件是这些会话存活的物理证明。

#### **C. 意外退出 (崩溃) 与恢复**

  * **策略：** 状态核对与告知 Agent。
  * **机制：** 这是 Delta Engine 无状态核心和 CWD 设计优势的体现。
    1.  **重启 `delta run`:** 用户使用完全相同的命令重启 `delta run`。
    2.  **上下文恢复:** 引擎像往常一样，从 `journal.jsonl` 中读取历史，重建 Agent 的记忆。
    3.  **会话状态核对 (Reconciliation):** 在执行任何新的 T-A-O 循环之前，引擎会执行一个“会话核对”步骤：
          * 它扫描 `journal.jsonl`，找出所有被 `session.start`（或 `stateful: true` 工具）创建、但没有被 `session.end` 关闭的 `session_id`。这些是“理论上”应该存活的会话。
          * 对于每一个“理论存活”的 `session_id`，引擎去 `.delta/sessions/<ID>/` 目录下查找 `pid.txt`。
          * 引擎检查操作系统，看该 PID 对应的进程是否**真实存活**。
    4.  **处理差异：**
          * **如果进程存活：** 太好了。引擎可以无缝地继续与该会话交互。对 Agent 来说一切正常。
          * **如果进程已死亡 (关键场景):** 这意味着会话在崩溃中丢失了。此时，引擎**绝不能**假装一切正常。它必须将这个现实状况告知 Agent。
    5.  **注入 `SYSTEM_MESSAGE`:** 在 T-A-O 循环开始前，引擎会向上下文中注入一条 `SYSTEM_MESSAGE` 事件，该事件也会被记录到 `journal.jsonl` 中。
        ```json
        {
          "type": "SYSTEM_MESSAGE",
          "payload": {
            "level": "WARN",
            "content": "Recovery Notice: Session 'shell_xyz123' was found inactive and could not be reconnected. The underlying process has terminated. You may need to restart the session to continue related tasks."
          }
        }
        ```
    6.  **Agent 自我修复:** LLM 在构建下一步的思考（Thought）时，会看到这条系统警告。它会理解 `shell_xyz123` 这个会话句柄已经失效，并能智能地决定是重新创建一个新的 shell 会话，还是放弃之前的任务。

**总结：** 这个恢复逻辑将**系统状态的现实**（进程已死）转化为了**Agent 上下文的一部分**（一条警告信息），使得 Agent 能够利用其自身的推理能力来处理故障，而不是依赖于脆弱和复杂的外部恢复系统。这完美地贯彻了 Delta Engine 的核心哲学。