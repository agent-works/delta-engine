# Memory Folding: Long-running Agent Context Management

> **Status**: Research / Exploratory Design
> **Created**: 2025-10-02
> **Last Updated**: 2025-10-02

## 概述

本文档记录关于长时间运行 Agent 的上下文管理研究。核心思想是将 LLM 的上下文管理从简单的"历史压缩"转变为"记忆折叠"——一种保留完整信息但分层呈现的架构。

## 核心概念

### 从"压缩"到"折叠"

**压缩思维的局限**：
- 删除冗余 → 信息丢失
- 去重错误 → 武断决策（框架不应替用户做语义判断）
- 静态策略 → 无法适应不同任务

**折叠思维的优势**：
- 降低颗粒度 → 信息分层呈现
- 保留索引 → 可召回完整内容
- 动态调整 → 随访问模式变化

**类比**：
- 压缩 = ZIP 文件（解压才能用，信息暂时不可访问）
- 折叠 = 目录结构（章节摘要可见，详细内容可展开）

---

## 记忆的"距离感"设计

### 距离的度量维度

**1. 时间维度**
- Iteration 距离：当前 iter 100，iter 1 的距离是 99
- 访问距离：最后一次被"提及"的距离

**2. 语义维度**
- 话题转换：当前讨论文件操作，之前的网络请求"距离"更远
- 依赖关系：当前操作依赖的历史操作"距离"更近

**3. 状态维度**
- 状态稳定后，创建该状态的历史"距离"变远
- 例：文件创建后，创建操作可折叠；文件被修改时，创建操作又变近

### 颗粒度层次

```
L0 [当前焦点] (iter 95-100): 完整对话
  ├─ Think: "I need to read file X"
  ├─ Action: read_file(X)
  └─ Result: "Content of X: ..."

L1 [近期记忆] (iter 80-95): 完整对话，省略冗余输出
  ├─ "Executed 15 file operations"
  ├─ Action: read_file(Y) → "Content: ..." (完整)
  └─ Action: write_file(Z) → "Success" (简化)

L2 [中期记忆] (iter 50-80): 摘要 + 关键操作
  └─ "Phase 2: Analyzed 30 files, found 5 errors
      Key actions: fixed config.yaml, deleted temp files"

L3 [远期记忆] (iter 20-50): 章节索引
  └─ "Phase 1: Environment setup
      Created 10 files, installed dependencies
      [可召回: journal seq 20-50]"

L4 [背景知识] (iter 1-20): 一句话概括
  └─ "Initialized project structure"
```

---

## 折叠触发机制

### 触发条件（多维度）

```
Trigger Evaluation:
  IF context_usage > 0.8 * window_size:
    → 紧急折叠（被动，空间压力）

  ELSE IF iterations % 20 == 0:
    → 定期折叠（主动，维护分区平衡）

  ELSE IF semantic_phase_completed:
    → 语义折叠（智能，LLM 检测到阶段完成）
```

**语义阶段检测**：
- LLM 在 Think 中提到 "completed", "finished", "moving to next step"
- 触发一次"章节总结"，生成高质量的阶段索引

### 折叠频率的自适应

```
Context Pressure Levels:
  Low (< 50% used):     每 50 iterations 折叠一次
  Medium (50-80%):      每 20 iterations 折叠一次
  High (> 80%):         每 5 iterations 折叠一次
  Critical (> 90%):     立即折叠最老的 L1 内容
```

---

## 折叠块（FoldedBlock）结构

### 索引元数据

```javascript
FoldedBlock {
  // 基本信息
  id: "fold_iter20_to_50",
  type: "chapter" | "summary" | "index",

  // 范围
  iteration_range: [20, 50],
  time_range: [start_time, end_time],

  // 语义内容（由 LLM 生成）
  summary: {
    title: "Phase 1: Environment Setup",
    content: "Initialized project, created config files...",
    outcome: "Successfully set up development environment"
  },

  // 检索线索（增强可召回性）
  keywords: ["init", "setup", "config", "dependencies"],
  entities: ["package.json", "config.yaml", ".gitignore"],
  state_changes: [
    "created: package.json, config.yaml",
    "installed: 15 npm packages"
  ],

  // 可召回性
  retrievability: {
    storage_ref: "journal:seq_20_50",    // 完整内容在 journal 中的位置
    importance: 0.6,                      // 重要性评分（影响召回优先级）
    last_accessed: null,                  // 最后一次被召回的时间
    access_count: 0                       // 访问次数
  },

  // 子结构（递归折叠）
  children: [
    {id: "fold_iter20_to_30", summary: "Created project structure", ...},
    {id: "fold_iter31_to_50", summary: "Installed dependencies", ...}
  ]
}
```

### LLM 生成摘要的提示词模式

```
Task: Summarize iterations 20-50 into a chapter-style index

Input:
- 30 iterations of dialogue
- Actions performed
- Current phase

Generate (JSON format):
1. title: 5-8 words chapter title
2. content: 2-3 sentences (focus on WHAT and WHY, not HOW)
3. outcomes: what state changed?
4. keywords: for retrieval
5. entities: files/objects mentioned

Example:
{
  "title": "Phase 1: Project Initialization",
  "content": "Set up project structure and dependencies. Created configuration files and initialized git. Resolved 2 dependency conflicts.",
  "outcomes": ["project ready", "dependencies installed"],
  "keywords": ["init", "setup", "npm", "git"],
  "entities": ["package.json", "config.yaml", ".gitignore"]
}
```

---

## Context Window 分区管理

### 分区设计（基于 100K token 窗口示例）

