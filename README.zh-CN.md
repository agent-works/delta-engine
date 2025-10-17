# Delta Engine

[English](README.md) | 简体中文

**一个极简的 AI Agent 开发平台 - 用 Unix 命令的方式构建 AI 智能体**

Delta 让你用最简单的方式创建 AI 智能体：所有能力都是外部命令，所有交互都通过文件系统，所有状态都可以随时恢复。

---

## 5 分钟快速开始

```bash
# 1. 安装
npm install -g delta-engine

# 2. 创建你的第一个智能体
delta init my-agent -t hello-world

# 3. 运行它
delta run --agent ./my-agent -m "创建一个问候文件"
```

**发生了什么？**
- 智能体读取了你的任务
- 使用 LLM 思考需要做什么
- 执行 `echo` 和 `ls` 等命令完成任务
- 所有过程记录在 `.delta/journal.jsonl` 中

**试试更多：**
```bash
# 让智能体使用 Python 分析数据
delta run --agent ./my-agent -m "计算 1 到 100 的平方和"

# 中断后可以随时恢复（Ctrl+C 后执行）
delta run --agent ./my-agent -m "同样的任务"  # 自动从断点继续
```

---

## 可以构建什么？

### 1. DevOps 自动化
让智能体执行系统命令、分析日志、生成报告

**示例**：[hello-world](examples/hello-world/) - 使用基础 Unix 命令的简单智能体

### 2. 交互式会话
创建持久化的 Shell/Python REPL 环境，跨命令保持状态

**示例**：[interactive-shell](examples/interactive-shell/) - 持久化的 bash 会话管理
**示例**：[python-repl](examples/python-repl/) - 带状态持久化的 Python REPL

### 3. 工具配置
学习使用不同执行模式配置智能体工具的各种方法

**示例**：[tool-syntax](examples/tool-syntax/) - exec 和 shell 模式演示

### 4. AI 编排 AI
创建可以调用其他智能体的元智能体，实现复杂的多步骤工作流

**示例**：[delta-agent-generator](examples/delta-agent-generator/) - 生成智能体的智能体

---

## 为什么选择 Delta？

### 与传统 AI 智能体框架的对比

| 特性 | Delta Engine | 传统框架 |
|---------|--------------|----------------------|
| **能力扩展** | 编写任意 shell 脚本 | 需要编写框架插件代码 |
| **状态管理** | 完全无状态，可恢复 | 依赖内存，中断即失败 |
| **调试方式** | 直接读取 `.delta/journal.jsonl` | 需要专门的调试工具 |
| **学习成本** | 会用命令行即可 | 必须学习框架 API |
| **工具复用** | 所有 Unix 工具直接可用 | 需要重新封装现有工具 |

### 核心优势

1. **极致简单**：所有智能体能力都是外部命令（`ls`、`cat`、`python` 等）- 无需学习框架 API
2. **完全透明**：所有执行细节记录在 `.delta/` 目录 - 随时检查、分析、追踪
3. **完美可恢复**：从任何中断（Ctrl+C、断电、崩溃）恢复执行

### 适合你，如果你...

- ✅ 熟悉命令行工具，想快速构建 AI 智能体
- ✅ 需要智能体执行可能被中断的长时间任务
- ✅ 需要完整的审计日志和执行记录
- ✅ 希望智能体能调用任何现有的命令行工具
- ✅ 需要在智能体执行过程中进行人工审核

---

## 它是如何工作的？

Delta 基于三个核心原则（Three Pillars）：

### 1️⃣ 一切皆命令

所有智能体能力通过外部命令实现，没有内置函数。

```yaml
# agent.yaml - 定义你的智能体能做什么
tools:
  - name: list_files
    exec: "ls -la ${directory}"

  - name: analyze_data
    shell: "python analyze.py ${data_file} | tee report.txt"
```

任何命令行工具（`grep`、`awk`、`docker`、自定义脚本）都可以直接成为智能体的能力。

### 2️⃣ 环境即接口

智能体通过工作目录（CWD）与外界交互 - 文件系统是通用接口。

