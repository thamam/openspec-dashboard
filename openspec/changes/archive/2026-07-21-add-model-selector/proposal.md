## Why

Currently, there is no way in the dashboard GUI to select which Agent Provider (Claude Code or Anti-Gravity) should execute lifecycle commands. Users must configure this out-of-band by manually editing `.openspec.yaml` or setting the `AGENT_PROVIDER` environment variable.

## What Changes

- Add a dropdown selector in the dashboard UI left panel (under "Lifecycle Actions") to choose the active Agent Provider (`Anti-Gravity` or `Claude Code`).
- Implement a backend endpoint `POST /api/changes/:change/provider` to persist the chosen provider to the change's `.openspec.yaml` file when the selection changes.
- Automatically update the selected provider state in the UI when switching between changes.

## Capabilities

### New Capabilities
- `model-selection`: Allow GUI-based selection and persistence of the active Agent Provider for a change.

### Modified Capabilities

## Impact

- **Client**: `CommandCenter` component (added select element, state management, and API post).
- **Server**: `app.ts` (added `POST /api/changes/:change/provider` endpoint), `repoService.ts` (added function to write `.openspec.yaml` config).