```
┌─────────────────────────────────────────────┐
│ Static Zone (10K, 10%)                      │
│ - System prompt                              │
│ - Task description                           │
│ - Agent capabilities                         │
│ - 整个 run 期间不变                          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Working Memory (30K, 30%)                   │
│ - Last 10-20 iterations (FULL detail)       │
│ - Current operation context                  │
│ - L0 颗粒度：完整的 Think-Act-Observe       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Short-term Memory (20K, 20%)                │
│ - Iterations 20-60 (SUMMARIZED)             │
│ - L1 颗粒度：保留关键操作，省略冗余输出      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Long-term Memory (20K, 20%)                 │
│ - Early iterations (CHAPTER INDEX)          │
│ - L2-L3 颗粒度：章节摘要 + 关键词            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Retrieved Memory (10K, 10%)                 │
│ - 临时召回的历史内容                         │
│ - 最近访问的折叠块展开内容                   │
│ - 停留 5-10 iterations 后淡出               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Dynamic Slots (10K, 10%)                    │
│ - 实时注入：文件列表、错误汇总               │
│ - 动态生成的上下文信息（见 context-slots 讨论）│
└─────────────────────────────────────────────┘
```

### 分区的动态流动

```
当 Working Memory 满：
  最老的 3-5 iterations
  → LLM 生成摘要
  → 移入 Short-term Memory

当 Short-term Memory 满：
  最老的 10-20 iterations
  → LLM 生成章节索引
  → 移入 Long-term Memory

当 Long-term Memory 满：
  多个章节
  → LLM 聚合为阶段总结
  → 进一步压缩
```

---

## 召回机制（Retrieval）

### 触发召回的场景

**1. 显式召回**（LLM 主动请求）
```
LLM: "I need to check what we did in Phase 1 regarding config setup"
→ 检索 keywords: ["Phase 1", "config", "setup"]
→ 找到对应的 FoldedBlock
→ 从 journal 读取完整内容
→ 展开到 Retrieved Memory
```

**2. 隐式召回**（系统自动检测）
```
Current iteration 提到 "config.yaml"
→ 检索包含 "config.yaml" 的历史折叠块
→ 如果 importance > 0.7，自动召回
```

**3. 错误召回**
```
Operation 失败："File not found: data.json"
→ 检索历史中创建/删除 "data.json" 的操作
→ 召回相关上下文，帮助 LLM 理解原因
```

### 召回的生命周期

```
Retrieval Lifecycle:
  1. 召回 → 展开到 Retrieved Memory（完整内容）
  2. 标记 last_accessed = current_iteration
  3. 停留 5-10 iterations（或直到不再被提及）
  4. 淡出 → 重新折叠为索引
  5. importance 评分增加（因为被访问过）
```

---

## LLM 介入的层次

### Level 1: 摘要生成（Summarization）

**频率**：每次折叠时（Working → Short-term）
**输入**：5-10 iterations 完整对话
**输出**：结构化摘要（200-500 tokens）

**Prompt 模式**：
```
Summarize iterations 50-60:
- Main actions performed
- Key outcomes
- State changes
- Any errors or warnings

Format: JSON with {summary, keywords, outcomes}
```

### Level 2: 章节归纳（Chapter Indexing）

**频率**：每 20-50 iterations（Short-term → Long-term）
**输入**：20-50 iterations 的摘要
**输出**：章节索引（100-200 tokens）

**Prompt 模式**：
```
Create chapter-style index for iterations 1-50:
- Chapter title (describe the goal)
- 2-3 sentence summary
- Key achievements
- Keywords for retrieval

Format: JSON
```

### Level 3: 阶段总结（Phase Synthesis）

**频率**：语义阶段完成时（LLM 主动触发）
**输入**：多个章节索引
**输出**：阶段总结（50-100 tokens）

**Trigger**：
```
LLM 在 Think 中说："Phase 1 completed"
→ 自动触发阶段总结
→ 将 iterations 1-100 聚合为一句话
```

---

## 保证折叠有效性的策略

### 挑战
如何避免关键信息丢失？如何保证折叠后的索引仍然有用？

### 策略 1: 重要性评分

```
Importance Score =
  0.3 * recency_factor +        // 越新越重要
  0.3 * access_frequency +      // 被访问越多越重要
  0.2 * error_presence +        // 有错误的更重要
  0.2 * state_change_magnitude  // 状态变化大的更重要
```

高重要性的折叠块：
- 保留更多细节
- 更容易被召回
- 折叠优先级更低

### 策略 2: 关键词 + 实体抽取

每次折叠时，LLM 抽取：
- 关键操作：["created", "deleted", "modified", "fixed"]
- 实体：["config.yaml", "server.js", "database"]
- 状态：["running", "stopped", "error"]

这些作为索引的一部分，增强可检索性。

### 策略 3: 双重验证

折叠前验证：
```
让 LLM 检查自己生成的摘要：
"Given this summary, can you infer what happened?
 What information might be missing?"

如果 LLM 回答"无法判断某个关键步骤"
→ 说明摘要质量不够，需要补充细节
```

### 策略 4: 关键时刻保护

某些 iteration 永远不折叠（保持 L0 颗粒度）：
- 第一次成功的操作
- 错误发生的 iteration
- 状态重大变化的 iteration
- 用户明确标记的 iteration（bookmark 功能）

---

## 完整工作流示例

### 场景：1000 iterations 的文件整理任务

**Iteration 1-50（探索阶段）**
```
Context:
  [Static Zone: System + Task]
  [Working Memory: iter 40-50 完整]
  [Short-term: iter 1-40 摘要]
  [Dynamic Slots: 当前文件列表]
```

**Iteration 200（第一次折叠）**
```
Trigger: Working Memory 接近满
Action:
  1. LLM 总结 iter 180-200
  2. 移入 Short-term Memory
  3. Working Memory 更新为 iter 200-220
```

**Iteration 500（语义阶段完成）**
```
LLM Think: "Phase 1 completed, moving to Phase 2"

Trigger: 语义折叠
Action:
  1. LLM 总结 iter 1-500 → 章节索引
     "Phase 1: Collected 1000 records from 10 sources"
  2. 移入 Long-term Memory
  3. 为 Phase 2 腾出空间
```

