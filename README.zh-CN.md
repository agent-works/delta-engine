# Delta Engine

[English](README.md) | 简体中文

**一个极简的 AI Agent 开发平台 - 用 Unix 命令的方式构建 AI 智能体**

Delta 让你用最简单的方式创建 AI Agent：所有能力都是外部命令，所有交互都通过文件系统，所有状态都可以随时恢复。

---

## 5 分钟快速体验

```bash
# 1. 安装
npm install -g delta-engine

# 2. 创建你的第一个 Agent
delta init my-agent -t hello-world

# 3. 运行它
delta run --agent ./my-agent --task "创建一个问候文件"
```

**发生了什么？**
- Agent 读取了你的任务
- 使用 LLM 思考需要做什么
- 调用 `echo` 和 `ls` 等命令完成任务
- 所有过程记录在 `.delta/journal.jsonl` 中

**试试更多：**
```bash
# 让 Agent 使用 Python 分析数据
delta run --agent ./my-agent --task "计算 1 到 100 的平方和"

# 中断后可以随时恢复（Ctrl+C 后执行）
delta run --agent ./my-agent --task "同样的任务"  # 自动从断点继续
```

---

## 这能用来做什么？

### 1. 自动化运维任务
让 Agent 执行系统命令、分析日志、生成报告

**示例**：[hello-world](examples/1-basics/hello-world/) - 使用基础 Unix 命令的简单 Agent

### 2. 数据分析和处理
在 Python REPL 中迭代探索数据，Agent 会保持会话状态

**示例**：[python-repl](examples/2-core-features/python-repl/) - 持久化的 Python 交互环境

### 3. 代码审查和生成
通过生命周期 Hooks 定制审计流程，生成完整的审查报告

**示例**：[code-reviewer](examples/3-advanced/code-reviewer/) - 带审计日志的代码审查工具

### 4. 长期研究任务
使用记忆折叠（Memory Folding）压缩历史对话，在有限 token 下完成长期任务

**示例**：[research-agent](examples/3-advanced/research-agent/) - 带上下文压缩的研究助手

### 5. AI 编排 AI
创建能够调用其他 Agent 的 Meta-Agent，实现复杂的多步骤工作流

**示例**：[delta-agent-generator](examples/3-advanced/delta-agent-generator/) - 自动生成 Agent 的 Agent

---

## 为什么选择 Delta？

### 与其他 AI Agent 框架的不同

| 特性 | Delta Engine | 传统框架 |
|------|-------------|----------|
| **能力扩展** | 写任何 shell 脚本即可 | 需要写框架插件代码 |
| **状态管理** | 完全无状态，断点可恢复 | 依赖内存，中断即失败 |
| **调试方式** | 直接读 `.delta/journal.jsonl` | 需要专门的调试工具 |
| **学习成本** | 会用命令行即可 | 需要学习框架 API |
| **工具复用** | 所有 Unix 工具都能直接用 | 需要重新封装 |

### 核心优势

1. **极致简单**：所有 Agent 能力都是外部命令（`ls`、`cat`、`python` 等），不需要学习框架 API
2. **完全透明**：所有执行细节记录在 `.delta/` 目录，可以随时查看、分析、回溯
3. **完美恢复**：任何时候中断（Ctrl+C、断电、崩溃），都可以从断点继续执行

### 适合你如果你...

- ✅ 熟悉命令行工具，想快速构建 AI Agent
- ✅ 需要 Agent 执行长时间任务，中途可能中断
- ✅ 需要完整的审计日志和执行记录
- ✅ 想要 Agent 能调用任何已有的命令行工具
- ✅ 需要在 Agent 执行过程中插入人工审核

---

## 它是如何工作的？

Delta 基于三个核心原则（Three Pillars）：

### 1️⃣ Everything is a Command（一切皆命令）

Agent 的所有能力都通过外部命令实现，没有内置函数。

```yaml
# config.yaml - 定义 Agent 能做什么
tools:
  - name: list_files
    exec: "ls -la ${directory}"

  - name: analyze_data
    shell: "python analyze.py ${data_file} | tee report.txt"
```

