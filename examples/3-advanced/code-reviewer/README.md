# Code Reviewer Agent

**Advanced example**: Demonstrates Delta Engine's lifecycle hooks and multi-file code review patterns.

---

## 🎯 What This Example Demonstrates

This agent showcases advanced Delta Engine capabilities:

- **Lifecycle Hooks**: `pre_llm_req` and `post_tool_exec` for audit logging
- **Stateless Resumability**: Pause long reviews, resume days later
- **Complete Audit Trail**: Every review decision logged in `.delta/review-audit.log`
- **Multi-File Context**: Systematic approach to reviewing multiple files
- **Real-World Use Case**: Automated code review that scales

**Delta-Unique Value**: The combination of hooks + stateless core + journal-based audit trail creates a code review system that's both powerful and transparent. You can see exactly what was reviewed, when, and why - impossible with generic LLM tools.

---

## 🏗️ How It Works

### Think-Act-Observe with Lifecycle Hooks

```
[Iteration N]
    ↓
1. PRE-LLM HOOK (Automatic)
   ├─ Create DELTA.md workspace guide if missing
   ├─ Log iteration start to .delta/review-audit.log
   └─ Prepare context for review
    ↓
2. THINK (LLM Decision)
   - Agent sees: Changes from git_diff
   - Agent decides: Which files to review, what to check
    ↓
3. ACT (Tool Execution)
   - read_file() → Examine code
   - search_code() → Find patterns
   - write_review() → Document findings
    ↓
4. POST-TOOL HOOK (Automatic, after each tool)
   ├─ Log tool execution to audit trail
   ├─ Note if write_review was called (finding recorded)
   └─ Maintain complete audit log
    ↓
5. OBSERVE (Record Results)
   - Tool outputs → Appended to journal
   - Findings → Written to REVIEW.md
   - Audit trail → Updated with timestamps
    ↓
[Iteration N+1] → Repeat until review complete
```

### Tools Available

| Tool | Purpose | Command |
|------|---------|---------|
| **read_file** | Read source files | cat |
| **list_files** | List directory contents | ls -la |
| **git_diff** | Show code changes | git diff |
| **git_log** | Show commit history | git log |
| **search_code** | Find code patterns | grep -rn |
| **write_review** | Document findings | tee -a |

### Lifecycle Hooks

#### pre_llm_req Hook
**Runs**: Before each LLM call (every iteration)
**Actions**:
- Creates `DELTA.md` workspace guide if missing
- Logs iteration start to `.delta/review-audit.log`

**Value**: Ensures consistent workspace state, creates audit trail

#### post_tool_exec Hook
**Runs**: After every tool execution
**Actions**:
- Logs tool name and timestamp to audit trail
- Special logging for `write_review` (marks when findings recorded)

**Value**: Complete transparency - you can see exactly what the agent examined and when

---

## 🚀 Quick Start

### Prerequisites
```bash
# Build Delta Engine
npm run build

# Ensure you're in a git repository
git init  # If not already a git repo
```

### Example 1: Review Single File (Simple)

Review a specific file for issues:

```bash
delta run \
  --agent examples/3-advanced/code-reviewer \
  -m "Review src/auth.js for security issues"
```

**Expected behavior**:
- Agent reads `src/auth.js`
- Identifies potential security issues
- Creates `REVIEW.md` with findings
- Audit trail in `.delta/review-audit.log`

---

### Example 2: Review Recent Changes (Medium)

Review what changed in the last commit:

```bash
delta run \
  --agent examples/3-advanced/code-reviewer \
  -m "Review changes in the last commit (HEAD~1..HEAD). Focus on code quality and potential bugs."
```

**Expected behavior**:
- Agent runs `git diff HEAD~1..HEAD` to see changes
- Reviews only changed files
- Documents findings by severity
- Creates structured REVIEW.md report

---

### Example 3: Review Feature Branch (Complex)

Review an entire feature branch before merging:

```bash
delta run \
  --agent examples/3-advanced/code-reviewer \
  -m "Review all changes in feature/user-auth branch compared to main. Check for: security issues, code quality, test coverage, and documentation."
```

