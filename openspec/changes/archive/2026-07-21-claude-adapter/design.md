## Context

Currently, the OpenSpec dashboard server is hardcoded to support only the local `AntiGravityProvider` (using the `agy` CLI tool) for task execution and interactive agent session launching. To support developers using the Claude Code toolchain, we need to introduce a dedicated `ClaudeProvider` implementing the `IAgentProvider` interface and add support for dynamic provider resolution to make the dashboard backend provider-agnostic.

## Goals / Non-Goals

**Goals:**
* Implement the `ClaudeProvider` class adhering to the `IAgentProvider` interface.
* Implement process spawning logic to delegate execution to the `claude` CLI.
* Support dynamic selection and configuration of the active agent provider in the dashboard server.
* Ensure backward compatibility such that the server defaults to `AntiGravityProvider` if no configuration is present.

**Non-Goals:**
* Providing a GUI settings interface to change the provider interactively.
* Supporting providers other than AntiGravity and Claude Code in this change.

## Decisions

### Decision 1: Interactive Execution via TMUX

* **Choice:** Spawn agent-involved lifecycle commands and task executions inside a detached `tmux` session by default, configuring the `claude` CLI to start in auto mode via `--permission-mode auto` (e.g., `tmux new-session -d -s <session_name> 'claude --permission-mode auto ...'`).
* **Rationale:** Spawning interactive agent CLIs (like `claude` or `agy`) in a standard non-TTY background child process causes them to fail or hang on user prompts (such as permission approvals, credentials verification, or asking clarification questions). Running them within a detached `tmux` session provides a pseudo-TTY environment, ensuring they execute properly. Configured with `--permission-mode auto`, the `claude` CLI will autonomously approve lower-risk actions (like file reads) while reserving user prompting for higher-risk operations (which the user can interactively answer by attaching to the session with `tmux attach -t <session_name>`). This approach is highly robust and compatible across diverse agent CLI tools (e.g., `claude`, `agy`, or future providers).
* **Alternatives considered:** Running `claude` in non-interactive print mode (`claude -p` or `--permission-mode bypassPermissions`). Discarded because it fails silently if the agent encounters interactive questions or permission barriers, and it lacks compatibility with agent CLIs that do not support standard print/bypass modes.

### Decision 2: Dynamic Provider Resolution

* **Choice:** Resolve the active provider by reading either the `agentProvider` field in the change configuration `.openspec.yaml` or falling back to the `AGENT_PROVIDER` environment variable (defaulting to `antigravity`).
* **Rationale:** Keeps configuration file-driven and environment-driven, enabling developers to configure settings per change or globally across the dashboard server.
* **Alternatives considered:** Registering provider state in database, which introduces database schema migration complexity.

### Decision 3: Provider-Specific Session Spawning

* **Choice:** Move session spawning logic out of `openspecController.ts` and delegate it to the active provider implementation. For `claude`, the provider will spawn a tmux session using the command format: `claude "Please follow the workflow instructions in .agent/workflows/opsx-continue.md to continue change claude-adapter"` or similar. For `antigravity`, it will spawn `agy -i '/<command> <args>'`.
* **Rationale:** Decouples the controller from provider-specific CLI syntaxes and arguments, maintaining a clean, model-agnostic dashboard backend architecture.
* **Alternatives considered:** Hardcoding the provider CLI options in the controller. This violates the open-closed principle and prevents easily adding third-party providers.

## Risks / Trade-offs

* **[Risk: Claude CLI not installed or not in PATH]** &rarr; **Mitigation:** Verify `claude` CLI availability on server startup or when resolving the provider, and return a clean HTTP 500 error code with instructions on how to install it.
* **[Risk: TMUX utility not installed in environment]** &rarr; **Mitigation:** Document TMUX as a server runtime dependency. Add a check during server initialization or command run to ensure `tmux` is available on the system.

## Migration Plan

* No database schema migrations are necessary.
* Add support for the `agentProvider` property in `.openspec.yaml`.
* Document the optional `AGENT_PROVIDER` environment variable.

## Open Questions

* Should the server attempt to automatically configure or authenticate Claude Code? (Recommendation: No, this must be handled out-of-band by the developer).
