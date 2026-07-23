---
name: openspec-record-pain
description: Record human developer friction or UX pain points, match them against the 28 UX Innovations Catalog, evaluate RICE scores, and log to .agent/pain-bank.json.
license: MIT
compatibility: Requires openspec workspace.
metadata:
  author: openspec
  version: "1.0"
---

Record developer friction or UX pain points, match them against the 28 UX Innovations Catalog, evaluate RICE scores, and log to `.agent/pain-bank.json`.

**Input**: A description of the friction, confusion, or test/agent trap experienced during development.

**Steps**

1. **Capture Pain Description**
   If no description is provided, prompt the user for details about the friction or confusion encountered.

2. **Consult the Master UX Idea Bank**
   Read `.agent/knowledge/ux_innovation_ideas_catalog.md` and `.agent/rules/pain-driven-prioritization.md`.
   Perform a fuzzy match between the reported friction and the 28 UX Innovations across the 7 Pillars.

3. **Calculate RICE Score**
   - **Reach** (1-10): How many developers or workflows are affected?
   - **Impact** (1-10): How much cognitive load or time is saved?
   - **Confidence** (1-10): How certain are we that this feature solves the pain?
   - **Effort** (1-10): Estimated implementation complexity.
   - $\text{RICE Score} = \frac{\text{Reach} \times \text{Impact} \times \text{Confidence}}{\text{Effort}}$

4. **Log to `.agent/pain-bank.json`**
   Assign a unique Pain ID (e.g. `PAIN-2026-002`) and append to `activePains` array in `.agent/pain-bank.json`.

5. **Update `.agent/context-skyline.json`**
   Update `topActivePainPoints` and `currentUxPriority` in `.agent/context-skyline.json`.

6. **Summary & Recommended Action**
   Display the recorded pain item, the matched UX Innovation idea, RICE score, and prompt the user if they wish to run `/opsx:propose <name>` to build it.
