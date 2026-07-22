## Context

The OpenSpec dashboard provides a unified web interface for managing codebase changes, executing agent workflows, and monitoring task progression. Historically, the dashboard supported the `AntiGravityProvider` (using the `agy` CLI). Recently, support was introduced for the `ClaudeProvider` (using the `claude` CLI). To offer developers even more flexibility, we want to integrate Codex as a supported agent provider.

This requires:
1. Creating a new `CodexProvider` implementing the `IAgentProvider` interface.
2. Enabling dynamic provider resolution based on environment variables or `.openspec.yaml` files.
3. Exposing Codex as a selectable option in the frontend interface.

## Goals / Non-Goals

**Goals:**
- Implement `CodexProvider` using the `codex` CLI to execute lifecycle commands and task executions.
- Run `codex` commands inside a detached `tmux` session, automatically adding the `--dangerously-bypass-approvals-and-sandbox` flag.
- Add dynamic resolution of `CodexProvider` when `agentProvider: codex` or `AGENT_PROVIDER=codex` is set.
- Update UI dropdowns in CommandCenter and CreateChangeForm to support selecting the Codex provider.

**Non-Goals:**
- Implementing actual task-execution or command-handling logic within the dashboard; the CLI handles the execution.
- Supporting execution without `tmux` or on environments lacking the `codex` or `tmux` binaries.

## Decisions

### Decision 1: Codex CLI Execution via Detached TMUX
- **Rationale**: The Codex CLI operates interactively. Spawning it directly as a background process would fail if it requires user prompt interaction or a TTY. Spawning in a detached `tmux` session allows the command to run asynchronously while letting developers manually attach via terminal (`tmux attach -t agent-<timestamp>`) to inspect progress or troubleshoot.
- **Alternatives considered**: Spawning a direct child process. This was rejected because it does not provide TTY emulation or an easy way for developers to interact with the running agent.

### Decision 2: Bypass Approvals and Sandbox
- **Rationale**: Dashboard-initiated runs must execute seamlessly without hanging for permissions or approval confirmations. Therefore, `codex` CLI runs will unconditionally include the `--dangerously-bypass-approvals-and-sandbox` flag.
- **Alternatives considered**: Interactive prompt forwarding, which is highly complex and out of scope for the current design.

### Decision 3: Dynamically Resolve Codex Provider
- **Rationale**: `ProviderResolver.ts` will resolve `codex` by checking for the `agentProvider: codex` value in the active change's `.openspec.yaml` first, falling back to the `AGENT_PROVIDER` environment variable.
- **Alternatives considered**: Hardcoding the provider at start time, which would prevent different changes from using different providers.

### Decision 4: Frontend UI Options
- **Rationale**: The user must be able to select Codex from CommandCenter and CreateChangeForm. We will add option elements with value `codex` and display label `Codex`.
- **Alternatives considered**: CLI-only configuration, which defeats the purpose of the dashboard UI.

## Risks / Trade-offs

- **[Risk]**: The `--dangerously-bypass-approvals-and-sandbox` flag bypasses safety prompts.
  - **Mitigation**: Users must be aware that running Codex via the dashboard runs with full local access. Document this clearly in the change instructions or UI labels.
- **[Risk]**: Missing `tmux` or `codex` CLI on the host machine.
  - **Mitigation**: Standard error propagation from process spawning will log missing command issues, which can be viewed in the server console or dashboard output.

## Migration Plan

- **Deployment**: Deploy the server changes alongside the client updates. The new option will appear in the UI, and if a change configures `agentProvider: codex`, the server will seamlessly invoke the `codex` CLI.
- **Rollback**: To rollback, set the provider back to `antigravity` or `claude` in the UI or environment variables.

## Open Questions

- *None.*
