## Why

We want to build a headless agentic integration for the OpenSpec Dashboard. This allows developers or scripts to run audits, check statuses, and interrogate requirements directly from the CLI or natively via an MCP (Model Context Protocol) server.

## What Changes

- Add a new `cli` workspace containing the OpenSpec CLI and MCP Server wrapper.
- Update root `package.json` to configure workspace linkages and dev/build scripts.
- Update `server/src/services/dagService.ts` to automatically persist complexity index and linter warnings back to change directories as version-controlled JSON artifacts.

## Capabilities

### New Capabilities
- `cli-mcp`: Exposes status, linting, complexity index, and active interrogation via CLI commands and stdio MCP server tools.

### Modified Capabilities
- `dag-linkage`: Automatically persist calculated complexity and linter warnings to change directory when parsing DAG.

## Impact

- `server/src/services/dagService.ts`
- Root `package.json`
- New `cli` directory and workspace