**Iteration 800（召回历史）**
```
LLM Think: "Need to check data collection method"

Trigger: 隐式召回
Action:
  1. 检索 "data collection" → 找到 Phase 1 折叠块
  2. 从 journal 读取 iter 50-100（关键部分）
  3. 展开到 Retrieved Memory
  4. 停留 10 iterations 后淡出
```

---

## 简化方案探索（第二次迭代）

> 2025-10-02: 重新审视复杂度，寻找更简单但有效的方案

### 核心反思

**原始方案的问题**：
- 6个分区太复杂
- 重要性评分公式难调优
- 自动召回机制可能过度设计
- **实现困难，影响因素太多，不好控制**

**重新定义核心需求**：
1. ✅ 让LLM在任何时刻都能"看到足够的上下文"
2. ✅ 不要让context window爆掉
3. ❌ 不一定需要复杂的自动化

---

### 方案1: 滑动窗口 + 定期检查点

**核心思路**：把长对话看作时间线，保留最近内容+定期里程碑

**结构**：
```
[System + Task] (10K)
[Checkpoints] (20K)
  ├─ iter 1-50:   "Phase 1: Setup complete"
  ├─ iter 51-150: "Phase 2: Data collected"
  └─ iter 151-250:"Phase 3: Analysis done"
[Sliding Window: 最近50次] (60K)
```

**触发**：每50 iterations生成一次checkpoint摘要

**优点**：
- 极简：只有3个部分
- 可预测：固定频率触发
- 低开销：只有checkpoint需要LLM

**缺点**：
- 召回是手动的
- checkpoint总结质量影响大

---

### 方案2: 两层记忆（Recent + Summary）

**核心思路**：只分两层，Summary是累积更新的流畅文本

**结构**：
```
[System + Task] (10K)
[Summary Memory - 一段文本] (40K)
  "This agent ran for 950 iters.
   Initially setup environment (1-100).
   Then collected data (100-500).
   Analyzed and found 50 errors (500-800).
   Currently fixing errors."

[Recent Memory: 最近50次] (50K)
```

**触发**：Recent Memory满时，LLM更新Summary

**关键点**：Summary是"故事大纲"，不是结构化索引

**优点**：
- 超级简单：就2层
- 自然：像讲故事，LLM易理解
- 灵活：可以突出重点

**缺点**：
- Summary可能变长，需要持续压缩
- 无法精确召回

---

### 方案3: 按"事件"而非"iteration"折叠

**核心思路**：LLM自己标记里程碑，触发折叠

**工作流**：
```
LLM: "Milestone: Environment setup completed"
→ Engine检测到 → 自动折叠之前的内容

结果：
[Milestone 1: Setup (1-50)]
[Milestone 2: Data collection (51-200)]
[Recent: 201-250]
```

**优点**：
- 语义化：按实际阶段划分
- 灵活：LLM自己决定
- 高质量：每个Milestone对应清晰阶段

**缺点**：
- 依赖LLM配合
- 可能长时间不触发

**混合模式**：优先LLM标记，保底50次强制折叠

---

### 方案4: 完全按需查询（最激进）

**核心思路**：context只保留最近内容，需要时查询journal

**结构**：
```
[System + Task] (10K)
[Recent: 最近50次] (70K)
[Query Results: 临时] (20K)
```

**新工具**：
```yaml
- name: query_history
  description: "Search past iterations by keyword"
  parameters:
    - name: query
      type: string
```

**工作流**：
- 正常：LLM只看最近50次
- 需要历史：LLM调用 `query_history("Phase 2")`
- 查询结果临时注入context，用完即扔

**优点**：
- 最简单：不维护任何摘要
- 最灵活：LLM自己决定
- 最精确：查询完整journal

**缺点**：
- 需要LLM学会使用工具
- 增加tool调用次数
- 可能查不准

---

### 方案对比

| 维度 | 方案1 | 方案2 | 方案3 | 方案4 |
|------|-------|-------|-------|-------|
| 复杂度 | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ |
| 实现难度 | 中 | 低 | 高 | 低 |
| LLM开销 | 低 | 中 | 低 | 按需 |
| 信息完整性 | 中 | 低 | 高 | 高 |
| 自动化 | 高 | 高 | 中 | 低 |
| 适用场景 | 长任务 | 超长任务 | 有里程碑 | 需精确历史 |

### 推荐：80/20混合方案

**核心思路**：80%时间用简单的"滑动窗口"，20%时间按需查询

**设计**：
```
Default (自动):
  [System + Task]
  [Recent 50 iterations]

Optional (手动):
  - query_history(keyword)
  - summarize_phase(start, end)
```

**渐进路径**：
1. MVP: 滑动窗口 + query_history工具
2. 观察使用模式
3. 按需决定是否加自动摘要

**为什么更简单可能更有效？**
1. 减少变量：少参数，易调优
2. 发挥LLM能力：让LLM自己管理记忆
3. 渐进式：先简单，遇到瓶颈再优化

---

## 架构设计思路：灵活框架而非固定方案

> 关键转变：不是"选择哪个方案"，而是"如何设计框架让所有方案都能实现"

### 设计哲学

**从"实现"到"架构"的转变**：
```
错误思路：实现方案2（两层记忆）
正确思路：设计框架，让用户可以实现方案1-4中的任何一个
```

**核心原则**：
1. **可插拔**：用户可以替换context构建策略
2. **可配置**：通过配置文件选择/调整行为
3. **默认简单**：内置最简单的实现
4. **易扩展**：用户可以基于默认实现定制

---

### Context Builder 抽象

#### 核心接口

