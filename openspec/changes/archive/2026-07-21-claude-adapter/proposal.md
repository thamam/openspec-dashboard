## Why

The OpenSpec dashboard currently only supports the local AntiGravity agent provider (via `AntiGravityProvider`), which wraps the `agy` CLI tool. To make the dashboard model-agnostic and extend its support to developers who use the Claude Code toolchain, we need to add a dedicated provider that supports running tasks and workflows using the `claude` CLI.

## What Changes

- Implement a new `ClaudeProvider` class that adheres to the `IAgentProvider` interface.
- Implement process-spawning logic to delegate task execution to the `claude` CLI.
- Implement process-spawning logic to delegate lifecycle commands to the `claude` CLI.
- Introduce dynamic provider resolution in the dashboard server so that the agent backend can be selected or configured.

## Capabilities

### New Capabilities
- `claude-provider`: Adds support for running lifecycle operations and code implementation tasks via the `claude` CLI, implementing the `IAgentProvider` interface.

### Modified Capabilities

## Impact

- Spawning logic and child processes on the server.
- The server will require the `claude` CLI tool to be installed and available in the environment's `PATH` when this provider is selected.
