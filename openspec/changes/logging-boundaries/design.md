# Design

`NexumLogger` is a small server-internal port. Its default sink writes JSON Lines to stderr; tests can inject a sink without mocking global console APIs. `AsyncLocalStorage` carries the request trace ID. The logger normalizes exceptions, applies the existing core redaction utility recursively, and truncates strings and arrays before serialization.
