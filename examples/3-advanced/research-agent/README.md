# Research Agent

**Advanced example**: Demonstrates Delta Engine's v1.6 context composition for long-running knowledge accumulation.

---

## 🎯 What This Example Demonstrates

This agent showcases Delta Engine's most advanced capabilities:

- **Context Composition** (v1.6): Dynamic assembly of context from multiple sources
- **Memory Folding**: Incremental summarization to maintain constant context size
- **Long-Running Tasks**: Multi-day/week research with perfect resumability
- **Stateless Resumability**: Pause and resume across unlimited time spans
- **Knowledge Accumulation**: Systematic research with clear documentation trail

**Delta-Unique Value**: The combination of context composition + stateless core + incremental summarization enables research projects that span days or weeks, with constant context size and zero state loss. Impossible with generic LLM tools that lose context or require manual state management.

---

## 🏗️ How It Works

### Think-Act-Observe with Context Composition

```
[Iteration N]
    ↓
1. CONTEXT ASSEMBLY (Automatic - v1.6)
   ├─ Load system_prompt.md (static_files)
   ├─ Execute computed_file script → research_summary.md
   ├─ Load notes.md (direct_includes, if exists)
   └─ Total: ~8000 tokens context (constant size)
    ↓
2. THINK (LLM Decision)
   - Agent sees: Previous findings, current phase, sources
   - Agent decides: What to research next, when to summarize
    ↓
3. ACT (Tool Execution)
   - write_note() → Record findings
   - search_notes() → Find references
   - create_summary() → Compress notes
    ↓
4. OBSERVE (Record Results)
   - Notes → Written to notes.md
   - Summary → Created in research_summary.md
   - Journal → All decisions logged
    ↓
[Iteration N+1] → Context reloaded with updated notes/summary
```

### Memory Folding Pattern

```
Phase 1 (Iterations 1-10):
  notes.md: 0 → 3000 tokens
  Context: system_prompt + notes.md

[Agent calls create_summary]

Phase 2 (Iterations 11-20):
  notes.md: 3000 → 500 tokens (summarized)
  research_summary.md: 500 tokens (compressed history)
  notes.md: 0 → 3000 tokens (new phase)
  Context: system_prompt + summary (500) + notes (3000)

[Agent calls create_summary again]

Phase 3 (Iterations 21-30):
  research_summary.md: 1000 tokens (merged)
  notes.md: 3000 tokens (current)
  Context: Still ~8000 tokens (constant size!)

Result: Unlimited research duration with constant context
```

### Tools Available

| Tool | Purpose | Command |
|------|---------|---------|
| **write_note** | Record findings | tee -a |
| **read_note** | Review notes | cat |
| **list_notes** | List workspace files | ls -lh |
| **search_notes** | Find topics | grep -rn |
| **create_summary** | Compress notes | Python script |

---

## 🚀 Quick Start

### Prerequisites
```bash
# Build Delta Engine
npm run build

# Ensure Python 3 is available
python3 --version
```

### Example 1: Simple Research (5-10 iterations)

Research a focused topic:

```bash
delta run \
  --agent examples/3-advanced/research-agent \
  -m "Research the basics of Retrieval-Augmented Generation (RAG). Focus on: What is RAG? Core components. Key benefits. Write findings to notes.md."
```

**Expected behavior**:
- Agent takes notes incrementally
- Creates `notes.md` with organized findings
- Includes sources and citations
- Final report with key points

**Check results**:
```bash
cat /tmp/rag-research/notes.md
```

---

### Example 2: Multi-Phase Research (20+ iterations)

Research with context management:

```bash
delta run \
  --agent examples/3-advanced/research-agent \
  -m "Conduct comprehensive research on RAG techniques. Phase 1: Foundations (what, why, how). Phase 2: Advanced techniques (hybrid RAG, multi-hop). When notes.md exceeds 500 lines, call create_summary to compress. Continue research after summarization."
```

**Expected behavior**:
- Agent researches Phase 1 → notes.md grows
- Agent detects notes.md size → calls `create_summary`
- notes.md compressed → `research_summary.md` created
- Agent continues Phase 2 with fresh notes
- Context stays constant size throughout

**Check memory folding**:
```bash
# Check summary was created
ls -lh /tmp/rag-comprehensive/

# View compressed summary
cat /tmp/rag-comprehensive/research_summary.md

# View current notes
cat /tmp/rag-comprehensive/notes.md
```

---

### Example 3: Multi-Session Resumable Research (Complex)

Long-running research across multiple sessions:

**Session 1** (Day 1):
```bash
delta run \
  --agent examples/3-advanced/research-agent \
  -m "Begin comprehensive survey of transformer architectures. Cover: Original transformer, BERT, GPT evolution. Take detailed notes. After 10-15 findings, create summary and pause."
```

**[Pause - Go do other work for hours/days]**

**Session 2** (Day 3):
```bash
delta run \
  --agent examples/3-advanced/research-agent \
  -m "Continue transformer architecture survey. Check notes.md and research_summary.md to see what's covered. Focus on: Vision transformers, multimodal transformers, efficiency improvements. Build on previous research."
```

**Session 3** (Day 7):
```bash
delta run \
  --agent examples/3-advanced/research-agent \
  -m "Finalize transformer survey. Review all notes and summaries. Generate comprehensive final report with: Timeline, key innovations, comparative analysis. Create final_report.md."
```

**Expected behavior**:
- Session 1: Initial research → notes.md + research_summary.md
- Session 2: Reads existing notes → Continues seamlessly → Adds more findings
- Session 3: Reviews all progress → Synthesizes final report
- **Perfect resumability** across days with no state loss

**This works because**:
- notes.md and research_summary.md persist in workspace
- context.yaml automatically loads them on each run
- Stateless core rebuilds full context from files
- Journal maintains complete history

---

## 📊 What To Observe

### 1. Context Composition in Action

Check how context is assembled:

```bash
# View context.yaml configuration
cat examples/3-advanced/research-agent/context.yaml

# After research run, check journal to see context loading
grep "context" /tmp/rag-research/.delta/*/journal.jsonl
```

**Key insights**:
- `static_files`: Always loaded (system_prompt.md)
- `computed_files`: Dynamically executed (research summary script)
- `direct_includes`: Conditionally loaded (notes.md if exists)
- Total context assembled automatically before each LLM call

### 2. Memory Folding Results

After agent calls `create_summary`:

```bash
# Compare sizes
wc -l /tmp/rag-comprehensive/notes.md
wc -l /tmp/rag-comprehensive/research_summary.md

# View compression ratio
cat /tmp/rag-comprehensive/research_summary.md | tail -3
```

Expected output:
```
Compression: 3000 → 500 tokens (83% reduction)
```

**Compression effectiveness**:
- Original notes: ~3000 tokens (verbose, detailed)
- Summary: ~500 tokens (key points only)
- Information preserved: Core findings, citations, structure
- Information lost: Verbose explanations, redundant details

### 3. Multi-Session Resumability

Test pause/resume:

```bash
# Session 1: Start research
delta run --agent research-agent -m "Research topic X, phase 1" ...

# Check progress mid-research
cat notes.md

# [Ctrl+C to interrupt]

# Session 2: Resume hours/days later
delta run --agent research-agent -m "Continue research on topic X, check notes to see progress" ...

# Agent picks up exactly where it left off
```

**What makes this work**:
1. Workspace files (notes, summary) persist across sessions
2. context.yaml loads them automatically
3. Stateless core rebuilds context from files + journal
4. Agent's "memory" is entirely in files (no hidden state)

---

## 🛠️ Troubleshooting

### Issue 1: "create_summary tool fails"

**Symptoms**: Python script error when calling create_summary

**Diagnosis**:
```bash
# Test script manually
python3 examples/3-advanced/research-agent/tools/summarize_research.py notes.md summary.md
```

**Solutions**:
1. Ensure Python 3 installed: `python3 --version`
2. Check file permissions: `chmod +x tools/summarize_research.py`
3. Verify notes.md exists: `ls -la notes.md`

---

### Issue 2: "Context still too large after summarization"

**Symptoms**: Agent responses getting shorter, context overflow warnings

**Cause**: Multiple summarization cycles without archiving old summaries

**Solution**: Archive older phases
```bash
# In workspace
mv research_summary.md research_summary_phase1.md
# Agent will create fresh summary for current phase
```

**Prevention**: Design research phases to be independently summarizable

---

### Issue 3: "Agent doesn't call create_summary"

**Symptoms**: notes.md grows very large, agent doesn't compress

**Cause**: Task description doesn't prompt summarization

**Solution**: Be explicit in task
```bash
# Bad (agent may not summarize)
"Research topic X comprehensively"

# Good (agent knows when to summarize)
"Research topic X. When notes.md exceeds 500 lines, call create_summary. Continue research after summarization."
```

---

### Issue 4: "Agent re-researches same topics"

**Symptoms**: Duplicate findings, redundant notes

**Cause**: Agent not checking existing notes