```typescript
interface ContextBuilder {
  // 构建LLM context
  buildContext(ctx: BuilderContext): Promise<Message[]>

  // 生命周期钩子
  onIterationComplete?(iteration: number): Promise<void>
  onPhaseComplete?(phaseName: string): Promise<void>
}

interface BuilderContext {
  systemPrompt: string
  initialTask: string
  currentIteration: number
  journal: Journal  // 完整journal访问

  // 可选：预先解析的结构化数据
  iterations?: IterationView[]
}
```

#### 配置示例

```yaml
context_builder:
  strategy: sliding_window  # built-in strategies

  # 策略参数
  options:
    window_size: 50
    checkpoint_interval: 50

  # 或者使用自定义策略
  # strategy: custom
  # custom_script: "${AGENT_HOME}/my_context_builder.py"
```

---

### 内置策略（Built-in Strategies）

#### 1. Simple Sliding Window（默认）

```yaml
context_builder:
  strategy: sliding_window
  options:
    window_size: 50  # 保留最近50次
```

**实现**：
- 只保留最近N次iterations
- 无摘要，无checkpoint
- 最简单，适合短任务

#### 2. Sliding Window with Checkpoints

```yaml
context_builder:
  strategy: sliding_window_checkpoints
  options:
    window_size: 50
    checkpoint_interval: 50  # 每50次生成checkpoint
    checkpoint_prompt: "Summarize iterations {start}-{end} in 1 sentence"
```

**实现**：
- 最近N次完整 + 定期生成checkpoint
- 对应"简化方案1"

#### 3. Two-Layer Memory

```yaml
context_builder:
  strategy: two_layer
  options:
    recent_size: 50
    summary_max_tokens: 5000
    update_interval: 20  # 每20次更新Summary
```

**实现**：
- Recent + Summary两层
- Summary累积更新
- 对应"简化方案2"

#### 4. Query-on-Demand

```yaml
context_builder:
  strategy: query_on_demand
  options:
    recent_size: 50
    enable_query_tool: true  # 提供query_history工具
```

**实现**：
- 只保留Recent
- 提供工具让LLM查询
- 对应"简化方案4"

---

### 用户自定义策略

#### Hook-based Extension

```yaml
context_builder:
  strategy: custom
  hook:
    type: script
    command: ["python3", "${AGENT_HOME}/my_builder.py"]
```

**Hook接口**：
```bash
# Input: .delta/<RUN_ID>/context_builder_input.json
{
  "system_prompt": "...",
  "task": "...",
  "current_iteration": 100,
  "journal_path": ".delta/<RUN_ID>/journal.jsonl"
}

# Output: .delta/<RUN_ID>/context_builder_output.json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    ...
  ]
}
```

#### Plugin-based Extension

```yaml
context_builder:
  strategy: plugin
  plugin_path: "./plugins/smart_memory.js"
  options:
    custom_param: value
```

**Plugin示例**（JavaScript/TypeScript）：
```typescript
// plugins/smart_memory.js
export default class SmartMemoryBuilder {
  async buildContext(ctx: BuilderContext): Promise<Message[]> {
    // 用户自定义逻辑
    const recent = await this.getRecentIterations(ctx, 30);
    const important = await this.extractImportantEvents(ctx);

    return [
      {role: 'system', content: ctx.systemPrompt},
      {role: 'user', content: ctx.initialTask},
      ...important,
      ...recent
    ];
  }
}
```

---

### 渐进式使用路径

#### Level 0: 默认行为（零配置）

```yaml
# 不配置任何东西，使用默认
llm:
  model: gpt-4o
  # context_builder 未配置 → 使用默认 sliding_window
```

**行为**：保留最近50次iterations，适合短任务

#### Level 1: 选择内置策略

```yaml
context_builder:
  strategy: sliding_window_checkpoints
  options:
    window_size: 30
    checkpoint_interval: 50
```

**行为**：使用检查点策略，适合长任务

#### Level 2: 调整参数

```yaml
context_builder:
  strategy: two_layer
  options:
    recent_size: 100  # 增大窗口
    summary_max_tokens: 10000
    summary_style: detailed  # 详细摘要 vs 简洁摘要
```

**行为**：微调策略参数

#### Level 3: 自定义Hook

```yaml
context_builder:
  strategy: custom
  hook:
    command: ["python3", "my_builder.py"]
```

**行为**：完全自定义逻辑

---

### 框架的职责划分

```
┌─────────────────────────────────────────┐
│ User Layer                               │
│ - 选择策略（config.yaml）                │
│ - 或实现自定义策略（hook/plugin）         │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│ Framework Layer (Engine)                │
│ - 管理context builder生命周期             │
│ - 提供BuilderContext给策略使用            │
│ - 验证输出格式                            │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│ Built-in Strategies                     │
│ - Sliding Window (default)              │
│ - Checkpoints                           │
│ - Two-Layer                             │
│ - Query-on-Demand                       │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│ Infrastructure                          │
│ - Journal (完整历史)                     │
│ - IterationView (结构化读取)             │
│ - LLM Adapter (摘要生成)                 │
└─────────────────────────────────────────┘
```

**职责**：
- **Framework**：不做语义决策，只提供机制
- **Strategy**：实现具体的context构建逻辑
- **User**：选择或定制策略

---

### 框架的核心价值

**1. 灵活性**
- 用户可以从简单策略开始
- 需要时切换到复杂策略
- 可以完全自定义

**2. 渐进性**
- 默认简单（Level 0）
- 按需复杂（Level 1-3）
- 不会"一开始就过度设计"

**3. 可观察性**
- 内置策略提供参考实现
- 用户看到"什么有效，什么没效"
- 基于观察再优化

**4. 社区生态**
- 用户可以分享自己的策略
- 最佳实践可以内置为新策略
- 形成策略库

---

### 实现优先级

**Phase 1: 核心框架**
- ContextBuilder接口定义
- 默认策略：Sliding Window
- 配置系统：strategy选择

