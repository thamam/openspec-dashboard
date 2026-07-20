# OpenSpec Dashboard Manifest

## Core Philosophy

This project serves as the definitive interface for the OpenSpec workflow. It is built on the principle that the dashboard must reflect reality, not guess it. We do not reverse-engineer; we integrate directly. We do not build disjointed tools; we build a unified workspace. 

## The Core Principles

### 1. The Single Focal Point
The dashboard is the one and only place required to execute an OpenSpec lifecycle.
- **1.1 Complete Lifecycle Management:** A single interface to run all OpenSpec stages (`new`, `continue`, `propose`, `apply`, `verify`, `ff`, `validate`, `archive`). No hidden CLI commands; the UI exposes the exact same capabilities.
- **1.2 Standardized Artifact Review:** A dedicated space to review each artifact individually against enforced, selected standard practices (e.g., YAGNI, Walking Skeleton, complexity limits, Definition of Done, EVAL criteria).
- **1.3 Holistic Context:** A clear, explicit view of how artifacts relate to one another (e.g., how a task links back to a design decision), relying on explicit references rather than brittle heuristic guessing.

### 2. The Unified Task Hub
Tasks cannot exist in isolation from execution.
- The dashboard provides a single queue where tasks are received, claimed, and reported upon. 
- Progress is tracked where the work is defined. If a task is updated in the codebase, the dashboard reflects it immediately.

### 3. Agent-Human Parity
Humans and AI models are treated as the exact same class of user.
- The interface must be easily navigable, readable, and actionable by both human developers and autonomous agents.
- Agents receive tasks, read specs, and report progress through the exact same channels and with the exact same access level as a human.

### 4. Less is More
We prioritize stability, clarity, and truth over complex feature sets.
- We ruthlessly cut code that guesses, approximates, or attempts to "be smart" when it should be deterministic.
- We disable or remove flaky integrations and fragile UI wizards that abstract away the truth of the underlying artifacts.
- Simplicity is our primary measure of architectural health.
