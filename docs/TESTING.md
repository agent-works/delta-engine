# Testing Philosophy

## Core Principle

**Tests verify the DESIGN, not the CODE.**

When we design a feature (Design Document), we define what users should be able to do.
Tests verify that users can actually do those things.

## The Three-Document Method and Testing

```
Design Document → Test Document → Implementation
      ↓                ↓                ↓
   (Why & What)    (How to Verify)   (How to Build)
```

**Test Document** is based on Design, NOT implementation:
- Written from user's perspective
- Defines acceptance criteria in plain language
- Acts as independent "referee"

## Test Document Template

```markdown
# v{X.Y} Test Verification Plan

## Design Goals
[What did we design? Link to design doc]

## User Scenarios to Verify
1. Can user do X as designed?
2. Does Y behave as specified?
3. Is Z accessible as documented?

## Acceptance Criteria
- [ ] Scenario 1: [Specific user action] produces [Expected result]
- [ ] Scenario 2: [Specific user action] produces [Expected result]
- [ ] Scenario 3: Edge case handling works

## How to Verify
[Manual steps or commands to verify each scenario]
```

## Running Tests

```bash
# Complete validation before release
npm run test:all

# During development
npm run test:quick
```

## What NOT to Do

❌ Don't test implementation details
❌ Don't write tests to make coverage numbers
❌ Don't let developers test their own work (referee ≠ athlete)
❌ Don't focus on HOW code works, focus on WHAT users can do

## Remember

> "The best test is a user successfully using the feature."

Testing is about **verifying value delivery**, not code correctness.