**Expected behavior**:
- Agent runs `git diff main..feature/user-auth`
- Reviews multiple changed files across iterations
- Uses hooks to log each step
- Can be paused/resumed (Ctrl+C, then rerun)
- Final REVIEW.md with categorized findings

**Demonstrates resumability**:
```bash
# Start review
delta run --agent code-reviewer -m "Review feature branch" ...

# [Agent reviews 5/15 files, you Ctrl+C to pause]

# Resume later (hours or days)
delta run --agent code-reviewer -m "Continue review where left off" ...

# Agent checks REVIEW.md, sees 5 files done, continues with file 6
```

---

## 📊 What To Observe

### 1. Lifecycle Hooks in Action

After running a review, check the audit trail:

```bash
# View audit log
cat /tmp/code-review-test/.delta/review-audit.log
```

Example output:
```
[2025-10-08T10:00:00Z] Pre-LLM: Starting iteration
[2025-10-08T10:00:05Z] Tool executed: git_diff
[2025-10-08T10:00:10Z] Tool executed: read_file
[2025-10-08T10:00:15Z] Tool executed: write_review
  → Review finding recorded
[2025-10-08T10:00:20Z] Pre-LLM: Starting iteration
[2025-10-08T10:00:25Z] Tool executed: read_file
...
```

**Key Insights**:
- Every iteration logged with timestamp
- Every tool execution tracked
- `write_review` calls highlighted (findings recorded)
- Complete transparency of review process

### 2. Review Report Structure

Check the generated `REVIEW.md`:

```bash
# View review report
cat /tmp/code-review-test/REVIEW.md
```

Expected structure:
```markdown
## [CRITICAL] SQL Injection Vulnerability

**File**: src/db.js:45
**Severity**: CRITICAL

**Description**:
User input directly concatenated into SQL query without sanitization.

**Current Code**:
```javascript
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

**Suggested Fix**:
```javascript
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

**Rationale**:
Parameterized queries prevent SQL injection attacks.

---

## [MAJOR] Missing Input Validation

**File**: src/api.js:23
...
```

### 3. Stateless Resumability

Test pause/resume capability:

```bash
# Start long review (20+ files)
delta run --agent code-reviewer -m "Review entire src/ directory" ...

# After 2-3 iterations, press Ctrl+C to interrupt

# Check what was completed
cat REVIEW.md  # See findings for files 1-3

# Resume the review
delta run --agent code-reviewer -m "Continue the code review. Check REVIEW.md to see what's already reviewed, then continue with remaining files." ...

# Agent picks up where it left off
```

**This works because**:
- REVIEW.md persists findings
- Journal records all iterations
- Stateless core rebuilds context
- Hooks continue logging seamlessly

---

## 🛠️ Troubleshooting

### Issue 1: "git diff fails with 'not a git repository'"

**Symptoms**: Agent can't run git commands

**Diagnosis**:
```bash
# Check if workspace is a git repo
git status
```

**Solutions**:
1. Run in an existing git repository
2. Or initialize git: `git init && git add . && git commit -m "Initial"`
3. Or review without git: "Review src/*.js files directly (don't use git_diff)"

---

### Issue 2: "Audit trail not created"

**Symptoms**: `.delta/review-audit.log` doesn't exist

**Diagnosis**:
```bash
# Check if .delta directory exists
ls -la .delta/
```

**Causes**:
- Hooks didn't run (check engine.log for errors)
- Insufficient permissions to create .delta/

**Solutions**:
1. Check Delta Engine version supports hooks (v1.1+)
2. Verify hook commands in config.yaml
3. Check workspace permissions: `chmod +w .`

---

### Issue 3: "Review is too slow (many files)"

**Symptoms**: Agent takes many iterations for large codebase

**This is expected!** Code review is iterative.

**Optimization strategies**:

**Strategy 1**: Focus on changes only
```bash
"Review only files changed in last commit (HEAD~1..HEAD)"
```

**Strategy 2**: Review specific directory
```bash
"Review only files in src/auth/ directory"
```

**Strategy 3**: Security-focused review
```bash
"Focus only on security issues. Use search_code to find: eval(), exec(), hardcoded passwords, SQL queries"
```

