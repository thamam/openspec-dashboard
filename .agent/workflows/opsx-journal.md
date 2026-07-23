---
description: Distill current session accomplishments, append to .agent/JOURNAL.md, and update .agent/context-skyline.json
---

Distill current session accomplishments into a milestone entry, append to `.agent/JOURNAL.md`, and update `.agent/context-skyline.json`.

**Input**: Summary of completed work or active task status.

**Steps**

1. **Summarize Session Achievements**
   Distill key accomplishments, decisions, code edits, and verification test status into 3-5 concise bullet points.

2. **Append to `.agent/JOURNAL.md`**
   Add a new cycle/session section to `.agent/JOURNAL.md` including:
   - Cycle Number & Date
   - Objective & Active Pain Point addressed
   - Key Decisions & Changes made
   - Verification status

3. **Update Level 1 Index (`.agent/context-skyline.json`)**
   Update `lastUpdated`, `lastSessionSummary`, `activeChange`, and `currentUxPriority` in `.agent/context-skyline.json`.

4. **Display Confirmation**
   Show a brief confirmation that the session journal entry and skyline index have been updated.
