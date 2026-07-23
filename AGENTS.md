# OpenSpec Agent Workflow Guide

This document defines how autonomous agents should interact with and modify the OpenSpec Dashboard project.

## Guiding Principles

The overarching goal of the OpenSpec project is to reduce the cognitive load required for humans to review complex AI-generated code.

**CRITICAL DIRECTIVE:** All agents operating within this repository MUST adhere to the "Zoom Level" framework outlined in our core UX Philosophy. Read it before proposing or implementing any changes:
**[-> Read `.agent/rules/ux-philosophy.md`](file://.agent/rules/ux-philosophy.md)**

### When Designing UI/UX
- **Progressive Disclosure:** Never dump dense technical markdown files on the user by default.
- **Traceability:** Maintain semantic linking (using `linkages.json`) between requirements, architectural decisions, and tasks.
- **Exception-Based Review:** The UI should highlight deviations, risk areas, and subjective choices made by the AI, while hiding standard boilerplate scaffolding.

### When Writing Code
- Keep components modular.
- The `ArtifactViewer` is a view router. All new views must respect the `Artifacts` and `Linkage` typing defined in `client/src/types.ts`.
- Prefer fuzzy matching on linkages to account for LLM drift unless an explicit deterministic ID system is in place.

## Session Boot & Knowledge Persistence Protocol
Before proposing or implementing any changes:
1. **Read Context Skyline:** Inspect `.agent/context-skyline.json` for active change pointers, top unresolved pain points, and current RICE UX priorities.
2. **Consult Prioritization Rules:** Read **[pain-driven-prioritization.md](file://.agent/rules/pain-driven-prioritization.md)** and the 28-Idea Catalog in `.agent/knowledge/ux_innovation_ideas_catalog.md`.
3. **Check Continuous Journal:** Review recent entries in **[JOURNAL.md](file://.agent/JOURNAL.md)** for ongoing context.
4. **Log Session Completions:** Upon completing a task or improvement cycle, update `.agent/context-skyline.json` and append a summary block to **[JOURNAL.md](file://.agent/JOURNAL.md)**.

## Agent Workflows
If you are generating artifacts (Proposals, Specs, Designs, Tasks), ensure that you follow the established `.agent/workflows/` and always generate a `linkages.json` map to power the UI's traceability graph.
