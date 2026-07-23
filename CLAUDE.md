# Claude Assistant Instructions

## OpenSpec Dashboard Project

Welcome to the OpenSpec Dashboard! This repository houses the client and server applications for OpenSpec, an intelligent agentic review platform.

### Core Philosophy 
**CRITICAL:** Before taking any action or proposing any UX changes in this project, you **MUST** read and adhere to our core design philosophy located at:
`.agent/rules/ux-philosophy.md`

We practice the "Zoom Level" framework of progressive disclosure. Never overwhelm the user with raw markdown or excessive detail upfront. 

### Technology Stack
- **Frontend:** React (Vite), TypeScript
- **Backend:** Node.js, Express, TypeScript
- **Agent Integration:** OpenSpec CLI (`opsx`), Antigravity Agent Framework

### Session Boot & Knowledge Protocol
- **Read Context Skyline:** Check `.agent/context-skyline.json` on startup (<200 tokens).
- **Walk of Pain Rule:** Consult `.agent/rules/pain-driven-prioritization.md` and `.agent/knowledge/ux_innovation_ideas_catalog.md` before proposing UX features.
- **Journal Ledger:** Review `.agent/JOURNAL.md` for historical continuity, and log session summaries upon completing tasks.

### Commands
- Start dev server: `npm run dev` (run from root, uses concurrently to run client and server)
- Client build: `npm run build` inside `/client`
- Server build: `npm run build` inside `/server`
