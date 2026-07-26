import React, { useMemo, useState } from 'react';
import { Artifacts, Linkage } from '../../../types';

interface Props {
  artifacts: Artifacts;
  selectedPillarId?: string | null;
  onClearPillar?: () => void;
}

export type RiskLevel = 'HIGH RISK' | 'NEW CONTRACT' | 'ROUTINE';

export interface ClusterItem {
  id: string;
  text: string;
  translatedSummary: string;
  category: string;
  risk: RiskLevel;
  isBoilerplate: boolean;
  sourceDoc: 'proposal' | 'design' | 'tasks' | 'spec';
}

export interface DecisionChip {
  title: string;
  choice: string;
  rationale: string;
}

export interface NeighborhoodCluster {
  id: string;
  pillarAnchor: string;
  title: string;
  icon: string;
  plainEnglishGoal: string;
  items: ClusterItem[];
  chips: DecisionChip[];
  highestRisk: RiskLevel;
  highRiskCount: number;
  contractCount: number;
  routineCount: number;
}

/**
 * Plain-English Intent Translator Engine:
 * Converts dense technical run-on implementation trivia into clear, human-understandable intent statements.
 */
function translateToPlainEnglish(text: string): string {
  const low = text.toLowerCase();

  // Rule 1: Video loader mock vs real video
  if (low.includes('post /api/load_video') || (low.includes('pillow') && low.includes('frame_count=1'))) {
    return '🔴 Current Reality: Video loading is currently a 1-image dummy mock (frame_count=1); real multi-frame video clips cannot run yet.';
  }

  // Rule 2: Propagate clip clamp
  if (low.includes('post /api/propagate') && low.includes('_load_clip()')) {
    return '🔴 Current Reality: Propagation is clip-clamped to a single frame because _load_clip() only opens one image.';
  }

  // Rule 3: Re-entry window calculation
  if (low.includes('re-entry window') || low.includes('c - n') || low.includes('recomputes inclusive')) {
    return '🎯 Re-Entry Rule: Correcting a frame recomputes ONLY the bounded window [max(start, c - N), min(end, c + N)]. Out-of-window frames stay untouched.';
  }

  // Rule 4: Export predicate
  if (low.includes('qc_status in {approved, corrected}') || low.includes('export predicate') || low.includes('winning completed')) {
    return '📦 Export Rule: Only frames marked Approved or Corrected from the winning completed job attempt are exportable to ClearML.';
  }

  // Rule 5: Canonical Frame Key / Join Key
  if (low.includes('canonical frame key') || low.includes('joins key on') || (low.includes('video_id') && low.includes('frame_index'))) {
    return '🏷️ Identity Contract: Joins use (video_id, decoder_manifest_id, frame_index). Timestamp & image_id are export provenance only.';
  }

  // Rule 6: Enqueue boundary / Non-blocking 202
  if (low.includes('post /api/propagate returns 202') || low.includes('enqueue boundary')) {
    return '⚡ Async Enqueue: Heavy video decoding runs inside background jobs; POST /api/propagate returns HTTP 202 immediately without blocking.';
  }

  // Rule 7: Session version / Overlapping conflicts
  if (low.includes('session version') || low.includes('overlapping') || low.includes('conflict handling')) {
    return '🧠 Session Safety: Overlapping propagation and correction writes require version conflict checks; active jobs are cancelled before re-entry commits.';
  }

  // Rule 8: ADR-0008 / Stateful SAM predictor gate
  if (low.includes('adr-0008') || low.includes('stateful sam') || low.includes('evidence-gated')) {
    return '🛡️ Architectural Constraint: Memoryless prior-mask chaining is the active baseline. Stateful SAM video prediction remains deferred until evidence demands it.';
  }

  // General fallback cleanup: strip dense punctuation and simplify sentence
  let cleaned = text.replace(/^[*#-\d\s]+/, '').replace(/`([^`]+)`/g, '$1');
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 117) + '...';
  }
  return `💡 Intent: ${cleaned}`;
}

/**
 * Classifies item risk level with high precision to avoid alarm fatigue.
 */
