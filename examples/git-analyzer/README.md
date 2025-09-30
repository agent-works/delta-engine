# Git Repository Analyzer

An intelligent agent that analyzes git repositories and provides comprehensive insights about code changes, contributors, and repository health.

## Features
- 📊 Repository statistics (size, file count, lines of code)
- 🔍 Recent commit analysis
- 👥 Contributor activity tracking
- 🚨 Large file detection
- 📝 Automated report generation

## Usage

```bash
# Analyze the current repository
delta run --agent examples/git-analyzer --task "Analyze this git repository and create a detailed report"

# Focus on specific aspects
delta run --agent examples/git-analyzer --task "Analyze the last 50 commits and identify patterns"
delta run --agent examples/git-analyzer --task "Find all files larger than 1MB and suggest optimization"
```

## Example Output

The agent generates a `repository-analysis.md` file with insights like:
- Total lines of code by language
- Most active contributors
- Recent commit patterns
- Branch structure analysis
- Recommendations for improvement