## ADDED Requirements

### Requirement: SQLite 数据库必须使用私有文件边界
SQLite persistence MUST create or tighten its data directory to owner-only access and MUST keep the database and existing WAL sidecar files owner-readable and owner-writable only.

#### Scenario: Open a persistent database
- **WHEN** the SQLite adapter opens a file-backed database
- **THEN** the parent data directory is `0700` and the database file is `0600`

### Requirement: SQLite schema version必须可验证
SQLite persistence MUST record a supported schema version and MUST reject a database whose version is newer than the adapter understands.

#### Scenario: Open a supported database
- **WHEN** the database has no version or the current supported version
- **THEN** the adapter initializes or continues with the current schema version

#### Scenario: Open a future database
- **WHEN** the database declares a newer schema version
- **THEN** opening fails before the runtime serves requests

### Requirement: SQLite record reads must be bounded
The generic SQLite record reader MUST reject a namespace whose row count exceeds its configured safety bound instead of materializing an unbounded result set.

#### Scenario: Read an oversized namespace
- **WHEN** a namespace contains more records than the safety bound
- **THEN** the read fails with a stable persistence error and does not return a partial list

### Requirement: SQLite Session deletion must be atomic
The SQLite adapter MUST delete a Session, its canonical messages, interactions, and events in one transaction.

#### Scenario: Delete a persisted Session
- **WHEN** the SessionService has verified that the Session exists and is not running
- **THEN** all related records are removed atomically

#### Scenario: Related deletion fails
- **WHEN** any part of the SQLite delete transaction fails
- **THEN** the database keeps the pre-delete records and the caller receives a failure