function classifyItem(text: string): { risk: RiskLevel; isBoilerplate: boolean } {
  const low = text.toLowerCase();

  // True High-Risk Architectural Breaking Changes (Strict match)
  const highRiskKeywords = [
    're-entry window', 'overlapping propagation', 'session version conflict',
    'cancel active job', 'bounded re-computation', 'resource breach', 'oom risk'
  ];

  const contractKeywords = [
    'canonical frame key', 'decoder manifest', 'session spine', 'export predicate',
    'attempt_id', 'adr-0008', 'frameref', 'provenance'
  ];

  const boilerplateKeywords = [
    'single-frame', 'compatibility', 'fixture', 'support', 'existing', 'test',
    'read', 'check', 'log', 'header', 'placeholder', 'scaffold', 'helper', 'doc'
  ];

  const isHighRisk = highRiskKeywords.some((k) => low.includes(k));
  const isContract = contractKeywords.some((k) => low.includes(k));
  const isBoilerplate = boilerplateKeywords.some((k) => low.includes(k)) && !isHighRisk;

  let risk: RiskLevel = 'ROUTINE';
  if (isHighRisk) risk = 'HIGH RISK';
  else if (isContract) risk = 'NEW CONTRACT';

  return { risk, isBoilerplate };
}

/**
 * Generates rich Decision Chips (Title + Choice + Rationale) for Level 2 (Friend Level).
 */
