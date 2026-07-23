---
description: Record developer friction or UX pain points and match against the 28 UX Innovations Catalog
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
   Evaluate Reach, Impact, Confidence, and Effort, then compute RICE score.

4. **Log to `.agent/pain-bank.json`**
   Assign a unique Pain ID (e.g. `PAIN-2026-002`) and append to `activePains` array in `.agent/pain-bank.json`.

5. **Update `.agent/context-skyline.json`**
   Update `topActivePainPoints` and `currentUxPriority` in `.agent/context-skyline.json`.

6. **Summary & Recommended Action**
   Display the recorded pain item, matched UX Innovation idea, RICE score, and prompt the user if they wish to run `/opsx:propose <name>` to build it.
