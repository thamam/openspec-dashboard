import fs from 'fs';
import path from 'path';
import { IAgentProvider } from './AgentProvider.js';
import { AntiGravityProvider } from './providers/AntiGravityProvider.js';
import { ClaudeProvider } from './providers/ClaudeProvider.js';
import { CodexProvider } from './providers/CodexProvider.js';
import { isSafeName } from '../utils/paths.js';
import { parseChangeConfig } from '../utils/yamlConfig.js';

export function resolveProvider(workspacePath: string, changeName?: string): IAgentProvider {
  // Precedence: change config (.openspec.yaml) -> AGENT_PROVIDER env -> default (codex).
  let providerType: string | undefined;

  // 1. Resolve from change config (.openspec.yaml). S6: changeName is joined
  // into the config path — a traversal value ('../../x') would read a config
  // outside the workspace, so unsafe names skip the per-change config entirely
  // and fall through to env/default.
  if (changeName && isSafeName(changeName)) {
    const configPath = path.join(workspacePath, 'openspec', 'changes', changeName, '.openspec.yaml');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const config = parseChangeConfig(content);
        if (config.agentProvider) {
          providerType = config.agentProvider;
        }
      } catch (err) {
        console.error(`Failed to read config at ${configPath}:`, err);
      }
    }
  }

  // 2. Resolve from environment if not specified in change config
  if (!providerType && process.env.AGENT_PROVIDER) {
    providerType = process.env.AGENT_PROVIDER;
  }

  // 3. Default to Codex when nothing is configured
  if (!providerType) {
    providerType = 'codex';
  }

  // 4. Instantiate resolved provider (Anti-Gravity and Claude remain explicitly selectable)
  switch (providerType.toLowerCase()) {
    case 'claude':
      return new ClaudeProvider();
    case 'antigravity':
      return new AntiGravityProvider();
    case 'codex':
    default:
      return new CodexProvider();
  }
}
