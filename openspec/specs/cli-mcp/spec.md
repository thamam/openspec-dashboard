# cli-mcp Specification

## Purpose
This capability provides a headless command-line interface and a stdio-based Model Context Protocol (MCP) server wrapper for the OpenSpec Dashboard.

## Requirements

### Requirement: OpenSpec CLI Commands
The system SHALL support executing OpenSpec status checks, task audits, complexity indexing, and interrogation workflows via a command-line interface.

#### Scenario: Running status command
- **WHEN** the user executes `openspec-cli status`
- **THEN** the system SHALL display the repository readiness, OpenSpec initialization, and git worktrees information

#### Scenario: Running lint command
- **WHEN** the user executes `openspec-cli lint --change <change-name>`
- **THEN** the system SHALL print task complexity and coupling warnings, and write them to `linter-warnings.json` in the change directory

#### Scenario: Running complexity command
- **WHEN** the user executes `openspec-cli complexity --change <change-name>`
- **THEN** the system SHALL print the early complexity index rating and scores, and write them to `complexity.json` in the change directory

#### Scenario: Running interrogate command to retrieve questions
- **WHEN** the user executes `openspec-cli interrogate --change <change-name>`
- **THEN** the system SHALL retrieve or generate 3 comprehension questions, print them, and save them to `review-answers.json`

#### Scenario: Running interrogate command to submit answers
- **WHEN** the user executes `openspec-cli interrogate --change <change-name> --submit --answers <json>`
- **THEN** the system SHALL parse the answers, write them to `review-answers.json` in the change directory, and mark the interrogation as completed if all questions are answered

### Requirement: Stdio Model Context Protocol Server
The system SHALL expose the OpenSpec CLI capabilities as structured tools on a stdio-based MCP server wrapper.

#### Scenario: Exposing tools list
- **WHEN** an AI agent requests the tools list from the MCP server
- **THEN** the server SHALL return `get_repo_status`, `run_linter`, `get_complexity`, `get_interrogation_questions`, and `submit_interrogation_answers`

#### Scenario: Executing MCP tools
- **WHEN** an AI agent calls any of the exposed MCP tools
- **THEN** the server SHALL execute the corresponding capability and return the result in JSON-RPC format
