# Lifecycle Hooks Guide

## Overview

Lifecycle hooks allow you to extend Delta Engine's behavior at specific points during execution. Hooks are external programs that communicate via File-Based IPC (Inter-Process Communication).

## Hook Types

### 1. `pre_llm_req`
**When:** Before sending request to LLM
**Purpose:** Modify or validate LLM requests
**Use Cases:** Add context, filter sensitive data, implement rate limiting

### 2. `post_llm_resp`
**When:** After receiving LLM response
**Purpose:** Process or log LLM responses
**Use Cases:** Content filtering, response caching, metrics collection

### 3. `pre_tool_exec`
**When:** Before executing a tool
**Purpose:** Validate or block tool execution
**Use Cases:** Security checks, parameter validation, audit logging

### 4. `post_tool_exec`
**When:** After tool execution completes
**Purpose:** Process tool results
**Use Cases:** Output sanitization, error handling, result caching

### 5. `on_error`
**When:** When an error occurs
**Purpose:** Handle errors gracefully
**Use Cases:** Alerting, recovery attempts, graceful degradation

## Hook Configuration

In `config.yaml`:

```yaml
lifecycle_hooks:
  pre_llm_req:
    command: [./hooks/pre_llm_req.sh]
    timeout_ms: 5000  # Optional, default 30000

  post_llm_resp:
    command: [python3, hooks/log_response.py]

  pre_tool_exec:
    command: [./hooks/security_check.sh]
    timeout_ms: 2000

  post_tool_exec:
    command: [node, hooks/process_output.js]

  on_error:
    command: [./hooks/error_handler.sh]
```

## File-Based IPC Protocol

### Directory Structure

When a hook is executed, Delta Engine creates:

```
runtime_io/hooks/{sequence}_{hook_name}/
├── input/              # Input data for hook
│   ├── context.json   # Execution context
│   └── payload.json   # Hook-specific data
├── output/            # Hook writes here
│   ├── control.json   # Control directives
│   └── final_payload.json  # Modified payload (pre_llm_req)
└── execution_meta/    # Execution details
    ├── command.txt
    ├── stdout.log
    ├── stderr.log
    └── exit_code.txt
```

### Environment Variables

Hooks receive:
- `DELTA_RUN_ID` - Current run ID
- `DELTA_HOOK_IO_PATH` - Absolute path to hook's I/O directory

### Working Directory

Hooks are executed with CWD set to the workspace root.

## Basic Hook Examples

### Shell Script Hook

`hooks/pre_llm_req.sh`:
```bash
#!/bin/bash

# Read input
context=$(cat "$DELTA_HOOK_IO_PATH/input/context.json")
payload=$(cat "$DELTA_HOOK_IO_PATH/input/proposed_payload.json")

# Log the request
echo "Processing LLM request at $(date)" >> llm_requests.log

# Add custom context to messages
modified_payload=$(echo "$payload" | jq '.messages += [{
  "role": "system",
  "content": "Current time: '"$(date)"'"
}]')

# Write modified payload
echo "$modified_payload" > "$DELTA_HOOK_IO_PATH/output/final_payload.json"

# Write control output
cat > "$DELTA_HOOK_IO_PATH/output/control.json" << EOF
{
  "status": "modified",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

exit 0
```

### Python Hook

`hooks/log_response.py`:
```python
#!/usr/bin/env python3
import json
import os
from datetime import datetime

# Get I/O path from environment
io_path = os.environ['DELTA_HOOK_IO_PATH']

# Read input
with open(f"{io_path}/input/context.json") as f:
    context = json.load(f)

with open(f"{io_path}/input/payload.json") as f:
    response = json.load(f)

# Log response details
log_entry = {
    "timestamp": datetime.utcnow().isoformat(),
    "run_id": context["run_id"],
    "model": response.get("model"),
    "tokens": response.get("usage", {}).get("total_tokens", 0)
}

# Append to log file
with open("llm_usage.jsonl", "a") as f:
    f.write(json.dumps(log_entry) + "\n")

# Write control output
control = {
    "status": "logged",
    "tokens_used": log_entry["tokens"]
}

with open(f"{io_path}/output/control.json", "w") as f:
    json.dump(control, f)
```

