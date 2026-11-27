# Skill capability

[中文](../zh-CN/capabilities/skills.md)

Skills are locally discoverable instruction and tool bundles. Nexum validates a
Skill before exposing it and returns a safe summary suitable for a UI or
management command.

## Skill summary

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description`, `version` | Skill metadata |
| `digest` | Stable SHA-256 digest of relative files and content |
| `fileCount`, `files` | File count and relative file list |
| `status` | `ready`, `invalid`, or `conflict` |
| `diagnostics` | Safe validation messages without secrets or raw command output |
| `sourceType` | Currently `local-directory` |

## Registry lifecycle

The registry discovers configured roots, validates candidate files, registers a
ready Skill, and emits update events when the source changes. Invalid or
conflicting Skills remain visible with diagnostics and are not invoked.

## Use from a client

Use the Skill list/detail/validate/register/refresh routes exposed by Server or
the matching Client methods. A Surface can use the list for `@skill`
autocomplete, display diagnostics, and refresh after `skill.updated` without
waiting for the Server to load plugins first.

See [Application](../modules/nexum-application.md), [Client](../modules/nexum-client.md),
and [Events](events.md).
