# Handoff: OpenSpec Dashboard — "Stages & Tools" Architecture

## Overview
This package hands off a **redesigned information architecture** for the OpenSpec Dashboard — a desktop app for managing spec-driven development changes inside a local git repo. A change moves through a lifecycle (propose → review), and the user runs AI-assisted analysis against it.

The redesign is the result of a long working session. **The single most important thing to preserve is not the pixels — it is the reasoning in the "Architecture & Decision Log" below.** Implement to the decisions, not just the screenshots. If a future tradeoff conflicts with a decision here, re-read its rationale before overriding it.

There are two reference artifacts in this bundle:
- **`Stages and Tools.dc.html`** — the agreed new architecture (the target). Start here.
- **`OpenSpec Dashboard.dc.html`** — the *previous* full-feature build. It is NOT the target architecture, but it contains fully-built detail flows (repo connect, New Change modal, two-phase Brainstorm, auditor chat) that the new architecture reuses. Mine it for those flows' content and behavior.

## About the Design Files
The bundled `.dc.html` files are **design references built in HTML** — interactive prototypes showing intended look and behavior, not production code to ship. They render via a small runtime (`support.js`, included). Open them in a browser to interact, and **read the source as the precise behavioral spec** (the template is the markup; the `class Component` block is the logic).

Your task is to **recreate these designs in the product's real stack** (the backend + frontend AntiGravity is building), using that codebase's established components, state patterns, and styling system. Do not copy the HTML or the runtime. Where the product already has primitives (buttons, menus, panels), use them — match the *spec values* (tokens, behavior) below, not the literal markup.

## Fidelity
**High-fidelity.** Colors, typography, spacing, layout, transitions, and interaction behavior are all final and intentional. Recreate them faithfully. The exact token values are in `DESIGN_TOKENS` below and in `tokens.json`.

---

## Architecture & Decision Log (READ FIRST)

The design rests on a **three-layer model**. Everything else follows from it.

| Layer | What it is | Where it lives | Examples |
|---|---|---|---|
| **1. Stages** | The lifecycle a change moves through — *where you are* | A tab "spine" under the header | Propose, Review |
| **2. Tools** | Context-aware lenses you *summon over* whatever stage you're in | Global cluster (top-right header) → opens a right-side dock panel | Grill Me, Audit, Ask AI |
| **3. Plumbing** | Rare setup commands + persistent context | `⋯` menu, and a persistent badge | Initialize, Create Worktree, Appearance |

### Decisions and rationale

**D1 — Stages replaced the old "Build / Review" mode toggle.**
The old toggle grouped UI by *kind* (a form vs. a graph). Stages group by *what the user is doing* (where the change is in its life). This makes the app legible left-to-right.

**D2 — Stages are freely navigable. NEVER gate or wizard them.**
Ordering is genuinely non-linear: sometimes you propose a rough spec then grill it; sometimes you grill first, then propose. **Do not** build a stepper, lock stages, or disable "next" until "previous" is complete. The numbered dots (1, 2) hint at the *common* path only — they are not a sequence the user must obey. All stages are always clickable.

**D3 — Actions fall into three distinct natures; sort every new action into one.**
- **Command** — fire once, then done; output lands elsewhere (a toast, the DAG). → menu or a compact action button. (Initialize, Create Worktree, Propose-the-run.)
- **Session** — you *enter* it and stay; interactive and continuous. → deserves canvas/dock space. (Grill Me, the Auditor.)
- **Persistent context** — created once, then lives for the whole change. → shown as *status*, not an action. (The git worktree.)
This taxonomy is the rule for placing anything new in the UI.

**D4 — Tools are context-aware lenses, not stages and not one-shot buttons.**
Grill Me, Audit, and Ask AI sit in ONE global cluster (top-right) and can be summoned from ANY stage. They open as a **right-dock panel that never takes over** — the stage stays visible beside it, so you grill *while looking at* your proposal/DAG. Only one tool occupies the dock at a time.
- **Same tool re-scopes by stage.** Grill Me from Propose pressure-tests the raw *concept*; from Review it pressure-tests the *generated spec/DAG*.
- **A tool may even change state by stage.** Audit in Propose shows an honest empty state ("no DAG to audit yet"); in Review it shows the traceability checklist.
- **Every tool panel shows a "context chip"** naming the change + stage it is acting on (e.g. `auditing · add-passwordless-auth · Review`). This is required — it's what makes the changing behavior read as intentional, not buggy.
- Backend implication: the same tool endpoint should accept a `stage` (and selection) context and branch its prompt/behavior on it.

**D5 — Two distinct surfaces: canvas "views" vs. dock "tools." Keep them visually and conceptually separate.**
- **Dock tools** (layer 2) *comment on* the work — they're assistants in a side panel.
- **Canvas views** *visualize* the work — they fill the main stage area and are toggled by an in-stage **"Views" bar** (not the global tool cluster). The DAG is the first view; **Diff** and **Coverage** are planned siblings (shown as disabled "soon" slots so the extensibility is visible). Build the Views bar so adding a view is trivial.

