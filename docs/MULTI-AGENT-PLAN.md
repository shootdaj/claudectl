# Multi-Agent Claude System: `claude-team`

A system where multiple Claude Code instances collaborate, each with specialties, delivering work that meets requirements 100% before shipping.

---

## Research Summary

### Ralph Wiggum (What You Heard Of)
**Not multi-agent.** It's a looping technique by Geoff Huntley:
- Bash loop that keeps feeding prompts to Claude until completion
- Uses a "Stop Hook" that blocks exit until `<promise>COMPLETE</promise>` found
- Single agent retrying, not multiple agents collaborating
- Good for: Long-running autonomous tasks, AFK development

Sources: [Ralph Wiggum Guide](https://awesomeclaude.ai/ralph-wiggum), [GitHub](https://github.com/ghuntley/how-to-ralph-wiggum)

### Existing Frameworks (Why Not Use Them)
| Framework | Agents | Why Not |
|-----------|--------|---------|
| [Claude Flow](https://github.com/ruvnet/claude-flow) | 54+ | Heavyweight, opinionated architecture |
| [wshobson/agents](https://github.com/wshobson/agents) | 99 | Overkill, learning curve > benefit |

### Chosen Approach: Claude Agent SDK
- Official Anthropic SDK, production-ready
- Clean Python/TypeScript API for spawning subagents
- Built-in MCP support for inter-agent communication
- You define exactly the agents you need

Sources: [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk), [Multi-Agent Research](https://www.anthropic.com/engineering/multi-agent-research-system)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   COORDINATOR (Opus 4)                   │
│  - Receives user task                                    │
│  - Creates requirements doc (LOCKED)                     │
│  - Breaks down into subtasks                             │
│  - Delegates to specialists                              │
│  - Synthesizes results                                   │
└─────────────────────────────────────────────────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌──────────┐        ┌──────────┐        ┌──────────┐
│ Frontend │        │ Backend  │        │ Database │
│ (Sonnet) │        │ (Sonnet) │        │ (Sonnet) │
└──────────┘        └──────────┘        └──────────┘
      │                   │                   │
      └───────────────────┴───────────────────┘
                          │
                    Shared Codebase
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌──────────┐        ┌──────────┐        ┌──────────┐
│    QA    │        │ Security │        │   User   │
│ (Sonnet) │        │ (Sonnet) │        │ (Sonnet) │
│  VETO    │        │  REVIEW  │        │  FINAL   │
└──────────┘        └──────────┘        └──────────┘
```

---

## Specialist Agents

| Agent | Role | Focus |
|-------|------|-------|
| **Coordinator** | Tech lead | Task decomposition, delegation, synthesis |
| **Frontend** | UI specialist | React/Vue, CSS, accessibility, UX |
| **Backend** | API specialist | Services, business logic, data flow |
| **Database** | Data specialist | Schema, queries, migrations, optimization |
| **QA** | Quality gate | Tests, edge cases, **VETO POWER** |
| **Security** | Pentest/hardening | Vulnerabilities, auth, OWASP |
| **User** | End user | Non-technical, runs app as customer would |

### The User Agent (Critical)
The User agent is NOT technical. It:
- **Runs the actual app** (browser, CLI, whatever the deliverable is)
- **Follows user journeys** defined in requirements
- **Reports UX issues** that QA might miss
- **Final sign-off** from customer perspective

```
QA: "All tests pass, code works" ✓
User: "I can't find the login button, it's below the fold" ✗
→ Back to Frontend
```

---

## Core Principle: Strict Accountability

**Problem with single-agent Claude:** Returns partial solutions, requires multiple prompts to fix.

**Solution:** Multi-layer verification where **nothing ships until QA signs off**.

```
Developer delivers → QA rejects → Developer fixes → QA rejects → ... → QA approves
                                                                            ↓
                                                                    Security reviews
                                                                            ↓
                                                                     User tests
                                                                            ↓
                                                                       SHIPS
```

### The Accountability Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                      REQUIREMENTS DOC                            │
│  (Created by Coordinator, IMMUTABLE during execution)            │
│  - Explicit acceptance criteria with priorities                  │
│  - Measurable outcomes                                           │
│  - Edge cases to handle                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DEVELOPER AGENT                             │
│  - Implements feature                                            │
│  - Must address ALL acceptance criteria                          │
│  - Submits: code + self-assessment against requirements          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         QA AGENT                                 │
│  - Runs tests (unit, integration, e2e)                           │
│  - Checks EACH acceptance criterion ✓/✗                          │
│  - If ANY P0/P1 criterion fails → REJECT with specific feedback  │
│  - Only APPROVE when 100% P0 + P1 pass                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                 REJECT              APPROVE
                    │                   │
                    ▼                   ▼
           Back to Developer      Security Review
                                        │
                                        ▼
                                   User Testing
                                        │
                                        ▼
                                  Final Delivery
```

---

## Requirement Priority Levels

```typescript
interface Requirement {
  id: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  acceptanceCriteria: string[];
  lockedAt: Date;  // Immutable until human changes
}
```

| Priority | Meaning | Shipping Rule |
|----------|---------|---------------|
| **P0 - Required** | Must have, blocks release | ALL must pass |
| **P1 - Expected** | Should have, degrades experience | ALL must pass (or human defers) |
| **P2 - Nice to have** | Enhancement, not critical | Can ship without |

```typescript
function canShip(results: CriteriaResult[]): boolean {
  const p0 = results.filter(r => r.priority === "P0");
  const p1 = results.filter(r => r.priority === "P1");

  if (p0.some(r => !r.passed)) return false;
  if (p1.some(r => !r.passed && !r.deferred)) return false;
  return true;
}
```

### Requirements Are Immutable

**Critical rule:** No agent can change requirements. Only human can.

```
Human: "Add auth"
Coordinator: Creates requirements doc → LOCKED

Developer: "Can we skip rate limiting?"
System: "NO. Requirements locked. Ask human to change."
```

---

## Safeguards Against Infinite Loops

```typescript
const MAX_REVISION_CYCLES = 5;  // Developer-QA back-and-forth
const MAX_AGENT_TURNS = 50;     // Per-agent context limit
```

**Escalation rules:**
- Developer-QA cycle exceeds 5 iterations → Escalate to human
- Same QA feedback repeated 3x → Escalate (agent stuck)
- Agent exceeds context limit → Summarize and continue fresh

**Escalation output:**
```
⚠️ ESCALATION REQUIRED

Task: Add user authentication
Stuck on: Rate limiting implementation
Attempts: 5

QA Feedback History:
1. "Add rate limiting" → Developer added IP-based limit
2. "Rate limit not working" → Developer fixed middleware order
3. "Rate limit not working" → Developer same fix (stuck)

Human action required: Clarify rate limiting requirements
```

---

## QA Agent System Prompt

```markdown
You are a senior QA engineer with VETO POWER over all deliverables.

## Your Role
You are the LAST LINE OF DEFENSE before code ships. Your job is NOT to be helpful
or encouraging. Your job is to find problems.

## Rules
1. **Never approve partial solutions.** If 9/10 criteria pass, REJECT.
2. **Run actual tests.** Don't just read code - execute `bun test` and verify.
3. **Check edge cases.** If requirements mention edge cases, test them explicitly.
4. **Be specific.** "Doesn't work" is not valid feedback. State exactly what fails.
5. **No assumptions.** If something "probably works," test it. Verify, don't assume.

## Approval Criteria
ONLY approve when ALL of the following are true:
- Every P0/P1 acceptance criterion has a passing test
- Tests actually execute (not just written)
- Edge cases documented in requirements are handled
- No obvious security vulnerabilities
- Code compiles without errors

## Response Format
For each criterion:
- ✓ PASS: [criterion] - [evidence: test name, output]
- ✗ FAIL: [criterion] - [what's wrong, how to fix]

VERDICT: APPROVE / REJECT
FEEDBACK: [Specific, actionable items if rejected]
```

---

## Tech Stack

- **Language:** TypeScript
- **SDK:** Claude Agent SDK (TypeScript version via `@anthropic-ai/claude-agent-sdk`)
- **IPC:** MCP tools for delegation + file-based handoffs
- **CLI:** Commander.js
- **Output:** Terminal with colored output per agent

---

## File Structure

```
claude-team/
├── src/
│   ├── index.ts              # CLI entry
│   ├── coordinator.ts        # Main orchestrator logic
│   ├── agents/
│   │   ├── base.ts           # Base agent class
│   │   ├── frontend.ts
│   │   ├── backend.ts
│   │   ├── database.ts
│   │   ├── qa.ts
│   │   ├── security.ts
│   │   └── user.ts
│   ├── prompts/
│   │   ├── coordinator.md    # System prompts
│   │   ├── frontend.md
│   │   ├── qa.md
│   │   └── ...
│   ├── types/
│   │   └── requirements.ts   # Requirement interfaces
│   └── utils/
│       ├── mcp.ts            # MCP tool definitions
│       └── output.ts         # Colored terminal output
├── package.json
└── README.md
```

---

## CLI Usage

```bash
# Basic usage - Coordinator breaks down and delegates
claude-team "Add user authentication to the app"

# Specify agents to use
claude-team --agents frontend,backend "Build a dashboard"

# Pipeline mode (sequential)
claude-team --pipeline "architect,dev,qa,security" "New feature: dark mode"

# Interactive mode (watch agents work in real-time)
claude-team --interactive "Refactor the API layer"

# Set max revision cycles
claude-team --max-revisions 3 "Fix the login bug"
```

---

## Implementation Steps

### Phase 1: Foundation
1. Create GitHub repo `claude-team`
2. Set up TypeScript + Claude Agent SDK
3. Implement base agent class with isolated context
4. Create Coordinator with delegation tools

### Phase 2: Core Agents
5. Implement Frontend, Backend, Database agents
6. Create system prompts for each specialist
7. Test single-agent execution

### Phase 3: Accountability Loop
8. Implement requirements doc generation
9. Add QA agent with strict verification
10. Implement reject/approve workflow
11. Add revision cycle tracking

### Phase 4: User Agent & Polish
12. Add User agent for end-user testing
13. Add Security agent
14. Implement escalation logic
15. CLI interface with progress output

---

## Verification

1. Run `claude-team "Add a contact form"` on a test project
2. Verify Coordinator creates requirements with P0/P1/P2 priorities
3. Verify Developer implements, QA rejects with specific feedback
4. Verify revision cycle continues until all P0/P1 pass
5. Verify User agent tests from end-user perspective
6. Verify escalation triggers after 5 failed cycles

---

## Future Enhancements (Post-MVP)

- **PM Agent** - Writes PRDs, clarifies requirements before dev starts
- **DevOps Agent** - CI/CD, deployment, infrastructure
- **Docs Agent** - Documentation, API docs, README updates
- **Web UI** - Visual orchestration dashboard
- **claudectl integration** - View team sessions in claudectl
- **Cost tracking** - Track API costs per agent per task