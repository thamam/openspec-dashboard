import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getChanges, getChangeDag } from '../src/services/dagService.js';

describe('dagService - getChanges', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-test-changes-'));
    const openspecDir = path.join(tempDir, 'openspec', 'changes');
    fs.mkdirSync(openspecDir, { recursive: true });
    
    // Create an active change
    fs.mkdirSync(path.join(openspecDir, 'my-active-feature'));
    
    // Create archived changes
    const archiveDir = path.join(openspecDir, 'archive');
    fs.mkdirSync(archiveDir);
    fs.mkdirSync(path.join(archiveDir, '2026-06-17-archived-feature'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should list all active and archived changes in the repo', async () => {
    const changes = await getChanges(tempDir);
    expect(changes).toContain('my-active-feature');
    expect(changes).toContain('archive/2026-06-17-archived-feature');
    expect(changes).not.toContain('archive'); // Don't return the archive base directory
  });
});

describe('dagService - getChangeDag', () => {
  let tempDir: string;
  let changeDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-test-linkage-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });

    // Write proposal.md
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `## Why
To fix a bug.

## Capabilities
### New Capabilities
- \`widget-feature\`: Add widget logic
`
    );

    // Write specs
    const specDir = path.join(changeDir, 'specs', 'widget-feature');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.md'),
      `## ADDED Requirements
### Requirement: Verify Widget Display
The system SHALL show widget data.

#### Scenario: Display successful
- **WHEN** user loads widget
- **THEN** data displays
`
    );

    // Write design.md
    fs.writeFileSync(
      path.join(changeDir, 'design.md'),
      `## Decisions
### Decision 1: Widget Database Integration
Store widget data in sqlite database.
`
    );

    // Write tasks.md
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `## 1. Widget Setup
- [ ] 1.1 Create database schema for widget data
- [x] 1.2 Implement widget service
`
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should parse markdown files and build correct nodes and edges (DAG)', async () => {
    const dag = await getChangeDag(tempDir, 'my-change');

    // Verify Nodes
    const nodes = dag.nodes;
    expect(nodes.some(n => n.id === 'proposal-widget-feature' && n.type === 'proposal')).toBe(true);
    expect(nodes.some(n => n.id === 'spec-req-verify-widget-display' && n.type === 'spec-requirement')).toBe(true);
    expect(nodes.some(n => n.id === 'design-decision-decision-1-widget-database-integration' && n.type === 'design-decision')).toBe(true);
    expect(nodes.some(n => n.id === 'task-1-1-create-database-schema-for-widget-data' && n.type === 'task' && n.status === 'pending')).toBe(true);
    expect(nodes.some(n => n.id === 'task-1-2-implement-widget-service' && n.type === 'task' && n.status === 'completed')).toBe(true);

    // Verify Edges
    const edges = dag.edges;
    // Edge: Proposal capability -> Spec requirement
    expect(edges.some(e => e.source === 'proposal-widget-feature' && e.target === 'spec-req-verify-widget-display')).toBe(true);
    // Edge: Spec requirement -> Design decision (contains "Widget")
    expect(edges.some(e => e.source === 'spec-req-verify-widget-display' && e.target === 'design-decision-decision-1-widget-database-integration')).toBe(true);
    // Edge: Design decision -> Tasks (database/widget mentions)
    expect(edges.some(e => e.source === 'design-decision-decision-1-widget-database-integration' && e.target === 'task-1-1-create-database-schema-for-widget-data')).toBe(true);
    expect(edges.some(e => e.source === 'design-decision-decision-1-widget-database-integration' && e.target === 'task-1-2-implement-widget-service')).toBe(true);
  });
});

describe('dagService - getChangeDag with explicit linkages.json', () => {
  let tempDir: string;
  let changeDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-test-explicit-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'linkages-test');
    fs.mkdirSync(changeDir, { recursive: true });

    // 1. Write proposal.md
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `## Capabilities
- \`widget-core\`: Core widget rendering
- \`sound-alerts\`: Sound alert capability
`
    );

    // 2. Write specs
    const widgetSpecDir = path.join(changeDir, 'specs', 'widget-core');
    fs.mkdirSync(widgetSpecDir, { recursive: true });
    fs.writeFileSync(
      path.join(widgetSpecDir, 'spec.md'),
      `## Requirements
### Requirement: Verify Widget Display
The system SHALL show widget data.
`
    );

    const soundSpecDir = path.join(changeDir, 'specs', 'sound-alerts');
    fs.mkdirSync(soundSpecDir, { recursive: true });
    fs.writeFileSync(
      path.join(soundSpecDir, 'spec.md'),
      `## Requirements
### Requirement: Sound Alert
The system SHALL sound an alert on success.
`
    );

    // 3. Write design.md
    fs.writeFileSync(
      path.join(changeDir, 'design.md'),
      `## Decisions
### Decision 1: Widget Database Integration
Store widget data in sqlite database.

### Decision 2: Play Alert Tone
Play a beep sound.
`
    );

    // 4. Write tasks.md
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `## Tasks
- [ ] 1.1 Create database schema for widget data
- [ ] 2.1 Write beep tone service
`
    );

    // 5. Write linkages.json (only linking the widget flow)
    fs.writeFileSync(
      path.join(changeDir, 'linkages.json'),
      JSON.stringify([
        {
          source: 'Verify Widget Display',
          target: 'Decision 1: Widget Database Integration'
        },
        {
          source: 'Decision 1: Widget Database Integration',
          target: '1.1 Create database schema for widget data'
        }
      ])
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should use explicit linkages and bypass Jaccard similarity completely when linkages.json is present', async () => {
    const dag = await getChangeDag(tempDir, 'linkages-test');
    const edges = dag.edges;

    // Verify explicit widget-core links exist (mapped by labels)
    const reqNodeId = 'spec-req-verify-widget-display';
    const decNodeId = 'design-decision-decision-1-widget-database-integration';
    const taskNodeId = 'task-1-1-create-database-schema-for-widget-data';

    expect(edges.some(e => e.source === reqNodeId && e.target === decNodeId)).toBe(true);
    expect(edges.some(e => e.source === decNodeId && e.target === taskNodeId)).toBe(true);

    // Verify Jaccard is bypassed:
    // "Sound Alert" and "Play Alert Tone" and "Write beep tone service" have matching tokens ("alert", "tone", "beep"),
    // but they are not linked in linkages.json.
    const soundReqId = 'spec-req-sound-alert';
    const soundDecId = 'design-decision-decision-2-play-alert-tone';
    const soundTaskId = 'task-2-1-write-beep-tone-service';

    expect(edges.some(e => e.source === soundReqId && e.target === soundDecId)).toBe(false);
    expect(edges.some(e => e.source === soundDecId && e.target === soundTaskId)).toBe(false);
  });
});