任何命令行工具（`grep`、`awk`、`docker`、自定义脚本）都可以直接成为 Agent 的能力。

### 2️⃣ Environment as Interface（环境即接口）

Agent 通过工作目录（CWD）与外界交互，文件系统是通用接口。

```
my-agent/workspaces/W001/  ← Agent 的工作目录
├── input.txt              ← 输入文件
├── output.json            ← Agent 生成的结果
├── DELTA.md               ← 给 Agent 的动态指令
└── .delta/                ← 控制平面（日志、状态）
    ├── journal.jsonl      ← 完整执行历史
    └── metadata.json      ← 运行状态
```

所有数据可见、可修改、可版本控制，Agent 执行过程完全透明。

### 3️⃣ Composition Defines Intelligence（组合定义智能）

复杂的 Agent 行为通过组合多个单一功能的 Agent 来实现 - 而不是构建庞大的单体系统。

```yaml
# Meta-agent 编排其他 Agent
tools:
  - name: research_agent
    exec: "delta run --agent ./research-agent --task ${task}"

  - name: writer_agent
    exec: "delta run --agent ./writer-agent --task ${task}"
```

像搭乐高一样构建复杂的 AI 系统 - 每个 Agent 专注做好一件事，组合创造智能。

---

## 核心功能

### 🔄 断点恢复
任何时候中断（Ctrl+C、崩溃、关机），都可以无缝恢复：
```bash
delta run --agent ./my-agent --task "长时间任务"
# 执行被中断...
delta run --agent ./my-agent --task "长时间任务"  # 自动继续
```

### 👥 人机协作
Agent 可以在运行中向你提问，等待回复后继续：
```bash
delta run -i --agent ./my-agent --task "需要我确认的任务"
# Agent: "是否要删除这些文件？[yes/no]"
# 你输入回答，Agent 继续执行
```

### 🖥️ 持久化会话
使用 `delta-sessions` 创建持久的 Shell/REPL 环境：
```bash
delta-sessions start bash           # 创建 bash 会话
echo "cd /data && ls" | delta-sessions exec <session_id>
# 工作目录会保持在 /data
```

### 🧠 记忆折叠
通过外部脚本压缩历史对话，在长期任务中保持上下文：
```yaml
# context.yaml - 定义上下文组成策略
sources:
  - type: computed_file
    generator:
      command: ["python", "tools/summarize.py"]  # 压缩历史
    output_path: ".delta/context_artifacts/summary.md"

  - type: journal
    max_iterations: 5  # 只保留最近 5 轮完整对话
```

### 🔌 生命周期 Hooks
在关键时刻插入自定义逻辑：
```yaml
hooks:
  pre_llm_req:
    command: ["./check-budget.sh"]  # 每次调用 LLM 前检查预算
  post_tool_exec:
    command: ["./log-to-audit.sh"]  # 每次执行工具后记录审计
```

---

## 下一步学习

### 🎯 新手入门（5-15 分钟）
1. **[Quick Start](docs/QUICKSTART.md)** - 5 分钟教程，创建第一个 Agent
2. **[hello-world 示例](examples/1-basics/hello-world/)** - 理解 Delta 的三大原则

### 📚 进阶使用（30-60 分钟）
3. **[Agent Development Guide](docs/guides/agent-development.md)** - 完整的 Agent 开发指南
4. **[interactive-shell 示例](examples/2-core-features/interactive-shell/)** - 学习会话管理
5. **[memory-folding 示例](examples/2-core-features/memory-folding/)** - 学习上下文管理

### 🚀 高级特性（1-2 小时）
6. **[code-reviewer 示例](examples/3-advanced/code-reviewer/)** - 学习生命周期 Hooks
7. **[Architecture Overview](docs/architecture/README.md)** - 理解系统设计原理
8. **[delta-agent-generator 示例](examples/3-advanced/delta-agent-generator/)** - AI 编排 AI 的高级模式

### 📖 完整文档
- **[所有示例](examples/README.md)** - 8 个示例，从入门到高级
- **[API 参考](docs/api/)** - CLI 命令和配置格式完整文档
- **[架构文档](docs/architecture/)** - 设计哲学和技术细节

---

## 快速参考

### 常用命令