### Node.js Hook

`hooks/security_check.js`:
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ioPath = process.env.DELTA_HOOK_IO_PATH;

// Read tool execution request
const payload = JSON.parse(
  fs.readFileSync(path.join(ioPath, 'input', 'payload.json'), 'utf8')
);

// Security checks
const blockedCommands = ['rm -rf', 'sudo', 'chmod 777'];
const command = payload.resolved_command;

let blocked = false;
for (const dangerous of blockedCommands) {
  if (command.includes(dangerous)) {
    blocked = true;
    break;
  }
}

// Write control output
const control = blocked ? {
  action: 'ABORT',
  skip: true,
  message: `Blocked dangerous command: ${command}`
} : {
  action: 'CONTINUE',
  status: 'approved'
};

fs.writeFileSync(
  path.join(ioPath, 'output', 'control.json'),
  JSON.stringify(control, null, 2)
);

process.exit(blocked ? 1 : 0);
```

## Advanced Hook Patterns

### Payload Transformer (pre_llm_req)

Add context from external sources:

```python
#!/usr/bin/env python3
import json
import os
import requests

io_path = os.environ['DELTA_HOOK_IO_PATH']

# Read proposed payload
with open(f"{io_path}/input/proposed_payload.json") as f:
    payload = json.load(f)

# Fetch external context (e.g., current weather)
try:
    weather = requests.get("https://api.weather.com/current").json()

    # Add weather context to system message
    weather_context = {
        "role": "system",
        "content": f"Current weather: {weather['description']}, {weather['temp']}°C"
    }

    # Insert after first system message
    messages = payload['messages']
    for i, msg in enumerate(messages):
        if msg['role'] == 'system':
            messages.insert(i + 1, weather_context)
            break

    payload['messages'] = messages
except:
    pass  # Continue without weather if API fails

# Write final payload
with open(f"{io_path}/output/final_payload.json", "w") as f:
    json.dump(payload, f)
```

### Rate Limiter (pre_llm_req)

Implement token bucket algorithm:

```bash
#!/bin/bash

BUCKET_FILE="/tmp/token_bucket.txt"
MAX_TOKENS=10
REFILL_RATE=1  # tokens per minute

# Initialize bucket if not exists
if [ ! -f "$BUCKET_FILE" ]; then
    echo "$MAX_TOKENS:$(date +%s)" > "$BUCKET_FILE"
fi

# Read current bucket state
IFS=':' read -r tokens last_refill < "$BUCKET_FILE"
current_time=$(date +%s)

# Refill tokens
elapsed=$((current_time - last_refill))
refill_amount=$((elapsed / 60 * REFILL_RATE))
tokens=$((tokens + refill_amount))
[ $tokens -gt $MAX_TOKENS ] && tokens=$MAX_TOKENS

# Check if we have tokens
if [ $tokens -le 0 ]; then
    # Rate limited
    cat > "$DELTA_HOOK_IO_PATH/output/control.json" << EOF
{
  "action": "ABORT",
  "message": "Rate limit exceeded. Please wait."
}
EOF
    exit 1
fi

# Consume a token
tokens=$((tokens - 1))
echo "$tokens:$current_time" > "$BUCKET_FILE"

# Copy payload as-is
cp "$DELTA_HOOK_IO_PATH/input/proposed_payload.json" \
   "$DELTA_HOOK_IO_PATH/output/final_payload.json"

exit 0
```

### Audit Logger (post_tool_exec)

Comprehensive audit logging:

```python
#!/usr/bin/env python3
import json
import os
import hashlib
from datetime import datetime

io_path = os.environ['DELTA_HOOK_IO_PATH']
run_id = os.environ['DELTA_RUN_ID']

# Read execution result
with open(f"{io_path}/input/payload.json") as f:
    result = json.load(f)

# Create audit entry
audit = {
    "timestamp": datetime.utcnow().isoformat(),
    "run_id": run_id,
    "tool": result["tool_name"],
    "exit_code": result["exit_code"],
    "success": result["exit_code"] == 0,
    "output_hash": hashlib.sha256(result["stdout"].encode()).hexdigest(),
    "error_hash": hashlib.sha256(result["stderr"].encode()).hexdigest() if result["stderr"] else None
}