**Phase 2: 内置策略**
- Checkpoints策略
- Two-Layer策略
- Query-on-Demand工具

**Phase 3: 扩展机制**
- Hook-based自定义
- Plugin-based自定义
- 策略示例和文档

---

## Sub-Agent 方案：通过 Agent 组合实现 Context Management

> 2025-10-02: 第三次迭代 - 探索另一种架构思路

### 核心思路

**关键洞察**：与其在框架内实现复杂的 ContextBuilder，不如利用 Delta Engine 的 "Everything is a Command" 哲学，**用专门的 summarization agent 作为 sub-agent（tool）来处理 context folding**。

**优势**：
- **更灵活**：用户完全控制 summarization 逻辑（通过提示词和 tools）
- **更易复用**：任何 agent 都可以调用 summarization agent
- **降低门槛**：用户只需会写 agent（已经会的技能）
- **符合哲学**：通过组合小工具解决问题，而非框架内置复杂功能

**核心机制**：
```yaml
# 主 agent 的 config.yaml
tools:
  - name: summarize_context
    command: ["delta", "run", "--agent", "./agents/summarizer", "--task"]
    parameters:
      - name: instruction
        type: string
        inject_as: argument
```

主 agent 可以在需要时调用 summarization agent，就像调用任何其他工具一样。

---

### 设计层面的支持

框架需要提供以下机制来支持这种模式：

#### 1. Sub-Agent 调用机制

**方案 A：直接命令调用**（简单，推荐先实现）
```yaml
tools:
  - name: summarize_context
    command: ["delta", "run", "--agent", "./agents/summarizer", "--task"]
    parameters:
      - name: instruction
        type: string
        inject_as: argument
```

**方案 B：标准化 agent-to-agent 协议**（未来优化）
```yaml
tools:
  - name: summarize_context
    type: sub_agent  # 特殊类型
    agent_path: "./agents/summarizer"
    parameters:
      - name: instruction
        type: string
```

框架在 executor.ts 中识别 `sub_agent` 类型，自动处理 parent context 传递。

#### 2. Journal Query API（只读访问）

**问题**：Summarization agent 需要读取主 agent 的 journal，但不应修改它。

**方案**：
```typescript
// journal-query.ts
export class JournalQuery {
  // 只读访问方法
  async getIterations(start: number, end: number): Promise<IterationView[]>
  async getEventsByType(type: string): Promise<Event[]>
  async searchByKeyword(keyword: string): Promise<Event[]>
}
```

**暴露给 sub-agent**：
```bash
# 通过环境变量
PARENT_JOURNAL_PATH=/path/to/parent/.delta/run_id/journal.jsonl
PARENT_JOURNAL_READONLY=true

# 或通过标准输入
echo '{"journal_path": "...", "query": "iterations:50-100"}' | \
  delta run --agent ./agents/summarizer
```

#### 3. Context 注入机制

**方案 1：通过 Tool Result**（推荐，无需修改框架）

Summarization agent 的返回值作为 tool result 自然注入到对话历史：

```
THOUGHT: "Context is getting long, I need to summarize."
ACTION: summarize_context(instruction="Summarize iterations 1-50")
OBSERVATION: "Phase 1 Summary: Setup environment, installed dependencies,
              created 10 files. Key outcomes: project ready."

THOUGHT: "Good, I can now continue with Phase 2..."
```

LLM 在后续 iterations 中会看到这个 summary，就像看到任何其他 tool result。

**方案 2：特殊 Context Slot**（未来优化）

允许 tool 返回特殊标记的内容，注入到特定 context 位置：
```json
{
  "type": "context_injection",
  "target": "long_term_memory",
  "content": "Phase 1 Summary: ..."
}
```

#### 4. 触发机制设计

**方案 A：LLM 自主判断**（推荐）

在主 agent 的 system prompt 中提供指引：
```markdown
## Context Management

When the conversation history becomes long (> 30 iterations),
you can use the `summarize_context` tool to create a summary.

Example usage:
- After completing a phase of work
- When context exceeds 20K tokens
- Before starting a new major task

The summary will replace detailed history with concise overview.
```

**优点**：
- 灵活：LLM 根据语义判断（自然的"章节边界"）
- 简单：无需框架实现复杂逻辑
- 智能：适应不同任务的节奏

**方案 B：自动触发**（可选优化）

```yaml
context_builder:
  auto_summarize:
    enabled: true
    trigger:
      iteration_interval: 50
      token_threshold: 50000
    summarizer_agent: "./agents/summarizer"
```

框架在满足条件时自动调用 sub-agent。

#### 5. Ephemeral Agent 模式（状态隔离）

**问题**：Sub-agent 的 journal 和 workspace 如何管理？

**方案：Ephemeral 模式**
```bash
delta run \
  --agent ./agents/summarizer \
  --task "Summarize iterations 50-100" \
  --ephemeral  # 新增标志
```

**特性**：
- 使用临时 workspace（`/tmp/delta_ephemeral_xxx`）
- 运行完成后自动清理
- Journal 不保留（或仅保留在主 agent 的 `io/sub_agents/` 下）
- 不计入主 agent 的 iteration 数

**实现**：
```typescript
interface EngineContext {
  ephemeral?: boolean  // 标记为临时 agent
  parentContext?: {
    journalPath: string
    runId: string
  }
}
```

---

### 设计层面之外的支持

#### 1. 标准 Summarization Agents

**提供官方模板**：
```
agents/
├── summarizer-chapter/      # 章节式索引
│   ├── config.yaml
│   └── system_prompt.md
├── summarizer-events/       # 关键事件提取
│   ├── config.yaml
│   └── system_prompt.md
├── summarizer-errors/       # 错误汇总
│   ├── config.yaml
│   └── system_prompt.md
└── summarizer-adaptive/     # 自适应策略
    ├── config.yaml
    └── system_prompt.md
```

