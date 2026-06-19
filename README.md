# OpenSpec Dashboard

A premium, responsive developer interface designed to manage, brainstorm, and verify your workspace changes using the **Stages & Tools** ("Anti-Gravity") architecture.

---

## Architecture Overview

The interface implements a three-layer model:

1. **Stages (Lifecycle Spine)**:
   - **Propose Stage**: Select AI generation engines (Gemini, Claude Code, Cursor, Codex), preview raw shell commands, and execute proposal generations.
   - **Review Stage**: Inspect the generated Spec-driven Linkage DAG. Navigate through Proposals, Specs, Designs, and Tasks.
2. **Tools (Context-Aware Docks)**:
   - Right-side panels slide in to mount contextual helpers:
     - **⚡ Grill Me**: A brainstorming wizard to pressure-test concepts/decisions before code is generated.
     - **🔍 Traceability Audit**: Run-time verification listing orphans, unlinked decisions, and task progress.
     - **💬 Ask AI**: Rescoped messaging thread aware of the active stage, selected nodes, and active schema.
3. **Plumbing (Setup Menu)**:
   - Accessed via the `⋯` icon in the header. Contains setup/run-once tasks:
     - **Initialize OpenSpec** in the connected repository.
     - **Create Git Worktree** using an automated destination path.
     - **Switch Repository** paths.
     - **Appearance settings**: Toggle themes (`Soft`, `Mono`, `Vivid`) and color modes (`Light`, `Dark`).

---

## Directory Structure

```
├── client/                     # React + Vite frontend
│   ├── src/                    # App code & components (DagViewer, BrainstormWizard, etc.)
│   └── tests/                  # Frontend unit tests (Vitest)
├── server/                     # Express.js backend
│   ├── src/                    # API routes, DAG services, and repo utilities
│   └── tests/                  # Backend unit and integration tests (Vitest)
├── e2e/                        # Playwright E2E integration test suite
└── package.json                # Monorepo workspaces configuration
```

---

## Getting Started

### Prerequisites

Ensure you have Node.js (version 18 or higher) installed.

### Installation

Install workspace dependencies from the root directory:

```bash
npm install
```

### Running the App Locally

Start both the client and server development servers concurrently:

```bash
npm run dev
```

- **Frontend**: Available at [http://localhost:5183](http://localhost:5183)
- **Backend API**: Running on port `3001`

---

## Testing

### Run All Unit Tests

Executes frontend and backend unit test suites in parallel:

```bash
npm run test
```

- Run only **Frontend** tests: `npm run test -w client`
- Run only **Backend** tests: `npm run test -w server`

### Run E2E Integration Tests

Runs Playwright E2E browser tests (Chromium headless) against the redesigned Stages & Tools flow:

```bash
npm run test:e2e
```
