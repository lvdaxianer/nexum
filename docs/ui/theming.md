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

The default dark palette exposes variables such as `--d-bg`, `--d-panel`,
`--d-border`, `--d-text`, `--d-muted`, `--d-accent`, `--d-success`,
`--d-warning`, and `--d-danger`. Override them at the host boundary rather than
editing the package stylesheet.

```css
:root {
  --d-bg: #0f151e;
  --d-panel: #151c26;
  --d-text: #e3eaf3;
  --d-accent: #35b8b2;
}
```

Respect `prefers-color-scheme` when the host follows the system theme and keep
contrast, focus, empty, loading, and error states visible. See [Chat Surface](../modules/nexum-chat-surface.md)
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