**示例：`summarizer-chapter/system_prompt.md`**
```markdown
# Context Summarizer (Chapter-Style)

You are a summarization agent. Your task is to read journal events
and create chapter-style summaries.

## Input Format
- `journal_path`: Path to parent agent's journal (via env var)
- `start_iteration`: Start of range to summarize
- `end_iteration`: End of range to summarize

## Output Format
Generate JSON:
{
  "title": "Phase 1: Environment Setup",
  "summary": "Created project structure, installed dependencies...",
  "key_actions": ["created 10 files", "installed npm packages"],
  "outcomes": ["project ready", "dev environment configured"],
  "keywords": ["init", "setup", "dependencies"]
}

## Tools Available
- read_journal(path, start, end): Read journal events
```

#### 2. Agent Registry / Marketplace

**概念**：类似 npm registry，但用于 agents

```bash
# 发现和安装 agents
delta agents search summarizer
delta agents install @delta/summarizer-chapter

# 本地引用
delta run --agent @delta/summarizer-chapter --task "..."
```

**Registry 结构**：
```
~/.delta/agents/
├── @delta/
│   ├── summarizer-chapter@1.0.0/
│   ├── summarizer-events@1.0.0/
│   └── ...
└── @community/
    └── smart-memory@2.1.0/
```

#### 3. 工具和调试

**Context Inspector 工具**：
```bash
# 查看当前 context 结构
delta context inspect --work-dir ./workspace

# 输出示例
Context Breakdown:
├─ System Prompt: 1.2K tokens
├─ Task: 0.3K tokens
├─ Recent History (iter 80-100): 15K tokens
├─ Summary (iter 1-80): 3K tokens
└─ Total: 19.5K tokens

# 模拟 summarization 效果
delta context simulate \
  --summarizer ./agents/summarizer-chapter \
  --range 1-50 \
  --preview

# 输出
Before: 25K tokens (50 iterations)
After: 8K tokens (summary + recent 10 iterations)
Savings: 17K tokens (68%)
```

**可视化工具**：
```bash
# 生成 context 层次结构图
delta context visualize --output context.html

# 浏览器打开，显示类似：
[System Prompt]
[Task]
[Long-term Memory]
  ├─ Phase 1 Summary (iter 1-50)
  └─ Phase 2 Summary (iter 51-100)
[Short-term Memory]
  └─ Recent 20 iterations
```

#### 4. 文档和最佳实践

**新增文档**：
```
docs/guides/
├── context-management.md           # 如何管理长任务的 context
├── writing-summarization-agents.md # 如何编写 summarization agent
└── agent-composition.md            # Agent 组合模式
```

**`writing-summarization-agents.md` 大纲**：
```markdown
# Writing Summarization Agents

## What is a Summarization Agent?
A specialized agent that reads parent agent's journal and produces summaries.

## Design Principles
1. Single Responsibility: Only summarize, don't execute
2. Deterministic: Same input → same output
3. Fast: Should complete in < 5 seconds
4. Idempotent: Can be called multiple times safely

## Input/Output Contract
### Input
- Journal path (via PARENT_JOURNAL_PATH env var)
- Range to summarize (via task parameter)

### Output
- Structured summary (JSON)
- Keywords for retrieval
- Key state changes

## Example: Chapter-Style Summarizer
[Code example...]

## Testing Your Summarizer
[Testing strategies...]
```

#### 5. 性能优化

**缓存机制**：
```
.delta/{run_id}/
└── summaries/
    ├── iter_1_50.json      # 已生成的摘要
    ├── iter_51_100.json
    └── cache_index.json    # 缓存索引
```

**`cache_index.json` 结构**：
```json
{
  "summaries": [
    {
      "range": [1, 50],
      "hash": "abc123",  // journal 内容的 hash
      "summary_path": "iter_1_50.json",
      "generated_at": "2025-10-02T10:00:00Z"
    }
  ]
}
```

**增量 Summarization**：
```bash
# 只处理新增的 iterations
delta run --agent ./agents/summarizer \
  --task "Summarize NEW iterations since last summary" \
  --parent-summary summaries/iter_1_50.json
```

Summarization agent 可以基于旧摘要做增量更新。

---

### 关键设计决策

#### 决策 1：Summarization 是 Tool 还是 Framework 特性？

**建议**：**优先作为 Tool（sub-agent）**

**理由**：
- 更灵活：用户完全控制
- 更简单：框架不需要内置复杂逻辑
- 更可组合：任何 agent 都能用
- 符合哲学："Everything is a Command"

**Framework 的职责**：
- 提供 sub-agent 调用机制
- 提供 journal query API
- 提供标准 summarization agents 作为参考实现

#### 决策 2：触发机制由谁控制？

**建议**：**优先 LLM 自主判断**，可选框架辅助

**理由**：
- LLM 更懂语义边界（"这个阶段完成了"）
- 避免框架做武断决策（回到之前的"去重错误"问题）
- 用户可以通过 prompt 调整策略

**Framework 的职责**：
- 在 system prompt 中提供指引
- 可选提供 context pressure 信号（如 `current_context_tokens`）

#### 决策 3：Summary 存储在哪里？

**建议**：**作为 tool result 存储在 journal**

**理由**：
- 与现有机制一致
- Journal 是 SSOT
- Rebuild 时自动恢复

**结构**：
```jsonl
{"type":"ACTION_REQUEST","payload":{"tool_name":"summarize_context",...}}
{"type":"ACTION_RESULT","payload":{"observation_content":"{\"title\":\"Phase 1\",...}"}}
```

LLM 在 rebuild 时会看到这个 summary，就像看到任何其他 tool result 一样。

---

### 实现路径

**Phase 1: 基础 Sub-Agent 支持**
- Sub-agent 调用机制（方案 A：直接命令）
- Ephemeral mode（临时 workspace）
- 文档：如何编写 sub-agent

