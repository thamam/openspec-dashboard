## Context

We need to trigger shell operations from our Express server. The two operations are:
1. `openspec init --tools none [path]` (to initialize OpenSpec).
2. `git worktree add -b [branch] [dest]` (to check out a new branch to a worktree folder).

## Goals / Non-Goals

**Goals:**
- Provide secure API endpoints `POST /api/init` and `POST /api/worktree` executing system shell commands.
- Validate inputs (branch name syntax, absolute path formats) to avoid command injection risks.
- Provide a clear UI state transition (success, error, progress) in the dashboard client.

**Non-Goals:**
- Supporting interactive `openspec init` configurations.
- Listing/pruning/deleting existing git worktrees. This is left for future updates.

## Decisions

### Decision 1: child_process.exec with validation
We will wrap Node's `child_process.exec` in a promise.
* **Alternative considered:** Using a shell library like `zx` or `shelljs`.
* **Rationale:** Direct usage of `child_process.exec` is lightweight and doesn't require adding new npm dependencies.

### Decision 2: Sanitization and Regex validations
Before calling `child_process.exec`, we will enforce:
1. Git branch name validation: Must match `^[a-zA-Z0-9._/-]+$`.
2. Paths: Must be validated as absolute directory formats.
* **Alternative considered:** Raw command execution.
* **Rationale:** Command injection is a critical risk when executing arbitrary string commands via shell.

## Risks / Trade-offs

- **Risk**: Branch name collisions or existing worktree directory.
  - *Mitigation*: The backend will capture stdout/stderr from the git/openspec commands and return the exact error message (e.g. "branch already exists" or "worktree already exists") to display gracefully in the UI.
