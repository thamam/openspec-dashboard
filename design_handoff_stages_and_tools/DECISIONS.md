# Decision Log — OpenSpec Dashboard "Stages & Tools"

The three-layer model: **Stages** (where you are) · **Tools** (lenses you summon over any stage) · **Plumbing** (rare setup + persistent context). Every decision below serves it. Full prose context is in `README.md`.

**D1 — Stages replaced the "Build / Review" mode toggle.** Group by *what the user is doing* (lifecycle), not by *kind of UI*.

**D2 — Stages are freely navigable; NEVER gate/wizard them.** Ordering is non-linear (grill→propose or propose→grill). Numbered dots hint at the common path only. No locks, no disabled "next."

**D3 — Three natures of action; sort every new one:**
- *Command* (fire once, output elsewhere) → menu / compact button.
- *Session* (you enter and stay) → canvas/dock space.
- *Persistent context* (created once, lives for the change) → shown as status, not an action.

**D4 — Tools are context-aware lenses.** One global cluster (top-right) summonable from any stage; open as a right dock that never takes over. Same tool re-scopes by stage (Grill the *concept* in Propose vs the *spec* in Review); a tool may change state by stage (Audit empty in Propose, full checklist in Review). Every panel shows a context chip (`<tool> · <change> · <stage>`). Backend: tool/LLM calls receive stage + selection context and branch on it.

**D5 — Canvas "views" ≠ dock "tools."** Views *visualize* (fill the canvas, toggled by an in-stage Views bar: DAG now, Diff/Coverage planned). Tools *comment* (dock panels). Keep the two surfaces separate.

**D6 — The "DAG" is the LINKING, not the breakdown.** The 4 columns (Proposal/Specs/Design/Tasks) are always-present breakdown content. The DAG view is the connector *edges* drawn between linked items; toggling it shows/hides the links. Edges re-layout on resize, dock open/close, font load. Carry over hover-to-trace path highlighting.

**D7 — Rare run-once commands live in the `⋯` menu** ("Setup · run once"): Initialize OpenSpec, Create Worktree. They don't earn canvas space (see D3).

**D8 — A created worktree becomes a persistent badge, not an action.** Create-once command (D7) whose result is durable context; show `⎇ worktrees/<branch>` near the change title. New change → its own worktree. Never keep a "Create Worktree" card after creation.

**D9 — Appearance (Soft/Mono/Vivid × light/dark) lives in the `⋯` menu.** It's chrome, not workflow.

## DO / DON'T
- DO sort new actions by D3 and place accordingly.
- DO pass stage/selection context to tools and branch behavior (D4).
- DO keep the breakdown always-on; treat the DAG as a toggleable edge overlay (D6).
- DON'T gate/lock/wizard the stages (D2).
- DON'T put run-once commands on the canvas (D3, D7).
- DON'T leave a worktree as an action once created (D8).
- DON'T mix canvas views into the global tool cluster (D5).
