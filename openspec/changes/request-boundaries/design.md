# Design

The server uses a single `readJsonRequest` helper. It checks a numeric `Content-Length` when present, reads at most `MAX_JSON_BODY_BYTES + 1` bytes through a `ReadableStream` reader, and parses only a body within the limit. Route handlers keep their existing `undefined`/empty-object fallback so public error contracts remain unchanged.
