import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isBMADWorkspace, getBMADSprints, getBMADArtifacts } from '../src/services/bmadAdapter.js';

describe('bmadAdapter - BMAD Framework Unit & Integration Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect non-BMAD directory', () => {
    expect(isBMADWorkspace(tempDir)).toBe(false);
  });

  it('should detect BMAD directory when _bmad-output exists', () => {
    const bmadOut = path.join(tempDir, '_bmad-output', 'planning-artifacts');
    fs.mkdirSync(bmadOut, { recursive: true });

    expect(isBMADWorkspace(tempDir)).toBe(true);
  });

  it('should list BMAD sprints and parse kickoff titles', () => {
    const sprintDir = path.join(tempDir, '_bmad-output', 'planning-artifacts', 'sprint-4.5');
    fs.mkdirSync(sprintDir, { recursive: true });

    fs.writeFileSync(
      path.join(sprintDir, 'SPRINT-4.5-KICKOFF.md'),
      '# Sprint 4.5 - Video Keyframe Annotation Propagation Kickoff (Epic 11)\n\nSome mission details...'
    );

    fs.writeFileSync(
      path.join(sprintDir, 'epics.md'),
      '# Sprint 4.5 Epics\n\n### Story 11.1: Video decoder manifest\n- [ ] Task 1'
    );

    const sprints = getBMADSprints(tempDir);
    expect(sprints.length).toBe(1);
    expect(sprints[0].id).toBe('sprint-4.5');
    expect(sprints[0].title).toBe('Sprint 4.5 - Video Keyframe Annotation Propagation Kickoff (Epic 11)');
    expect(sprints[0].framework).toBe('bmad');
  });

  it('should parse BMAD artifacts and generate linkages', () => {
    const artifactsResult = getBMADArtifacts(tempDir, 'sprint-4.5');

    expect(artifactsResult.artifacts.framework).toBe('bmad');
    expect(artifactsResult.artifacts.proposal).toContain('Sprint 4.5');
    expect(artifactsResult.artifacts.tasks).toContain('Story 11.1');
    expect(artifactsResult.parsedTasks.length).toBeGreaterThan(0);
    expect(artifactsResult.linkages.length).toBeGreaterThan(0);
  });

  it('should work with real production Sprint 4.5 if path exists', () => {
    const realRepoPath = '/Users/tomerhamam/work/neuronbox-mlops-worktrees/sprint-4-dev';
    if (fs.existsSync(realRepoPath)) {
      expect(isBMADWorkspace(realRepoPath)).toBe(true);
      const sprints = getBMADSprints(realRepoPath);
      expect(sprints.some((s) => s.id === 'sprint-4.5')).toBe(true);

      const artifacts = getBMADArtifacts(realRepoPath, 'sprint-4.5');
      expect(artifacts.artifacts.proposal).toContain('Sprint 4.5');
      expect(artifacts.artifacts.tasks).toContain('Story 11.1');
      expect(artifacts.linkages.length).toBeGreaterThan(0);
    }
  });
});
