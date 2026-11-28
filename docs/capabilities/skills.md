# Skill capability

[中文](../zh-CN/capabilities/skills.md)

Skills are locally discoverable instruction and tool bundles. Nexum validates a
Skill before exposing it and returns a safe summary suitable for a UI or
management command. The standalone service scans the current working
directory's `skills/` root at startup by default.

## Skill summary

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description`, `version` | Skill metadata |
| `digest` | Stable SHA-256 digest of relative files and content |
| `fileCount`, `files` | File count and relative file list |
| `status` | `ready`, `invalid`, or `conflict` |
| `diagnostics` | Safe validation messages without secrets or raw command output |
| `sourceType` | Currently `local-directory` |
| `sourceKind` | `builtin` for a configured root child, `registered` for an external address |

## Registry lifecycle

The registry discovers configured roots at startup, validates candidate files,
persists the discovered source metadata, and restores those addresses on later
starts. Invalid or conflicting Skills remain visible with diagnostics and are
not invoked.

## Use from a client

Use the Skill list/detail/validate/register/refresh/unregister/remove routes exposed by Server or
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

Registering the same normalized address is idempotent. A configured root child
is a `builtin` Skill; an address registered outside those roots is a
`registered` Skill. Unregistering removes only a `registered` registry entry
and never deletes its source directory. A `builtin` Skill must be removed with
the dedicated operation, which only deletes a real direct-child directory of a
configured root. A duplicate ID is reported as `conflict`; an invalid or
conflicting Skill cannot be activated.

The default standalone service root is `./skills`, with one Skill per direct
child directory. A host product can pass other roots through `skillRoots` when
it creates the Runtime. A directory added after startup is not watched or
discovered automatically; the owning product should call the address-based
register operation:

```http
POST /api/nexum/skills/register
Content-Type: application/json

{ "address": "/path/to/skill" }
```

Registration records the source address and safe metadata. Nexum does not copy,
move, or modify external source files; removing a built-in explicitly deletes
its configured-root child directory.

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
items as actionable diagnostics rather than as ready-to-run Skills, label
`builtin` entries with source deletion and `registered` entries with
unregistration, and keep the row actionable when a destructive request fails.
