# Testing Philosophy

## Core Principle

**Tests are quality gates, not documentation.**

- **E2E Tests** = User value delivery
- **Unit Tests** = Critical invariant protection
  - Data integrity (sequences, concurrency)
  - Safety mechanisms (max_iterations, ask_human)
  - Fatal error tracking

## Test Structure

```bash
tests/
├── unit/                    # Critical invariants only (3 files)
│   ├── engine.test.ts       # Safety mechanisms
│   ├── journal.test.ts      # Data integrity
│   └── journal-format-validation.test.ts
└── e2e/                     # Real user journeys
```

## Running Tests

```bash
npm test        # Unit tests (<2s)
npm run test:e2e  # User journeys
npm run test:all  # Everything
```

## Maintenance Rule

**Keep a test only if its failure indicates real user impact.**

If AI breaks it and users won't notice, delete it.

## Key Insight for AI Workflow

**E2E tests are the final quality gate** - if they pass, we can ship with confidence.

**Unit tests serve a different role in AI workflow:**
- Traditional: Unit tests verify code correctness
- AI Workflow: Unit tests detect when AI modifies critical invariants

In AI coding, humans don't read code. Unit tests alert us when AI accidentally breaks critical safety mechanisms (like max_iterations or data integrity).

*"The best test suite is the smallest one that prevents catastrophe."*