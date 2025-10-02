# Research & Exploratory Design

This directory contains exploratory design discussions and research notes for future features of Delta Engine. These are **not implemented features** but rather design explorations, architectural proposals, and long-term research directions.

## Purpose

- Document early-stage design thinking before implementation
- Explore architectural alternatives and trade-offs
- Iterate on ideas through structured discussions
- Provide a foundation for future development decisions

## Difference from `architecture/`

| `architecture/` | `research/` |
|----------------|------------|
| Implemented designs | Exploratory ideas |
| Specification documents | Discussion notes |
| Version-tagged (v1.1, v1.2) | Open-ended iteration |
| Reference for current code | Blueprint for future features |

## Active Research Topics

### [Memory Folding](./memory-folding.md)
**Status**: Exploratory
**Focus**: Long-running agent context management through "folding" instead of "compression"

**Core Ideas**:
- Multi-level memory hierarchy (L0-L4 granularity)
- Context window partitioning (Working/Short-term/Long-term memory)
- LLM-assisted summarization and retrieval
- Distance-based memory management

**Why it matters**: Critical for agents that run hundreds to thousands of iterations, where context window management becomes a bottleneck.

---

## Contributing to Research

When adding new research documents:

1. **Create a clear title**: Descriptive and memorable
2. **Mark status**: Exploratory / Under Consideration / Shelved
3. **Document core concepts**: What problem does this solve?
4. **Include examples**: Concrete use cases
5. **List open questions**: What needs to be figured out?
6. **Track iterations**: Add dated updates when discussions continue

### Template for New Research Docs

```markdown
# [Feature Name]: [Brief Description]

> **Status**: Exploratory / Under Consideration / Shelved
> **Created**: YYYY-MM-DD
> **Last Updated**: YYYY-MM-DD

## Problem Statement
What problem are we trying to solve?

## Core Concepts
Key ideas and principles

## Design Proposals
Concrete design alternatives

## Trade-offs
Advantages and disadvantages of each approach

## Open Questions
Unresolved design decisions

## Iteration History
- YYYY-MM-DD: Initial discussion
- YYYY-MM-DD: Refined based on feedback
```

---

## Graduation Path

When a research topic is ready for implementation:

1. **Refine the design** through discussion iterations
2. **Create a specification** in `architecture/` or `implementation/`
3. **Version it** (e.g., v2.0-memory-folding.md)
4. **Update this README** to mark the topic as "Graduated"
5. **Optional**: Keep the research doc as historical reference

---

## Index of Discussions

- [Memory Folding](./memory-folding.md) - Context management for long-running agents
- (More topics will be added as research continues)