**Phase 2: Journal Query API**
- `JournalQuery` 类（只读访问）
- 环境变量传递（`PARENT_JOURNAL_PATH`）
- 测试：sub-agent 读取 parent journal

**Phase 3: 标准 Summarization Agents**
- `summarizer-chapter` 参考实现
- `summarizer-events` 参考实现
- 集成到 examples/

**Phase 4: 工具和生态**
- `delta context inspect` 命令
- `delta context simulate` 命令
- Agent registry（可选）

---

### Sub-Agent 方案 vs ContextBuilder 方案

| 维度 | ContextBuilder 方案 | Sub-Agent 方案 |
|------|---------------------|----------------|
| **复杂度** | 需要实现整个 builder 框架 | 复用现有 tool 机制 |
| **灵活性** | 需要学习 ContextBuilder API | 只需会写 agent |
| **可组合** | 策略独立，难以组合 | Agent 可以调用其他 agents |
| **可测试** | 需要 mock 框架 | 直接测试 agent |
| **社区** | 需要学习框架特定 API | 任何会写 agent 的人都能贡献 |
| **调试** | 需要框架内调试工具 | 直接看 sub-agent 的 journal |
| **学习曲线** | 中等（新概念：ContextBuilder） | 低（已有技能：写 agent） |
| **运行时开销** | 低（同进程） | 中（启动新进程） |

**核心优势（Sub-Agent 方案）**：
1. **降低门槛**：用户只需会写 agent（已经会的技能）
2. **提高复用**：Summarization agent 可以在任何地方用，甚至其他项目
3. **自然演进**：从简单（不 summarize）到复杂（多级 summarize）都支持
4. **避免过度设计**：框架只做必要的支持，逻辑由用户控制

**适用场景**：
- **ContextBuilder 方案**：需要高度定制化的 context 构建逻辑，愿意学习框架 API
- **Sub-Agent 方案**：快速开始，利用已有技能，强调组合和复用

---

### 完整示例：主 Agent 使用 Summarization Agent

**主 Agent 配置（`examples/long-task/config.yaml`）**：
```yaml
name: long-task-agent
version: 1.0.0

llm:
  model: gpt-4o
  temperature: 0.7

tools:
  # 常规工具
  - name: bash_exec
    command: ["bash", "-c"]
    parameters:
      - name: script
        type: string
        inject_as: argument

  # Summarization sub-agent
  - name: summarize_context
    command: ["delta", "run", "--agent", "./agents/summarizer-chapter", "--task", "--ephemeral"]
    parameters:
      - name: instruction
        type: string
        description: "Summarization instruction (e.g., 'Summarize iterations 1-50')"
        inject_as: argument
```

**主 Agent System Prompt（`system_prompt.md`）**：
```markdown
# Long Task Agent

You are an agent handling long-running tasks (hundreds of iterations).

## Context Management Strategy

When conversation history grows large (> 30 iterations), use the
`summarize_context` tool to create summaries:

```
summarize_context(instruction="Summarize iterations 1-50 into a chapter-style overview")
```

The summarization will help you maintain context without exceeding limits.

### When to Summarize
- After completing a major phase
- Before starting a new independent task
- When you notice context becoming unwieldy

### Example Workflow
1. Complete Phase 1 (iterations 1-50)
2. Call `summarize_context(instruction="Summarize Phase 1")`
3. Use the summary to inform Phase 2 decisions
```

**实际运行示例**：
```
[Iteration 55]
🤔 Thinking...
💭 Phase 1 is complete (setup and data collection). Before moving to Phase 2,
   I should summarize Phase 1 to keep context manageable.

🛠️ Executing 1 tool call(s)...
  → summarize_context(instruction="Summarize iterations 1-50...")
  ✓ Output: {"title":"Phase 1: Setup & Data Collection",...} (850 chars)

[Iteration 56]
🤔 Thinking...
💭 Good, I have Phase 1 summary. Now I can start Phase 2 (data analysis)
   with clean context.
```

---

### 核心价值总结

这个设计的核心是：**把 context management 从框架内置功能变成可组合的 agent 能力**。

**设计层面**，框架需要：
1. Sub-agent 调用机制
2. Journal 只读访问 API
3. Ephemeral agent 模式
4. Context pressure 信号（可选）

**设计层面之外**，生态需要：
1. 标准 summarization agents
2. Agent registry/marketplace
3. 调试和可视化工具
4. 文档和最佳实践

**关键价值**：
- 符合 Unix 哲学（组合小工具）
- 降低用户门槛（只需会写 agent）
- 提高灵活性（完全用户控制）
- 避免框架过度设计

---

## 开放问题

### 1. 折叠时机由谁决定？

**当前方案**：基于 token 数量 + iteration 数
**激进方案**：让 LLM 判断"这个阶段可以总结了"

**Trade-off**：
- 优点：更符合语义，折叠更自然
- 缺点：增加 LLM 调用，可能误判

**讨论点**：
- 是否需要混合模式？（空间压力时强制折叠，否则由 LLM 决定）
- LLM 如何表达"可以折叠"的意图？（特殊 tool call？）

### 2. 是否需要反折叠机制？

如果 LLM 频繁召回某个折叠块：
- 是否应该"解压"到 Short-term Memory（持久停留）？
- 还是提高其重要性评分，延迟下次折叠？

### 3. 跨 Agent 的记忆共享？

**场景**：Agent A 完成任务，Agent B 基于 A 的结果继续

**问题**：
- B 是否应该看到 A 的完整 journal？
- 还是只看 A 的"最终折叠摘要"？
- 如何设计跨 Agent 的记忆索引？

### 4. 用户干预接口？