# Save to audit log
audit_file = f"audit_{datetime.now().strftime('%Y%m%d')}.jsonl"
with open(audit_file, "a") as f:
    f.write(json.dumps(audit) + "\n")

# Sensitive data redaction
if "password" in result["stdout"].lower():
    # Alert on potential credential exposure
    alert = {
        "severity": "HIGH",
        "message": "Potential credential in output",
        "tool": result["tool_name"],
        "timestamp": audit["timestamp"]
    }

    with open("security_alerts.jsonl", "a") as f:
        f.write(json.dumps(alert) + "\n")
```

## Control Directives

### Control Output Format

`output/control.json`:
```json
{
  "action": "CONTINUE",     // CONTINUE, ABORT, or RETRY
  "skip": false,           // Skip tool execution (pre_tool_exec)
  "message": "Optional message",
  "modifications": {}      // Additional data
}
```

### Action Types

- **CONTINUE**: Proceed normally
- **ABORT**: Stop execution with error
- **RETRY**: Retry the operation (not yet implemented)

## Testing Hooks

### Test Script

```bash
#!/bin/bash
# test-hook.sh

# Create test environment
export DELTA_RUN_ID="test_$(date +%s)"
export DELTA_HOOK_IO_PATH="/tmp/test_hook_$$"

# Setup I/O directories
mkdir -p "$DELTA_HOOK_IO_PATH"/{input,output}

# Create test input
cat > "$DELTA_HOOK_IO_PATH/input/context.json" << EOF
{
  "hook_name": "test",
  "step_index": 1,
  "run_id": "$DELTA_RUN_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cat > "$DELTA_HOOK_IO_PATH/input/payload.json" << EOF
{
  "test": "data"
}
EOF

# Run hook
./hooks/my_hook.sh

# Check results
echo "Exit code: $?"
echo "Control output:"
cat "$DELTA_HOOK_IO_PATH/output/control.json" 2>/dev/null || echo "No control output"

# Cleanup
rm -rf "$DELTA_HOOK_IO_PATH"
```

## Best Practices

### 1. Fast Execution
- Hooks should complete quickly (< 5 seconds)
- Use timeouts for external calls
- Consider async processing for heavy tasks

### 2. Error Handling
- Always exit with proper code (0 for success)
- Write meaningful error messages
- Don't crash on missing optional data

### 3. Idempotency
- Hooks may be called multiple times
- Design for idempotent operations
- Use unique IDs for deduplication

### 4. Security
- Validate all inputs
- Sanitize file paths
- Never execute user input directly
- Use least privilege principle

### 5. Debugging
- Log to stderr for debugging
- Write diagnostic info to execution_meta
- Keep audit trail of modifications

## Common Use Cases

### 1. Context Injection
Add user preferences, time, location, or other context to LLM requests.

### 2. Content Filtering
Remove sensitive information from requests/responses.

### 3. Usage Tracking
Monitor token usage, costs, and performance metrics.

### 4. Security Enforcement
Block dangerous commands, validate parameters.

### 5. Caching
Cache responses to reduce API calls and costs.

### 6. Alerting
Send notifications on errors or specific events.

## Troubleshooting

### Hook Not Executing
- Check file permissions (`chmod +x`)
- Verify command path is correct
- Check syntax errors in script

### Hook Timing Out
- Increase `timeout_ms` in config
- Optimize hook performance
- Move heavy processing to background

### Data Not Modified
- Ensure writing to correct output path
- Check file permissions
- Verify JSON syntax

### View Hook Execution
```bash
# List all hook executions
ls -la work_runs/workspace_*/delta/runs/*/runtime_io/hooks/

# Check specific hook output
cat work_runs/workspace_*/delta/runs/*/runtime_io/hooks/*/execution_meta/stdout.log
```

## Next Steps

- Review [Configuration Reference](../api/config.md) for all hook options
- Check [example hooks](../../examples/) for more patterns
- Learn about [Agent Development](./agent-development.md) for integration