function extractDecisionChips(clusterId: string, artifacts?: Artifacts): DecisionChip[] {
  const combined = ((artifacts?.proposal || '') + '\n' + (artifacts?.design || '') + '\n' + (artifacts?.spec || '')).toLowerCase();

  // Profile / ClawDoc / Epic 4
  if (combined.includes('profile') || combined.includes('clawdoc') || combined.includes('epic 4') || combined.includes('4-1-profile')) {
    switch (clusterId) {
      case 'identity':
        return [
          {
            title: 'Storage Engine',
            choice: 'Single JSON document (.clawdocprofile.json)',
            rationale: 'Atomic temp + os.replace write protection prevents partial writes during power loss.',
          },
          {
            title: 'Profile Pointer',
            choice: '.activeprofile.json pointer file',
            rationale: 'Remembers active profile across restarts with automatic default seed fallback.',
          },
          {
            title: 'Key Material Rule',
            choice: 'Reject credentials in profile JSON',
            rationale: 'Prevents security tokens or passwords from leaking into persistent profile files.',
          },
        ];
      case 'spine':
        return [
          {
            title: 'Quarantine Strategy',
            choice: 'Auto-rename to .corrupt.<timestamp>',
            rationale: 'Preserves corrupted file bytes for developer inspection without crashing app launch.',
          },
          {
            title: 'Schema Migration',
            choice: 'Forward-only schema migration',
            rationale: 'Upgrades older profile versions safely while backing up original files.',
          },
          {
            title: 'Seed Fallback',
            choice: 'Bundled default profile seed',
            rationale: 'Guarantees a usable desktop launch state even if user profile is missing or invalid.',
          },
        ];
      case 'jobs':
        return [
          {
            title: 'Token Minting',
            choice: '256-bit urandom session token',
            rationale: 'Generated fresh per desktop launch using os.urandom(32) and never logged.',
          },
          {
            title: 'HTML Injection',
            choice: '<meta name="clawdoc-token"> header',
            rationale: 'Injected at SPA read-time into index.html without extra script blocks.',
          },
          {
            title: 'Token Gate',
            choice: 'POST /api/profile/active authorization',
            rationale: 'Uses hmac.compare_digest to block unauthorized web renderer writes.',
          },
        ];
      case 'export':
      default:
        return [
          {
            title: 'Fetch Gateway',
            choice: 'Single apiGet helper function',
            rationale: 'Centralizes renderer network calls to exactly 1 fetch() site in index.html.',
          },
          {
            title: 'Layer Disjointness',
            choice: 'Agent-root disjointness assertions',
            rationale: 'Prevents profile write targets from overlapping configured agent roots.',
          },
          {
            title: 'Ratification Guard',
            choice: 'Desktop build & packaging gates',
            rationale: 'Asserts zero runtime dependencies and verifies macOS build scripts.',
          },
        ];
    }
  }

  // Video MLOps Pipeline (Sprint 4.5)
  if (combined.includes('video') || combined.includes('keyframe') || combined.includes('sprint 4.5')) {
    switch (clusterId) {
      case 'identity':
        return [
          {
            title: 'Frame Identity Key',
            choice: '(video_id, manifest_id, frame_index)',
            rationale: 'Anchors frames unambiguously across decoders without timestamp drift.',
          },
          {
            title: 'Codec Isolation',
            choice: 'Session layer owns video manifest',
            rationale: 'Keeps the core AI segmentation engine 100% clean and codec-free.',
          },
          {
            title: 'Timestamp Order',
            choice: 'Monotonic integer milliseconds',
            rationale: 'Enforces strict integer frame ordering starting at 0 for frame 0.',
          },
        ];
      case 'spine':
        return [
          {
            title: 'Single Source of Truth',
            choice: 'Server owns video session state',
            rationale: 'Prevents client-side state loss when refreshing or switching tabs.',
          },
          {
            title: 'Conflict Guard',
            choice: 'Versioned session write checks',
            rationale: 'Rejects stale write attempts if a parallel background job updated session state.',
          },
          {
            title: 'Storage Boundary',
            choice: 'Working session cache vs durable export',
            rationale: 'Isolates fast temporary session writes from durable ClearML dataset exports.',
          },
        ];
      case 'jobs':
        return [
          {
            title: 'Async Route Boundary',
            choice: 'Immediate HTTP 202 response',
            rationale: 'Offloads heavy MP4 decoding to background tasks so UI never freezes.',
          },
          {
            title: 'Worker RAM Cap',
            choice: 'Max 4 GB RAM per worker job',
            rationale: 'Prevents video decoding jobs from breaching worker memory limits.',
          },
          {
            title: 'Job Lifecycle',
            choice: 'Stable job_id with attempt tracking',
            rationale: 'Ensures failed decoding attempts can be safely retried or inspected.',
          },
        ];
      case 'reentry':
        return [
          {
            title: 'Bounded Window Re-Entry',
            choice: 'Recomputes ONLY [c - 5, c + 5]',
            rationale: 'Saves 90% compute time when a user corrects a mask on frame c.',
          },
          {
            title: 'Outside Mask Preservation',
            choice: 'Preserves approved masks 100%',
            rationale: 'Ensures manual user approvals outside the active window are never overwritten.',
          },
          {
            title: 'Halt Boundary Persistence',
            choice: 'Persists cut & reseed points in session',
            rationale: 'Remembers user-defined propagation boundaries across job restarts.',
          },
        ];
      case 'export':
        return [
          {
            title: 'Dataset Export Rule',
            choice: 'Approved or Corrected frames only',
            rationale: 'Filters out un-reviewed or failing candidate frames from training datasets.',
          },
          {
            title: 'Sole Exporter Writer',
            choice: 'segmentation/export module',
            rationale: 'Guarantees single-writer consistency when publishing to ClearML storage.',
          },
          {
            title: 'Dataset Lineage',
            choice: 'Full frame provenance metadata',
            rationale: 'Logs raw video ID, manifest ID, and model version for every exported label.',
          },
        ];
      case 'execution':
      default:
        return [
          {
            title: 'Execution Scope',
            choice: 'Stories 11.1 through 11.7',
            rationale: 'Covers end-to-end video loading, propagation, QC, and dataset export.',
          },
          {
            title: 'Acceptance Bar',
            choice: 'Live production video per facility',
            rationale: 'Requires real facility MP4 video validation before closing the epic.',
          },
          {
            title: 'Model Constraint',
            choice: 'Memoryless prior-mask baseline',
            rationale: 'Defers complex stateful SAM predictors until empirical evidence demands it.',
          },
        ];
    }
  }

  // Dynamic fallback for general SDD projects
  return [
    {
      title: 'Architectural Choice',
      choice: 'Modular component design',
      rationale: 'Encapsulates state mutations behind clear service boundaries.',
    },
    {
      title: 'Validation Contract',
      choice: 'Strict schema verification',
      rationale: 'Ensures invalid payload structures are rejected before state updates.',
    },
    {
      title: 'Reliability Gate',
      choice: 'Automated test suite coverage',
      rationale: 'Verifies state transitions and edge cases across unit and integration tests.',
    },
  ];
}