是否提供：
- `delta memory show` - 查看当前记忆分区
- `delta memory fold --iterations 50-100` - 手动折叠
- `delta memory retrieve --keyword "config"` - 手动召回
- `delta memory bookmark --iteration 42` - 标记关键时刻

### 5. 折叠块的存储位置？

**方案 A**：存储在 journal 内部（作为特殊事件类型）
**方案 B**：存储在独立的 `folded_memory.json` 文件
**方案 C**：存储在数据库（支持复杂查询）

### 6. 折叠是否可逆？

如果发现折叠导致信息丢失：
- 是否支持"撤销折叠"？
- 如何检测折叠质量？

---

## 理论基础与类比

### 人类记忆系统
- 工作记忆（Working Memory）：7±2 个 chunks
- 长期记忆（Long-term）：通过"提取线索"召回
- 遗忘曲线：时间越久，记忆越模糊（颗粒度变粗）

### 操作系统的虚拟内存
- 页面置换算法（LRU, LFU）
- 分页表（类似索引）
- Page fault（类似召回）
- 工作集（Working Set）

### 数据库的分层存储
- Hot data（Working Memory）：内存
- Warm data（Short-term）：SSD
- Cold data（Long-term）：磁盘
- 缓存预热（类似召回）

---

## 迭代历史

### 2025-10-02: 初始讨论（第一次）

**核心成果**：
- 确立"折叠"vs"压缩"的概念区别
- 定义 L0-L4 颗粒度层次
- 设计 Context Window 分区（6 个分区）
- 确定 LLM 介入的 3 个层次
- 提出"距离感"度量维度

**关键洞察**：
- 框架不应替用户做语义决策（如"去重错误"是错误的）
- 折叠应该是可召回的，而不是删除
- LLM 的语义理解能力是折叠的关键（摘要、关键词）

**待解决问题**：
- 折叠触发机制的优先级？
- FoldedBlock 的最佳数据结构？
- 如何衡量折叠质量？

---

### 2025-10-02: 简化与架构思维转变（第二次）

**核心反思**：
- 初始方案太复杂（6个分区、重要性评分、自动召回）
- **实现困难，影响因素多，不好控制**
- 需要"退一步"寻找更简单的方案

**探索的4个简化方案**：
1. 滑动窗口 + 定期检查点（3个分区）
2. 两层记忆（Recent + Summary）
3. 按事件折叠（LLM标记Milestone）
4. 完全按需查询（提供query_history工具）

**关键洞察**：
- **不是"选择哪个方案"，而是"设计框架让所有方案都能实现"**
- 从"实现"转向"架构"
- 可插拔、可配置、默认简单、易扩展

**架构设计**：
- ContextBuilder抽象接口
- 内置4种策略（从简单到复杂）
- Hook/Plugin扩展机制
- 渐进式使用路径（Level 0-3）

**实施路径**：
1. Phase 1: 核心框架 + 默认策略（Sliding Window）
2. Phase 2: 内置其他策略（Checkpoints, Two-Layer, Query-on-Demand）
3. Phase 3: 扩展机制（Hook/Plugin）

**下一步**：
- 定义ContextBuilder接口的详细规范
- 实现默认策略（Sliding Window）
- 在实际任务中测试，观察瓶颈
- 根据观察决定优先实现哪个内置策略

---

### 2025-10-02: Sub-Agent 方案探索（第三次）

**核心转变**：从"在框架内实现 ContextBuilder"转向"用 agent 组合实现 context management"

**关键洞察**：
- **用 summarization agent 作为 sub-agent（tool）**，而非框架内置功能
- 符合 "Everything is a Command" 哲学
- 降低用户门槛：只需会写 agent（已有技能）
- 提高复用性：summarization agent 可以跨项目使用

**设计层面的支持**：
1. **Sub-agent 调用机制**：
   - 方案 A：直接命令调用（简单，优先实现）
   - 方案 B：标准化 agent-to-agent 协议（未来优化）
2. **Journal Query API**：只读访问，通过环境变量或 stdin 传递
3. **Context 注入机制**：通过 tool result（无需修改框架）
4. **触发机制**：优先 LLM 自主判断，可选框架辅助
5. **Ephemeral Agent 模式**：临时 workspace，运行后自动清理

**设计层面之外的支持**：
1. **标准 Summarization Agents**：官方模板（chapter, events, errors, adaptive）
2. **Agent Registry/Marketplace**：类似 npm registry
3. **工具和调试**：context inspect, simulate, visualize
4. **文档和最佳实践**：如何编写 summarization agent
5. **性能优化**：缓存机制、增量 summarization

**Sub-Agent 方案 vs ContextBuilder 方案对比**：
- 复杂度：Sub-Agent 复用现有 tool 机制，更简单
- 灵活性：只需会写 agent，无需学习新 API
- 可组合性：Agent 可以调用其他 agents
- 社区门槛：任何会写 agent 的人都能贡献

**实施路径**：
1. Phase 1: 基础 Sub-Agent 支持（调用机制、ephemeral mode）
2. Phase 2: Journal Query API（只读访问）
3. Phase 3: 标准 Summarization Agents（参考实现）
4. Phase 4: 工具和生态（inspect, simulate, registry）

**核心价值**：
- 符合 Unix 哲学（组合小工具解决问题）
- 避免框架过度设计（框架只提供必要支持）
- 自然演进路径（从简单到复杂都支持）
- 提高生态复用性（summarization agent 可以独立使用）

**关键设计决策**：
1. Summarization 优先作为 Tool（sub-agent），而非 Framework 特性
2. 触发机制优先 LLM 自主判断，避免框架武断决策
3. Summary 作为 tool result 存储在 journal（符合 SSOT 原则）

---

## 相关讨论

- [Context Slots 设计](./context-slots.md)（如果未来创建）
- [Journal 简化方案](../architecture/journal-refactor.md)（未来）

---

## 贡献者

初始讨论：fugen + Claude Code (2025-10-02)
