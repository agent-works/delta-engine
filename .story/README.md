# .story/ - Incidents & Experiments

This directory contains **real-world incident reports** and **architecture validation experiments** for Delta Engine.

## What's Here?

### incidents/
Post-mortem reports of real problems encountered during development or production:
- Root cause analysis
- Timeline of events
- Solutions implemented
- Prevention measures

### experiments/
Records of architecture validation experiments (POC-first methodology):
- Assumptions tested
- POC results
- Decision rationale
- Learnings captured

## Why This Exists?

**Problem**: Standard documentation (specs, guides) don't capture:
- How things go wrong in practice
- Why certain approaches failed
- Lessons learned from real incidents

**Solution**: Dedicated space for "war stories" and validation records.

## When to Add Content?

### Add Incident Report When:
- ✅ Real bug/issue with non-obvious root cause
- ✅ Problem required significant investigation
- ✅ Solution worth documenting for future
- ✅ Prevention measures actionable

### Add Experiment When:
- ✅ Validated major architectural approach with POCs
- ✅ Multiple options tested with concrete results
- ✅ Learnings applicable to future decisions

### Don't Add:
- ❌ Simple bugs (use git commit messages)
- ❌ Obvious fixes (use code comments)
- ❌ Architecture decisions (use `docs/decisions/` - ADRs)

## Naming Convention

### Incidents
Format: `YYYY-MM-DD-short-description.md`

Example: `2025-10-09-journal-corruption.md`

### Experiments
Format: `YYYY-MM-DD-short-description.md`

Example: `2025-10-01-poc-validation.md`

## Related Documentation

- **Architecture Decisions**: See `docs/decisions/` for ADRs
- **Architecture Specs**: See `docs/architecture/` for version designs
- **Development Guide**: See `CLAUDE.md` for coding conventions
- **User Guides**: See `docs/guides/` for how-to documentation

## Current Contents

| File | Type | Date | Severity |
|------|------|------|----------|
| [2025-10-09-journal-corruption.md](incidents/2025-10-09-journal-corruption.md) | Incident | 2025-10-09 | 🔴 Critical |
| [2025-10-01-unix-socket-limit.md](incidents/2025-10-01-unix-socket-limit.md) | Incident | 2025-10-01 | ⚠️ Platform |
| [2025-10-01-poc-validation.md](experiments/2025-10-01-poc-validation.md) | Experiment | 2025-10-01 | ℹ️ Methodology |

---

**Maintainer**: Project team (both human and AI contributors)
**Purpose**: Preserve hard-won lessons and validation records
