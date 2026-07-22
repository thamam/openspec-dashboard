## 1. Codex Provider Implementation

- [ ] 1.1 Create server/src/agents/providers/CodexProvider.ts implementing IAgentProvider interface
- [ ] 1.2 Implement executeLifecycle in CodexProvider to spawn codex CLI command in detached tmux session
- [ ] 1.3 Implement executeTask in CodexProvider to spawn codex CLI command with task context in detached tmux session
- [ ] 1.4 Ensure codex CLI commands execute with --dangerously-bypass-approvals-and-sandbox flag

## 2. Dynamic Provider Resolution

- [ ] 2.1 Import CodexProvider and resolve it for value 'codex' in server/src/agents/ProviderResolver.ts
- [ ] 2.2 Add unit tests to server/tests/providerResolver.test.ts to verify CodexProvider resolution

## 3. Frontend UI Option Additions

- [ ] 3.1 Update client/src/components/CommandCenter/index.tsx to include Codex in AGENT PROVIDER dropdown
- [ ] 3.2 Update client/src/components/CreateChangeForm.tsx to include Codex in AI Propose Engine dropdown
