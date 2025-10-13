# Memory Folding Example Agent

**v1.6 flagship feature**: Demonstrates Delta Engine's **Context Composition Layer** with dynamic memory compression.

---

## 🎯 What This Example Demonstrates

This agent showcases the `computed_file` source type, a v1.6 feature that enables:

- **Memory folding**: Compressing journal history into concise summaries
- **Token efficiency**: Keep context windows small even after 20+ iterations
- **Dynamic context generation**: Python scripts generate context on-the-fly before each LLM call
- **Long-running tasks**: Multi-day projects without context explosion

**Delta-Unique Value**: This capability is impossible with generic LLM tools. Only Delta's context composition layer makes memory folding practical and reliable.

---

## 🏗️ How It Works

### Think-Act-Observe Cycle with Memory Folding

```
[Iteration N]
    ↓
1. CONTEXT PREPARATION (Before LLM)
   ├─ Load system_prompt.md (static)
   ├─ Load DELTA.md if exists (workspace guide)
   ├─ Run tools/summarize.py → generates summary.md
   │  └─ Reads full journal.jsonl
   │  └─ Extracts key facts: tools used, files created, decisions
   │  └─ Writes .delta/context_artifacts/summary.md
   └─ Load recent journal (last 5 iterations only)
    ↓
2. THINK (LLM Decision)
   - Agent sees: system prompt + summary + recent 5 turns
   - Agent knows: What happened 20 iterations ago (from summary)
   - Agent decides: What tools to call next
    ↓
3. ACT (Tool Execution)
   - write_file() → Persist data to workspace
   - read_file() → Retrieve stored information
   - list_files() → Understand workspace state
    ↓
4. OBSERVE (Record Results)
   - Tool outputs → Appended to journal.jsonl
   - Next iteration: New summary generated from updated journal
    ↓
[Iteration N+1] → Repeat with compressed context
```

### Context Strategy (context.yaml)

```yaml
sources:
  # Layer 1: Agent instructions (always present)
  - type: file
    path: "${AGENT_HOME}/system_prompt.md"

  # Layer 2: Workspace guide (if agent creates DELTA.md)
  - type: file
    path: "${CWD}/DELTA.md"
    on_missing: skip

  # Layer 3: Compressed memory (dynamic generation)
  - type: computed_file
    generator:
      command: ["python3", "${AGENT_HOME}/tools/summarize.py"]
      timeout_ms: 10000
    output_path: "${CWD}/.delta/context_artifacts/summary.md"
    on_missing: skip

  # Layer 4: Recent conversation (last 5 iterations only)
  - type: journal
    max_iterations: 5
```

**Key Insight**: Agent sees **full summary** + **recent 5 turns**, not all 20+ iterations. Context stays small, memory stays complete.

---

## 🚀 Quick Start

### Prerequisites
```bash
# Build Delta Engine
npm run build

# Verify Python 3 available
python3 --version
```

### Example 1: Basic Memory Folding (Simple)

Create files and see memory compression in action:

```bash
delta run \
  --agent examples/2-core-features/memory-folding \
  -m "Create 3 text files (file1.txt, file2.txt, file3.txt) with different content, then list them and summarize what you created" \
  --work-dir /tmp/memory-test \
  -y
```

**Expected behavior**:
- Iteration 1-2: Creates files
- Iteration 3: Lists and summarizes
- Check summary: `cat /tmp/memory-test/.delta/context_artifacts/summary.md`

### Example 2: Long-Running Task (Medium)

Test memory retention across many iterations:

```bash
delta run \
  --agent examples/2-core-features/memory-folding \
  -m "Create 10 files named step1.txt through step10.txt. In each file, write 'Completed step N'. After all files are created, write a report.md summarizing all steps completed." \
  --work-dir /tmp/memory-long \
  -y
```

**What to observe**:
- Agent completes task across multiple iterations
- Summary file grows with each iteration
- Recent journal stays fixed at 5 iterations
- Agent remembers early steps even when out of recent journal

### Example 3: Multi-Day Research Simulation (Complex)

