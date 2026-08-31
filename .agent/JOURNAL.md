# OpenSpec Dashboard Development Journal & Walk of Pain Ledger

This journal maintains a continuous, unbroken record of development cycles, human friction reports, RICE prioritization evaluations, and architectural decisions across AI sessions and tools.

---

## Active State
- **Current Focus:** Agent Interaction & Capabilities Audit + Knowledge Persistence Setup
- **Active Pain Point:** None (Session context & memory persistence established)
- **Latest Milestone:** 10 Iterations of Agent Harness Enhancements + 4-Tier Knowledge Vault Setup
- **Test Status:** 57/57 unit tests passing across server and client

---

## Development Cycles & Decision History

### [Cycle #011] - 2026-07-23 - Knowledge Persistence & Walk of Pain Architecture
- **Objective:** Persist thread context, research artifacts, and "Walk of Pain" prioritization rules into version control for cross-agent session continuity.
- **Architectural Analysis:** Evaluated 4 storage paradigms with sub-agents (`Architecture_Strategist` and `Workflow_UX_Specialist`). Selected Tiered Hybrid System applying the Zoom Level Framework to meta-documentation.
- **Key Changes:**
  - Migrated 6 master research artifacts from temporary session brain paths into `.agent/knowledge/`.
  - Updated `.agent/rules/pain-driven-prioritization.md` to use relative repository URIs.
  - Created micro JSON indexes (`.agent/context-skyline.json`, `.agent/pain-bank.json`, `.agent/ux-catalog.json`) for instant <200-token agent boot loading.
  - Updated `AGENTS.md` and `CLAUDE.md` to mandate session start context loading and session end logging.

### [Cycle #010] - 2026-07-23 - Agent Interaction & Capability Audit (10 Iterations)
- **Human Pain Point / Friction:** Agent harness UI felt lagging; socket failures hid behind quiet typing states; lack of direct workflow triggers in UI.
- **Matched UX Idea:** Idea 14 (Real-Time Spec-Code Drift Radar & Agent Socket Harness).
- **Key Changes Across 10 Iterations:**
  - *Iteration 1:* Cleaned stale compiled `.js` files and fixed expected test metadata in `server/tests/repoService.test.ts`.
  - *Iteration 2:* Standardized agent tmux session naming (`agent-${changeName}` / `agent-task-${timestamp}`).
  - *Iteration 3:* Added 45s socket timeout safeguards and explicit `chat_reply_error` / `autofix_error` event emitters.
  - *Iteration 4:* Implemented `executeWorkflow` in `LocalAgentWrapper` and added `socket.on('execute_workflow')` for `/opsx-propose`, `/opsx-continue`, `/opsx-sync`, `/opsx-verify`, `/opsx-archive`.
  - *Iteration 5:* Connected process stdout streaming to `AgentHarness.tsx`.
  - *Iteration 6:* Added 300ms file change debouncing in `AgentService.ts` watcher and multi-fallback JSON parsing in `LocalAgentWrapper.ts`.
  - *Iteration 7:* Enriched chat prompts with active change artifact presence (`proposal.md`, `tasks.md`, `specs.md`, `linkages.json`) and provider info.
  - *Iteration 8:* Added Quick Action buttons (`▶ Continue`, `🔄 Sync`, `✓ Verify`) and slash command auto-triggering in `AgentHarness.tsx`.
  - *Iteration 9:* Updated `AgentHarness.css` with quick action styles, error state banners, and status badges.
  - *Iteration 10:* Added `server/tests/agentService.test.ts` verifying 57/57 unit tests pass.