---

### Issue 4: "Agent re-reviews same files"

**Symptoms**: Agent doesn't remember what was reviewed

**Cause**: Task description doesn't reference existing REVIEW.md

**Solution**: Update task to reference state
```bash
# Bad (agent doesn't check previous work)
"Review src/ directory"

# Good (agent checks REVIEW.md first)
"Continue code review. Check REVIEW.md to see what's done, review remaining files."
```

---

### Issue 5: "Want more detailed reviews"

**Symptoms**: Agent's reviews are too high-level

**Solution**: Be specific in task description
```bash
# Generic (brief reviews)
"Review auth.js"

# Specific (detailed reviews)
"Review auth.js line-by-line. Check for:
- SQL injection vulnerabilities
- Missing input validation
- Hardcoded secrets
- Race conditions
- Error handling gaps
For each issue found, provide exact line number and code fix."
```

---

## 🎓 Understanding Delta's Three Pillars

This example demonstrates all three core principles:

### 1. Everything is a Command ✅

**Principle**: All capabilities are external CLI programs.

**Implementation**:
- `read_file` → `cat` command
- `git_diff` → `git diff` command
- `search_code` → `grep -rn` command
- `write_review` → `tee -a` command

**Why it matters**: You can replace any tool. Want to use `ripgrep` instead of `grep`? Just change the command in config.yaml. Want to integrate eslint? Add a new tool with `eslint` command.

**Example Extension**:
```yaml
- name: run_linter
  description: Run ESLint on JavaScript files
  command: [npx, eslint, --format, json]
  parameters:
    - name: file_path
      inject_as: argument
```

### 2. Environment as Interface ✅

**Principle**: Agent interacts only through workspace directory.

**Implementation**:
- Review findings → `REVIEW.md` file
- Workspace guide → `DELTA.md` file
- Audit trail → `.delta/review-audit.log` file
- No external databases, APIs, or hidden state

**Why it matters**: Everything is visible and debuggable. Want to see the agent's decisions? Read REVIEW.md. Want to understand the review process? Check the audit log. No black boxes.

### 3. Stateless Core ✅

**Principle**: No in-memory state. Everything rebuilt from journal.

**Implementation**:
- Agent doesn't "remember" previous files reviewed
- Every iteration rebuilds context from journal + workspace files
- REVIEW.md acts as persistent state (created by agent)
- Hooks run on every iteration (stateless context preparation)

**Why it matters**: Perfect resumability. Pause at any point, resume later (hours or days), and the review continues exactly where it left off. The journal + workspace files contain complete state.

**Resumability Example**:
```
Day 1, 2pm: Review files 1-5 → pause (Ctrl+C)
Day 2, 9am: Resume → agent rebuilds state from journal
            → checks REVIEW.md (files 1-5 done)
            → continues with file 6
```

---

## 🔬 Extending This Pattern

The code-reviewer pattern enables many advanced use cases:

### Pattern 1: Security-Focused Audits

Modify system_prompt.md to focus exclusively on security:

```markdown
## Security Review Checklist

For each file, check:
- [ ] SQL injection (search for string concatenation in queries)
- [ ] XSS vulnerabilities (search for innerHTML, document.write)
- [ ] Hardcoded secrets (search for 'password', 'api_key', 'secret')
- [ ] Insecure crypto (search for MD5, SHA1)
- [ ] Command injection (search for exec, eval)
```

### Pattern 2: Test Coverage Verification

Add tool to check test coverage:

```yaml
- name: check_coverage
  command: [npx, jest, --coverage, --json]
  parameters: []
```

Then modify prompt to require ≥80% coverage for reviewed files.

### Pattern 3: Style/Lint Integration

Add linter tools and modify prompt to enforce style:

```yaml
- name: run_eslint
  command: [npx, eslint, --format, json]
  ...

- name: run_prettier
  command: [npx, prettier, --check]
  ...
```

### Pattern 4: AI-Powered Static Analysis

Use Claude to detect complex patterns:

```
"Search for potential race conditions in async code:
1. Find all async functions
2. Check for shared state modifications
3. Verify proper locking/synchronization"
```

