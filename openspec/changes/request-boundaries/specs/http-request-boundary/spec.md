## ADDED Requirements

### Requirement: JSON 请求体必须有统一字节上限
Nexum Server MUST reject JSON request bodies larger than the configured byte limit before handing the parsed value to route logic.

#### Scenario: Submit an oversized JSON body
- **WHEN** a client sends a JSON body larger than the limit
- **THEN** the endpoint returns the stable invalid-request response and does not invoke the business operation

### Requirement: Content-Length 不能绕过实际读取限制
The request reader MUST enforce the byte limit on the actual UTF-8 body even when `Content-Length` is absent or inaccurate.

#### Scenario: Stream a body without a reliable length
- **WHEN** the body exceeds the limit while being read
- **THEN** parsing stops at the boundary and the request is rejected without unbounded buffering
