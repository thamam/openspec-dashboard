## 1. Backend Implementation

- [x] 1.1 Implement change config writing utility in repoService.ts to write agentProvider setting
- [x] 1.2 Add POST /api/changes/:change/provider endpoint in server/src/app.ts to persist the provider
- [x] 1.3 Update GET /api/artifacts in server/src/app.ts to read and return the configured agentProvider

## 2. Frontend Implementation

- [x] 2.1 Add Agent Provider select dropdown UI to CommandCenter sidebar component
- [x] 2.2 Wire up local state and change handler in App.tsx to load and POST active provider values
- [x] 2.3 Verify styling and dropdown positioning fits properly into the dark/light design systems

## 3. Integration & Testing

- [x] 3.1 Write unit tests for the new persistence API endpoint in api.test.ts
- [x] 3.2 Add E2E test verifying provider dropdown updates config file dynamically
