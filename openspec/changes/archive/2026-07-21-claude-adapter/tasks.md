## 1. Provider Implementations

- [x] 1.1 Create ClaudeProvider implementing IAgentProvider with tmux spawning and --permission-mode auto
- [x] 1.2 Refactor AntiGravityProvider to handle tmux session spawning internally for lifecycle execution

## 2. Dynamic Selection

- [x] 2.1 Implement provider resolution service reading .openspec.yaml config and AGENT_PROVIDER environment variable
- [x] 2.2 Refactor openspecController.ts to resolve the active provider and delegate command execution to it

## 3. Integration & Verification

- [x] 3.1 Verify dynamic provider resolution works with environment variable and config files
- [x] 3.2 Verify fallback to AntiGravityProvider is preserved by default
