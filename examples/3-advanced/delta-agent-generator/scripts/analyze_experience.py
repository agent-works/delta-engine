#!/usr/bin/env python3
"""
Experience Analyzer for Delta Agent Generator

Analyzes .claude-lab/sessions.jsonl to extract patterns, predict costs,
and provide insights for agent generation.

Usage:
    python3 analyze_experience.py [sessions.jsonl]

Output: JSON with patterns, costs, and recommendations
"""

import json
import sys
from collections import defaultdict, Counter
from datetime import datetime
from typing import Dict, List, Any
from statistics import mean, median, stdev


class ExperienceAnalyzer:
    """Analyzes agent generation history for patterns and insights."""

    def __init__(self, sessions_file: str):
        self.sessions_file = sessions_file
        self.sessions = []
        self.load_sessions()

    def load_sessions(self):
        """Load and parse sessions.jsonl"""
        try:
            with open(self.sessions_file, 'r') as f:
                for line in f:
                    if line.strip():
                        self.sessions.append(json.loads(line))
        except FileNotFoundError:
            # No history yet
            self.sessions = []
        except json.JSONDecodeError as e:
            print(f"Warning: Malformed JSON in {self.sessions_file}: {e}", file=sys.stderr)

    def analyze_all(self) -> Dict[str, Any]:
        """Comprehensive analysis of all sessions"""
        if not self.sessions:
            return {
                "status": "no_history",
                "message": "No session history found",
                "total_sessions": 0
            }

        return {
            "status": "analyzed",
            "total_sessions": len(self.sessions),
            "summary": self.get_summary(),
            "agent_types": self.analyze_agent_types(),
            "cost_patterns": self.analyze_costs(),
            "success_metrics": self.analyze_success(),
            "tool_patterns": self.analyze_tool_patterns(),
            "resume_patterns": self.analyze_resumes(),
            "recommendations": self.generate_recommendations()
        }

    def get_summary(self) -> Dict[str, Any]:
        """High-level summary statistics"""
        executions = [s for s in self.sessions if s.get('action') == 'execute']
        completed = [s for s in self.sessions if s.get('action') == 'complete']
        failed = [s for s in self.sessions if s.get('action') == 'failed']

        total_cost = sum(s.get('cost_usd', 0) for s in self.sessions if 'cost_usd' in s)

        return {
            "total_executions": len(executions),
            "completed": len(completed),
            "failed": len(failed),
            "success_rate": len(completed) / len(executions) if executions else 0,
            "total_cost_usd": round(total_cost, 2),
            "avg_cost_per_agent": round(total_cost / len(completed), 2) if completed else 0
        }

    def analyze_agent_types(self) -> Dict[str, Any]:
        """Analyze patterns by agent type"""
        type_data = defaultdict(lambda: {"count": 0, "costs": [], "success": 0, "failed": 0})

        for session in self.sessions:
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

        # Calculate statistics
        result = {}
        for agent_type, data in type_data.items():
            if data["count"] > 0:
                costs = data["costs"]
                result[agent_type] = {
                    "count": data["count"],
                    "success": data["success"],
                    "failed": data["failed"],
                    "success_rate": data["success"] / data["count"] if data["count"] > 0 else 0,
                    "avg_cost": round(mean(costs), 2) if costs else 0,
                    "min_cost": round(min(costs), 2) if costs else 0,
                    "max_cost": round(max(costs), 2) if costs else 0,
                    "median_cost": round(median(costs), 2) if costs and len(costs) > 1 else (costs[0] if costs else 0)
                }

        return result

    def analyze_costs(self) -> Dict[str, Any]:
        """Analyze cost patterns"""
        costs_by_action = defaultdict(list)

        for session in self.sessions:
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
        all_costs = [s.get('cost_usd', 0) for s in self.sessions if 'cost_usd' in s and s.get('action') == 'execute']

        if all_costs:
            result["categories"] = {
                "simple": {"range": "$0.05-$0.15", "count": len([c for c in all_costs if c <= 0.15])},
                "medium": {"range": "$0.15-$0.40", "count": len([c for c in all_costs if 0.15 < c <= 0.40])},
                "complex": {"range": "$0.40+", "count": len([c for c in all_costs if c > 0.40])}
            }

        return result

    def analyze_success(self) -> Dict[str, Any]:
        """Analyze success patterns"""
        executions = [s for s in self.sessions if s.get('action') == 'execute']
        successes = [s for s in self.sessions if s.get('action') == 'complete']
        failures = [s for s in self.sessions if s.get('action') == 'failed']

        # Map session IDs to outcomes
        session_outcomes = {}
        for session in successes:
            sid = session.get('session_id')
            if sid:
                session_outcomes[sid] = 'success'

        for session in failures:
            sid = session.get('session_id')
            if sid:
                session_outcomes[sid] = 'failed'

        success_count = len([o for o in session_outcomes.values() if o == 'success'])
        failure_count = len([o for o in session_outcomes.values() if o == 'failed'])
        total = len(session_outcomes)

        return {
            "total_attempts": total,
            "successful": success_count,
            "failed": failure_count,
            "success_rate": round(success_count / total, 2) if total > 0 else 0,
            "failure_rate": round(failure_count / total, 2) if total > 0 else 0
        }

    def analyze_tool_patterns(self) -> Dict[str, Any]:
        """Analyze common tool combinations (if available in logs)"""
        # This would require parsing agent configs or enhanced logging
        # For now, return placeholder showing structure
        return {
            "note": "Tool pattern analysis requires agent config inspection",
            "suggestion": "Log tool lists in sessions.jsonl for automatic analysis"
        }

    def analyze_resumes(self) -> Dict[str, Any]:
        """Analyze resume iteration patterns"""
        resumes = [s for s in self.sessions if s.get('action') == 'resume']
        session_resumes = Counter()

        for session in resumes:
            sid = session.get('session_id')
            if sid:
                session_resumes[sid] += 1

        if not session_resumes:
            return {
                "total_resumes": 0,
                "sessions_with_resumes": 0,
                "avg_resumes_per_session": 0
            }

        resume_counts = list(session_resumes.values())

        return {
            "total_resumes": sum(resume_counts),
            "sessions_with_resumes": len(session_resumes),
            "avg_resumes_per_session": round(mean(resume_counts), 1),
            "max_resumes": max(resume_counts),
            "distribution": {
                "0_resumes": len([s for s in self.sessions if s.get('action') == 'complete']) - len(session_resumes),
                "1_resume": len([c for c in resume_counts if c == 1]),
                "2+_resumes": len([c for c in resume_counts if c >= 2])
            }
        }

    def generate_recommendations(self) -> List[str]:
        """Generate actionable recommendations based on patterns"""
        recommendations = []

        summary = self.get_summary()

        # Success rate recommendations
        if summary["success_rate"] < 0.70:
            recommendations.append(
                "⚠️ Success rate is below 70%. Consider using plan mode more often and providing more specific task descriptions."
            )
        elif summary["success_rate"] >= 0.85:
            recommendations.append(
                "✅ High success rate (>85%). Current approach is working well."
            )

        # Cost recommendations
        avg_cost = summary.get("avg_cost_per_agent", 0)
        if avg_cost > 0.50:
            recommendations.append(
                f"💰 Average cost per agent is ${avg_cost:.2f}. Consider breaking complex tasks into smaller chunks."
            )

        # Resume pattern recommendations
        resume_patterns = self.analyze_resumes()
        avg_resumes = resume_patterns.get("avg_resumes_per_session", 0)
        if avg_resumes > 2:
            recommendations.append(
                f"🔄 High resume count (avg: {avg_resumes:.1f}). More specific initial descriptions may reduce iterations."
            )

        # Agent type recommendations
        agent_types = self.analyze_agent_types()
        if len(agent_types) > 3:
            most_common = max(agent_types.items(), key=lambda x: x[1]["count"])
            recommendations.append(
                f"📊 Most generated agent type: {most_common[0]} ({most_common[1]['count']} times). Consider creating a template."
            )

        # General recommendations
        if len(self.sessions) < 5:
            recommendations.append(
                "📈 Limited history. Generate 5+ agents for better pattern recognition."
            )

        return recommendations


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Analyze Delta Agent Generator experience')
    parser.add_argument('sessions_file', nargs='?',
                       default='.claude-lab/sessions.jsonl',
                       help='Path to sessions.jsonl file')
    parser.add_argument('--format', choices=['json', 'text'], default='json',
                       help='Output format (default: json)')

    args = parser.parse_args()

    analyzer = ExperienceAnalyzer(args.sessions_file)
    analysis = analyzer.analyze_all()

    if args.format == 'json':
        print(json.dumps(analysis, indent=2))
    else:
        # Text format for human reading
        print("=== Delta Agent Generator - Experience Analysis ===\n")

        if analysis["status"] == "no_history":
            print(analysis["message"])
            return

        summary = analysis["summary"]
        print(f"Total Sessions: {analysis['total_sessions']}")
        print(f"Executions: {summary['total_executions']}")
        print(f"Completed: {summary['completed']}")
        print(f"Failed: {summary['failed']}")
        print(f"Success Rate: {summary['success_rate']*100:.1f}%")
        print(f"Total Cost: ${summary['total_cost_usd']:.2f}")
        print(f"Avg Cost/Agent: ${summary['avg_cost_per_agent']:.2f}")

        print("\n--- Agent Types ---")
        for agent_type, data in analysis["agent_types"].items():
            print(f"\n{agent_type}:")
            print(f"  Count: {data['count']}")
            print(f"  Success Rate: {data['success_rate']*100:.1f}%")
            print(f"  Avg Cost: ${data['avg_cost']:.2f}")

        print("\n--- Recommendations ---")
        for rec in analysis["recommendations"]:
            print(f"  {rec}")


if __name__ == "__main__":
    main()
