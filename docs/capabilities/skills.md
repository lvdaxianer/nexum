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

## Registration lifecycle

Application combines a local Skill source with the Persistence registry:

```text
configured roots / registered address
  → scan and validate SKILL.md
  → aggregate candidates and detect duplicates
  → persist address, digest, status, and diagnostics
  → expose a safe summary to Server and Client
```

Registering the same normalized address is idempotent. Unregistering removes
the registry entry but does not delete the source directory. A duplicate ID is
reported as `conflict`; an invalid or conflicting Skill cannot be activated.

## Explicit activation

When a user writes `@<skill-id>` in a Prompt, the Runtime preserves mention
positions, keeps the first occurrence of duplicate IDs, looks up the safe
registry summary, and checks that the status is `ready`. Each Skill then passes
through a `skill.use` Permission request. After approval, `SKILL.md` becomes a
temporary system message for the current model run and the Runtime emits
`skill.activated` or `skill.failed`.

Skill source text is not copied into ordinary canonical history. Shell, file,
and external calls made by a Skill still use the normal Tool and Permission
boundaries; a Skill cannot bypass the host sandbox.

## UI behavior

A Surface can use the list for `@` autocomplete, show validation diagnostics,
and refresh after `skill.updated`. It should show `invalid` and `conflict`
items as actionable diagnostics rather than as ready-to-run Skills.
