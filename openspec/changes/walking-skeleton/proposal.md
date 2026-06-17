## Why

To establish a verified baseline for the OpenSpec Dashboard project by setting up a "Walking Skeleton"—a minimal, end-to-end slice of the application connecting the frontend UI to the backend filesystem/CLI runner. This proves the integration of the React frontend, Express backend, and testing infrastructure (Vitest + Playwright) works before implementing more complex features.

## What Changes

- Set up monorepo structure with NPM Workspaces for `client` and `server`.
- Implement a Node.js/Express server that exposes a `/api/status` endpoint to check local repository status (git and openspec presence).
- Implement a React dashboard UI that allows inputting a directory path and displays its git/openspec status.
- Add unit testing with Vitest in both client and server.
- Add E2E testing with Playwright to verify the complete system flow.

## Capabilities

### New Capabilities

- `walking-skeleton`: Ability to enter a directory path on the dashboard and verify if it has Git and OpenSpec initialized, displaying the status in a premium UI.

### Modified Capabilities

(None)

## Impact

- Root directory configuration for NPM Workspaces, TypeScript, and Playwright.
- New `client/` package for the frontend.
- New `server/` package for the backend.
