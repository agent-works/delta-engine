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
├── unit/                    # Critical invariants
│   ├── engine.test.ts       # Safety mechanisms
│   ├── journal.test.ts      # Data integrity
│   └── journal-format-validation.test.ts
└── e2e/                     # User journeys + functional validation
    ├── 01-first-time-user.test.ts           # P0: New user onboarding
    ├── 02-interrupt-and-resume.test.ts      # P0: Interrupt workflow
    ├── 03-human-interaction.test.ts        # P0: ask_human workflow
    ├── 04-concurrent-agents.test.ts        # P0: Multi-agent execution
    ├── 05-multiple-workspaces.test.ts      # P1: Workspace isolation
    ├── 06-error-recovery.test.ts           # P1: Error handling
    ├── output-formats-and-io.test.ts       # P1: Output formats & I/O
    └── examples-and-templates.test.ts      # P2: Examples validation
```

## E2E Test Philosophy

**E2E is the execution approach, not the test category.**

Our E2E tests serve both purposes:
- **User Journeys**: End-to-end validation of user workflows
- **Functional Validation**: Technical features using E2E execution approach

**Key Principles:**
- Real CLI execution (no mocking)
- Real filesystem operations
- Complete workflow validation
- Priority-based organization (P0/P1/P2) for CI/CD decisions

**No separate integration layer** - all functional tests use E2E execution to maintain consistency and realistic validation.

## Priority System

E2E tests are organized by priority for CI/CD decisions:

- **P0 (Blocker)**: Must-pass for any release
  - First-time user onboarding
  - Interrupt and resume workflow
  - Human interaction (ask_human)
  - Concurrent agents (v1.10 core feature)

- **P1 (Critical)**: Should-pass for release
  - Multiple workspace isolation
  - Error recovery patterns
  - Output formats and I/O separation

- **P2 (Important)**: Nice-to-have validation
  - Examples and templates validation

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