```
my-agent/workspaces/W001/  ← 智能体的工作目录
├── input.txt              ← 输入文件
├── output.json            ← 智能体生成的结果
├── DELTA.md               ← 智能体的动态指令
└── .delta/                ← 控制平面（日志、状态）
    ├── journal.jsonl      ← 完整的执行历史
    └── metadata.json      ← 运行状态
```

所有数据都可见、可修改、可版本控制 - 智能体执行完全透明。

### 3️⃣ 组合定义智能

复杂的智能体行为来自简单、单一用途智能体的组合 - 而非构建单体系统。

```yaml
# 编排其他智能体的元智能体
tools:
  - name: data_agent
    exec: "delta run --agent ./data-analyzer -m ${task}"

  - name: writer_agent
    exec: "delta run --agent ./report-writer -m ${task}"
```

像搭乐高积木一样构建复杂的 AI 系统 - 每个智能体做好一件事，组合创造智能。

---

## 核心功能

### 🔄 断点恢复
从任何中断（Ctrl+C、崩溃、关机）无缝恢复：
```bash
delta run --agent ./my-agent -m "长时间运行的任务"
# 执行被中断...
delta run --agent ./my-agent -m "长时间运行的任务"  # 自动继续
```

### 👥 人机协作
智能体可以在执行过程中向你提问并等待回答：
```bash
delta run -i --agent ./my-agent -m "需要确认的任务"
# 智能体："删除这些文件？ [yes/no]"
# 你输入答案，智能体继续执行
```

### 🖥️ 持久化会话
使用 `delta-sessions` 创建持久化的 Shell/REPL 环境：
```bash
delta-sessions start bash           # 创建 bash 会话
echo "cd /data && ls" | delta-sessions exec <session_id>
# 工作目录持久保持在 /data
```

### 🧠 记忆折叠
使用外部脚本压缩对话历史，支持长期任务：
```yaml
# context.yaml - 定义上下文组合策略
sources:
  - type: computed_file
    generator:
      command: ["python", "tools/summarize.py"]  # 压缩历史
    output_path: ".delta/context_artifacts/summary.md"

  - type: journal
    max_iterations: 5  # 仅保留最后 5 轮完整对话
```

### 🔌 生命周期钩子
在关键时刻注入自定义逻辑：
```yaml
# hooks.yaml - 独立的生命周期钩子配置（v1.9+）
pre_llm_req:
  command: ["./check-budget.sh"]  # 每次 LLM 调用前检查预算
post_tool_exec:
  command: ["./log-to-audit.sh"]  # 每次工具执行后记录审计
on_run_end:
  command: ["./cleanup.sh"]       # 运行完成时清理（v1.9 新增）
```

---

## 学习路径

### 🎯 入门（5-15 分钟）
1. **[快速开始](docs/QUICKSTART.md)** - 5 分钟教程，创建你的第一个智能体
2. **[hello-world 示例](examples/hello-world/)** - 理解 Delta 的三大原则
3. **[tool-syntax 示例](examples/tool-syntax/)** - 学习工具配置模式

### 📚 进阶（30-60 分钟）
4. **[智能体开发指南](docs/guides/agent-development.md)** - 完整的智能体开发指南
5. **[interactive-shell 示例](examples/interactive-shell/)** - 学习会话管理
6. **[python-repl 示例](examples/python-repl/)** - 带状态持久化的 Python REPL
7. **[上下文管理指南](docs/guides/context-management.md)** - 学习上下文组合策略

### 🚀 高级（1-2 小时）
8. **[钩子指南](docs/guides/hooks.md)** - 学习生命周期钩子和可扩展性
9. **[架构概览](docs/architecture/README.md)** - 理解系统设计原则
10. **[delta-agent-generator 示例](examples/delta-agent-generator/)** - 高级 AI 编排 AI 模式

### 📖 完整文档
- **[所有示例](examples/README.md)** - 5 个聚焦的示例展示核心能力
- **[API 参考](docs/api/)** - 完整的 CLI 命令和配置格式文档
- **[架构文档](docs/architecture/)** - 设计哲学和技术细节

