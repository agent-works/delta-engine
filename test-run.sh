#!/bin/bash

# Test Delta Engine with a simple task

echo "Testing Delta Engine with .env configuration..."
echo "==========================================="

# Run with a simple echo task
node dist/index.js run \
  --agent examples/hello-agent \
  --task "Use the echo_message tool to print 'Hello from Delta Engine!' to the console" \
  --verbose 2>&1 | head -50

echo ""
echo "==========================================="
echo "Test completed. Check the output above."