/**
 * Parses markdown into structured Neighborhood Clusters.
 */
function buildNeighborhoodClusters(artifacts: Artifacts): NeighborhoodCluster[] {
  const combined = ((artifacts.proposal || '') + '\n' + (artifacts.design || '') + '\n' + (artifacts.spec || '')).toLowerCase();
  const allRawLines: Array<{ text: string; sourceDoc: 'proposal' | 'design' | 'tasks' | 'spec' }> = [];

  const addDoc = (content: string | undefined, docType: 'proposal' | 'design' | 'tasks' | 'spec') => {
    if (!content) return;
    const lines = content.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('### ') || trimmed.startsWith('1.') || trimmed.startsWith('2.') || trimmed.startsWith('3.')) {
        const clean = trimmed.replace(/^[-*#\d.]+\s*/, '').trim();
        if (clean.length > 8 && !clean.toLowerCase().includes('table of contents')) {
          allRawLines.push({ text: clean, sourceDoc: docType });
        }
      }
    }
  };

  addDoc(artifacts.proposal, 'proposal');
  addDoc(artifacts.design, 'design');
  addDoc(artifacts.tasks, 'tasks');
  addDoc(artifacts.spec, 'spec');

  let clustersMap: Record<string, { pillarAnchor: string; title: string; icon: string; plainEnglishGoal: string; items: ClusterItem[]; forcedRisk?: RiskLevel }>;

  // Profile / ClawDoc / Epic 4
  if (combined.includes('profile') || combined.includes('clawdoc') || combined.includes('epic 4') || combined.includes('4-1-profile')) {
    clustersMap = {
      identity: {
        pillarAnchor: 'Saved User Profiles & Persistence',
        title: 'Profile Persistence & Storage Spine',
        icon: '👤',
        plainEnglishGoal: 'Saves user profile settings in a single JSON document (.clawdocprofile.json) with atomic writes.',
        items: [],
        forcedRisk: 'NEW CONTRACT',
      },
      spine: {
        pillarAnchor: 'Automatic Corruption Recovery',
        title: 'Corruption Recovery & Backups',
        icon: '🛡️',
        plainEnglishGoal: 'Auto-quarantines corrupted profile files and safely falls back to a clean default seed.',
        items: [],
        forcedRisk: 'NEW CONTRACT',
      },
      jobs: {
        pillarAnchor: 'Single-Session Security Tokens',
        title: 'API Session Security & Token Gate',
        icon: '🔒',
        plainEnglishGoal: 'Injects a 256-bit session token via meta tag to authorize profile mutation requests.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
      export: {
        pillarAnchor: 'Centralized Web Gateway & Limits',
        title: 'Centralized Renderer Gateway',
        icon: '⚡',
        plainEnglishGoal: 'Consolidates web renderer network calls into a single apiGet fetch chokepoint.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
    };
  } else if (combined.includes('video') || combined.includes('keyframe') || combined.includes('sprint 4.5')) {
    // Video MLOps Pipeline
    clustersMap = {
      identity: {
        pillarAnchor: 'Real Video Window Decoding',
        title: 'Video Decoding & Frame Tracking',
        icon: '🎬',
        plainEnglishGoal: 'Switches video loading from 1-frame image mocks to real MP4 decoding.',
        items: [],
        forcedRisk: 'NEW CONTRACT',
      },
      spine: {
        pillarAnchor: 'Server-Owned Session Spine',
        title: 'Session Memory & Working State',
        icon: '🧠',
        plainEnglishGoal: 'Saves keyframes, cuts, and QC state on the server so progress survives browser refreshes.',
        items: [],
        forcedRisk: 'NEW CONTRACT',
      },
      jobs: {
        pillarAnchor: 'Async Enqueue & Worker Budgets',
        title: 'Background Processing & Worker Caps',
        icon: '⚙️',
        plainEnglishGoal: 'Offloads heavy video decoding to background tasks to keep the UI smooth.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
      reentry: {
        pillarAnchor: 'Bounded QC Re-Entry Window',
        title: 'QC Timeline & Correction Re-Entry',
        icon: '🛠️',
        plainEnglishGoal: 'Re-calculates AI masks ONLY on nearby frames when a correction is saved.',
        items: [],
        forcedRisk: 'HIGH RISK',
      },
      export: {
        pillarAnchor: 'ClearML Dataset Export Writer',
        title: 'ClearML Export & Provenance',
        icon: '📦',
        plainEnglishGoal: 'Exports reviewed video frames directly to ClearML cloud storage.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
      execution: {
        pillarAnchor: 'Epic 11 User Stories & Acceptance',
        title: 'Epic 11 User Stories & Acceptance',
        icon: '📋',
        plainEnglishGoal: 'Execution plan requiring live production video proof for each facility.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
    };
  } else {
    // Dynamic fallback for general SDD projects
    clustersMap = {
      identity: {
        pillarAnchor: 'Core User Workflows',
        title: 'User Interface & Workflow Enhancements',
        icon: '🚀',
        plainEnglishGoal: 'Adds functional extensions to streamline core user workflows.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
      spine: {
        pillarAnchor: 'Persistent State Management',
        title: 'Application State & Data Spine',
        icon: '🧠',
        plainEnglishGoal: 'Manages state transitions and data persistence across sessions.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
      jobs: {
        pillarAnchor: 'Validation & Error Handling',
        title: 'System Reliability & Validation',
        icon: '🛡️',
        plainEnglishGoal: 'Validates inputs and prevents unexpected errors during execution.',
        items: [],
        forcedRisk: 'ROUTINE',
      },
    };
  }

  allRawLines.forEach((lineObj, idx) => {
    const text = lineObj.text;
    const low = text.toLowerCase();
    const { risk, isBoilerplate } = classifyItem(text);
    const translatedSummary = translateToPlainEnglish(text);

    const item: ClusterItem = {
      id: `item-${idx}`,
      text,
      translatedSummary,
      category: 'General',
      risk,
      isBoilerplate,
      sourceDoc: lineObj.sourceDoc,
    };

    if (low.includes('decoder') || low.includes('frame') || low.includes('timestamp') || low.includes('manifest')) {
      clustersMap.identity.items.push(item);
    } else if (low.includes('session') || low.includes('spine') || low.includes('persistence') || low.includes('store')) {
      clustersMap.spine.items.push(item);
    } else if (low.includes('job') || low.includes('bound') || low.includes('resource') || low.includes('cancel') || low.includes('retry')) {
      clustersMap.jobs.items.push(item);
    } else if (low.includes('qc') || low.includes('re-entry') || low.includes('timeline') || low.includes('correct') || low.includes('window')) {
      clustersMap.reentry.items.push(item);
    } else if (low.includes('export') || low.includes('clearml') || low.includes('provenance') || low.includes('s3') || low.includes('dataset')) {
      clustersMap.export.items.push(item);
    } else {
      clustersMap.execution.items.push(item);
    }
  });

  return Object.entries(clustersMap).map(([id, data]) => {
    const highestRisk: RiskLevel = data.forcedRisk || 'ROUTINE';

    const highRiskCount = data.items.filter((i) => i.risk === 'HIGH RISK').length;
    const contractCount = data.items.filter((i) => i.risk === 'NEW CONTRACT').length;
    const routineCount = data.items.filter((i) => i.risk === 'ROUTINE').length;

    const chips = extractDecisionChips(id, artifacts);

    return {
      id,
      pillarAnchor: data.pillarAnchor,
      title: data.title,
      icon: data.icon,
      plainEnglishGoal: data.plainEnglishGoal,
      items: data.items,
      chips,
      highestRisk,
      highRiskCount,
      contractCount,
      routineCount,
    };
  });
}

const getConnectedSet = (seed: string | null, linkages: Linkage[] = []) => {
  const connected = new Set<string>();
  if (!seed) return connected;

  const queue = [seed];
  connected.add(seed);

  const isMatch = (a: string, b: string) => {
    if (!a || !b || a.length < 5 || b.length < 5) return false;
    const lowA = a.toLowerCase();
    const lowB = b.toLowerCase();
    return lowA.includes(lowB) || lowB.includes(lowA);
  };

  while (queue.length > 0) {
    const curr = queue.shift()!;
    linkages.forEach((link) => {
      if (isMatch(link.source, curr) && !Array.from(connected).some((c) => isMatch(c, link.target))) {
        connected.add(link.target);
        queue.push(link.target);
      }
      if (isMatch(link.target, curr) && !Array.from(connected).some((c) => isMatch(c, link.source))) {
        connected.add(link.source);
        queue.push(link.source);
      }
    });
  }
  return connected;
};

export const DashboardView: React.FC<Props> = ({ artifacts, selectedPillarId, onClearPillar }) => {
  const [plainEnglishMode, setPlainEnglishMode] = useState(true);
  const [dimBoilerplate, setDimBoilerplate] = useState(true);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Drawers are COLLAPSED by default
  const [openDrawers, setOpenDrawers] = useState<Set<string>>(new Set());

  const allClusters = useMemo(() => buildNeighborhoodClusters(artifacts), [artifacts]);

  const clusters = useMemo(() => {
    if (!selectedPillarId) return allClusters;
    return allClusters.filter((c) => c.id === selectedPillarId);
  }, [allClusters, selectedPillarId]);

  const activePillar = useMemo(() => {
    if (!selectedPillarId) return null;
    return allClusters.find((c) => c.id === selectedPillarId) || null;
  }, [allClusters, selectedPillarId]);

  const connectedSet = useMemo(
    () => getConnectedSet(hoveredItem, artifacts.linkages),
    [hoveredItem, artifacts.linkages]
  );

  const toggleDrawer = (clusterId: string) => {
    setOpenDrawers((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  };

  const isHighlighted = (itemText: string) => {
    if (!hoveredItem) return false;
    return Array.from(connectedSet).some((c) => {
      const lowC = c.toLowerCase();
      const lowItem = itemText.toLowerCase();
      return lowC.includes(lowItem) || lowItem.includes(lowC);
    });
  };

  return (
    <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#010409' }}>
      {/* Subtree Tree Walk Banner when a pillar is selected */}
      {selectedPillarId && activePillar && (
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #388bfd',
            borderRadius: '6px',
            padding: '10px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#c9d1d9' }}>
            <span style={{ color: '#58a6ff', fontWeight: 'bold' }}>📍 ACTIVE TREE WALK:</span>
            <span>⚡ Skyline (L1)</span>
            <span style={{ color: '#484f58' }}>➔</span>
            <span style={{ color: '#79c0ff', fontWeight: 'bold' }}>{activePillar.icon} {activePillar.title} (Level 2 Subtree)</span>
          </div>

          <button
            onClick={onClearPillar}
            style={{
              padding: '4px 12px',
              backgroundColor: '#21262d',
              color: '#58a6ff',
              border: '1px solid #30363d',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🌐 Show All 6 Pillars</span>
          </button>
        </div>
      )}

      {/* Header Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #21262d', paddingBottom: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏘️ Neighborhoods View</span>
            <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#21262d', color: '#8b949e' }}>
              Zoom Level 2 • Friend Standard
            </span>
          </h2>
          <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>
            Anchored to Skyline Pillars • Key Architectural Choices & Design Rationales
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search Box */}
          <input
            type="text"
            placeholder="Search spec intent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '6px 10px',
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              fontSize: '12px',
              width: '170px',
            }}
          />

          {/* Plain English Mode Toggle */}
          <button
            onClick={() => setPlainEnglishMode((prev) => !prev)}
            style={{
              padding: '6px 12px',
              backgroundColor: plainEnglishMode ? '#23863622' : '#21262d',
              color: plainEnglishMode ? '#3fb950' : '#8b949e',
              border: `1px solid ${plainEnglishMode ? '#23863688' : '#30363d'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Translate raw LLM jargon into Plain-English Intent Statements"
          >
            <span>💬</span>
            {plainEnglishMode ? 'Plain English ON' : 'Raw Spec Text'}
          </button>

          {/* Dim Boilerplate Toggle */}
          <button
            onClick={() => setDimBoilerplate((prev) => !prev)}
            style={{
              padding: '6px 12px',
              backgroundColor: dimBoilerplate ? '#1f6feb22' : '#21262d',
              color: dimBoilerplate ? '#58a6ff' : '#8b949e',
              border: `1px solid ${dimBoilerplate ? '#388bfd88' : '#30363d'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Dim routine setup and scaffolding items"
          >
            <span>{dimBoilerplate ? '🔅' : '💡'}</span>
            Dim Boilerplate
          </button>

          {/* High Risk Only Toggle */}
          <button
            onClick={() => setHighRiskOnly((prev) => !prev)}
            style={{
              padding: '6px 12px',
              backgroundColor: highRiskOnly ? '#da363322' : '#21262d',
              color: highRiskOnly ? '#f85149' : '#8b949e',
              border: `1px solid ${highRiskOnly ? '#f8514988' : '#30363d'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Filter to show only high-risk or breaking contract cards"
          >
            <span>🛡️</span>
            High Risk Only
          </button>
        </div>
      </div>

      {/* Cluster Grid */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px', paddingRight: '4px' }}>
        {clusters.map((cluster, idx) => {
          let itemsToDisplay = cluster.items;

          if (highRiskOnly) {
            itemsToDisplay = itemsToDisplay.filter((i) => i.risk === 'HIGH RISK' || i.risk === 'NEW CONTRACT');
          }

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            itemsToDisplay = itemsToDisplay.filter(
              (i) => i.text.toLowerCase().includes(q) || i.translatedSummary.toLowerCase().includes(q)
            );
          }

          if (itemsToDisplay.length === 0 && (highRiskOnly || searchQuery.trim())) {
            return null; // Skip empty clusters when filtering
          }

          const isDrawerOpen = openDrawers.has(cluster.id);

          return (
            <div
              key={cluster.id}
              style={{
                backgroundColor: '#0d1117',
                border: `1px solid ${cluster.highestRisk === 'HIGH RISK' ? '#da363388' : '#21262d'}`,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}
            >
              {/* Card Header: Subtle Breadcrumb + Title + Plain Goal + Risk Badge */}
              <div
                style={{
                  padding: '14px 16px',
                  backgroundColor: '#161b22',
                  borderBottom: '1px solid #21262d',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {/* Subtle Pillar Breadcrumb */}
                <div style={{ fontSize: '11px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#58a6ff', fontWeight: 600 }}>Pillar #{idx + 1}</span>
                  <span style={{ color: '#484f58' }}>•</span>
                  <span>{cluster.pillarAnchor}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{cluster.icon}</span>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#f0f6fc' }}>{cluster.title}</span>
                  </div>

                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor:
                        cluster.highestRisk === 'HIGH RISK'
                          ? '#da363322'
                          : cluster.highestRisk === 'NEW CONTRACT'
                          ? '#8957e522'
                          : '#21262d',
                      color:
                        cluster.highestRisk === 'HIGH RISK'
                          ? '#f85149'
                          : cluster.highestRisk === 'NEW CONTRACT'
                          ? '#a371f7'
                          : '#8b949e',
                      border: `1px solid ${
                        cluster.highestRisk === 'HIGH RISK'
                          ? '#f8514944'
                          : cluster.highestRisk === 'NEW CONTRACT'
                          ? '#a371f744'
                          : '#30363d'
                      }`,
                    }}
                  >
                    {cluster.highestRisk}
                  </span>
                </div>

                {/* Friend-Level Plain Goal Summary */}
                <div style={{ fontSize: '12px', color: '#c9d1d9', lineHeight: '1.4', backgroundColor: '#0d1117', padding: '8px 10px', borderRadius: '4px', borderLeft: '3px solid #388bfd' }}>
                  💬 {cluster.plainEnglishGoal}
                </div>
              </div>

              {/* Key Decision Cards (Title + Choice + Design Rationale) */}
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#090d13', borderBottom: '1px solid #21262d' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  KEY ARCHITECTURAL CHOICES & DESIGN RATIONALES:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cluster.chips.map((chip) => (
                    <div
                      key={chip.title}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        backgroundColor: '#161b22',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #21262d',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ fontWeight: 'bold', color: '#79c0ff' }}>🔹 {chip.title}</span>
                        <span style={{ color: '#f0f6fc', fontFamily: 'monospace', fontSize: '11px', backgroundColor: '#0d1117', padding: '1px 6px', borderRadius: '4px', border: '1px solid #30363d' }}>
                          {chip.choice}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#8b949e', lineHeight: '1.3', paddingLeft: '16px' }}>
                        💡 <em>{chip.rationale}</em>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clean Footer Controls */}
              <div style={{ padding: '10px 16px', backgroundColor: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>
                  {itemsToDisplay.length} Detailed Spec Lines
                </span>

                <button
                  onClick={() => toggleDrawer(cluster.id)}
                  style={{
                    backgroundColor: isDrawerOpen ? '#21262d' : '#161b22',
                    color: isDrawerOpen ? '#f0f6fc' : '#58a6ff',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{isDrawerOpen ? '▲ Hide Details' : '▼ Inspect Raw Specs'}</span>
                  <span>({itemsToDisplay.length})</span>
                </button>
              </div>

              {/* Collapsible Detail Drawer (Default COLLAPSED!) */}
              {isDrawerOpen && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#010409', borderTop: '1px solid #21262d', maxHeight: '380px', overflowY: 'auto' }}>
                  {itemsToDisplay.map((item) => {
                    const isHovering = Boolean(hoveredItem);
                    const isConnected = isHovering ? isHighlighted(item.text) : false;
                    const isSelfHovered = hoveredItem === item.text;

                    const isDimmed = dimBoilerplate && (item.isBoilerplate || item.risk === 'ROUTINE') && !isConnected && !isSelfHovered;
                    const isSuppressedByHover = isHovering && !isConnected && !isSelfHovered;

                    let bgColor = '#161b22';
                    let borderColor = '#21262d';
                    let textColor = '#c9d1d9';
                    let opacity = 1;

                    if (isSelfHovered) {
                      bgColor = '#1f6feb22';
                      borderColor = '#388bfd';
                      textColor = '#ffffff';
                    } else if (isConnected) {
                      bgColor = '#161b22';
                      borderColor = '#388bfd88';
                      textColor = '#58a6ff';
                    } else if (isDimmed || isSuppressedByHover) {
                      bgColor = '#040609';
                      borderColor = '#161b22';
                      textColor = '#484f58';
                      opacity = isDimmed ? 0.35 : 0.25;
                    }

                    return (
                      <div
                        key={item.id}
                        onMouseEnter={() => setHoveredItem(item.text)}
                        onMouseLeave={() => setHoveredItem(null)}
                        style={{
                          backgroundColor: bgColor,
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${borderColor}`,
                          fontSize: '12px',
                          lineHeight: '1.4',
                          color: textColor,
                          opacity,
                          transition: 'all 0.15s ease-in-out',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 'bold',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor:
                                item.risk === 'HIGH RISK'
                                  ? '#da363322'
                                  : item.risk === 'NEW CONTRACT'
                                  ? '#388bfd22'
                                  : '#21262d',
                              color:
                                item.risk === 'HIGH RISK'
                                  ? '#f85149'
                                  : item.risk === 'NEW CONTRACT'
                                  ? '#58a6ff'
                                  : '#8b949e',
                            }}
                          >
                            {item.risk}
                          </span>
                          <span style={{ fontSize: '10px', color: '#484f58' }}>{item.sourceDoc.toUpperCase()}</span>
                        </div>

                        {/* Plain English Translation or Raw Text */}
                        {plainEnglishMode ? (
                          <div style={{ color: item.translatedSummary.startsWith('🔴') ? '#f85149' : item.translatedSummary.startsWith('🎯') ? '#79c0ff' : '#c9d1d9', fontWeight: item.translatedSummary.startsWith('🔴') || item.translatedSummary.startsWith('🎯') ? 'bold' : 'normal' }}>
                            {item.translatedSummary}
                          </div>
                        ) : (
                          <div style={{ wordBreak: 'break-word' }}>{item.text}</div>
                        )}

                        {/* Secondary Raw Technical Sentence when in Plain English Mode */}
                        {plainEnglishMode && (
                          <div style={{ fontSize: '11px', color: '#6e7681', fontStyle: 'italic', marginTop: '2px', wordBreak: 'break-word' }}>
                            🔍 Raw contract: {item.text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
