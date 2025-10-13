# Experience Analyzer Sub-Agent

**Intelligent semantic analysis of delta-agent-generator history**

Part of `delta-agent-generator` v3.0 - demonstrates Delta Engine's agent composition capability.

---

## 🎯 What Is This?

A **sub-agent** that provides intelligent analysis of `delta-agent-generator`'s generation history.

Unlike a simple statistics script, this agent uses an LLM to:
- **Understand** task descriptions semantically
- **Explain** why generations succeed or fail
- **Predict** costs with reasoning
- **Recommend** improvements based on patterns

---

## 🏗️ Architecture Context

```
delta-agent-generator (Parent Agent)
├── Tools:
│   ├── claude_task
│   ├── claude_resume
│   ├── analyze_experience ← Calls this sub-agent
│   └── ...
│
└── experience-analyzer/ ← You are here (sub-agent)
    ├── config.yaml
    ├── system_prompt.md
    ├── README.md
    └── tools/
        └── basic_stats.py
```

**Key Concept**: The parent agent calls this sub-agent as a tool. This demonstrates Delta's agent composition philosophy: **"Everything is a Command"** - even other agents.

---

## ✨ Capabilities

### 1. Semantic Pattern Recognition

**Not just**: "5 file-tools agents, 80% success rate"

**But**: "File-tools agents succeed when task descriptions explicitly list tools (5/5 success). Failures occurred when descriptions were vague."

### 2. Root Cause Analysis

**Not just**: "3 failures in last 10 runs"

**But**: "Failures caused by missing tool specifications. All 3 failed tasks used generic nouns ('organizer', 'tool') without listing CLI commands."

### 3. Cost Prediction with Reasoning

**Not just**: "Average cost: $0.18"

**But**: "For a 4-tool file-processing agent, expect $0.16-$0.20 (avg $0.18). Based on historical pattern: ~$0.04/tool + $0.03 base cost."

### 4. Actionable Recommendations

**Not just**: "Be more specific"

**But**: "List tools with CLI commands: 'list_files (ls -la)', not 'list files'. File-processing agents typically need 4-5 tools: list, read, write, move, delete."

---

## 🚀 Usage

### As a Sub-Agent (Normal Usage)

Called by `delta-agent-generator`:

```bash
# Parent agent calls this automatically
delta run --agent examples/3-advanced/delta-agent-generator \
  -m "Generate file organizer (check cost patterns first)"
```

The parent agent will invoke:
```bash
delta run --agent experience-analyzer \
  -m "Analyze cost patterns for file-processing agents" \
  --output json -y
```

### Standalone Testing (Development)

You can also test this agent independently:

```bash
# Navigate to parent agent directory
cd examples/3-advanced/delta-agent-generator

# Run sub-agent directly
delta run --agent experience-analyzer \
  -m "Predict cost for a database CRUD agent" \
  -y
```

---

## 📊 Input/Output

### Input (via -m)

Analysis requests in natural language:

**Examples**:
- "Predict cost for a file-processing agent with 4 tools"
- "Why did the last 3 agents fail?"
- "What patterns do you see in my generation history?"
- "Compare success rates between simple and complex agents"
- "What task description style leads to best results?"

### Output (JSON)

Structured analysis with this schema:

```json
{
  "summary": "2-3 sentence overview of findings",
  "insights": [
    {
      "type": "pattern|cost_driver|success_factor|failure_cause",
      "finding": "Specific observation with evidence",
      "evidence": "Supporting data from sessions.jsonl",
      "confidence": "high|medium|low"
    }
  ],
  "cost_prediction": {
    "for_request": "What's being predicted",
    "predicted_range": "$0.15-$0.22",
    "expected": "$0.18",
    "confidence": "medium",
    "reasoning": "Explanation of derivation"
  },
  "recommendations": [
    "Specific, actionable advice (not generic)"
  ],
  "success_factors": [
    "Patterns that lead to success"
  ],
  "failure_patterns": [
    "Common failure causes"
  ]
}
```

---

## 🛠️ How It Works

### Data Source

Reads `.claude-lab/sessions.jsonl` from the parent agent's workspace:

```jsonl
{"timestamp":"2025-10-08T10:30:00Z","action":"execute","session_id":"abc-123","task":"Generate file-organizer agent with list_files (ls), move_file (mv)","num_turns":5,"cost_usd":0.12,"result":"success","agent_type":"file-tools"}
{"timestamp":"2025-10-08T10:35:00Z","action":"complete","session_id":"abc-123"}
{"timestamp":"2025-10-08T11:00:00Z","action":"execute","session_id":"def-456","task":"Create API testing tool","cost_usd":0.35,"result":"failed"}
```

### Analysis Process

1. **Read History**: Parse sessions.jsonl
2. **Get Statistics**: Run basic_stats.py for numerical baseline
3. **Semantic Analysis**: Understand task descriptions, correlate with outcomes
4. **Pattern Recognition**: Identify success factors and failure causes
5. **Generate Insights**: Provide evidence-based recommendations
6. **Output JSON**: Structured result for parent agent

### Tools Used

| Tool | Purpose |
|------|---------|
| **read_sessions** | Load complete history |
| **read_recent_failures** | Focus on recent problems |
| **read_successes** | Extract success patterns |
| **get_statistics** | Numerical foundation |
| **output_analysis** | Return structured JSON |

---

## 📈 Example Analysis

### Request

"Predict cost for a database CRUD agent"

### Process

1. **Read History**: Find database-related agents
2. **Analyze**: 2 database agents, both 5 tools, costs $0.22-$0.24
3. **Derive Pattern**: Database agents consistently use CRUD + connect = 5 tools
4. **Predict**: ~$0.04/tool × 5 + $0.03 base = $0.23

