## Context

We are starting a new project, `openspec-dashboard`, from scratch. There is no codebase yet. We need a "Walking Skeleton" to establish the core tech stack, monorepo structure, API protocols, and testing setup.

## Goals / Non-Goals

**Goals:**
- Set up an NPM workspaces monorepo containing `client` (React + Vite) and `server` (Express).
- Establish backend endpoints to check folder existence and git/openspec status.
- Build a polished light-themed dashboard UI that talks to the backend.
- Configure TDD-ready unit tests (Vitest) and E2E tests (Playwright).

**Non-Goals:**
- Implementing advanced UI features (worktree branching, interactive propose modes, linking operations). These will be implemented in subsequent changes.
- Distributing or packaging the application (e.g., via Electron or Docker) in this phase.

## Decisions

### Decision 1: Monorepo Structure with NPM Workspaces
We will use NPM workspaces to manage the frontend (`client`) and backend (`server`) packages within a single git repository.
* **Alternative considered:** Separate repositories.
* **Rationale:** A monorepo keeps client/server code in sync, simplifies configuration of E2E tests (which require both to run), and allows a single root-level `package.json` to manage development scripts.

### Decision 2: Backend File Access and Check Logic
The Express backend will use native Node.js `fs` (file system) APIs to verify:
1. Directory existence (`fs.existsSync(path)` and checking if it's a directory).
2. Git initialization (checking if `path/.git` exists).
3. OpenSpec initialization (checking if `path/openspec/config.yaml` exists).
* **Alternative considered:** Executing CLI commands (`git status` or `openspec status`).
* **Rationale:** Direct filesystem checks are much faster, more robust, do not depend on system binary paths, and are easier to stub/mock in unit tests.

### Decision 3: Vitest for Unit Testing and Playwright for E2E Testing
* **Alternative considered:** Jest + Cypress.
* **Rationale:** Vitest integrates seamlessly with Vite (used for the client) and runs extremely fast. Playwright is highly reliable, supports multiple browsers natively, and allows headless verification in macOS environments.

## Risks / Trade-offs

- **Risk**: Arbitrary filesystem access from the local server.
  - *Mitigation*: For this developer tool, the server runs locally on the user's machine. We will sanitize input paths and check that they are valid absolute paths.
