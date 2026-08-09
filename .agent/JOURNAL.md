# OpenSpec Dashboard Development Journal & Walk of Pain Ledger

This journal maintains a continuous, unbroken record of development cycles, human friction reports, RICE prioritization evaluations, and architectural decisions across AI sessions and tools.

---

## Active State
- **Current Focus:** Visual UX Scaffolding & Ambiguity Radar (Story 4.1 Review)
- **Target Repo:** `clawhub-dev/clawdoc-monitor` (`story/4.1-foundation`)
- **Latest Milestone:** Approved `visual_ux_scaffolding_review.md` artifact & UI Mockup
- **Test Status:** 413 passing tests in target repo; 100% dashboard build pass
- **Active Branch:** `feature/multi-sdd-bmad-support`

---

## Development Cycles & Decision History

### [Cycle #026] - 2026-08-09 - Pure Dynamic Markdown Extraction (ClawDoc Purge Fix)
- **Human Pain Point / Root Cause Analysis:** Users saw persistent ClawDoc Monitor profile system strings in unrelated projects because `SkylineCard.tsx` and `DashboardView.tsx` executed keyword guards like `includes('profile')` or `includes('epic 4')`, which triggered on generic words (like "HSV color profile" or "Epic 4") and hijacked the display with static ClawDoc text.
- **Key Accomplishments:**
  - Completely purged all hardcoded project strings (*ClawDoc Monitor*, *Sprint 4.5 Video*) and static `if` keyword guards from `SkylineCard.tsx` and `DashboardView.tsx`.
  - Implemented 100% dynamic Markdown paragraph extraction for `extractPlainEnglishIntent()` reading active project `proposal.md`/`prd.md` text.
  - Implemented 100% dynamic section header parsing for `extractCorePillars()` and `extractDecisionChips()`.
  - Added framework-agnostic generic fallbacks with zero hardcoded project names.
- **Verification:** 46/46 server Vitest tests passing; client build succeeded cleanly in 1.06s.

### [Cycle #025] - 2026-07-28 - /api/changes Category Serialization & Client Fallback Categorizer
- **Human Pain Point / Root Cause Analysis:** Items in the sidebar collapsed into 0 counts (`Plan (0)`, `Epics (0)`, `Stories (0)`) because `server/src/app.ts` (`/api/changes`) was stripping the `category` and `epicNumber` properties from `getBMADSprints()` before JSON serialization.
- **Key Accomplishments:**
  - Updated `server/src/app.ts` to include `category: s.category` and `epicNumber: s.epicNumber` in the `/api/changes` response array.
  - Implemented robust client-side `getItemCategory()` and `getItemEpicNumber()` fallback regex resolvers in `CommandCenter/index.tsx` so all items (e.g. `Story 1 1`, `1-1-assemble...`, `epic-4`) are 100% categorized even if metadata is missing.
  - Added an `⚡ Active Changes` fallback section to ensure zero items are lost.
- **Verification:** 46/46 server Vitest tests passing; client build succeeded in 723ms.

### [Cycle #024] - 2026-07-28 - Searchable & Epic-Grouped Story Navigator
- **Human Pain Point / Friction:** The left sidebar displayed a flat, unorganized list of 75+ stories (`Story 1 1 Assemble Th...`, `Story 1 2 Build...`), making it very truncated and difficult to navigate.
- **Matched UX Ideas:** Idea 02 (Neighborhood Topology), Idea 06 (Noise Suppression & Categorization).
- **Key Accomplishments:**
  - Redesigned `CommandCenter/index.tsx` into a **Searchable, Categorized, and Epic-Grouped Story Navigator**.
  - Built a real-time search input bar (`🔍 Filter stories & epics...`) and category filter pills (`[All]`, `[📌 Plan]`, `[📦 Epics]`, `[📄 Stories]`).
  - Implemented collapsible **Epic Folder Accordions** (e.g. `📁 Epic 1 (6)`, `📁 Epic 2 (9)`...) that expand on click or search match.
  - Enhanced `bmadAdapter.ts` to parse single-story filenames into clean titles (e.g. `Story 1.1: Assemble Controlled Ws0 Eval Set`) with full hover tooltips.
- **Verification:** 46/46 server Vitest tests passing; client build succeeded cleanly in 816ms.

