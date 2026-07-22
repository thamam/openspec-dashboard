# model-selection Specification

## Purpose
TBD - created by syncing change add-model-selector. Update Purpose after archive.

## Requirements

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

### Requirement: Persist Provider Selection
The dashboard server SHALL expose a REST endpoint to persist the chosen provider in the change's configuration file.

#### Scenario: Persist provider to change config
- **WHEN** a POST request is received at `/api/changes/:change/provider` with `agentProvider` in the body
- **THEN** the server SHALL update `.openspec.yaml` inside the change's folder on disk to contain `agentProvider: <value>`

### Requirement: Load Active Provider on Change Switch
The dashboard UI SHALL retrieve and display the active provider configuration whenever a change is loaded or switched.

#### Scenario: Load provider on change load
- **WHEN** the user switches the active change in the sidebar
- **THEN** the client SHALL fetch the active change's artifacts and files, parse the configured provider, and update the dropdown select value to match
