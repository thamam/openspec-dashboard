## Context

We are building a headless agentic integration for the OpenSpec Dashboard. It consists of a command-line interface (`openspec-cli`) and a stdio-based Model Context Protocol (MCP) server. It also writes complexity and lint metrics directly back into the change folders so they can be monitored.

## Goals / Non-Goals

**Goals:**
- Provide a robust command-line interface for manual auditing, status checking, and active interrogation response.
- Expose status, linting, complexity index, and active interrogation questions/answers as MCP tools on a stdio server.
- Persist complexity and linter findings back to the change folder.

**Non-Goals:**
- Building a graphical interface (GUI) or electron app for headless agents.
- Supporting network-based MCP transports (like WebSockets or SSE) at this stage.

## Decisions

### Decision 1: Hybrid Workspace Structure
We will structure the CLI and MCP code in a new workspace package called `cli/` to keep it separate from the dashboard backend server while allowing relative imports of the DAG parsing and repository service functions.
- *Alternatives considered:* Implementing the CLI within the server directory. *RATIONALE:* Harder to package as a standalone executable and clutters the server build.

### Decision 2: Stdio-based MCP Communication
We will use `@modelcontextprotocol/sdk` to build a stdio-based server. This is standard, secure, and enables agents to execute it as a local process without requiring web ports.
- *Alternatives considered:* Custom stdio JSON-RPC implementation. *RATIONALE:* `@modelcontextprotocol/sdk` is well-tested, handles serialization/deserialization safely, and conforms to standard protocol schemas.

### Decision 3: Dynamic Metric Persistency in getChangeDag
We will modify the server's `getChangeDag` function to automatically write `complexity.json` and `linter-warnings.json` to the change directory.
- *Alternatives considered:* Only writing these files when the CLI is run. *RATIONALE:* Writing them whenever the DAG is parsed guarantees they are always up to date and in sync with any manual or automated updates, making dashboard-monitored metrics persistent by design.

## Risks / Trade-offs

- [Risk: Missing GEMINI_API_KEY] → The active interrogation questions will fall back to static template questions.
- [Risk: File System Permissions] → Writing to the change directory from the server/CLI requires write permissions in the workspace directory.
