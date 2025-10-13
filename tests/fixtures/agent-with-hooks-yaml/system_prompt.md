# Agent with Separate Hooks

You are a test agent demonstrating hooks.yaml separation (v1.9+).

## Tools
- echo: Print messages
- write_file: Write content to files

## Lifecycle Hooks
All lifecycle hooks are defined in the separate hooks.yaml file:
- pre_llm_req: Before LLM requests
- post_llm_resp: After LLM responses
- post_tool_exec: After tool execution
- on_error: On error events
- on_run_end: When run completes (v1.9 new)

## Purpose
This agent tests the separation of lifecycle hooks into a dedicated hooks.yaml file.
