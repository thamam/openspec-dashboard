## ADDED Requirements

### Requirement: Claude Provider Implementation
The system SHALL implement a `ClaudeProvider` class that implements the `IAgentProvider` interface.

#### Scenario: Execute task using Claude CLI
- **WHEN** `executeTask` is called with a task context and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session with the `claude` command and the task context

#### Scenario: Execute lifecycle command using Claude CLI
- **WHEN** `executeLifecycle` is called with an agentic command and workspace path
- **THEN** the system SHALL spawn a detached `tmux` session executing `claude` instructed to run the target workflow

### Requirement: Dynamic Provider Selection
The system SHALL dynamically resolve the active provider class based on the change configuration or the environment.

#### Scenario: Resolve provider from environment
- **WHEN** the environment variable `AGENT_PROVIDER` is set to `claude`
- **THEN** the dashboard server SHALL resolve and use the `ClaudeProvider`

#### Scenario: Resolve provider from change config
- **WHEN** `.openspec.yaml` contains `agentProvider: claude`
- **THEN** the dashboard server SHALL resolve and use the `ClaudeProvider`

#### Scenario: Fallback to AntiGravity provider
- **WHEN** no provider is configured in the environment or change configuration
- **THEN** the dashboard server SHALL fallback to `AntiGravityProvider`

### Requirement: Claude Auto Mode by Default
The system SHALL configure the `claude` CLI to run in auto mode by default.

#### Scenario: Start Claude CLI with auto permission mode
- **WHEN** the system spawns a `claude` CLI command
- **THEN** the spawned command arguments SHALL include `--permission-mode auto`
