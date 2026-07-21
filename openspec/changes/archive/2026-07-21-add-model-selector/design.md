## Context

The OpenSpec dashboard backend resolved the active Agent Provider dynamically by reading the `agentProvider` field in the change configuration `.openspec.yaml` or falling back to the `AGENT_PROVIDER` environment variable. However, the client GUI does not show this selection or allow configuring it.

## Goals / Non-Goals

**Goals:**
* Provide a GUI dropdown selector in the dashboard to choose the active Agent Provider.
* Expose a server API endpoint to save the selected provider to `.openspec.yaml` in the change directory.
* Auto-poll and sync the selected provider state on change switch.

**Non-Goals:**
* Modifying global server environment variables from the GUI.
* Adding a configuration GUI for providers other than Claude Code and Anti-Gravity.

## Decisions

### Decision 1: GUI Dropdown Placement
* **Choice**: Render the Agent Provider dropdown selector in the dashboard's left pane (inside the `CommandCenter` component) directly above the "Lifecycle Actions" buttons.
* **Rationale**: This group is where all action triggers reside, making it intuitive for the user to configure the executor model before running operations.
* **Alternatives considered**: Placing it in the top header. Rejected because it clutters the global header which is reserved for global path configurations.

### Decision 2: Backend Persistence API
* **Choice**: Expose a new POST endpoint `/api/changes/:change/provider` that accepts `{ provider: string }` and writes `agentProvider: <provider>` to the change's `.openspec.yaml`.
* **Rationale**: Writes the choice directly to the file system, ensuring it is preserved across server restarts and is fully compatible with headless CLI operations.
* **Alternatives considered**: Passing the provider on every `/api/execute` call. Rejected because it doesn't persist the state if the user reloads the dashboard or runs CLI commands directly.

### Decision 3: Exposing Current Provider to Frontend
* **Choice**: Include the parsed `agentProvider` as a top-level field in the response of the existing `GET /api/artifacts` endpoint.
* **Rationale**: The client already calls `GET /api/artifacts` when switching changes or polling, so appending the active provider metadata is highly efficient and requires no extra request.

## Risks / Trade-offs

* **[Risk: Invalid provider value written to config]** &rarr; **Mitigation**: Add validation in the backend controller to ensure only `claude` or `antigravity` are accepted.
