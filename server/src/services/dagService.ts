import fs from 'fs';
import path from 'path';

export interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
  scenariosCount?: number;
}

export interface DagEdge {
  source: string;
  target: string;
}

// Common stop words to exclude during token extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'about', 'against', 
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 
  'from', 'up', 'down', 'in', 'out', 'off', 'over', 'under', 'again', 'further', 
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 
  'will', 'just', 'don', 'should', 'now', 'and', 'or', 'of', 'is', 'are', 'it', 
  'this', 'that', 'shall', 'must', 'should', 'we', 'i', 'you', 'he', 'she', 'they'
]);

// Helper: Tokenize and clean text to build keywords
function getTokens(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = clean.split(/\s+/);
  const tokens = new Set<string>();
  
  for (const word of words) {
    if (word.length >= 3 && !STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

// Helper: Calculate Jaccard Similarity Coefficient
function getJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }
  
  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

// Helper: Create safe HTML/CSS id
function makeId(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
}

export async function getChanges(repoPath: string): Promise<string[]> {
  const resolvedPath = path.resolve(repoPath);
  const changesDir = path.join(resolvedPath, 'openspec', 'changes');

  if (!fs.existsSync(changesDir)) {
    return [];
  }

  const results: string[] = [];

  // 1. Read active changes
  const activeItems = fs.readdirSync(changesDir);
  for (const item of activeItems) {
    const itemPath = path.join(changesDir, item);
    if (item !== 'archive' && fs.statSync(itemPath).isDirectory()) {
      results.push(item);
    }
  }

  // 2. Read archived changes
  const archiveDir = path.join(changesDir, 'archive');
  if (fs.existsSync(archiveDir) && fs.statSync(archiveDir).isDirectory()) {
    const archivedItems = fs.readdirSync(archiveDir);
    for (const item of archivedItems) {
      const itemPath = path.join(archiveDir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        results.push(`archive/${item}`);
      }
    }
  }

  return results;
}

export async function getChangeDag(
  repoPath: string,
  changeName: string
): Promise<{ nodes: DagNode[]; edges: DagEdge[] }> {
  const resolvedPath = path.resolve(repoPath);
  const changeDir = path.join(resolvedPath, 'openspec', 'changes', changeName);

  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory not found: ${changeName}`);
  }

  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  // Track token sets for overlap matching
  const nodeTokensMap = new Map<string, Set<string>>();

  // 1. Parse proposal.md
  const proposalPath = path.join(changeDir, 'proposal.md');
  const capIds: string[] = [];
  let proposalFileExists = false;
  
  if (fs.existsSync(proposalPath)) {
    proposalFileExists = true;
    const content = fs.readFileSync(proposalPath, 'utf8');
    // Extract capabilities (lines starting with - under ## Capabilities or ### New Capabilities)
    const lines = content.split('\n');
    let inCapabilities = false;
    
    for (const line of lines) {
      if (line.match(/^##\s+Capabilities/) || line.match(/^###\s+New\s+Capabilities/)) {
        inCapabilities = true;
        continue;
      } else if (line.match(/^##\s+/) && inCapabilities) {
        inCapabilities = false;
      }

      if (inCapabilities) {
        // Match standard list items with backticks, bold, or plain text
        const capMatch = line.match(/^[-*+]\s*(?:`|\*\*)?([a-zA-Z0-9._/-]+)(?:`|\*\*)?(?:\s*[:—-]\s*|\s*$)/);
        if (capMatch) {
          const capName = capMatch[1].trim();
          if (capName && capName.toLowerCase() !== 'none' && capName.toLowerCase() !== '(none)') {
            const nodeId = makeId('proposal', capName);
            if (!nodes.some(n => n.id === nodeId)) {
              nodes.push({
                id: nodeId,
                label: capName,
                type: 'proposal'
              });
              capIds.push(capName);
              nodeTokensMap.set(nodeId, getTokens(capName));
            }
          }
        }
      }
    }
  }

  // Fallback: If proposal.md exists, but we parsed no capability nodes,
  // add a node representing proposal.md itself.
  if (proposalFileExists && capIds.length === 0) {
    const nodeId = 'proposal-doc';
    nodes.push({
      id: nodeId,
      label: 'proposal.md',
      type: 'proposal'
    });
    nodeTokensMap.set(nodeId, getTokens('proposal.md'));
  }

  // 2. Parse specs folder
  const specsDir = path.join(changeDir, 'specs');
  const reqMap = new Map<string, string[]>(); // capName -> reqNodeIds[]

  if (fs.existsSync(specsDir)) {
    const caps = fs.readdirSync(specsDir);
    for (const capName of caps) {
      const capPath = path.join(specsDir, capName);
      if (fs.statSync(capPath).isDirectory()) {
        const specFile = path.join(capPath, 'spec.md');
        if (fs.existsSync(specFile)) {
          const content = fs.readFileSync(specFile, 'utf8');
          const lines = content.split('\n');
          
          let currentReqId: string | null = null;
          const capNodeId = makeId('proposal', capName);

          for (const line of lines) {
            // Parse: ### Requirement: Verify Widget Display
            const reqMatch = line.match(/^###\s+Requirement:\s*(.+)$/i);
            if (reqMatch) {
              const reqLabel = reqMatch[1].trim();
              currentReqId = makeId('spec-req', reqLabel);
              nodes.push({
                id: currentReqId,
                label: reqLabel,
                type: 'spec-requirement',
                scenariosCount: 0
              });
              nodeTokensMap.set(currentReqId, getTokens(reqLabel));

              // Link to Capability
              if (capIds.includes(capName)) {
                edges.push({
                  source: capNodeId,
                  target: currentReqId
                });
              } else if (nodes.some(n => n.id === 'proposal-doc')) {
                edges.push({
                  source: 'proposal-doc',
                  target: currentReqId
                });
              }

              if (!reqMap.has(capName)) {
                reqMap.set(capName, []);
              }
              reqMap.get(capName)!.push(currentReqId);
            }

            // Parse: #### Scenario: Display successful
            const scMatch = line.match(/^####\s+Scenario:\s*(.+)$/i);
            if (scMatch && currentReqId) {
              const reqNode = nodes.find(n => n.id === currentReqId);
              if (reqNode) {
                reqNode.scenariosCount = (reqNode.scenariosCount || 0) + 1;
              }
            }
          }
        }
      }
    }
  }

  // 3. Parse design.md
  const designPath = path.join(changeDir, 'design.md');
  const designNodeIds: string[] = [];

  if (fs.existsSync(designPath)) {
    const content = fs.readFileSync(designPath, 'utf8');
    const lines = content.split('\n');

    let inDecisionsSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^##\s+(?:Design\s+)?Decisions/i)) {
        inDecisionsSection = true;
        continue;
      } else if (trimmed.match(/^##\s+/)) {
        inDecisionsSection = false;
      }

      if (!inDecisionsSection) {
        continue;
      }

      // Check for level 3 heading format first:
      // ### Decision 1: ... or ### D1 — ...
      const headingMatch = line.match(/^###\s+((?:Decision\s+\d+|Decision(?=\s*[:—–-]\s*)|D\d+)\s*[:—–-]?\s*.+)$/i);
      
      // Check for bold-prefix format:
      // **1. Slug-based...** or - **Decision 1: ...**
      const boldMatch = line.match(/^\s*(?:-\s+|\*\s+)?\*\*((?:Decision\s+\d+|Decision|D\d+|\d+)\s*[:.—–-]\s*.*?)\*\*/i);

      let decisionLabel: string | null = null;
      if (headingMatch) {
        decisionLabel = headingMatch[1].trim();
      } else if (boldMatch) {
        const rawLabel = boldMatch[1].trim();
        // If it's a plain number (e.g. "1. Slug-based"), prepend "Decision " to format it nicely
        if (rawLabel.match(/^\d+\./)) {
          decisionLabel = `Decision ${rawLabel}`;
        } else {
          decisionLabel = rawLabel;
        }
      }

      if (decisionLabel) {
        const nodeId = makeId('design-decision', decisionLabel);
        nodes.push({
          id: nodeId,
          label: decisionLabel,
          type: 'design-decision'
        });
        designNodeIds.push(nodeId);
        nodeTokensMap.set(nodeId, getTokens(decisionLabel));
      }
    }
  }

  // 4. Parse tasks.md
  const tasksPath = path.join(changeDir, 'tasks.md');
  const taskNodeIds: string[] = [];

  if (fs.existsSync(tasksPath)) {
    const content = fs.readFileSync(tasksPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Match checkboxes: - [ ] 1.1 Create database schema
      const taskMatch = line.match(/^-\s+\[([ xX]?)\]\s*(.+)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === 'x';
        const taskLabel = taskMatch[2].trim();
        
        const nodeId = makeId('task', taskLabel);
        nodes.push({
          id: nodeId,
          label: taskLabel,
          type: 'task',
          status: checked ? 'completed' : 'pending'
        });
        taskNodeIds.push(nodeId);
        nodeTokensMap.set(nodeId, getTokens(taskLabel));
      }
    }
  }

  // 5. Check if linkages.json exists
  const linkagesPath = path.join(changeDir, 'linkages.json');
  let hasExplicitLinkages = false;

  if (fs.existsSync(linkagesPath)) {
    try {
      const linkagesContent = fs.readFileSync(linkagesPath, 'utf8');
      const linkages = JSON.parse(linkagesContent);
      if (Array.isArray(linkages)) {
        hasExplicitLinkages = true;
        for (const link of linkages) {
          const sources = nodes.filter(n => n.label === link.source || n.id === link.source);
          const targets = nodes.filter(n => n.label === link.target || n.id === link.target);

          for (const srcNode of sources) {
            for (const tgtNode of targets) {
              edges.push({
                source: srcNode.id,
                target: tgtNode.id
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to parse linkages.json at ${linkagesPath}:`, err);
    }
  }

  // 6. Fallback to Jaccard similarity matching if explicit linkages are not present
  if (!hasExplicitLinkages) {
    // Connect Spec-Requirements <-> Design-Decisions via Jaccard Overlap
    const reqNodeIds = nodes.filter(n => n.type === 'spec-requirement').map(n => n.id);
    for (const reqId of reqNodeIds) {
      const reqTokens = nodeTokensMap.get(reqId) || new Set();
      
      for (const decId of designNodeIds) {
        const decTokens = nodeTokensMap.get(decId) || new Set();
        const similarity = getJaccardSimilarity(reqTokens, decTokens);
        
        if (similarity > 0.1) {
          edges.push({
            source: reqId,
            target: decId
          });
        }
      }
    }

    // Connect Design-Decisions <-> Tasks via Jaccard Overlap
    for (const decId of designNodeIds) {
      const decTokens = nodeTokensMap.get(decId) || new Set();
      
      for (const taskId of taskNodeIds) {
        const taskTokens = nodeTokensMap.get(taskId) || new Set();
        const similarity = getJaccardSimilarity(decTokens, taskTokens);
        
        if (similarity > 0.1) {
          edges.push({
            source: decId,
            target: taskId
          });
        }
      }
    }
  }

  return { nodes, edges };
}