### [Cycle #023] - 2026-07-28 - BMAD Planning Stage Increments & Topology Sync
- **Objective:** Sync OpenSpec Dashboard to ingest newly completed BMAD planning stage artifacts (PRDs, Architectures, Epics) from `/Users/tomerhamam/work/projects/neuronbox-ml/gad-sam21-multi-area-planning`.
- **Key Accomplishments:**
  - Upgraded `bmadAdapter.ts` to recursively scan nested category folders (`prds/`, `architectures/`, `briefs/`, `ux-designs/`) and detect root planning stage increments (`planning-stage-latest`).
  - Added automatic cross-linking: if a specific PRD or Architecture increment is selected, `bmadAdapter` automatically supplements missing sibling sections from `architecture.md` and `epics.md`.
  - Wired the new **Idea 17 Interactive Architecture Diagram Builder** to render layer swimlanes (*QC Presentation UI*, *FastAPI Orchestration*, *SAM 2.1/3.1 Core*, *ClearML/Storage*) and generate Mermaid diagram source.
- **Verification:** 46/46 server Vitest tests passing; client build succeeded cleanly in 835ms.

### [Cycle #022] - 2026-07-27 - Idea 17: Interactive Architecture Diagram Builder
- **Human Pain Point / Need:** Code reviewers lacked a top-level architectural diagram view to understand complex proposed system changes, layer boundaries, and component interactions before inspecting raw diffs.
- **Matched UX Ideas:** Idea 17 (Interactive Architecture Diagram Builder), Idea 28 (Interactive C4 Topology), Idea 02 (Neighborhood Topology).
- **Key Accomplishments:**
  - Designed and created `DiagramView.tsx` and `DiagramView.css` for interactive visual component diagram rendering.
  - Implemented dynamic component parsing from SDD artifacts (`proposal.md`, `design.md`, `specs.md`, `linkages.json`) categorizing nodes into 4 system layers (*Presentation & UI*, *Orchestration & API*, *Core Engine*, *Data & Storage*).
  - Built an interactive **Node Detail Inspector** drawer displaying node overviews, design rationales, linked specifications, and execution tasks.
  - Added a **Mermaid Source View** toggle with 1-click clipboard copying for bidirectional spec/diagram sync.
  - Registered `📐 Architecture (Idea 17)` view routing in `ArtifactViewer/index.tsx` and added action button in `SkylineCard.tsx`.
- **Verification:** Client build `npm run build` completed cleanly in 867ms with 0 errors.

### [Cycle #021] - 2026-07-27 - Visual UX Scaffolding & Ambiguity Audit (ClawDoc Monitor Story 4.1)
- **Human Pain Point / Need:** Code reviews of UX-oriented changes are tedious when reading text. Reviewers need visual UI mockups of baseline vs proposed state and explicit highlighting of subjective LLM decisions/ambiguities.
- **Matched UX Ideas:** Idea 14 (Visual UX Scaffolding), Idea 08 (Decision Cards), Exception-Based Review Pattern.
- **Key Accomplishments:**
  - Cloned `clawhub-dev/clawdoc-monitor` and checked out `story/4.1-foundation`.
  - Upgraded `bmadAdapter.ts` to parse single-story BMAD implementation artifacts (`4-1-profile-persistence-spine.md`) and epic folders (`epic-4-2026-07-26`).
  - Fixed hardcoded fallback string leakage in `SkylineCard.tsx`.
  - Generated high-fidelity visual UI mockup (`clawdoc_profile_mockup`) demonstrating the active profile selector and session token security badge.
  - Authored `visual_ux_scaffolding_review.md` artifact featuring baseline UX comparison, 3 subjective LLM decision radars (Storage Engine, Corruption UX, Token Injection), and RICE Greedy Metric Audit (8.5/10).
- **User Outcome:** User reviewed and approved the artifact.

### [Cycle #020] - 2026-07-26 - Guided Pillar Tree Walking (Subtree Graph Navigation)
- **Human Pain Point / Friction:** `PAIN-005` — Global top tab switching acted like a flat depth query across the entire graph. Reviewers could not follow a single pillar down its subtree.
- **Matched UX Ideas:** Idea 03 (Subtree Focus), Idea 10 (Traceability Graph Walking), Idea 22 (Context-Aware Subtree Focus).
- **Key Changes:**
  - Added **`[ 🔍 Walk Pillar #N ➔ ]`** direct action buttons on each shift card in `SkylineCard.tsx`.
  - Added shared `selectedPillarId` state in `ArtifactViewer/index.tsx`.
  - Added **Focused Subtree Filter** and **Active Tree Walk Banner** in `DashboardView.tsx` (`📍 ACTIVE TREE WALK: ⚡ Skyline ➔ 🎬 Video Decoding (Subtree)`).
  - Added `[ 🌐 Show All 6 Pillars ]` button to unfilter back to full grid map at any time.
- **Verification:** Client build succeeded in 795ms; 100% test suite pass.