### [Cycle #012] - 2026-08-31 - Client Data-Flow Hardening (C1-C4)
- **Objective:** Close the client-side data-flow HIGHs without visual/UX change (per Zoom Level framework — behavior-preserving fixes only).
- **Key Changes:**
  - `App.tsx` `loadArtifacts`: monotonic request-id guard discards stale responses; in-flight flag makes the 2s poll skip overlapping ticks; failed loads (non-ok or missing `artifacts`) now clear artifacts/tasks/files instead of leaving the previous workspace's data on screen.
  - `App.tsx` workspace switch: `repoPath` change resets `activeChange` to `main` and clears artifact state before reloading; `loadChanges` selects the first change via functional `setActiveChange` (no stale closure) and validates `res.ok` + `Array.isArray` before `setChanges`.
  - `RawView.tsx`: feedback posts to relative `/api/send-message` (was hardcoded `http://localhost:3011`).
  - `KeystoneView.tsx`: manifest fetch parses the body first, preserves the server's `{error}` message on non-ok responses, and handles unparseable bodies.
  - Review follow-ups folded in: StrictMode-safe workspace reset (prevRepoPath ref comparison, not a boolean flag — a boolean wipes `?change=` deep links on StrictMode's second mount-effect run), `?change=` read at mount instead of module import, workspace switch also clears `changes`/`agentProvider`, 30s `AbortSignal.timeout` so a hung fetch can't wedge the poll, request-id bumped before the `'main'` early return so leaving a change invalidates its in-flight fetch.
  - 6 new vitest regression tests (stale-response discard, poll skip, workspace-switch reset, error-body no-crash x2 guard branches, StrictMode deep-link preservation, relative URL), all verified red against the pre-fix code first.

### [Cycle #013] - 2026-08-31 - Dead UI Controls & Keystone Pin Preservation (C5-C6)
- **Human Pain Point / Friction:** User-facing buttons that do nothing erode trust in the review surface; creating a change from a Deck-pinned tab silently discarded the pinned context and drift badge.
- **Matched UX Idea:** Exception-based review — the UI must never present affordances without a backing capability; Zoom Level framework continuity across navigation.
- **Key Changes:**
  - `TaskHub/index.tsx`: removed "Claim Task (Agent)"/"Claim Task (Human)" — no onClick and no reachable backing capability (`AgentProvider.executeTask` is defined on providers but never invoked from any route or socket event). Orphaned `.task-action` CSS removed from `App.css`.
  - `WizardView.tsx`: removed "Reject (Needs Changes)" — no onClick, no reject endpoint, no callback prop; Back / Accept & Continue step navigation unchanged.
  - `SkylineCard.tsx`: removed "5-Sec Quick Approve" — `alert()` placeholder with no approval capability. A real approve marker (persisted review state) remains a candidate follow-up.
  - `App.tsx`: create-change success now merges into existing query params via exported `buildPostCreateSearch` instead of replacing the search string — `?project=`/`?sha=` Keystone pin params survive the reload, so the pinned Deck context and drift badge persist after creating a change.
  - 12 new vitest regression tests (TaskHub x4, WizardView x3, SkylineCard x1, post-create search builder x4), verified red pre-fix where observable (jsdom cannot intercept `location.search` assignment, so C6 red was the missing helper seam — noted in PR).

### [Cycle #014] - 2026-08-31 - Terminal Pipeline Performance (C7-C8)
- **Objective:** Bound the terminal data pipeline's hidden costs without any visual/behavior change (per Zoom Level framework — behavior-preserving fixes only).
- **Key Changes:**
  - `App.tsx` `terminalLines` is now capped at 2000 lines (`client/src/terminal/lineBuffer.ts`). The array only feeds agent-session detection since TerminalPane became a live PTY (xterm owns the real 10k-line scrollback); unbounded growth was a redundant slow memory leak plus a re-render per chunk. All append sites route through `appendTerminalLines`/`capTerminalLines`, including `captureTmuxPane`'s marker-splice rebuild.
  - The agent-session regex scan (duplicated verbatim in `TerminalPane/index.tsx` and `App.tsx`) is extracted into `client/src/terminal/sessionDetect.ts` as a single `detectActiveSession` helper, byte-identical semantics to the legacy inline loops (incl. the same-line exit-marker edge). An incremental `SessionDetector` class was implemented first, then removed in review: its reset heuristic couldn't see prefix rewrites, and with the cap a full scan is bounded O(2000) over an array that only changes on user commands — incrementality had no payoff left. Both call sites use the batch helper.
  - 17 new vitest tests (cap keeps newest N, session-start/exit/multiple-session detection, legacy-oracle equivalence matrix).
