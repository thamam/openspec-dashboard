# UX Philosophy: The "Zoom Level" Framework

**Core Motivation:** AI-generated artifacts contain too much detail for a human to review comprehensively without fatigue. If we show everything at once, the human resorts to "vibing" through the review. To preserve cognitive capacity, we must trade upfront detail for navigable depth.

We treat the review process like a progressive story told to different audiences—from your grandma, to a peer from another department, to a domain specialist.

---

## The "Grandma-to-Professor" Audience Protocol

### Zoom Level 1: The Skyline (The Grandma Level)
- **Target Audience:** Your grandma or executive sponsor.
- **Rule:** ZERO technical jargon, buzzword salads, or implementation trivia.
- **Answers:** *What is changing, why does it matter, and what problem does it solve in plain human language?*
- **Goal:** Allow the user to say "Yes, this is generally the right direction" in 5 seconds.

### Zoom Level 2: The Neighborhoods (The Cross-Department Friend Level)
- **Target Audience:** An engineering friend from another department.
- **Rule:** High-level functional choices, component boundaries, and key invariants without run-on jargon.
- **Answers:** *What are the architectural choices, boundaries, and trade-offs between components?*
- **Goal:** Allow the user to scan functional surface area and see how parts fit together.

### Zoom Level 3: The Streets (The Specialist / Teammate Level)
- **Target Audience:** A teammate implementing the feature.
- **Rule:** Functional specs, acceptance criteria, edge cases, and API input/output contracts.
- **Answers:** *What are the exact functional requirements and edge case bounds?*
- **Goal:** Provide concrete implementation bounds for task execution.

### Zoom Level 4: The License Plates (The Forensic Professor Level)
- **Target Audience:** A compiler or forensic auditor.
- **Rule:** Granular task checklists, raw markdown code diffs, and byte-level schema details.
- **Answers:** *What exact lines of code or files are modified?*
- **Goal:** Ultimate fallback for forensic inspection.

---

## Implementation Principles
1. **The Grandma-to-Professor Protocol:** Always synthesize Level 1 (Skyline) using plain, buzzword-free human language ("Grandma Standard"). See **[plain-language-synthesis.md](file://.agent/rules/plain-language-synthesis.md)** for detailed rules and prompt templates.
2. **Never default to Level 4:** The user should never see a license plate unless they explicitly clicked on a car.
3. **Progressive Delta Knowledge Protocol:** Every Zoom Level MUST explicitly anchor to the mental model established by its predecessor level (Zoom $N-1$) and present ONLY the incremental **Delta Knowledge** introduced at that depth.
4. **Interactive Traceability:** Use semantic linking to maintain context across levels so the user never gets lost.
