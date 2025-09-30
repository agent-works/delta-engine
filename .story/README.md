# .story/ - Project Story Repository

## What is This?

This directory contains the **"why" and "how we got here"** of the Delta Engine project - the decisions, traps, and experiments that shaped its evolution.

Unlike traditional documentation that focuses on **what** the code does, `.story/` captures the **context** behind architectural choices, lessons learned from failures, and the reasoning that led to current implementations.

## For Human Developers

If you're new to this project, start here:

1. **Read `INDEX.md`** - Core decisions and known traps (15 min read)
2. **Browse `decisions/`** - Deep dives into architectural choices
3. **Check `traps/`** - Common pitfalls and how to avoid them

This helps you understand not just "how to use Delta Engine" but "why it works this way."

## For AI Collaborators

**Primary Purpose**: This directory is maintained BY AI, FOR AI to preserve context across sessions.

**Before starting work**: Read `INDEX.md` completely
**During work**: Update `INDEX.md` when discovering new decisions or traps
**After completing work**: Run the maintenance checklist in `INDEX.md`

## Directory Structure

```
.story/
├── README.md          # This file (for humans)
├── INDEX.md           # Core index (for AI, must-read)
├── decisions/         # Why we made architectural choices
│   └── 001-*.md
├── traps/             # Known pitfalls to avoid
│   └── *.md
└── experiments/       # What we tried and learned
    └── 2025-*.md
```

## Philosophy

**Story vs Documentation**:
- Documentation says "use this API"
- Story says "we tried A, B, C; chose B because of X, Y, Z"

**Story vs Changelog**:
- Changelog says "added feature X on date Y"
- Story says "why we needed X, what problems it solves, what we learned"

**Story vs Code Comments**:
- Code comments explain local logic
- Story explains system-wide decisions and their implications

## Maintenance

This directory is **automatically maintained by AI** during collaborations.

Human developers should:
- ✅ Read it to understand project context
- ✅ Suggest corrections if information is outdated
- ❌ Don't manually edit without good reason (AI maintains consistency)

## Size Limits

- `INDEX.md`: Keep under 500 lines (essential content only)
  - **Current**: ~449 lines (Level 1 - all content)
  - **450 lines**: Warning - prepare for Level 2 migration
  - **500 lines**: Trigger - execute Level 2/3 split
- Individual files in `decisions/`, `traps/`: No limit (detailed as needed)
- `experiments/`: Monthly rollups to avoid fragmentation

### INDEX.md Growth Strategy

**Level 1 (Current)**: All content with full details
- Used when: < 500 lines
- Content: 5-10 core decisions + 5-8 traps + 5-10 tradeoffs

**Level 2 (Future)**: Tiered content display
- Used when: 450-500 lines reached
- Level 1: Global context (full details, 5-10 items)
- Level 2: Context-specific (summary + keywords, 10-20 items)
- Level 3: Deep dive (category index only, rest)

**Level 3 (If needed)**: Full search-driven
- Used when: Even Level 2 exceeds 500 lines
- Level 1: Absolute essentials (3-5 principles)
- Level 2: Categorized keywords
- Level 3: Full-text search instructions

See `INDEX.md` bottom section for detailed migration guide.

## Meta

- **Created**: 2025-09-30
- **Maintainer**: Claude Code (AI)
- **Purpose**: Preserve decision context across AI sessions
- **Inspired by**: The pain of repeatedly explaining "why we did this"
