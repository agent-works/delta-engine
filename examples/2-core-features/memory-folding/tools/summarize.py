#!/usr/bin/env python3
"""
Memory Folding Tool for Delta Engine v1.6

This tool demonstrates context compression by:
1. Reading the journal.jsonl from the current run
2. Extracting key decisions and progress
3. Writing a compressed summary for context injection

Environment variables provided by Delta Engine:
- DELTA_RUN_ID: Current run ID
- DELTA_AGENT_HOME: Agent project directory
- DELTA_CWD: Current working directory (workspace)
"""

import json
import os
import sys
from pathlib import Path

def read_journal(run_id, cwd):
    """Read journal events from the current run"""
    journal_path = Path(cwd) / '.delta' / run_id / 'journal.jsonl'

    if not journal_path.exists():
        return []

    events = []
    with open(journal_path, 'r') as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))
    return events

def extract_key_facts(events):
    """Extract key decisions and tool usage from journal"""
    facts = []
    tool_usage = {}

    for event in events:
        event_type = event.get('type')
        payload = event.get('payload', {})

        if event_type == 'THOUGHT':
            content = payload.get('content', '')
            # Extract first sentence as key insight
            first_sentence = content.split('.')[0] if content else ''
            if first_sentence and len(first_sentence) > 20:
                facts.append(f"**Thought**: {first_sentence}...")

        elif event_type == 'ACTION_REQUEST':
            tool_name = payload.get('tool_name')
            tool_args = payload.get('tool_args', {})

            # Track tool usage
            tool_usage[tool_name] = tool_usage.get(tool_name, 0) + 1

            # Record important actions (file writes)
            if tool_name == 'write_file' and 'filename' in tool_args:
                filename = tool_args['filename']
                facts.append(f"**Created**: {filename}")

        elif event_type == 'ACTION_RESULT':
            observation = payload.get('observation_content', '')
            # Only include notable observations (errors, important outputs)
            if 'error' in observation.lower() or 'failed' in observation.lower():
                facts.append(f"**Issue**: {observation[:100]}...")

    return facts, tool_usage

def format_summary(facts, tool_usage, turn_count):
    """Format compressed summary for context injection"""
    summary_lines = [
        "# Compressed Memory (Auto-Generated)",
        "",
        f"**Progress**: Completed {turn_count} iterations so far.",
        ""
    ]

    if tool_usage:
        summary_lines.append("## Tools Used")
        for tool, count in sorted(tool_usage.items(), key=lambda x: -x[1]):
            summary_lines.append(f"- `{tool}`: {count} times")
        summary_lines.append("")

    if facts:
        summary_lines.append("## Key Actions & Decisions")
        # Limit to last 10 facts to keep summary compact
        for fact in facts[-10:]:
            summary_lines.append(f"- {fact}")
        summary_lines.append("")
    else:
        summary_lines.append("## Key Actions & Decisions")
        summary_lines.append("- (No significant actions recorded yet)")
        summary_lines.append("")

    summary_lines.append("---")
    summary_lines.append("*This summary helps maintain context across iterations while saving tokens.*")

    return "\n".join(summary_lines)

def main():
    # Get environment variables
    run_id = os.environ.get('DELTA_RUN_ID')
    cwd = os.environ.get('DELTA_CWD', os.getcwd())

    if not run_id:
        # Fallback: read from LATEST file
        latest_file = Path(cwd) / '.delta' / 'LATEST'
        if latest_file.exists():
            run_id = latest_file.read_text().strip()
        else:
            print("Error: Could not determine run ID", file=sys.stderr)
            sys.exit(1)

    # Read and analyze journal
    events = read_journal(run_id, cwd)

    if not events:
        # No journal yet - create minimal summary
        summary = "# Compressed Memory\n\n(No previous iterations to summarize yet.)\n"
    else:
        facts, tool_usage = extract_key_facts(events)

        # Count turns (THOUGHT events)
        turn_count = sum(1 for e in events if e.get('type') == 'THOUGHT')

        summary = format_summary(facts, tool_usage, turn_count)

    # Write summary to output path
    output_dir = Path(cwd) / '.delta' / 'context_artifacts'
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / 'summary.md'
    with open(output_path, 'w') as f:
        f.write(summary)

    print(f"Summary written to {output_path}", file=sys.stderr)

if __name__ == '__main__':
    main()
