## MODIFIED Requirements

### Requirement: GUI Agent Provider Selector
The dashboard UI SHALL render a dropdown selector in the left pane under "Lifecycle Actions" to choose the active Agent Provider (Anti-Gravity, Claude Code, or Codex). When a change has no provider configured, the selector SHALL default to Codex, matching the server's default resolution.

#### Scenario: Select agent provider in GUI
- **WHEN** the user selects "Claude Code" from the Agent Provider dropdown
- **THEN** the client SHALL send a POST request to the backend to update the configured provider for the active change

#### Scenario: Codex is selectable
- **WHEN** the user selects "Codex" from the Agent Provider dropdown
- **THEN** the client SHALL persist `agentProvider: codex` for the active change, using the option value string `codex` that the provider resolver expects

#### Scenario: Codex shown as default when unconfigured
- **WHEN** a change is loaded that has no `agentProvider` persisted
- **THEN** the Agent Provider dropdown SHALL default to "Codex" (value `codex`)