```bash
# 初始化
delta init <agent-name> -t <template>  # 从模板创建
delta init <agent-name>                # 空白 Agent

# 运行
delta run --agent <path> --task "任务描述"       # 基本运行
delta run -i --agent <path> --task "..."        # 交互模式
delta run -y --agent <path> --task "..."        # 静默模式（自动创建工作区）

# 版本信息
delta --version

# 会话管理
delta-sessions start [shell]         # 创建会话（默认 bash）
delta-sessions exec <session_id>     # 执行命令（从 stdin 读取）
delta-sessions end <session_id>      # 终止会话
delta-sessions list                  # 列出所有会话
```

### 调试和检查

```bash
# 查看运行状态
RUN_ID=$(cat .delta/LATEST)
cat .delta/$RUN_ID/metadata.json

# 查看执行历史
tail -50 .delta/$RUN_ID/journal.jsonl

# 查看 LLM 调用记录
ls -lht .delta/$RUN_ID/io/invocations/ | head -5

# 查看工具执行记录
ls -lht .delta/$RUN_ID/io/tool_executions/ | head -5

# 检查待处理的人工交互
ls -la .delta/interaction/
```

### Agent 目录结构

```
my-agent/
├── config.yaml              # 必需：Agent 配置（LLM、工具、Hooks）
├── system_prompt.md         # 必需：系统提示词（也可以是 .txt）
├── context.yaml             # 可选：上下文组成策略
├── tools/                   # 可选：自定义工具脚本
│   ├── analyze.py
│   └── summarize.sh
└── workspaces/              # 运行时生成：执行工作区
    ├── LAST_USED            # 记录最后使用的工作区
    ├── W001/                # 工作区 1（序号递增）
    │   ├── DELTA.md         # 可选：工作区级上下文
    │   ├── [你的文件]        # Agent 操作的文件
    │   └── .delta/          # 控制平面
    │       ├── VERSION      # 数据格式版本
    │       ├── LATEST       # 最新 run ID
    │       └── <run_id>/    # 单次运行记录
    │           ├── journal.jsonl        # 执行日志（核心）
    │           ├── metadata.json        # 运行元数据
    │           ├── engine.log           # 引擎日志
    │           └── io/                  # I/O 审计
    │               ├── invocations/     # LLM 调用
    │               ├── tool_executions/ # 工具执行
    │               └── hooks/           # Hook 执行
    └── W002/                # 工作区 2
```

### 工具配置语法速查

```yaml
# 方式 1: exec - 直接执行（推荐，最安全）
- name: list_files
  exec: "ls -F ${directory}"

# 方式 2: shell - Shell 解释（用于管道、重定向）
- name: count_lines
  shell: "cat ${file} | wc -l"

# 使用 stdin 参数
- name: write_file
  exec: "tee ${filename}"
  stdin: content  # content 参数从 stdin 注入

# :raw 修饰符（用于传递命令行标志列表）
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
  # LLM 传入: flags="-p 8080:80 -d"
  # 实际执行: docker run -p 8080:80 -d nginx

# 完整语法（复杂场景）
- name: search
  command: [grep, -r]
  parameters:
    - name: pattern
      type: string
      inject_as: argument
    - name: directory
      type: string
      inject_as: argument
```

详见：[Configuration Reference](docs/api/config.md)

---

## 技术要求

- **Node.js** 20+
- **TypeScript** 5+（仅开发需要）
- **操作系统**：Linux / macOS / WSL

---

## 项目信息

- **当前版本**：v1.7
- **许可证**：MIT
- **仓库**：[GitHub](https://github.com/agent-works/delta-engine)
- **问题反馈**：[Issues](https://github.com/agent-works/delta-engine/issues)
- **贡献指南**：[CONTRIBUTING.md](CONTRIBUTING.md)
- **变更日志**：[CHANGELOG.md](CHANGELOG.md)

---

## 社区与支持

- **文档**：[docs/](docs/)
- **示例**：[examples/](examples/)
- **讨论**：[GitHub Discussions](https://github.com/agent-works/delta-engine/discussions)
- **博客**：查看 `docs/architecture/philosophy-02-whitepaper.md` 了解设计哲学