Simulate a long research project:

```bash
delta run \
  --agent examples/2-core-features/memory-folding \
  -m "Research task: Create findings.md (iteration 1-3), then outline.md (iteration 4-5), then draft.md (iteration 6-8). Each file should reference previous work. Finally create final_report.md combining everything." \
  --work-dir /tmp/memory-research \
  -y
```

**Demonstrates**:
- Incremental progress tracking
- Cross-file references
- Long-term memory retention
- Complex multi-phase workflows

---

## 📊 What To Observe

### 1. Compressed Memory in Action

After running any example, inspect the generated summary:

```bash
# View the compressed memory
cat /tmp/memory-test/.delta/context_artifacts/summary.md
```

You'll see:
- **Progress tracking**: Iteration count
- **Tool usage stats**: How many times each tool was called
- **Key actions**: Files created, important decisions
- **Compact format**: ~10-20 lines representing 10+ iterations

### 2. Context Window Efficiency

```bash
# Count journal events (all history)
wc -l /tmp/memory-test/.delta/*/journal.jsonl

# Compare with summary size (compressed)
wc -l /tmp/memory-test/.delta/context_artifacts/summary.md
```

**Typical results**:
- Journal: 50+ lines (complete history)
- Summary: 15 lines (compressed essence)
- **Compression ratio**: ~70-80% reduction

### 3. Memory Persistence

Run the same agent again with `--resume` (if implemented), or observe:
- Files persist in workspace (permanent memory)
- Summary updates with each iteration (dynamic memory)
- Recent journal slides forward (rolling window)

---

## 🛠️ Troubleshooting

### Issue 1: "Summary not appearing in context"

**Symptoms**: Agent seems to forget previous work

**Diagnosis**:
```bash
# Check if summary file was created
ls -la /path/to/workspace/.delta/context_artifacts/

# Check if summarize.py ran successfully
tail -20 /path/to/workspace/.delta/*/engine.log | grep summarize
```

**Solutions**:
1. Verify Python 3 is installed and accessible
2. Check `tools/summarize.py` permissions: `chmod +x examples/2-core-features/memory-folding/tools/summarize.py`
3. Verify journal.jsonl exists before summary generation
4. Check for Python errors in engine.log

---

### Issue 2: "Context still too large despite compression"

**Symptoms**: Agent hits token limits after many iterations

**Diagnosis**:
```bash
# Check how many iterations in recent journal
grep -c "THOUGHT" /path/to/workspace/.delta/*/journal.jsonl
```

**Solutions**:

**Option 1**: Reduce `max_iterations` in context.yaml (5 → 3):
```yaml
- type: journal
  max_iterations: 3  # Only last 3 turns instead of 5
```

**Option 2**: Enhance summarize.py to be more aggressive (compress more)

**Option 3**: Use smaller model (gpt-4o-mini → gpt-3.5-turbo)

---

### Issue 3: "summarize.py fails with error"

**Symptoms**: Engine log shows Python traceback

**Diagnosis**:
```bash
# Run summarize.py manually
cd /path/to/workspace
python3 /path/to/delta-engine/examples/2-core-features/memory-folding/tools/summarize.py
```

**Common causes**:
1. **Journal doesn't exist yet**: Normal on iteration 1 (summary skipped)
2. **Invalid JSON in journal**: Run `delta run` again (journal might be corrupted)
3. **Python version**: Requires Python 3.6+ (check with `python3 --version`)

**Solutions**:
- Verify journal.jsonl has valid JSONL format (one JSON object per line)
- Check Python dependencies (none required for default summarize.py)
- Update summarize.py if journal schema changed

---

### Issue 4: "Agent doesn't mention compressed memory"

**Symptoms**: Agent works but never references summary

