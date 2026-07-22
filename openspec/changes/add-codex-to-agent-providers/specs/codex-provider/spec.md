## ADDED Requirements

### Requirement: Codex Provider Implementation
The system SHALL implement a `CodexProvider` class that implements the `IAgentProvider` interface, spawning the `codex` CLI in a detached, attachable `tmux` session.

#### Scenario: Execute task using Codex CLI
- **WHEN** `executeTask` is called with a task context and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session running the `codex` command with the task context as its prompt

#### Scenario: Execute lifecycle command using Codex CLI
- **WHEN** `executeLifecycle` is called with a lifecycle command, args, and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session running the `codex` command with a human-readable instruction derived from the command and change name

#### Scenario: Return attach instructions
- **WHEN** a Codex session is launched
- **THEN** the returned `ExecutionStream` SHALL emit `tmux attach -t <session>` instructions so the operator can attach to the running agent

### Requirement: Codex Auto-Approval by Default
The system SHALL configure the `codex` CLI to run non-interactively without approval prompts by default, scoped to a least-privilege workspace sandbox.

#### Scenario: Start Codex CLI with approvals disabled
- **WHEN** the system spawns a `codex` CLI command
- **THEN** the spawned command SHALL include `--ask-for-approval never`
- **AND** the spawned command SHALL include `--sandbox workspace-write`

### Requirement: Dynamic Codex Provider Resolution
The system SHALL dynamically resolve `codex` to the `CodexProvider` class from change configuration or the environment, and SHALL use `CodexProvider` as the default provider when none is configured. The resolution precedence order (change config → environment → default) SHALL be preserved.

#### Scenario: Resolve Codex from environment
- **WHEN** the environment variable `AGENT_PROVIDER` is set to `codex`
- **THEN** the dashboard server SHALL resolve and use the `CodexProvider`

#### Scenario: Resolve Codex from change config
- **WHEN** a change's `.openspec.yaml` contains `agentProvider: codex`
- **THEN** the dashboard server SHALL resolve and use the `CodexProvider`

#### Scenario: Change config takes precedence over environment
- **WHEN** `.openspec.yaml` selects one provider and `AGENT_PROVIDER` selects a different one
- **THEN** the dashboard server SHALL resolve the provider named in the change config

#### Scenario: Codex is the default provider
- **WHEN** neither the change configuration nor the `AGENT_PROVIDER` environment variable selects a provider
- **THEN** the dashboard server SHALL resolve and use `CodexProvider` as the default

#### Scenario: Anti-Gravity remains explicitly selectable
- **WHEN** `AGENT_PROVIDER` is set to `antigravity` (or a change's `.openspec.yaml` contains `agentProvider: antigravity`)
- **THEN** the dashboard server SHALL resolve and use the `AntiGravityProvider`
