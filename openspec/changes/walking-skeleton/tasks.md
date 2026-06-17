## 1. Monorepo and Project Configuration

- [x] 1.1 Create root package.json with workspaces and root scripts
- [x] 1.2 Create base tsconfig.json in the root directory
- [x] 1.3 Initialize the server directory with package.json and tsconfig.json
- [x] 1.4 Initialize the client directory with Vite, React, TS, package.json, and tsconfig.json

## 2. Backend Implementation (TDD)

- [x] 2.1 Write repoService unit tests verifying directory status checks
- [x] 2.2 Implement repoService checking logic to satisfy the unit tests
- [x] 2.3 Write Express /api/status endpoint integration tests
- [x] 2.4 Implement GET /api/status Express server route

## 3. Frontend Implementation (TDD)

- [x] 3.1 Write frontend component tests for the path verification form
- [x] 3.2 Implement the React UI in App.tsx to select/input folder and fetch status
- [x] 3.3 Implement light-theme CSS styles in App.css following design system rules

## 4. End-to-End Tests and Verification

- [x] 4.1 Set up Playwright configuration at the root
- [x] 4.2 Write skeleton.spec.ts E2E test verifying full-system path checks
- [x] 4.3 Run E2E test suite in full-system mode to verify everything works
