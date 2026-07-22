## Why

Integrate Codex into the dashboard's supported AI agent providers to allow users to delegate tasks and execute lifecycle commands using the Codex CLI. This expands the agent options available in the dashboard to include Codex in addition to AntiGravity and Claude Code.

## What Changes

- Implement a `CodexProvider` class that implements the `IAgentProvider` interface.
- Add support for resolving `codex` as the active provider via environment variable (`AGENT_PROVIDER=codex`) or change configuration (`agentProvider: codex`).
- Update provider resolution logic to instantiate and return `CodexProvider`.
- Configure `CodexProvider` to run the `codex` CLI with permissions/approval-bypass flags (`--dangerously-bypass-approvals-and-sandbox`) in a detached tmux session.
- Add "Codex" as a selectable agent provider option in the frontend interface.

## Capabilities

### New Capabilities

- `codex-provider`: Implementation of the `IAgentProvider` interface using the Codex CLI to execute lifecycle commands and task executions.

### Modified Capabilities

<!-- None -->

## Impact

- `server/src/agents/providers/CodexProvider.ts`: New provider class.
- `server/src/agents/ProviderResolver.ts`: Resolver logic to import and instantiate `CodexProvider`.
- `client/src/components/CommandCenter/index.tsx`: Dropdown option to select Codex.
- `client/src/components/CreateChangeForm.tsx`: Dropdown option to select Codex for new changes.
