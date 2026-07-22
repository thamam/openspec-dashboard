## Why

Integrate Codex (OpenAI's `codex` CLI) into the dashboard's supported AI agent providers so users can delegate OpenSpec lifecycle commands and tasks to it, alongside Anti-Gravity and Claude Code. Per product direction, Codex becomes the **default** provider: a freshly opened change delegates to Codex unless another provider is explicitly configured.

## What Changes

- Implement a `CodexProvider` class that implements the `IAgentProvider` interface, spawning the `codex` CLI in a detached `tmux` session (behaviorally symmetric with `ClaudeProvider`).
- Configure `CodexProvider` to run non-interactively with `--ask-for-approval never --sandbox workspace-write` (least-privilege auto-approval — the Codex analog of Claude's `--permission-mode auto`).
- Extend dynamic provider resolution so `codex` (via `AGENT_PROVIDER=codex` or `agentProvider: codex` in a change's `.openspec.yaml`) resolves to `CodexProvider`, and **make Codex the default fallback** when nothing is configured. Anti-Gravity and Claude Code remain explicitly selectable.
- Add "Codex" as a selectable agent provider option in the GUI, and default the client provider selection to Codex to match the server default.

## Capabilities

### New Capabilities

- `codex-provider`: Implementation of the `IAgentProvider` interface using the Codex CLI to execute lifecycle commands and tasks in a detached tmux session, plus its dynamic resolution and its role as the default provider.

### Modified Capabilities

- `model-selection`: The GUI Agent Provider selector adds Codex as a selectable, persistable option and defaults to Codex when a change has no provider configured.

## Impact

- **New code**: `server/src/agents/providers/CodexProvider.ts`.
- **Modified code**:
  - `server/src/agents/ProviderResolver.ts`: add `codex` case + Codex default fallback.
  - `server/tests/providerResolver.test.ts`: default-provider expectation + Anti-Gravity selection test.
  - `client/src/components/CommandCenter/index.tsx`, `client/src/components/CreateChangeForm.tsx`: add Codex dropdown option.
  - `client/src/App.tsx`, `client/src/components/CreateChangeForm.tsx`: default client provider state to `codex`.
- **External dependency**: requires the `codex` CLI to be installed and authenticated on the host. Because Codex is now the default, the default delegation path depends on this prerequisite.
- **Behavior change**: the implicit default provider flips from Anti-Gravity to Codex. Changes that pin a provider in `.openspec.yaml` are unaffected; changes relying on the implicit default now run via Codex. Anti-Gravity remains available when selected explicitly.
