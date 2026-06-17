## Why

To introduce a "Review Mode" to the OpenSpec Dashboard that parses change artifacts into a Directed Acyclic Graph (DAG), letting developers visually trace and verify alignment between high-level proposals, specs/requirements, designs, and tasks.

## What Changes

- Add a `GET /api/changes/:change/dag` backend route parsing markdown files into a unified DAG node/edge representation.
- Add an token-based Jaccard similarity edge-matching logic on the backend.
- Add an interactive `DagViewer` React component drawing connections using SVG lines.
- Add a "Review Mode" tab in the frontend layout.

## Capabilities

### New Capabilities

- `dag-linkage`: Parse, calculate, and visually render the DAG linkages for any active or archived change.

### Modified Capabilities

(None)

## Impact

- Modifies `server/src/app.ts`, `client/src/App.tsx`, and `client/src/App.css`.
- Adds `server/src/services/dagService.ts`, `client/src/components/DagViewer.tsx`, and `client/src/components/DagViewer.css`.
