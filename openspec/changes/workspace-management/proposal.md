## Why

To expand the OpenSpec Dashboard's capabilities by allowing developers to manage their local workspaces directly: specifically, initializing OpenSpec in projects that don't have it yet, and spinning up new Git worktree branches for isolated change development.

## What Changes

- Add Express backend endpoints `POST /api/init` and `POST /api/worktree` for running CLI/git commands.
- Implement React UI cards to trigger OpenSpec initialization when a repo has git but lacks OpenSpec.
- Implement React UI form to create a new Git worktree with customizable branch name and destination paths.

## Capabilities

### New Capabilities

- `workspace-init`: Support running `openspec init` on folders verified to be Git repos but lacking OpenSpec.
- `git-worktree`: Support starting new Git worktree branches for active workspace repositories.

### Modified Capabilities

(None)

## Impact

- Modified `server/src/services/repoService.ts` and `server/src/app.ts` to implement business logic and API endpoints.
- Modified `client/src/App.tsx` and `client/src/App.css` to build workspace management UI panels.
