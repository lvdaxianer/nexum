# Model and Runtime capability

[中文](../zh-CN/capabilities/model-runtime.md)

The Runtime combines a model, host capabilities, Persistence, permissions,
Skills, and the Coding Loop. The model provider is replaceable; the Runtime
keeps execution and recovery semantics stable.

## Configure a model and role

```ts
await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("You are a concise, reliable project assistant.")
```

`baseUrl` is the upstream model URL, `model` is its model name,
`credentialRef` identifies the backend credential source, and `rolePrompt` is
the Runtime-level system instruction. The user task is still supplied as the
Session `prompt.text`.

## Execution boundaries

One Coding Loop step is one explicit model stream. Tool calls, Permission,
Questions, retries, cancellation, and continuation are represented as runtime
events. The UI should consume those events instead of inferring state from
assistant text.

Common limits include:

| Option | Meaning |
| --- | --- |
| `modelTimeoutMs` | Maximum wait between model stream chunks |
| `toolTimeoutMs` | Maximum time for one tool execution |
| `runTimeoutMs` | Maximum duration of one run |
| `maxModelRetries` | Maximum retry count for retryable model failures |
| `retryDelayMs` / `maxRetryDelayMs` | Backoff base and ceiling |

When the context exceeds the model limit, the Runtime can compact history and
continue from the resulting summary. Read [Context and History](context-and-history.md)
and [Application](../modules/nexum-application.md) for composition options.

## Model errors and retries

Stable model error codes include `not_configured`, `authentication_failed`,
`network_error`, `timeout`, `rate_limited`, `upstream_error`,
`invalid_request`, `unavailable`, `context_overflow`, and `invalid_response`.
Network, timeout, rate-limit, upstream, and unavailable errors may be retried;
authentication, invalid-request, invalid-response, and not-configured errors
are not blindly repeated.

Each request publishes `model.attempt`. Before visible reasoning or text is
produced, a retryable transient error can use bounded exponential backoff and
the upstream `Retry-After` value. Once visible output exists, the Runtime does
not replay the same model step because doing so could duplicate text or tool
side effects. Cancellation aborts both the backoff and the request.

## Context overflow

When the provider reports `context_overflow`, the Runtime can invoke a
`ContextCompactionPort`, write a summary and retained recent messages to
canonical history, and retry the rebuilt request once. Compaction and retry are
different recovery paths and must not alternate forever.