**Solution**: Remind agent to check progress
```bash
# Bad
"Research topic Y"

# Good
"Continue research on topic Y. First read_note to see what's covered. Avoid duplicating existing findings."
```

---

### Issue 5: "Want faster research (less detail)"

**Symptoms**: Research taking many iterations

**This is expected** for thorough research!

**Optimization strategies**:

**Strategy 1**: Focus the scope
```bash
"Research only the top 3 RAG techniques, brief overview for each"
```

**Strategy 2**: Set iteration limits
```bash
"Survey RAG techniques in 10 iterations max. High-level only."
```

**Strategy 3**: Use existing knowledge
```bash
"You already know RAG basics. Focus research on 2024 innovations only."
```

---

## 🎓 Understanding Delta's Context Composition (v1.6)

This example demonstrates all three core principles + v1.6 context features:

### 1. Everything is a Command ✅

**Principle**: All capabilities are external CLI programs.

**Implementation**:
- `write_note` → Unix `tee -a`
- `search_notes` → `grep -rn`
- `create_summary` → Python script
- Even context assembly uses shell scripts (`computed_files`)

**Extension example**:
```yaml
# Add web search capability
- name: web_search
  command: [curl, -s]
  parameters:
    - name: url
      inject_as: argument
```

### 2. Environment as Interface ✅

**Principle**: Agent interacts only through workspace directory.

**Implementation**:
- Research notes → `notes.md` file
- Compressed history → `research_summary.md` file
- Sources and citations → embedded in markdown files
- No external databases, APIs, or hidden state

**Why it matters**: Everything is visible, debuggable, and version-controllable. Want to see agent's knowledge? Read the files. Want to share research? Copy the workspace.

### 3. Stateless Core ✅

**Principle**: No in-memory state. Everything rebuilt from journal + workspace.

**Implementation**:
- Agent doesn't "remember" previous research across iterations
- Every iteration: context loaded from files via context.yaml
- notes.md + research_summary.md = agent's complete "memory"
- Journal records all decisions (what was researched, when, why)

**Resumability example**:
```
Day 1, 2pm: Research phase 1 → notes.md (500 lines) → pause
Day 5, 9am: Resume → context.yaml loads notes.md → agent continues
            → Agent knows exactly where it left off
```

### 4. Context Composition (v1.6) ✅

**New capability**: Dynamic context assembly from multiple sources.

**How it works**:
```yaml
# context.yaml
static_files:
  - path: system_prompt.md  # Always loaded

computed_files:
  - name: research_progress
    command: [sh, -c, "cat research_summary.md || echo 'No summary'"]
    max_tokens: 2000  # Limit to prevent overflow

direct_includes:
  - path: notes.md
    max_tokens: 3000
    if_exists: true  # Only load if file exists
```

**Context assembly process**:
1. Static files loaded (system_prompt.md)
2. Computed files executed (script runs, output captured)
3. Direct includes loaded (notes.md read)
4. All assembled into single context
5. Sent to LLM

**Why it matters**: Enables "infinite memory" through summarization. As research grows, old notes compressed into summaries, new notes keep growing. Context size stays constant.

---

## 🔬 Extending This Pattern

The research-agent pattern enables many advanced use cases:

### Pattern 1: Literature Review Agent

Modify for academic paper summarization:

```yaml
# Add tools
- name: read_pdf
  command: [pdftotext]
  parameters:
    - name: pdf_path
      inject_as: argument

- name: extract_citations
  command: [python3, "${AGENT_HOME}/tools/extract_refs.py"]
  ...
```

**System prompt changes**:
- Focus on academic rigor
- Citation management (BibTeX format)
- Structured literature review format

### Pattern 2: Market Research Agent

Research commercial topics:

```yaml
- name: fetch_webpage
  command: [curl, -s]
  ...

- name: extract_data
  command: [python3, "${AGENT_HOME}/tools/scrape.py"]
  ...
```

**System prompt changes**:
- Focus on trends, competitors, market sizing
- Structured output (tables, charts data)
- Executive summary format

### Pattern 3: Technical Documentation Agent

Research codebases:

```yaml
- name: read_code
  command: [cat]
  ...

- name: analyze_deps
  command: [npm, list, --json]
  ...
```

**System prompt changes**:
- Code analysis focus
- API documentation format
- Examples and usage patterns

### Pattern 4: Comparative Analysis Agent

Research multiple options:

```markdown
## Research Structure
- notes_option_a.md
- notes_option_b.md
- notes_option_c.md
- comparison_matrix.md (created at end)
```

