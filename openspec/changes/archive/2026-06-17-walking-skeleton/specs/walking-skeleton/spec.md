## ADDED Requirements

### Requirement: Verify Local Repository Status
The system SHALL accept a directory path, check if it exists on the local filesystem, verify whether it is a git repository, and check whether it has OpenSpec initialized.

#### Scenario: Path is a git repository with OpenSpec
- **WHEN** the user inputs a valid directory path that contains both a git repository and an OpenSpec configuration
- **THEN** the system SHALL display "Git: Initialized" and "OpenSpec: Initialized"

#### Scenario: Path is a git repository without OpenSpec
- **WHEN** the user inputs a valid directory path that contains a git repository but no OpenSpec configuration
- **THEN** the system SHALL display "Git: Initialized" and "OpenSpec: Not Initialized"

#### Scenario: Path is not a git repository
- **WHEN** the user inputs a valid directory path that is not a git repository
- **THEN** the system SHALL display "Git: Not Initialized" and "OpenSpec: Not Initialized"

#### Scenario: Path does not exist
- **WHEN** the user inputs a directory path that does not exist on the filesystem
- **THEN** the system SHALL display a clear error message stating the directory was not found