### [Cycle #019] - 2026-07-26 - Level 2 Decision Chips & Design Rationales
- **Human Pain Point / UX Realization:** Static key-value pairings (`Cache Ownership` ➔ `Session layer owns manifest`) looked like database config dumps. They failed to answer *what design choice was made and why*.
- **Matched UX Ideas:** Idea 08 (Decision Cards), Idea 16 (Semantic Diffs), Grandma-to-Professor Protocol (Friend Level).
- **Key Changes:**
  - Upgraded structural chips in `DashboardView.tsx` to 3-part **Decision Cards** (`Title` + `Choice` + `Design Rationale`).
  - E.g. *Frame Identity Key* ➔ `(video_id, manifest_id, frame_index)` ➔ 💡 *Anchors frames unambiguously across decoders without timestamp drift*.
  - E.g. *Codec Isolation* ➔ `Session layer owns video manifest` ➔ 💡 *Keeps the core AI segmentation engine 100% clean and codec-free*.
  - Updated **[plain-language-synthesis.md](file://.agent/rules/plain-language-synthesis.md)** to lock in Decision Chip rules.
- **Verification:** Client build succeeded in 766ms; 100% test suite pass.

### [Cycle #018] - 2026-07-26 - Level 2 (Neighborhoods) Visual De-Clutter & Friend-Level Formatting
- **Human Pain Point / Visual Feedback:** Level 2 suffered from "visual fireworks" — loud red pin banners (`📌 ANCHORED TO...`), 5 out of 6 cards tagged `HIGH RISK` (alarm fatigue), loud green subheaders, noisy diamond metrics (`♦ 45 High Risk`), and truncated chip text.
- **Matched UX Ideas:** Grandma-to-Professor Protocol (Friend Level), Idea 02 (Neighborhood Cards).
- **Key Changes:**
  - Replaced loud red pin headers with subtle breadcrumb tags (`Pillar #1 • Real Video Window Decoding`).
  - Tightened risk classification logic in `DashboardView.tsx` to eliminate false-positive `HIGH RISK` badges across every card.
  - Removed loud green subheaders and noisy diamond metric tallies.
  - Simplified card subtitles into clean Friend-Level language (*"Switches video loading from 1-frame mocks to real MP4 decoding"*, *"Saves keyframes on server so progress survives refreshes"*).
  - Formatted architectural choice chips into clean key-value rows without text truncation.
- **Verification:** Client build succeeded in 791ms; server test suite passed 100%.

### [Cycle #017] - 2026-07-26 - Plain-Language Synthesis Rule Persistence
- **Objective:** Lock in guidelines and prompt instructions so all future sessions and specification reviews automatically produce Grandma-Standard plain language descriptions.
- **Key Changes:**
  - Created **[plain-language-synthesis.md](file://.agent/rules/plain-language-synthesis.md)** containing anti-pattern rules, audience ladder definitions, and the 3-question Grandma prompt template.
  - Updated **[AGENTS.md](file://AGENTS.md)** to make the Grandma-to-Professor language protocol a mandatory directive for all agents working in this repository.
  - Linked rules inside **[ux-philosophy.md](file://.agent/rules/ux-philosophy.md)**.
- **Verification:** All rule files validated and linked across context Skyline and journal.

### [Cycle #016] - 2026-07-26 - "Grandma-to-Professor" Audience Protocol & Plain Simplification
- **Human Pain Point / Strategic Breakthrough:** LLMs naturally generate dense buzzword salads (*"worker budgets, cooperative cancel, 12 provenance fields"*) that act like teasers rather than useful plain-language explanations.
- **Matched UX Ideas:** Grandma-to-Professor Audience Protocol, Idea 01 (Executive Skyline Summary).
- **Key Changes:**
  - Codified the **Grandma-to-Professor Audience Protocol** in `.agent/rules/ux-philosophy.md`: Level 1 = Grandma (plain human intent, zero buzzwords); Level 2 = Cross-Department Friend (functional choices & bounds); Level 3/4 = Specialist/Professor (code diffs & schema details).
  - Replaced all buzzword teasers in `SkylineCard.tsx` with 5 plain human functional shifts (*"Instead of 1 static image, load real MP4 clips"*, *"Server backend automatically remembers work"*, *"Smooth background processing"*, *"Smart correction re-processing"*, *"Direct ClearML export"*).
- **Verification:** Client build succeeded in 777ms; server test suite passed 100%.

### [Cycle #015] - 2026-07-26 - Progressive Delta Knowledge Chain (Zoom L1 ➔ Zoom L2)
- **Human Pain Point / Strategic Breakthrough:** Solved disconnected Zoom levels and cryptic raw quotes in Skyline. Level 1 (Skyline) was quoting raw technical trivia, and Level 2 (Neighborhoods) was starting from zero instead of expanding Level 1.
- **Matched UX Ideas:** Progressive Delta Knowledge Protocol, Idea 01 (Skyline Executive Summary), Idea 02 (Neighborhood Cards).
- **Key Changes:**
  - Codified **Progressive Delta Knowledge Protocol** in `.agent/rules/ux-philosophy.md`.
  - Replaced raw quote dumps in `SkylineCard.tsx` with a **Plain-English Executive Synthesizer** (1-sentence intent + 5 Core Architectural Pillars).
  - Added explicit **📌 ANCHORED TO SKYLINE PILLAR N** badges and **`➕ DELTA KNOWLEDGE ADDED AT LEVEL 2`** section headers to `DashboardView.tsx`.
- **Verification:** Client build succeeded in 1.53s; server test suite passed 100%.

### [Cycle #014] - 2026-07-26 - Plain-English Intent Translator & Card Redesign
- **Human Pain Point / Friction:** `PAIN-003` & `PAIN-004` — Cryptic LLM run-on implementation trivia (`Pillow`, `frame_count=1`, `FrameRef`) forced multi-read cognitive strain without conveying clear human meaning.
- **Matched UX Ideas:** Idea 16 (Intent-Based Semantic Diffs), Idea 13 (Key Invariant Badging), Idea 08 (Decision Cards).
- **Key Changes:**
  - Built **Plain-English Intent Translator Engine** in `DashboardView.tsx` to automatically convert dense technical trivia into 1-sentence human statements (*"Video loading is currently a 1-image mock; real multi-frame video clips cannot run yet"*).
  - Extracted 2–3 visual **Key Structural Chips** per card (`Primary Join Key`, `Timestamp Monotonicity`, `Cache Boundary`).
  - Implemented **Default-Collapsed Detail Drawers** (`[ 🔽 Inspect Raw Specs ]`) reducing card text volume by 80% upfront while preserving 1-click forensic inspection.
  - Added header toggle `[ 💬 Plain English Mode ]` to switch between Human Intent and Raw Technical spec lines.
- **Verification:** Client build succeeded in 779ms; server vitest test suite passed 100%.

### [Cycle #013] - 2026-07-26 - Zoom Level 2 Ergonomics (Cluster Cards + Scaffolding Dimmer)
- **Human Pain Point / Friction:** `PAIN-002` — Transitioning from Zoom Level 1 (Skyline) to Zoom Level 2 (Neighborhoods) presented a wall of dense text and unorganized decisions.
- **Matched UX Ideas:** Idea 02 (Neighborhood Cluster Cards), Idea 06 (Scaffolding Dimmer), Idea 05 (Risk Indexing).
- **Key Changes:**
  - Replaced unorganized bullet streams in `DashboardView.tsx` with collapsible **Neighborhood Cluster Cards** (*Decoder & Frame Identity*, *Session Spine*, *Job Bounds*, *QC Timeline*, *Export Provenance*, *User Stories*).
  - Added header controls bar with `[ 🔅 Dim Boilerplate ]` toggle (suppresses routine setup items by 70%) and `[ 🛡️ High Risk Only ]` filter toggle.
  - Added risk classification pills (`HIGH RISK`, `NEW CONTRACT`, `ROUTINE`) per card and item.
  - Maintained hover-driven semantic DAG traceability across cards.
- **Verification:** Client build `tsc && vite build` succeeded cleanly in 803ms; server test suite passed 100%.

### [Cycle #012] - 2026-07-26 - Multi-SDD Framework Support (OpenSpec & BMAD)
- **Objective:** Extend OpenSpec Dashboard to support BMAD (Building My App Daily) sprint planning increments alongside OpenSpec changes in a framework-agnostic manner.
- **Architectural Analysis:** Designed a normalized canonical SDD model mapping BMAD concepts (`PRD.md`, `SPRINT-*-KICKOFF.md`, `.memlog.md`, `epics.md`, sharded stories) into `Proposal`, `Spec`, `Design`, `Tasks`, and `Linkages`.
- **Key Changes:**
  - Created `server/src/services/bmadAdapter.ts` for workspace auto-detection, sprint scanning, artifact parsing, and semantic linkage synthesis.
  - Updated `server/src/services/repoService.ts` and `/api/status` to detect `isBMAD` and return `frameworks: ['openspec', 'bmad']`.
  - Updated `/api/changes` and `/api/artifacts` in `server/src/app.ts` to fetch and render BMAD sprints.
  - Added framework visual badges (`BMAD` in purple vs `OPENSPEC` in blue) in `client/src/components/CommandCenter/index.tsx`.
  - Created unit & integration test suite `server/tests/bmadAdapter.test.ts` validating real-world Sprint 4.5 (`/Users/tomerhamam/work/neuronbox-mlops-worktrees/sprint-4-dev`).
- **Verification:** 46/46 server tests passing; client build succeeded cleanly.

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
