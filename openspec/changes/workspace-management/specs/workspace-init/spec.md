## ADDED Requirements

### Requirement: Initialize OpenSpec in Target Folder
The system SHALL support initializing OpenSpec in a directory that is currently a git repository but does not have OpenSpec set up.

#### Scenario: Successful OpenSpec initialization
- **WHEN** the user requests OpenSpec initialization for a verified git repository path
- **THEN** the system SHALL execute the initialization command and return a success message

#### Scenario: Initialization fails when path is not a git repository
- **WHEN** the user requests OpenSpec initialization for a path that is not a git repository
- **THEN** the system SHALL return a bad request error and refuse to initialize
