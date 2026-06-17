## Context

We need a way to link items across all OpenSpec artifacts (Proposal, Spec, Design, Tasks) and render them visually as a DAG.

## Goals / Non-Goals

**Goals:**
- Extract structural items from markdown: Capability, Requirement, Scenario, Decision, Task Group, Task checkbox.
- Link them using simple text matching.
- Draw SVG connectors in React.
- Highlight connected paths and incomplete task critical paths.

**Non-Goals:**
- Supporting editing of nodes directly from the DAG view.

## Decisions

### Decision 1: Backend Parsing & Jaccard Token Overlap Matcher
The backend will parse Markdown elements using regex. To create edges:
- Capability → Requirement: Linked if the requirement is declared in the capability's spec folder.
- Requirement → Decision: Linked if Jaccard similarity of their tokens > 0.1.
- Decision → Task: Linked if Jaccard similarity of their tokens > 0.1.
* **Alternative considered:** Strict manual linking configuration file.
* **Rationale:** Text similarity is zero-config and adapts automatically to changes.

### Decision 2: SVG Connectors
A single background `<svg>` overlay will draw lines between nodes. The coordinates are calculated dynamically using the layout positions of node container elements.
* **Alternative considered:** HTML canvas or React Flow library.
* **Rationale:** Raw SVG paths are extremely simple to style with CSS, lightweight, and fully testable in JSDOM.
