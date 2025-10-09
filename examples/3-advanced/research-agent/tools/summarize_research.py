#!/usr/bin/env python3
"""
Research summarization tool for Delta Engine.

Reads research notes and creates a compressed summary suitable for context composition.
Preserves key findings while reducing token usage.

Usage:
    python3 summarize_research.py <notes_file> <summary_file>
"""

import sys
import os
from datetime import datetime


def summarize_notes(notes_file: str, summary_file: str) -> None:
    """
    Read research notes and create/update summary.

    Strategy:
    1. Parse notes file for key sections (findings, sources, insights)
    2. Extract essential information (dates, key points, citations)
    3. Compress verbose explanations into bullet points
    4. Write to summary file
    """

    if not os.path.exists(notes_file):
        print(f"Error: Notes file '{notes_file}' not found", file=sys.stderr)
        sys.exit(1)

    # Read notes
    with open(notes_file, 'r', encoding='utf-8') as f:
        notes_content = f.read()

    # Count tokens (rough estimate: 1 token ≈ 4 characters)
    notes_tokens = len(notes_content) // 4

    # Simple summarization: Extract headings and first sentence of each section
    lines = notes_content.split('\n')
    summary_lines = []
    summary_lines.append(f"# Research Summary")
    summary_lines.append(f"")
    summary_lines.append(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    summary_lines.append(f"**Source**: {notes_file} ({notes_tokens} tokens)")
    summary_lines.append(f"")

    current_section = None
    for line in lines:
        line = line.strip()

        # Capture headings
        if line.startswith('#'):
            summary_lines.append(line)
            current_section = line

        # Capture first substantial line after heading (key finding)
        elif current_section and line and not line.startswith('-') and len(line) > 20:
            summary_lines.append(f"- {line[:200]}...")  # Truncate to 200 chars
            current_section = None  # Only first line per section

        # Capture bullet points (likely key findings)
        elif line.startswith('-') or line.startswith('*'):
            summary_lines.append(line)

    # Create summary
    summary_content = '\n'.join(summary_lines)
    summary_tokens = len(summary_content) // 4
    compression_ratio = (1 - summary_tokens / notes_tokens) * 100 if notes_tokens > 0 else 0

    # Append compression stats
    summary_content += f"\n\n---\n"
    summary_content += f"\n**Compression**: {notes_tokens} → {summary_tokens} tokens ({compression_ratio:.1f}% reduction)"

    # Write summary
    with open(summary_file, 'w', encoding='utf-8') as f:
        f.write(summary_content)

    # Output confirmation to stdout
    print(f"✓ Summary created: {summary_file}")
    print(f"✓ Compressed {notes_tokens} tokens → {summary_tokens} tokens ({compression_ratio:.1f}% reduction)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 summarize_research.py <notes_file> <summary_file>", file=sys.stderr)
        sys.exit(1)

    notes_file = sys.argv[1]
    summary_file = sys.argv[2]

    summarize_notes(notes_file, summary_file)
