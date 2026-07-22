## ADDED Requirements

### Requirement: Codex Provider Implementation
The system SHALL implement a `CodexProvider` class that implements the `IAgentProvider` interface.

#### Scenario: Execute task using Codex CLI
- **WHEN** `executeTask` is called with a task context and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session with the `codex` command and the task context

#### Scenario: Execute lifecycle command using Codex CLI
- **WHEN** `executeLifecycle` is called with an agentic command and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session executing `codex` instructed to run the target workflow

### Requirement: Codex Bypass Approvals and Sandbox
The system SHALL configure the `codex` CLI to run with bypassed approvals and sandboxing by default for seamless execution in the dashboard environment.

#### Scenario: Start Codex CLI with bypass flag
- **WHEN** the system spawns a `codex` CLI command
- **THEN** the spawned command arguments SHALL include `--dangerously-bypass-approvals-and-sandbox`

### Requirement: Codex Dynamic Provider Selection
The system SHALL dynamically resolve the `CodexProvider` when configured in the environment or change configuration.

#### Scenario: Resolve Codex from environment
- **WHEN** the environment variable `AGENT_PROVIDER` is set to `codex`
- **THEN** the dashboard server SHALL resolve and use the `CodexProvider`

#### Scenario: Resolve Codex from change config
- **WHEN** `.openspec.yaml` contains `agentProvider: codex`
- **THEN** the dashboard server SHALL resolve and use the `CodexProvider`
