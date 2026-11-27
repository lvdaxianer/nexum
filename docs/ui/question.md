# Question protocol

[中文](../zh-CN/ui/question.md)

Questions pause a run until the user supplies structured information. A
Question belongs to one Session and one tool call, and answers must preserve the
question order.

## Request fields

| Field | Meaning |
| --- | --- |
| `id` | Request ID used for reply or cancellation |
| `sessionID` | Owning Session |
| `toolCallID` | Tool call that produced the Question |
| `questions` | Ordered question list |
| `questions[].header` | Short label |
| `questions[].question` | User-facing question |
| `questions[].options` | Options with `label` and `description` |
| `questions[].multiple` | Whether multiple answers are allowed |

## Flow

1. Discover a pending Question from `session.state()` or `question.request`.
2. Render the options and keep the request ID.
3. Submit a two-dimensional string array of answers.
4. Observe the next events; cancel only when the user explicitly cancels.

Invalid answer shape, a stale request, or a Session mismatch is a protocol
error. Refresh state and stop using the old card. See [interaction protocol](interaction-protocol.md),
[UI states](states.md), and the [Runtime API](../../apis/nexum.md).