**System prompt changes**:
- Parallel research tracks
- Structured comparison criteria
- Final decision matrix

---

## 📚 Related Documentation

- **Context Composition**: [v1.6 Architecture](../../../docs/architecture/v1.6-context-composition.md)
- **Memory Folding**: [CLAUDE.md - Context Management](../../../CLAUDE.md#context-management)
- **Stateless Core**: [v1.1 Design](../../../docs/architecture/v1.1-design.md)

### See Also: Other Examples

- **[memory-folding](../../2-core-features/memory-folding/)** - Simpler context compression example
- **[code-reviewer](../code-reviewer/)** - Lifecycle hooks pattern
- **[delta-agent-generator](../delta-agent-generator/)** - AI orchestration

---

## 🔧 Technical Details

### File Structure

```
examples/3-advanced/research-agent/
├── config.yaml              # Tool definitions
├── context.yaml             # v1.6: Context composition rules
├── system_prompt.md         # Research methodology
├── README.md                # This file
└── tools/
    └── summarize_research.py  # Python summarization script
```

### Configuration

- **Model**: gpt-4o (advanced reasoning for synthesis)
- **Temperature**: 0.5 (balanced creativity and accuracy)
- **Max tokens**: 4000 (sufficient for detailed research)
- **Tools**: 5 (write_note, read_note, list_notes, search_notes, create_summary)
- **Context composition**: 3 sources (static, computed, direct)

### Context Budget

```
system_prompt.md:        ~500 tokens (static)
research_summary.md:     up to 2000 tokens (computed)
notes.md:                up to 3000 tokens (direct)
Tools + user task:       ~2500 tokens
─────────────────────────────────────────────
Total:                   ~8000 tokens (constant!)
```

### Summarization Strategy

**Input**: Verbose research notes (~3000 tokens)
**Process**:
1. Extract headings (structure preservation)
2. Extract first sentence of each section (key finding)
3. Keep all bullet points (likely key points)
4. Truncate long explanations
5. Add compression statistics

**Output**: Compressed summary (~500 tokens)
**Compression ratio**: Typically 80-85% reduction

### Dependencies

- Python 3 (for summarization script)
- Unix commands: cat, tee, ls, grep
- Delta Engine v1.6+ (for context composition)

---

## 🎯 When To Use Research Agent

### ✅ Perfect For

- **Literature reviews**: Systematic survey of papers/articles
- **Market research**: Trends, competitors, opportunities
- **Technical surveys**: Technology comparisons, best practices
- **Knowledge accumulation**: Building domain expertise over time
- **Multi-day projects**: Research spanning days/weeks

### ❌ Not Ideal For

- **Quick lookups**: Single-fact queries (use simpler tools)
- **Real-time data**: Research agent is not connected to live data sources
- **Interactive research**: Requires autonomous operation (use human feedback sparingly)

### 🤔 Consider Alternatives

- **Web search**: For current events or real-time data
- **memory-folding example**: For simpler context compression needs
- **Manual research**: For highly specialized domains requiring expert judgment

---

## 🧪 Testing Checklist

Verify this example works correctly:

- [ ] **Example 1 (simple)**: Basic research, creates notes.md
- [ ] **Example 2 (summarization)**: Agent calls create_summary, compresses notes
- [ ] **Example 3 (multi-session)**: Resume research days later, continues seamlessly
- [ ] **Context composition**: Notes and summary loaded automatically
- [ ] **Memory folding**: Constant context size across multiple phases
- [ ] **Python script**: summarize_research.py works correctly
- [ ] **Error handling**: Missing files handled gracefully

---

## 💡 Key Takeaways

1. **Context composition enables unlimited research**: Constant context size across infinite duration
2. **Memory folding is proactive**: Summarize before overflow, not after
3. **Phase-based research scales**: Break large topics into manageable phases
4. **Perfect resumability**: Pause/resume across days/weeks with zero state loss
5. **Workspace is complete memory**: All knowledge in visible files (no hidden state)
6. **Stateless core = transparency**: Every decision reconstructable from journal + files
7. **Production-ready pattern**: Use for real long-running research tasks

---

## 📝 Version History

- **v1.0.0** (2025-10-08): Initial release with v1.6 context composition and memory folding

---

## 🤝 Contributing

To improve this example:
1. Add more sophisticated summarization algorithms
2. Integrate external data sources (web search, APIs)
3. Create domain-specific research templates (academic, market, technical)
4. Share your custom research workflows

---

**Ready to use?** Run Example 1 to start your first research project. Watch context composition and memory folding in action!
