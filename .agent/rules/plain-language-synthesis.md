# Plain-Language Spec Synthesis Guide: The "Grandma-to-Professor" Protocol

**Core Directive:** When generating, summarizing, or presenting specification artifacts in OpenSpec Dashboard, agents MUST NOT dump raw LLM implementation trivia, variable names, or run-on buzzword salads. Every summary MUST follow the audience simplification rules.

---

## 1. The Audience Ladder

| Zoom Depth | Target Audience | Primary Question Answered | Language Rule |
| :--- | :--- | :--- | :--- |
| **Zoom Level 1 (Skyline)** | **Grandma / Executive** | *What is changing, why does it matter, and what problem does it solve?* | **ZERO buzzwords, zero variable names.** Plain human language explaining user-facing functional shifts. |
| **Zoom Level 2 (Neighborhoods)** | **Cross-Department Friend** | *What are the key architectural choices, component boundaries, and invariants?* | **Decision Chips (Title + Choice + Design Rationale).** Never render raw static key-value pairings; always explain *what choice was made* and *why*. |
| **Zoom Level 3 (Streets)** | **Teammate / Specialist** | *What are the acceptance criteria, edge cases, and API contracts?* | Concrete functional specs, schemas, and contract rules. |
| **Zoom Level 4 (License Plates)** | **Forensic Auditor / Compiler** | *What exact lines of code or files are modified?* | Code diffs, file trees, and byte-level schema details. |

---

## 2. Anti-Patterns vs Good Synthesis

### ❌ Anti-Pattern 1: Meta-Documentation Quotes
* **Bad:** `Prepared 2026-07-26 via bmad-architecture Update mode. The canonical epic ledger is epics.md...`
* **Why it fails:** Teaches the human about folder structures instead of explaining the feature.
* **Good (Grandma Standard):** `Upgrades the segmentation tool so users can load real multi-minute MP4 video clips, edit keyframes, and save dataset labels directly.`

### ❌ Anti-Pattern 2: Run-On Buzzword Salads
* **Bad:** `Runs heavy decoding in non-blocking background jobs with worker budgets, cooperative cancel, and attempt tracking.`
* **Why it fails:** Packs 6 dense engineering terms into a teaser that requires 3 slow reads.
* **Good (Grandma Standard):** `Heavy video decoding and AI mask generation run in background tasks so the interface stays fast and responsive while working.`

### ❌ Anti-Pattern 3: Arbitrary Numeric Trivia
* **Bad:** `Exports approved video frames with 12 provenance fields from raw video to keyframe propagation.`
* **Why it fails:** Mentions "12 fields" as if 12 were a magic number without explaining the human goal.
* **Good (Grandma Standard):** `Saves approved video frames directly to ClearML cloud storage so researchers can immediately train downstream AI models.`

---

## 3. Executive Prompt Template for Skyline Synthesis

When generating or parsing Level 1 (Skyline) summaries, use this mental prompt:

```markdown
Imagine you are explaining this software change to your grandma over tea:
1. What could the app NOT do before this change?
2. What can the user do NOW after this change?
3. What are the 3-5 major parts working together to make this happen, explained in 1 plain sentence each without engineering jargon?
```

---

## 4. Synthesis Rules for Code & UI Components

1. **`SkylineCard.tsx`**: Must always render the 1-Sentence Executive Intent and 4-5 Core Functional Shifts using the Grandma Standard.
2. **`DashboardView.tsx`**: Must always anchor Level 2 cards to Skyline Pillars and display the `➕ DELTA KNOWLEDGE ADDED` section showing *incremental architectural decisions*.
3. **`MatrixView.tsx`**: Must anchor tasks to Level 2 Neighborhoods and display Level 3 acceptance criteria.
