# CLAUDE.md

This document defines the core methodology and philosophy for working with the Delta Engine project.

**Language**: All documentation must be in English.

## Core Philosophy

**Delta's Three Pillars:**
1. **Everything is a Command** - All agent capabilities are external CLI programs
2. **Environment as Interface** - Agents interact only through working directory
3. **Composition Defines Intelligence** - Complex behaviors emerge from composing simple agents

**Project Values:**
- Simplicity > Features
- Safety > Speed
- Clarity > Cleverness
- Recovery > Efficiency
- Less > More (非必要不增加)

## Methodology Principles

**High-level guidance, not low-level rules.**

Overly specific instructions lead to mechanical execution.
Clear principles enable intelligent adaptation.

---

## 🎯 The Three-Document Method

Every feature implementation requires three distinct documents that serve as the backbone of development:

### 1. Design Document (Why & What)
**Purpose:** Define WHY we're building this and WHAT it looks like
- **Why:** The problem and its importance
  - What pain does this solve?
  - Why does it matter now?
  - What happens if we don't solve it?
- **What:** The solution from user's perspective
  - User interface and experience
  - Success criteria and acceptance tests
- NO implementation details
- NO code

**Location:** `docs/architecture/vX.Y-feature-name.md`

### 2. Implementation Plan (How)
**Purpose:** Break down the technical approach into manageable phases
- Phases for focused AI attention (smaller context = higher quality)
- Architecture decisions and trade-offs
- Critical logic and schemas (but not "writing code in markdown")
- Each phase independently verifiable
- Risk assessment and mitigation

**Location:** `docs/architecture/vX.Y-implementation-plan.md`

### 3. Test Document (Verify)
**Purpose:** Independent quality gatekeeper
- Based on Design Document, NOT implementation
- End-to-end validation from user perspective
- Written scenarios in plain language
- Acts as "referee" independent from "athlete"
- **Role Separation:** Test validation should ideally be performed by someone other than the implementer (or through an independent review process) to maintain true independence
- Defines what "done" actually means

**Location:** `docs/architecture/vX.Y-test-plan.md`

**Why Three Documents?**
- Separates builder from validator (athlete vs referee) - the implementer creates, but ideally another party validates
- Documents serve as recovery blueprint if work is lost
- Forces clear thinking before coding
- Creates confidence to ship

---

## 🔄 Development Workflow

```
Think → Document → Build → Verify → Ship
```

### Think Phase
Questions to answer:
- What problem are we solving?
- What's the simplest solution that works?
- Can this be done with existing tools?
- What could go wrong?

### Document Phase
Actions:
1. Create Design Document (why it matters + what users see)
2. Create Implementation Plan (technical breakdown)
3. Create Test Document (validation criteria)
4. Review all three for consistency

Remember: Documents are your recovery blueprint.

### Build Phase
Principles:
- Follow implementation plan phases strictly
- Small, verifiable increments
- Always maintain working state
- If stuck, refer back to documents

### Verify Phase
Rules:
- Execute test document scenarios
- **Independent Verification:** When possible, have someone other than the implementer execute test scenarios (maintaining referee independence)
- End-to-end validation from user perspective
- Tests reveal problems, don't hide them
- NEVER modify tests just to pass

### Ship Phase
Checklist:
- All test scenarios genuinely pass
- User can actually use the feature
- Documentation reflects reality
- No "we'll fix it later" items

---

## 🚨 Critical Safety Rules

These are the only rules that truly matter because violating them causes irreversible damage:

### 1. Destructive Operations
**The Rule:** NEVER execute without explicit user request by exact command name

**Dangerous Commands:**
- `git checkout HEAD -- .` (discards all uncommitted changes)
- `git reset --hard` (destroys all uncommitted work)
- `git clean -fd` (deletes untracked files)
- `rm -rf` (recursive force delete)
- `git push --force` (overwrites remote history)

**Required Protocol:**
1. User must request by exact command name
2. Warn about specific data loss
3. Get explicit confirmation
4. Only then execute

**Safe Alternatives First:**
- Instead of `git checkout HEAD -- .` → Use `git stash`
- Instead of `git reset --hard` → Use `git stash` or new branch
- Instead of `rm -rf` → Move to temp location first

### 2. Test Integrity
**The Rule:** Tests are sacred - they judge the code, not vice versa

**Requirements:**
- Run `npm run test:all` for complete validation (NOT just `npm test`)
- NEVER say "tests passed" without full test run
- NEVER modify tests to make them pass
- Test failure = feature incomplete, period

### 3. Work Preservation
**The Rule:** Never lose work

**Protocol:**
- Check for uncommitted changes before ANY cleanup
- Create documents BEFORE implementation (recovery blueprint)
- Commit frequently with meaningful messages
- When in doubt, create a backup

---

## 🧭 Decision Framework

When facing any decision, ask these questions in order:

1. **Is it safe?**
   - Will this lose data?
   - Can we recover if it goes wrong?

2. **Is it simple?**
   - Is there a simpler solution?
   - Are we over-engineering?

3. **Is it necessary?**
   - Does the user actually need this?
   - What happens if we don't do it?

4. **Is it testable?**
   - Can we verify it works?
   - Will users be able to use it?

Stop at the first "No" and reconsider.

---

## 📍 Quick Reference

### Essential Commands
```bash
# Run agent
delta run -m "Task description"         # Simple run
delta run -i -m "Task"                  # Interactive mode
delta continue --run-id <id>            # Resume run

# Complete test validation
npm run test:all                        # The ONLY way to verify

# Debug
delta list-runs                         # List all runs
tail .delta/{run_id}/journal.jsonl      # Check progress
cat .delta/{run_id}/metadata.json       # Check status
```

### Directory Structure
```
workspaces/
└── W001/                               # Workspace
    └── .delta/
        └── {run_id}/                   # Each run (v1.10: no LATEST file)
            ├── journal.jsonl           # Single source of truth
            ├── metadata.json           # Run status
            └── io/                     # Audit trail
```

### Current Version
**v1.10** - Frontierless Workspace
- Explicit run IDs (no LATEST file)
- Concurrent agent support
- Structured output formats

---

## 📚 Where to Find Details

This document focuses on methodology. Technical details live elsewhere:

- **Code conventions** → Look at existing code
- **API documentation** → `docs/api/`
- **Testing philosophy** → `docs/TESTING.md`
- **Incident history** → `.story/incidents/`
- **Version history** → Git commits and tags

Don't duplicate what can be found elsewhere. Link, don't copy.

---

## 🎓 Final Wisdom

> "The best code is no code.
> The best documentation is self-evident design.
> The best test is user success."

**Remember:**
- Methodology over technology
- Thinking over typing
- Safety over speed

Keep this file under 250 lines. If it grows larger, move details elsewhere.