## 1. Codex Provider Implementation

- [x] 1.1 Create server/src/agents/providers/CodexProvider.ts implementing IAgentProvider interface
- [x] 1.2 Implement executeLifecycle in CodexProvider to spawn codex CLI command in detached tmux session
- [x] 1.3 Implement executeTask in CodexProvider to spawn codex CLI command with task context in detached tmux session
- [x] 1.4 Ensure codex CLI commands execute with `--ask-for-approval never --sandbox workspace-write` (least-privilege auto-approval)

## 2. Dynamic Provider Resolution

- [x] 2.1 Import CodexProvider and resolve it for value 'codex' in server/src/agents/ProviderResolver.ts
- [x] 2.2 Make Codex the default fallback in ProviderResolver.ts (config → env → codex), keeping Anti-Gravity and Claude explicitly selectable
- [x] 2.3 Update server/tests/providerResolver.test.ts: expect Codex as the default and add an explicit Anti-Gravity selection test

## 3. Frontend UI Option Additions

- [x] 3.1 Update client/src/components/CommandCenter/index.tsx to include Codex in the Agent Provider dropdown
- [x] 3.2 Update client/src/components/CreateChangeForm.tsx to include Codex in the AI Propose Engine dropdown
- [x] 3.3 Default the client provider selection to `codex` (agentProvider in App.tsx, proposeEngine in CreateChangeForm) to match the server default
