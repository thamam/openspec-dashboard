## Context

The OpenSpec dashboard provides a unified web interface for managing codebase changes, executing agent workflows, and monitoring task progression. Historically the dashboard supported the `AntiGravityProvider` (using the `agy` CLI). Support was later added for the `ClaudeProvider` (using the `claude` CLI). To offer developers more flexibility — and per product direction to make Codex the default — we integrate Codex (OpenAI's `codex` CLI) as a supported agent provider and as the default.

This requires:
1. Creating a new `CodexProvider` implementing the `IAgentProvider` interface.
2. Enabling dynamic provider resolution based on environment variables or `.openspec.yaml`, with Codex as the default when nothing is configured.
3. Exposing Codex as a selectable option in the frontend interface and reflecting the Codex default in the UI.

## Goals / Non-Goals

**Goals:**
- Implement `CodexProvider` using the `codex` CLI to execute lifecycle commands and tasks in a detached `tmux` session.
- Run `codex` non-interactively with `--ask-for-approval never --sandbox workspace-write` (least-privilege auto-approval).
- Add dynamic resolution of `CodexProvider` when `agentProvider: codex` or `AGENT_PROVIDER=codex` is set, and make Codex the default fallback.
- Update UI dropdowns (CommandCenter, CreateChangeForm) to support selecting Codex, and default the client selection to Codex.

**Non-Goals:**
- Implementing actual task-execution or command-handling logic within the dashboard; the CLI handles execution.
- Supporting execution without `tmux` or on environments lacking the `codex` or `tmux` binaries.
- Per-change tuning of the Codex model, sandbox scope, or approval policy (fixed defaults; future work).

## Decisions

### Decision 1: Codex CLI Execution via Detached TMUX
- **Rationale**: The Codex CLI operates interactively. Spawning it directly as a background process would fail if it requires prompt interaction or a TTY. Spawning in a detached `tmux` session lets the command run asynchronously while developers manually attach (`tmux attach -t <session>`) to inspect progress or troubleshoot — matching the existing `ClaudeProvider` pattern.
- **Alternatives considered**: Spawning a direct child process — rejected; no TTY emulation and no easy way to interact with the running agent.

### Decision 2: Auto-Approval via `--ask-for-approval never --sandbox workspace-write`
- **Rationale**: Dashboard-initiated runs must proceed without hanging for approval prompts. `--ask-for-approval never` removes the prompts; pairing it with `--sandbox workspace-write` (rather than full access) keeps writes confined to the workspace — the least-privilege choice that still lets OpenSpec lifecycle work proceed. This is the Codex analog of Claude's `--permission-mode auto`.
- **Alternatives considered**: `--dangerously-bypass-approvals-and-sandbox` (yolo) — rejected as an unsafe default; it removes the sandbox entirely. `--sandbox danger-full-access` — broader than needed; deferred to future per-change config.

### Decision 3: Dynamically Resolve Codex Provider, with Codex as the Default
- **Rationale**: `ProviderResolver.ts` resolves the provider by precedence — change config (`agentProvider:` in the active change's `.openspec.yaml`) first, then the `AGENT_PROVIDER` environment variable. When neither selects a provider, resolution falls back to `CodexProvider` (Codex is the default). This required refactoring the resolver's sentinel: previously `providerType` was initialised to `'antigravity'` and that same string doubled as "config didn't set it". It is now initialised unset (`undefined`), then config → env → `'codex'` default, then mapped to a class (`claude`→Claude, `antigravity`→AntiGravity, `codex`/unknown→Codex). Anti-Gravity and Claude remain explicitly selectable.
- **Alternatives considered**: Keeping Anti-Gravity as the default — rejected per product direction. Hardcoding the provider at start time — rejected; prevents per-change provider choice.

### Decision 4: Frontend UI Options and Default
- **Rationale**: Users must be able to select Codex from CommandCenter and CreateChangeForm; option elements use value `codex` and label `Codex`. The client's initial provider state also defaults to `codex` (`App.tsx` `agentProvider`, `CreateChangeForm` `proposeEngine`) so the UI reflects the server default when a change has no persisted provider. When a change does specify a provider, the existing load-on-switch logic overrides this initial value.
- **Alternatives considered**: CLI-only configuration — rejected; defeats the dashboard UI. Leaving the UI default at Anti-Gravity — rejected; the selector would show Anti-Gravity while the backend runs Codex.

## Risks / Trade-offs

- **[Risk]**: Silent default flip surprises existing users — changes that relied on the implicit Anti-Gravity default now run Codex, which must be installed/authenticated.
  - **Mitigation**: documented behavior change; Anti-Gravity remains one explicit selection away; Codex is the intended default per product direction.
- **[Risk]**: `workspace-write` sandbox blocks a legitimate out-of-workspace action.
  - **Mitigation**: accept the least-privilege default now; expose sandbox/approval overrides via change config as future work.
- **[Risk]**: Missing `tmux` or `codex` CLI on the host.
  - **Mitigation**: standard error propagation from process spawning surfaces missing-command errors in the server console / dashboard output; the tmux session stays attachable so the operator sees the error directly.

## Migration Plan

- **Deployment**: Deploy the server changes alongside the client updates. The new option appears in the UI; when nothing is configured the server now delegates to Codex by default. Existing changes that pin `agentProvider:` are unaffected.
- **Rollback**: Revert the resolver default to `antigravity` (and the client defaults) to restore the prior behavior; no persisted state depends on the new default beyond opt-in `.openspec.yaml` entries.

## Open Questions

- Should the default sandbox be `workspace-write` (chosen) or configurable per change from day one? Deferred unless an early user hits the limit.