---

## 快速参考

### 常用命令

```bash
# 初始化
delta init <agent-name> -t <template>  # 从模板创建
delta init <agent-name>                # 空白智能体

# 运行
delta run --agent <path> -m "任务描述"    # 基本运行
delta run -i --agent <path> -m "..."      # 交互模式
delta run -y --agent <path> -m "..."      # 静默模式（自动创建工作空间）

# 版本信息
delta --version

# 会话管理
delta-sessions start [shell]         # 创建会话（默认：bash）
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

# 查看 LLM 调用日志
ls -lht .delta/$RUN_ID/io/invocations/ | head -5

# 查看工具执行日志
ls -lht .delta/$RUN_ID/io/tool_executions/ | head -5

# 检查待处理的人工交互
ls -la .delta/interaction/
```

### 智能体目录结构

```
my-agent/
├── agent.yaml               # 必需：智能体配置（LLM、工具）[v1.9+]
├── hooks.yaml               # 可选：生命周期钩子 [v1.9+]
├── system_prompt.md         # 必需：系统提示词（可以是 .txt）
├── context.yaml             # 可选：上下文组合策略
├── modules/                 # 可选：可复用的工具模块 [v1.9+]
│   ├── file-ops.yaml
│   └── web-search.yaml
├── tools/                   # 可选：自定义工具脚本
│   ├── analyze.py
│   └── summarize.sh
└── workspaces/              # 运行时生成：执行工作空间
    ├── LAST_USED            # 跟踪最后使用的工作空间
    ├── W001/                # 工作空间 1（顺序编号）
    │   ├── DELTA.md         # 可选：工作空间级别上下文
    │   ├── [your files]     # 智能体操作的文件
    │   └── .delta/          # 控制平面
    │       ├── VERSION      # 数据格式版本
    │       ├── LATEST       # 最新运行 ID
    │       └── <run_id>/    # 单次运行记录
    │           ├── journal.jsonl        # 执行日志（核心）
    │           ├── metadata.json        # 运行元数据
    │           ├── engine.log           # 引擎日志
    │           └── io/                  # I/O 审计
    │               ├── invocations/     # LLM 调用
    │               ├── tool_executions/ # 工具执行
    │               └── hooks/           # 钩子执行
    └── W002/                # 工作空间 2

注意：config.yaml 仍然支持向后兼容（v1.9）
```

### 工具配置语法速查表

```yaml
# 方法 1：exec - 直接执行（推荐，最安全）
- name: list_files
  exec: "ls -F ${directory}"

# 方法 2：shell - Shell 解释（用于管道、重定向）
- name: count_lines
  shell: "cat ${file} | wc -l"

# 使用 stdin 参数
- name: write_file
  exec: "tee ${filename}"
  stdin: content  # content 参数通过 stdin 注入

# :raw 修饰符（用于传递标志列表）
- name: run_docker
  shell: "docker run ${flags:raw} ${image}"
  # LLM 传递：flags="-p 8080:80 -d"
  # 实际执行：docker run -p 8080:80 -d nginx

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

参见：[配置参考](docs/api/config.md)

---

## 系统要求

- **Node.js** 20+
- **TypeScript** 5+（仅开发时）
- **操作系统**：Linux / macOS / WSL

---

## 项目信息

- **当前版本**：v1.10.0
- **许可证**：MIT
- **代码仓库**：[GitHub](https://github.com/agent-works/delta-engine)
- **问题跟踪**：[Issues](https://github.com/agent-works/delta-engine/issues)
- **贡献指南**：[CONTRIBUTING.md](CONTRIBUTING.md)
- **更新日志**：[CHANGELOG.md](CHANGELOG.md)

---

## 社区与支持

- **文档**：[docs/](docs/)
- **示例**：[examples/](examples/)
- **讨论区**：[GitHub Discussions](https://github.com/agent-works/delta-engine/discussions)
- **博客**：参见 `docs/architecture/philosophy-02-whitepaper.md` 了解设计哲学
