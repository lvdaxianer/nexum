# Design

SQLite remains the default Web/Test persistence adapter. `NexumSessionService` performs ownership and status checks, then delegates the complete delete to an optional persistence callback. The SQLite composition implements that callback with one synchronous SQLite transaction. Other adapters do not implement it and retain their existing ordered cleanup behavior.

The database layer sets `PRAGMA user_version` through a small migration dispatcher. Existing version `0` databases are upgraded to version `1`; versions greater than `1` fail closed. Generic record reads use a fixed `MAX_RECORD_ROWS` guard and query one extra row so an oversized namespace is rejected without returning partial data.
