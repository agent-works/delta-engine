# Agent with Circular Imports (Error Test)

This agent intentionally has circular imports to test error handling.

## Import Chain
- agent.yaml imports module-a.yaml
- module-a.yaml imports module-b.yaml
- module-b.yaml imports module-a.yaml (circular!)

## Expected Behavior
Loading this agent should fail with a "Circular import detected" error.

## Purpose
This agent is used to test that the circular import detection mechanism works correctly.
