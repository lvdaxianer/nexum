# Styling and theming

[中文](../zh-CN/ui/theming.md)

Chat Surface uses CSS that can be embedded in a responsive host application.
Keep layout responsibility in the host and component styles scoped to the
Surface.

## Responsive layout

Prefer container queries for component layout and media queries for host-level
breakpoints. Keep the message list, input, Permission, and Question controls
usable at narrow widths; do not rely on a fixed desktop panel width.

## Theme variables

ChatSurface supports an explicit component-local theme. Pass `theme="light"`
or `theme="dark"` when the host must not follow its own or the system color
scheme:

```tsx
<ChatSurface theme="light" sessionID={sessionID} />
<ChatSurface theme="dark" sessionID={sessionID} />
```

The selected theme is scoped to the component root and does not modify the
host document. If `theme` is omitted, the component uses its default light
palette. Hosts may still override `--nexum-chat-*` variables when they need a
custom palette, but the explicit light/dark contract is the recommended way to
avoid accidental darkening from global selectors.

See [Chat Surface](../modules/nexum-chat-surface.md)
and [UI states](states.md).

## Container and host responsibilities

The Chat Surface should size itself from its container rather than assuming a
fixed desktop width. The host owns page-level breakpoints, navigation, and the
placement of the Session list; the component owns message, input, Permission,
and Question layout inside its container.

## Custom themes and validation

Override theme variables at the host boundary and keep both dark and light
states readable. Validate narrow and wide containers, system-theme changes,
keyboard focus, empty/loading/error states, streaming text, long tool output,
and Permission/Question cards. Do not edit package CSS to solve a host layout
problem; use the documented variables and wrapper styles.
