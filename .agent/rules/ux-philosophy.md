# UX Philosophy: The "Zoom Level" Framework

**Core Motivation:** AI-generated artifacts contain too much detail for a human to review comprehensively without fatigue. If we show everything at once, the human resorts to "vibing" through the review. To preserve cognitive capacity, we must trade upfront detail for navigable depth.

We will treat the review process like viewing a city landscape. The user starts at a macro level and dynamically zooms in *only* on the areas that catch their attention.

## Zoom Level 1: The Skyline (Far Away)
**What you see:** The absolute highest-level summary. Is it a city or a jungle? Day or night?
**Equivalent in OpenSpec:** 
- A 1-2 sentence summary of the entire feature ("Adding JWT Authentication").
- Key architectural pillars ("Using Redis for sessions").
- Any critical exceptions/risks ("Modifies the core database schema").
- **Goal:** Allow the user to say "Yes, this is generally the right direction" in 5 seconds.

## Zoom Level 2: The Neighborhoods (Mid-Distance)
**What you see:** Distinguishable areas. The roads, the clusters of buildings.
**Equivalent in OpenSpec:** 
- The high-level Goals and major Decisions (The top-level nodes in the Traceability Matrix).
- "Goal: User Registration" -> "Decision: Email verification via SendGrid."
- **Goal:** Allow the user to scan the functional surface area. If a specific neighborhood looks suspicious or interesting, they can click it.

## Zoom Level 3: The Streets (Close)
**What you see:** Individual buildings, number of driving lanes.
**Equivalent in OpenSpec:** 
- Expanding a specific Goal to see its Functional Specs and Edge Cases.
- Expanding a specific Decision to see the data models and component architecture that support it.
- **Goal:** Provide detailed context only when the user explicitly asks for it by clicking/focusing.

## Zoom Level 4: The License Plates (Super Close)
**What you see:** People's faces, license plate numbers.
**Equivalent in OpenSpec:**
- The granular Task checklist ("Step 1.1 Create `auth.ts`").
- The raw markdown code blocks.
- **Goal:** The ultimate fallback. Only shown if the user is forensically investigating *how* the AI plans to write the code for a specific component.

---

### Implementation Principles
1. **Never default to Level 4.** The user should never see a license plate unless they explicitly clicked on a car. 
2. **Interactive Traceability.** When zooming in (e.g., from Level 2 to 3), the UI must use semantic linking to maintain context so the user doesn't get lost in the details.
3. **Guiding Light.** As you write code or design UX for this project, you MUST adhere to this progressive disclosure philosophy. Minimize upfront cognitive load.
