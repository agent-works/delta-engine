# Architecture Decision Records (ADR)

This directory contains **Architecture Decision Records** for Delta Engine - records of significant architectural decisions made during the project's development.

## What is an ADR?

An ADR documents:
- **Context**: What situation led to this decision?
- **Decision**: What did we choose to do?
- **Consequences**: What are the benefits and tradeoffs?

ADRs focus on **architectural decisions** - choices that:
- Shape the core design of the system
- Are difficult or expensive to reverse
- Impact how developers work with the codebase

## Format

We follow a lightweight ADR format:

```markdown
# ADR-NNN: Decision Title

**Date**: YYYY-MM-DD
**Status**: Active | Deprecated | Superseded by ADR-XXX
**Related**: ADR-XXX, ADR-YYY

## Context
What is the problem or situation that requires a decision?

## Decision
What did we decide to do?

## Consequences
What are the results of this decision (both benefits and costs)?
```

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [001](./001-stateless-core.md) | Stateless Core Architecture | Active | 2025 Q3 |
| [002](./002-journal-jsonl-format.md) | Journal Format - JSONL | Active | 2025 Q3 |
| [003](./003-human-interaction-modes.md) | Two-Mode Human Interaction | Active | 2025 Q3 |
| [004](./004-poc-first-validation.md) | POC-First Architecture Validation | Active | 2025-10-01 |

## When to Create an ADR?

Create an ADR when:
- ✅ Making a decision that affects system architecture
- ✅ Choosing between multiple viable approaches
- ✅ Establishing a pattern or convention
- ✅ Deciding on critical defaults or thresholds

Don't create an ADR for:
- ❌ Implementation details that can easily change
- ❌ Obvious best practices
- ❌ Minor bug fixes or refactorings

## Related Documentation

- **Incidents & Postmortems**: See `.story/incidents/` for real-world problem reports
- **Experiments**: See `.story/experiments/` for POC validation records
- **Architecture Specs**: See `docs/architecture/` for version-specific designs
- **Development Guide**: See `CLAUDE.md` for coding conventions

## Resources

- [ADR GitHub Organization](https://adr.github.io/) - Original ADR methodology
- [Michael Nygard's Blog](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - The article that started it all
