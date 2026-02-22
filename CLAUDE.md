# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

openAgents is a modular sandbox platform for building specialized agents with tools and skills, enabling secure and traceable inter-agent communication. The project is in bootstrap phase (Phase 0) with only JSON schemas currently implemented.

## Architecture

The system follows a capability-based security model with centralized coordination:

- **Orchestrator**: Receives user tasks, selects agents, manages task lifecycle (pending/running/blocked/completed/failed), applies policies (timeout, retry, budget)
- **Agent Runtime**: Execution environment for agents, manages prompt context, tool selection, and standardizes agent I/O
- **Tool Gateway**: Registers and executes tools with schema validation, permission control, and audit logging
- **Message Bus**: Handles inter-agent communication via request/reply and pub/sub patterns
- **Observability**: Structured logging with `trace_id`, metrics, and traces per task/agent/tool

### Key Principles

1. **Separation of concerns**: Agents reason, tools execute
2. **Typed contracts**: All messages and tools use JSON Schema validation
3. **Sandbox by capabilities**: Per-agent and per-tool permission isolation
4. **Complete traceability**: All actions logged with `task_id` and `trace_id`

## Project Structure

```
platform/
├── runtime/          # Agent lifecycle and execution
├── orchestrator/     # Multi-agent task coordination
├── tool-gateway/     # Tool registry, validation, and execution
├── message-bus/      # Event transport for internal communication
└── observability/    # Logging, metrics, and traces

agents/
├── supervisor/       # High-level task coordination agent
├── planner/         # Planning and strategy agent
├── coder/           # Code implementation agent
└── reviewer/        # Code review agent

skills/              # Installable behavior modules
schemas/             # JSON Schema contracts (see below)
docs/                # Additional technical documentation
```

## Core Contracts

All inter-component communication follows strict JSON Schema contracts in `schemas/`:

### AgentTask (`agent-task.schema.json`)
```json
{
  "id": "string (required)",
  "goal": "string (required)",
  "context": "object (required)",
  "constraints": "object (required)",
  "reply_to": "string (required)"
}
```

### AgentResult (`agent-result.schema.json`)
```json
{
  "task_id": "string (required)",
  "status": "completed | failed | blocked (required)",
  "summary": "string (required)",
  "artifacts": "array of objects (required)",
  "next_actions": "array of strings (required)"
}
```

### ToolSpec (`tool-spec.schema.json`)
```json
{
  "name": "string (required)",
  "description": "string (required)",
  "input_schema": "JSON Schema object (required)",
  "output_schema": "JSON Schema object (required)",
  "permissions": "array of strings (required, min 1)",
  "side_effects": "none | fs | network | external (required)"
}
```

### SkillManifest (`skill-manifest.schema.json`)
```json
{
  "name": "string matching ^[a-z0-9-]+$ (required)",
  "description": "string (required)",
  "triggers": "array of strings (required)",
  "resources": {
    "scripts": "array of strings",
    "references": "array of strings",
    "assets": "array of strings"
  },
  "version": "semver string (required)"
}
```

## Task Flow

1. User submits task to Orchestrator via API Gateway
2. Orchestrator creates `task_id` and selects initial agent (typically supervisor or planner)
3. Agent executes steps, calling tools via Tool Gateway
4. Inter-agent collaboration happens through Message Bus events
5. Orchestrator collects partial results
6. Final `AgentResult` is consolidated and returned to user

## MVP Scope (Current Target)

The first deliverable includes:

1. **API endpoints** in `platform/orchestrator`:
   - `submit_task(goal, context, constraints)` → `task_id`
   - `get_task_status(task_id)` → status object
   - `get_task_result(task_id)` → `AgentResult`

2. **Complete flow** with 2 agents: supervisor + planner

3. **Initial tools**: `filesystem.read` and `filesystem.write` with schema validation

4. **Traceability**: All operations logged with `task_id` and `trace_id`

5. **Example skill** in `skills/` to validate the pipeline

## Development Roadmap

- **Phase 0 (Current)**: Bootstrap - Create schemas ✓, implement interfaces (IAgent, ITool)
- **Phase 1**: Basic execution - Functional runtime, tool gateway, end-to-end simple task
- **Phase 2**: Inter-agent communication - Integrate message bus, handle timeouts/retries
- **Phase 3**: Skills and governance - Load skills from `skills/`, validate manifests, permission policies
- **Phase 4**: Hardening - Full observability, robust retries + DLQ, load testing

## Implementation Guidelines

### When implementing IAgent interface
- Must accept `AgentTask` and return `AgentResult`
- Must validate against schemas in `schemas/`
- All tool calls go through Tool Gateway (never direct execution)
- Use Message Bus for agent-to-agent communication

### When implementing ITool
- Must define complete `ToolSpec` with I/O schemas
- Declare all required permissions explicitly
- Specify side effects accurately (none/fs/network/external)
- All invocations are audited by Tool Gateway

### When creating skills
- Follow `SkillManifest` schema strictly
- Use lowercase alphanumeric + hyphens for name
- Declare all resources (scripts, references, assets)
- Use semantic versioning

## Security Model

- Agents run with capability profiles (allowlist of tools)
- Tools execute with explicit permission checks
- Sensitive operations require policy approval
- All executions traced: who executed what, when, with what parameters
- Schema validation enforced at all component boundaries