---

## 📚 Related Documentation

- **Delta Engine Hooks**: [CLAUDE.md - Lifecycle Hooks](../../../CLAUDE.md#lifecycle-hooks)
- **Stateless Core**: [v1.1 Architecture](../../../docs/architecture/v1.1-design.md)
- **Journal Format**: [CLAUDE.md - Journal Event Types](../../../CLAUDE.md#journal-event-types)

### See Also: Other Examples

- **[hello-world](../../1-basics/hello-world/)** - Delta fundamentals
- **[memory-folding](../../2-core-features/memory-folding/)** - Context composition (similar hooks concept)
- **[delta-agent-generator](../delta-agent-generator/)** - AI orchestration patterns

---

## 🔧 Technical Details

### File Structure

```
examples/3-advanced/code-reviewer/
├── config.yaml              # Tool definitions + lifecycle hooks
├── system_prompt.md         # Review standards and workflow
├── README.md                # This file
└── .review-template.md      # Optional: Review report template
```

### Configuration

- **Model**: gpt-4o (advanced reasoning for code review)
- **Temperature**: 0.3 (low for consistent, precise reviews)
- **Max tokens**: 4000 (sufficient for detailed analysis)
- **Tools**: 6 (read_file, list_files, git_diff, git_log, search_code, write_review)
- **Hooks**: 2 (pre_llm_req, post_tool_exec)

### Hooks Breakdown

**pre_llm_req**:
- Runs before each iteration
- Creates DELTA.md if missing
- Logs iteration start
- Timeout: 3000ms

**post_tool_exec**:
- Runs after every tool call
- Logs tool name + timestamp
- Highlights write_review calls
- Timeout: 2000ms

### Dependencies

- Git (for git_diff, git_log)
- Unix commands: cat, ls, grep, tee
- Delta Engine v1.1+ (for hooks support)

---

## 🎯 When To Use Code Reviewer

### ✅ Perfect For

- **Pre-merge reviews**: Review pull requests before merging
- **Security audits**: Find vulnerabilities in code
- **Code quality checks**: Maintain standards across team
- **Legacy code review**: Systematic review of old code
- **Onboarding**: Help new devs understand codebase through reviews

### ❌ Not Ideal For

- **Real-time review**: Code reviewer takes multiple iterations (not instant)
- **Very large codebases**: Review 1000+ files in one go (use focused reviews instead)
- **Non-code files**: Designed for source code, not documentation/images

### 🤔 Consider Alternatives

- **Manual review**: For small changes (1-2 files)
- **IDE linters**: For instant style feedback (eslint, prettier)
- **CI/CD integration**: For automated checks on every commit

---

## 🧪 Testing Checklist

Verify this example works correctly:

- [ ] **Example 1 (single file)**: Reviews one file, creates REVIEW.md
- [ ] **Example 2 (git diff)**: Reviews changes in commit
- [ ] **Example 3 (branch diff)**: Reviews feature branch vs main
- [ ] **Hooks working**: Audit trail created in `.delta/review-audit.log`
- [ ] **Resumability**: Can pause (Ctrl+C) and resume
- [ ] **Multi-file**: Reviews 5+ files across multiple iterations
- [ ] **Error handling**: Handles missing files gracefully

---

## 💡 Key Takeaways

1. **Lifecycle hooks provide transparency**: Complete audit trail of review process
2. **Stateless resumability enables long reviews**: Pause/resume anytime without losing state
3. **Incremental review scales**: Review 1-2 files per iteration for large projects
4. **Git integration focuses effort**: Review only what changed, not entire codebase
5. **Everything is a command**: Easy to extend with linters, static analysis, etc.
6. **Production-ready pattern**: Use for real code reviews in your team

---

## 📝 Version History

- **v1.0.0** (2025-10-08): Initial release with lifecycle hooks and resumability

---

## 🤝 Contributing

To improve this example:
1. Add more security check patterns
2. Integrate additional linters (pylint, rustfmt, etc.)
3. Create review templates for different languages
4. Share your custom hooks for specialized reviews

---

**Ready to use?** Run Example 1 to review your first file. Check the audit trail to see hooks in action!
