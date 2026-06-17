## ADDED Requirements

### Requirement: Render Interactive DAG Linkages
The system SHALL support loading and rendering a Directed Acyclic Graph mapping proposal, spec, design, and task items for a change.

#### Scenario: Successful DAG loading and rendering
- **WHEN** the user selects a change in Review Mode
- **THEN** the system SHALL parse the artifacts, compute edges, and draw SVG connector lines between the node columns

#### Scenario: Highlight connected neighbors on click
- **WHEN** the user clicks a node in the DAG
- **THEN** the system SHALL highlight the clicked node and all its connected neighbor nodes, while fading out other nodes

#### Scenario: Highlight critical paths for incomplete tasks
- **WHEN** the user toggles "Highlight Critical Paths"
- **THEN** the system SHALL visually distinguish paths that lead to uncompleted tasks (checkbox `[ ]`)
