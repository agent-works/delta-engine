#!/usr/bin/env python3
"""
Basic Statistics Helper for Experience Analyzer Sub-Agent

Provides numerical foundation for semantic analysis.
Simplified from the original analyze_experience.py script.

Usage:
    python3 basic_stats.py [sessions.jsonl]

Output: JSON with statistical summary
"""

import json
import sys
from collections import defaultdict
from statistics import mean, median, stdev
from typing import Dict, List, Any


def load_sessions(sessions_file: str) -> List[Dict[str, Any]]:
    """Load and parse sessions.jsonl"""
    sessions = []
    try:
        with open(sessions_file, 'r') as f:
            for line in f:
                if line.strip():
                    sessions.append(json.loads(line))
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as e:
        print(f'{{"error": "Malformed JSON in {sessions_file}: {e}"}}', file=sys.stderr)
        return []

    return sessions


def get_summary(sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """High-level summary statistics"""
    executions = [s for s in sessions if s.get('action') == 'execute']
    completed = [s for s in sessions if s.get('action') == 'complete']
    failed = [s for s in sessions if s.get('action') == 'failed']

    total_cost = sum(s.get('cost_usd', 0) for s in sessions if 'cost_usd' in s)

    return {
        "total_sessions": len(sessions),
        "total_executions": len(executions),
        "completed": len(completed),
        "failed": len(failed),
        "success_rate": round(len(completed) / len(executions), 2) if executions else 0,
        "total_cost_usd": round(total_cost, 2),
        "avg_cost_per_agent": round(total_cost / len(completed), 2) if completed else 0
    }


def analyze_agent_types(sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze patterns by agent type"""
    type_data = defaultdict(lambda: {"count": 0, "costs": [], "success": 0, "failed": 0})

    for session in sessions:
        agent_type = session.get('agent_type', 'unknown')
        action = session.get('action')

        if action == 'execute':
            type_data[agent_type]["count"] += 1
            if 'cost_usd' in session:
                type_data[agent_type]["costs"].append(session['cost_usd'])
        elif action == 'complete':
            type_data[agent_type]["success"] += 1
        elif action == 'failed':
            type_data[agent_type]["failed"] += 1

    result = {}
    for agent_type, data in type_data.items():
        if data["count"] > 0:
            costs = data["costs"]
            result[agent_type] = {
                "count": data["count"],
                "success": data["success"],
                "failed": data["failed"],
                "success_rate": round(data["success"] / data["count"], 2) if data["count"] > 0 else 0,
                "avg_cost": round(mean(costs), 2) if costs else 0,
                "min_cost": round(min(costs), 2) if costs else 0,
                "max_cost": round(max(costs), 2) if costs else 0,
                "median_cost": round(median(costs), 2) if costs and len(costs) > 1 else (costs[0] if costs else 0)
            }

    return result


def analyze_costs(sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze cost patterns"""
    costs_by_action = defaultdict(list)

    for session in sessions:
        if 'cost_usd' in session:
            action = session.get('action', 'unknown')
            costs_by_action[action].append(session['cost_usd'])

    result = {}
    for action, costs in costs_by_action.items():
        if costs:
            result[action] = {
                "count": len(costs),
                "total": round(sum(costs), 2),
                "avg": round(mean(costs), 2),
                "min": round(min(costs), 2),
                "max": round(max(costs), 2),
                "median": round(median(costs), 2) if len(costs) > 1 else costs[0],
                "stdev": round(stdev(costs), 2) if len(costs) > 1 else 0
            }

    # Categorize agents by cost
    all_costs = [s.get('cost_usd', 0) for s in sessions if 'cost_usd' in s and s.get('action') == 'execute']

    if all_costs:
        result["categories"] = {
            "simple": {"range": "$0.05-$0.15", "count": len([c for c in all_costs if c <= 0.15])},
            "medium": {"range": "$0.15-$0.40", "count": len([c for c in all_costs if 0.15 < c <= 0.40])},
            "complex": {"range": "$0.40+", "count": len([c for c in all_costs if c > 0.40])}
        }

    return result


def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        sessions_file = sys.argv[1]
    else:
        sessions_file = '.claude-lab/sessions.jsonl'

    sessions = load_sessions(sessions_file)

    if not sessions:
        print(json.dumps({
            "status": "no_history",
            "message": "No session history found",
            "summary": {
                "total_sessions": 0,
                "total_executions": 0,
                "completed": 0,
                "failed": 0,
                "success_rate": 0,
                "total_cost_usd": 0,
                "avg_cost_per_agent": 0
            },
            "agent_types": {},
            "cost_patterns": {}
        }))
        return

    # Generate statistical summary
    analysis = {
        "status": "analyzed",
        "summary": get_summary(sessions),
        "agent_types": analyze_agent_types(sessions),
        "cost_patterns": analyze_costs(sessions)
    }

    print(json.dumps(analysis, indent=2))


if __name__ == "__main__":
    main()