### Response

```json
{
  "summary": "Based on 2 database agents (both successful), expect $0.20-$0.26 for CRUD agent with 5 tools.",
  "insights": [
    {
      "type": "pattern",
      "finding": "Database agents consistently use 5 tools: connect_db, create_record, read_record, update_record, delete_record",
      "evidence": "2/2 database agents had exactly 5 tools with CRUD operations",
      "confidence": "medium"
    }
  ],
  "cost_prediction": {
    "for_request": "Database CRUD agent (5 tools expected)",
    "predicted_range": "$0.20-$0.26",
    "expected": "$0.23",
    "confidence": "medium",
    "reasoning": "Historical costs: $0.22, $0.24. Linear model: 5 tools × $0.04/tool + $0.03 base = $0.23."
  },
  "recommendations": [
    "Plan for 5 tools: connect_db, create_record, read_record, update_record, delete_record",
    "Budget $0.25 to be safe",
    "List all 5 tools explicitly in task description",
    "Example: 'Generate database CRUD agent with connect_db (sqlite3), create_record (INSERT), read_record (SELECT), update_record (UPDATE), delete_record (DELETE)'"
  ],
  "success_factors": [
    "Explicit CRUD tool naming",
    "Clear database type (sqlite, postgres, etc.)"
  ],
  "failure_patterns": []
}
```

---

## 🎯 Value Proposition

### vs. Python Statistics Script

| Capability | Python Script | This Sub-Agent |
|-----------|---------------|----------------|
| **Count & Average** | ✅ Fast | ✅ Fast |
| **Understand Task Descriptions** | ❌ No | ✅ Yes |
| **Explain Failures** | ❌ No | ✅ Yes |
| **Personalized Recommendations** | ❌ Generic rules | ✅ Context-aware |
| **Cost** | $0 | ~$0.01-0.03/analysis |
| **Flexibility** | ❌ Code changes needed | ✅ Prompt changes |
| **Demo Value** | ❌ Just a tool | ✅ Shows Delta composition |

### Real-World Impact

**Scenario**: User asks "Why did my last generation fail?"

**Python Script Output**:
```json
{
  "success_rate": 0.75,
  "recommendations": ["Use plan mode more often"]
}
```
→ Not helpful

**Sub-Agent Output**:
```json
{
  "summary": "Failure caused by vague task description without tool specifications.",
  "insights": [{
    "finding": "Failed task: 'Create API testing tool' - no tools listed",
    "evidence": "Successful tasks always list tools: 'http_get (curl), http_post (curl -X POST)'"
  }],
  "recommendations": [
    "Change 'Create API testing tool' to 'Generate API tester with http_get (curl -X GET), http_post (curl -X POST -d), http_delete (curl -X DELETE)'",
    "Always list HTTP methods explicitly (GET, POST, PUT, DELETE)"
  ]
}
```
→ Immediately actionable!

---

## 🔧 Technical Details

### Configuration

- **Model**: claude-sonnet-4-5-20250929
- **Temperature**: 0.3 (low for analytical precision)
- **Max Tokens**: 3000
- **Tools**: 5 (read_sessions, read_recent_failures, read_successes, get_statistics, output_analysis)

### File Structure

```
experience-analyzer/
├── config.yaml              # Agent configuration (5 tools)
├── system_prompt.md         # Analysis instructions (9000+ characters)
├── README.md                # This file
└── tools/
    └── basic_stats.py       # Python helper for numerical statistics
```

### Dependencies

- **Delta Engine**: v1.6+ (for ${AGENT_HOME} variable support)
- **Python 3**: For basic_stats.py helper script
- **Parent Agent**: delta-agent-generator v3.0+

---

## 🧪 Testing

### Unit Test (Standalone)

```bash
cd examples/3-advanced/delta-agent-generator

# Create test data
mkdir -p .claude-lab
echo '{"timestamp":"2025-10-08T10:00:00Z","action":"execute","session_id":"test-1","task":"Generate file-organizer with list_files (ls), move_file (mv)","cost_usd":0.12,"result":"success","agent_type":"file-tools"}' > .claude-lab/sessions.jsonl

# Run sub-agent
delta run --agent experience-analyzer \
  -m "Analyze patterns in my generation history" \
  -y

# Expected: JSON analysis with insights
```

### Integration Test (Parent → Child)

```bash
# Run parent agent, which will call sub-agent automatically
delta run --agent examples/3-advanced/delta-agent-generator \
  -m "Generate file organizer (predict cost first)" \
  -y

# Expected: Parent agent calls sub-agent, uses insights to inform generation
```

---

## 📚 Related Documentation

- **Parent Agent**: [delta-agent-generator README](../../README.md)
- **Delta Architecture**: [v1.6 Context Composition](../../../../../docs/architecture/v1.6-context-composition.md)
- **Agent Development**: [Agent Development Guide](../../../../../docs/guides/agent-development.md)

---

## 🤝 Contributing

This sub-agent demonstrates Delta's agent composition capability. Improvements welcome:

1. **Enhanced Analysis**: Add more sophisticated pattern recognition
2. **Better Recommendations**: Refine advice based on user feedback
3. **Cost Modeling**: Improve cost prediction accuracy
4. **Failure Classification**: Categorize failure types more granularly

---

## 📝 Changelog

### v1.0.0 (2025-10-08)
- Initial release
- 5 tools: read_sessions, read_recent_failures, read_successes, get_statistics, output_analysis
- Semantic analysis capability
- Cost prediction with reasoning
- Actionable recommendations

---

**Status**: Production-ready (Part of delta-agent-generator v3.0)

**Demonstrates**: Delta Engine's agent composition philosophy - "Everything is a Command", even other agents.