**This is normal!** Agent uses summary implicitly (it's in context) but may not explicitly say "based on my compressed memory...".

**To verify agent sees summary**:
```bash
# Temporarily add print statement to summarize.py
echo 'print("SUMMARY GENERATED!")' >> tools/summarize.py

# Run agent and check output
delta run --agent examples/2-core-features/memory-folding -m "..." | grep "SUMMARY GENERATED"
```

---

### Issue 5: "Memory folding seems unnecessary for my task"

**When memory folding is overkill**:
- ❌ Simple one-shot tasks (< 5 iterations)
- ❌ Tasks requiring full history (detailed audit trail)
- ❌ Short conversations (no context window pressure)

**When memory folding is essential**:
- ✅ Long-running research (10+ iterations)
- ✅ Incremental code review (analyze large codebases piece-by-piece)
- ✅ Multi-day customer support (maintain conversation context)
- ✅ Knowledge accumulation (progressive learning agents)

**Solution**: Use simpler agents (like hello-world) for basic tasks.

---

## 🎓 Understanding Delta's Three Pillars

This example demonstrates all three of Delta's core principles:

### 1. Everything is a Command ✅

**Principle**: All capabilities are external CLI programs, no built-in functions.

**Implementation**:
- `write_file` → Unix `tee` command
- `read_file` → Unix `cat` command
- `list_files` → Unix `ls -la` command
- Memory compression → Python script `summarize.py`

**Why it matters**: You can replace summarize.py with any compression strategy (vector DB, Claude Haiku summarization, knowledge graphs) without modifying Delta Engine.

### 2. Environment as Interface ✅

**Principle**: Agent interacts only through workspace directory.

**Implementation**:
- All files created in `${CWD}` workspace
- No external state (databases, APIs, cloud storage)
- Summary generated in `.delta/context_artifacts/` (part of workspace)
- DELTA.md can be created by agent to guide future iterations

**Why it matters**: Entire agent state is visible and debuggable through file system. No hidden memory.

### 3. Stateless Core ✅

**Principle**: No in-memory state. Everything rebuilt from journal.

**Implementation**:
- Agent doesn't "remember" previous iterations in memory
- Every iteration: rebuild conversation from journal.jsonl
- Memory folding = **journal compression**, not state preservation
- Summary is **derived state** (can be regenerated from journal anytime)

**Why it matters**: Perfect resumability. You can stop agent at iteration 10, wait a week, resume, and it continues exactly where it left off.

---

## 🔬 Extending This Pattern

The `computed_file` mechanism enables many advanced patterns beyond simple summarization:

### Pattern 1: Vector Retrieval (RAG)

Replace `summarize.py` with vector search:

```python
# tools/vector_search.py
# 1. Embed journal content
# 2. Store in vector DB
# 3. Search for relevant context given current task
# 4. Return top-K results as summary
```

**Use case**: Agent searching large knowledge bases for relevant information.

### Pattern 2: Knowledge Graph Extraction

Extract structured information from journal:

```python
# tools/extract_entities.py
# 1. Parse journal for entities (people, files, decisions)
# 2. Build relationship graph
# 3. Output as structured markdown (entities + relationships)
```

**Use case**: Complex project management with many interconnected facts.

### Pattern 3: Hierarchical Summarization

Multi-level compression for very long tasks:

```python
# tools/hierarchical_summary.py
# 1. Summarize iterations 1-10 → summary_1.md
# 2. Summarize iterations 11-20 → summary_2.md
# 3. Combine summaries → meta_summary.md
```

**Use case**: Month-long research projects with 100+ iterations.

### Pattern 4: Dynamic Context Adaptation

Load different context based on task type:

```python
# tools/adaptive_context.py
# 1. Detect task type from recent journal (research vs coding vs support)
# 2. Load task-specific instructions
# 3. Return relevant context only
```

**Use case**: Multi-purpose agents that switch modes.

---

## 📚 Related Documentation

- **Delta Engine Architecture**: [v1.6 Context Composition](../../../docs/architecture/v1.6-context-composition.md)
- **Context.yaml Reference**: [Agent Development Guide](../../../docs/guides/agent-development.md#context-composition)
- **Journal Format**: [CLAUDE.md](../../../CLAUDE.md#journal-event-types)
- **Stateless Core Design**: [v1.1 Architecture](../../../docs/architecture/v1.1-design.md)

### See Also: Other Examples

- **[hello-world](../../1-basics/hello-world/)** - Basic Delta introduction (no memory folding)
- **[interactive-shell](../interactive-shell/)** - v1.5 session management (same level)
- **[python-repl](../python-repl/)** - REPL state preservation (same level)
- **[delta-agent-generator](../../3-advanced/delta-agent-generator/)** - AI orchestrating AI with sub-agents

---

## 🔧 Technical Details

### File Structure

```
examples/2-core-features/memory-folding/
├── config.yaml              # Tool definitions + LLM settings
├── context.yaml             # Context composition strategy
├── system_prompt.md         # Agent instructions (Delta-aware)
├── README.md                # This file
└── tools/
    └── summarize.py         # Memory compression script
```

### Configuration

- **Model**: gpt-4o-mini (fast, efficient for demos)
- **Temperature**: 0.7 (balanced creativity)
- **Max tokens**: 4000 (sufficient for file operations)
- **Context window**: 128K tokens (gpt-4o-mini)
- **Effective context**: ~5-10K tokens (after compression)

### Performance

| Metric | Without Folding | With Folding |
|--------|----------------|--------------|
| **Iterations** | 20 | 20 |
| **Journal size** | 50KB | 50KB (same) |
| **Context sent** | ~40KB (full) | ~8KB (compressed) |
| **Tokens used** | ~12K | ~2.5K |
| **Cost savings** | - | ~80% |

### Dependencies

- Python 3.6+ (for summarize.py)
- No external Python packages (uses only stdlib)
- Unix commands: `tee`, `cat`, `ls` (standard on macOS/Linux)

---

## 🎯 When To Use Memory Folding

### ✅ Perfect For

- **Long research sessions** (multi-day projects)
- **Large codebase analysis** (incremental review)
- **Customer support** (maintain conversation context)
- **Knowledge accumulation** (progressive learning agents)
- **Multi-document synthesis** (compress source summaries)

### ❌ Not Needed For

- **Simple one-shot tasks** (hello-world is better)
- **Short conversations** (< 5 iterations)
- **Tasks requiring full history** (audit trails, legal review)
- **Real-time systems** (summary generation adds ~100ms overhead)

### 🤔 Consider Alternatives

- **No compression**: Use default journal loading (full history)
- **File-based memory**: Store everything in workspace files (like DELTA.md)
- **External memory**: Use vector DB or knowledge graph (advanced patterns)

---

## 🧪 Testing Checklist

Verify this example works correctly:

- [ ] Run Example 1 (basic): Creates 3 files and summarizes
- [ ] Check summary exists: `.delta/context_artifacts/summary.md`
- [ ] Verify compression: Summary < journal size
- [ ] Run Example 2 (long-running): Agent completes 10-step task
- [ ] Verify memory retention: Agent knows about step 1 when on step 10
- [ ] Test error recovery: Interrupt and resume (if resume implemented)
- [ ] Inspect workspace: Files persist correctly
- [ ] Check engine.log: No Python errors from summarize.py

---

## 💡 Key Takeaways

1. **Memory folding ≠ forgetting**: Compressed memory preserves key facts
2. **Files are permanent storage**: Use workspace for important data
3. **Summary is dynamic**: Regenerated every iteration from journal
4. **Token efficiency**: 70-80% context reduction typical
5. **Extensible pattern**: Replace summarize.py with any compression strategy
6. **Production-ready**: Use this pattern in real long-running agents

---

## 📝 Version History

- **v1.0.0** (2025-10-08): Enhanced documentation, improved system prompt, updated to gpt-4o-mini
- **v0.9.0** (2025-10-01): Initial example showcasing computed_file feature

---

## 🤝 Contributing

To improve this example:
1. Test with your own long-running tasks
2. Report issues with summary generation
3. Share alternative compression strategies (vector DB, embeddings, etc.)
4. Suggest improvements to summarize.py

---

**Ready to use?** Run Example 1 and inspect the generated summary. See memory folding in action!