**D6 — The "DAG" is the LINKING, not the breakdown.**
The four columns (Proposal · Specs · Design · Tasks) are the change's item **breakdown** — they are *always present* content in Review. The **DAG view** is the set of **connecting lines (edges) drawn between linked items across those columns**. Toggling the DAG view on draws the links; toggling it off leaves the plain breakdown. Do not conflate "show the columns" with "show the DAG" — the DAG *is the edges*.
- Edges are directional Proposal→Specs→Design→Tasks. Render as curved connectors between node edges (right edge of source → left edge of target). The reference computes Bézier paths from measured node positions; reproduce equivalently (links must re-layout on resize, dock open/close, and theme/font load).
- The reference edge set for `add-passwordless-auth`: `p1→s1, p1→s2, p1→s3, s1→d1, s2→d1, s3→d2, d1→t1, d1→t2, d2→t3, s2→t4`. (The original dashboard also implements hover-to-trace highlighting of a node's connected path — carry that behavior over.)

**D7 — Rare setup commands go in the `⋯` menu ("Setup · run once").**
Initialize OpenSpec (once per repo) and Create Worktree (once per change) were big cards; they're now menu items. They don't earn permanent canvas space because you touch them rarely (see D3).

**D8 — A created worktree becomes a persistent BADGE, not an action.**
Creating a worktree is a one-time command (D7), but its *result* is durable context for the change's whole life. Once it exists, show it as a quiet badge near the change title (`⎇ worktrees/<branch>`). When the change ships and a new one begins, that new change gets its own. Do not keep a "Create Worktree" card around after creation.

**D9 — Appearance (theme + dark mode) lives in the `⋯` menu.**
Soft / Mono / Vivid palettes × light / dark mode. It's chrome, not workflow — so it belongs with the plumbing, not on the canvas. (It was previously in the sidebar footer.)

### DO / DON'T quick reference
- **DO** sort every new action into command / session / persistent-context (D3) and place it accordingly.
- **DO** make tools accept and display a stage/selection context, and branch behavior on it (D4).
- **DO** keep the breakdown always-on and treat the DAG as a toggleable edge overlay (D6).
- **DON'T** gate, lock, or wizard the stages (D2).
- **DON'T** put rare run-once commands on the canvas (D3, D7).
- **DON'T** leave a worktree as an action once created — it's status (D8).
- **DON'T** mix canvas views into the global tool cluster, or vice versa (D5).

---

## Screens / Views

### App shell
- **Layout:** full-height flex row. Left **sidebar** (fixed 240px), then **main column** (flex). Main column = header (fixed) → optional concept/hint strip → stage spine (fixed) → body. Body = stage content (flex, scrolls) + optional tool dock (fixed 388px, right).
- **Sidebar (240px):** logo lockup; repo card (green dot + monospace repo path); "CHANGES" list (each row: status dot, monospace change name, status label, `done/total` task count; selected row gets white bg + accent border); "+ New Change" button pinned at bottom.
- **Header:** left = change title (monospace, 16px) + subtitle (`schema · created <date>`, 11.5px dim) + the persistent **worktree badge**; right = **tool cluster** (Grill Me / Audit / Ask AI icon+label buttons), a divider, a `⌘K` pill, and the `⋯` menu button. The left title group must hold a readable min-width and truncate rather than collapse; the right cluster does not shrink; the badge yields space first.

### Stage spine
- A row of stage tabs (Propose · Review), each a numbered dot + label. Active tab: full-opacity text + a 2px accent underline (inset box-shadow). Inactive: faint text. Always clickable (D2).

### Stage: Propose
- **Purpose:** define/generate the change's spec/design/task pipeline; output streams here, then populates the Review DAG.
- **Layout:** a single left-aligned content column (~640px max-width, generous padding). NOT a centered narrow column floating in the middle (that was an explicitly-rejected earlier layout).
- **Components:** title "Propose"; description; an **Engine** select (Gemini / Claude Code / Cursor / Codex); a **Command** preview box (`$ npx openspec propose <change> --engine <engine>`, monospace, live-updating); a primary **Run Propose** button; a hint card pointing to Grill Me.

### Stage: Review
- **Purpose:** inspect the generated change and its traceability.
- **Components:**
  - A **Views bar** at the top: label "Views" + a **DAG** toggle chip (checkbox-style, on by default) + disabled **Diff** / **Coverage** "soon" chips; right-aligned meta chips (`Schema spec-driven`, `2 / 4 tasks complete`).
  - The **canvas**: dotted-grid background card containing the always-present 4-column breakdown (Proposal / Specs / Design / Tasks), with the DAG edge overlay when the DAG view is on (D6).

### Tool dock (Grill Me / Audit / Ask AI)
- 388px right panel, slides in (`translateX(20px)`+fade, ~220ms). Header = tool icon tile + title + close (×); a **context chip** below the title. Body varies by tool & stage (D4): a message thread (Grill Me, Ask AI) or audit results / empty state (Audit). Conversational tools have a composer (input + Send) pinned at the bottom.

### `⋯` menu (plumbing)
- Dropdown, ~210px. Sections: **Setup · run once** (Initialize OpenSpec, Create Worktree…, divider, Switch Repository); **Appearance** (Soft/Mono/Vivid segmented control + a light/dark toggle row).

### Reference-only flows (from `OpenSpec Dashboard.dc.html`)
These were fully built in the previous version and carry into the new architecture largely unchanged — reuse their content/behavior:
- **Repo connection / verify screen** (the gate before any repo is loaded).
- **New Change modal** (name with kebab-case validation, description, engine, Standard vs Custom-states workflow, schema select).
- **Brainstorm / "Grill Me with Docs"** two-phase overlay (phase 1: idea + model config; phase 2: decision-tree interrogation with a "resolve ≥4 topics to unlock Commit & Generate" gate). In the new model, Grill Me is the **dock tool** (layer 2); this overlay is its expanded/standalone session form — reconcile the two as one feature with two surface sizes.

## Interactions & Behavior
- **Stage switch:** swaps stage content; if a tool dock is open, the tool re-scopes (re-renders content + context chip) for the new stage.
- **Tool button:** toggles its dock panel; clicking the active tool closes it; opening another swaps dock contents (dock stays).
- **DAG toggle:** shows/hides the connector edges (links re-measure on toggle, resize, dock open/close, and webfont load).
- **DAG hover (from original):** hovering/clicking a node highlights its connected path and dims the rest.
- **Task checkboxes (from original):** toggle completion; updates the `done/total` counts in sidebar + meta chip live.
- **Theme/mode:** recolors the entire UI (including DAG links and dock) via CSS variables; ~300ms bg/color transition.
- **Transitions:** panel slide ~220ms ease; content fade ~200ms; tab/button state changes ~150ms.

## State Management
Per-session UI state observed in the reference (map to the product's store):
- `stage` (`propose` | `review`)
- `tool` (`null` | `grill` | `audit` | `chat`) — only one open
- `dagOn` (boolean) + future `views` toggles
- `repoMenuOpen` (boolean)
- `theme` (`Soft`|`Mono`|`Vivid`), `mode` (`light`|`dark`)
- selected change id; per-change task completion map
- worktree existence/branch per change (drives badge vs. create-action, D8)
- tool threads/messages per (tool, stage, change); audit results
Backend/data: list of changes (with schema, status, created, proposal/specs/design/tasks nodes + edges); repo verification + OpenSpec-init status; engine/provider+model config; the propose run and the tool/LLM calls (which must receive stage context per D4).

## Design Tokens
Full values in **`tokens.json`** (machine-readable). Summary:
- **Type:** `Outfit` (display/headings, 700–800), `Inter` (body/UI, 400–600), `Fira Code` (identifiers, commands, repo/branch paths). Sizes: stage title 21px; section titles 15–17px; body/UI 12.5–14px; meta 11–12px; uppercase labels 10–11px (letter-spacing .06–.07em).
- **Radii:** cards 14px; controls/inputs/small cards 10px; chips/buttons 7–8px.
- **Shadows:** card `0 1px 3px rgba(15,23,42,.06)`; elevated menu/modal `0 18px 48px rgba(15,23,42,.16)`.
- **Palettes:** three families (Soft / Mono / Vivid), each with a light and dark set, expressed as CSS variables (`--bg, --surface, --s2, --border, --text, --dim, --faint, --accent, --accent-soft, --accent-border, --green/-soft/-text, --amber/-soft/-text, --canvas, --dot`). See `tokens.json`.
- **DAG connectors:** stroke = `--accent`, width 1.6px, opacity ~0.5 (idle); the original elevates width/opacity to ~2.25 / ~0.95 on the hovered path.

## Assets
No raster/vector asset files. The `</>` logo glyph and all icons are text/emoji glyphs (`⚡ 🔍 💬 ⎇ ⋯ ⌘ ☾ ☀`). Replace emoji with the product's real icon set on implementation. Fonts load from Google Fonts (Outfit, Inter, Fira Code) — swap for the codebase's bundled equivalents.

## Files
- `Stages and Tools.dc.html` — **target architecture** (read template = markup, `class Component` = logic).
- `OpenSpec Dashboard.dc.html` — previous full-feature build; source of detail flows (D-references above).
- `support.js` — the runtime that renders the `.dc.html` files (reference only; do not port).
- `tokens.json` — machine-readable design tokens (all palettes + type + radii + shadows).
- `DECISIONS.md` — the decision log (D1–D9) extracted on its own for quick reference.
