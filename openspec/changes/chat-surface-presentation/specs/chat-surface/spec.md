# Spec Delta

## Purpose

提供一个遵守 Nexum Protocol、可由宿主传入 Session ID 直接使用的完整聊天 Surface，使同一套聊天能力能够独立运行或嵌入页面、弹框和 Drawer。

## ADDED Requirements

### Requirement: ChatSurface SHALL render with a conversation-first layout

ChatSurface SHALL present a conversation-first default visual UI: a compact header, a toolbar combining view tabs with a single run-status cluster (context status and Session status), turn-structured messages where assistant turns carry an identity rail, card-styled execution rows, and a rounded composer. Session status SHALL appear exactly once in the chrome.

#### Scenario: Inspect chrome on an idle session

- **WHEN** the host mounts ChatSurface on a Session in any status
- **THEN** the toolbar shows view tabs and one status cluster with the context status and the Session status, and no other chrome area repeats the Session status text

#### Scenario: Identify speakers while scrolling

- **WHEN** the conversation contains user and assistant messages
- **THEN** assistant turns render with an identity rail and a turn label, and user turns render as right-aligned bubbles, so speakers remain distinguishable without relying on message content alone

### Requirement: ChatSurface SHALL expose a token-based theming contract

All colors, radii and font steps used by the default visual UI SHALL be defined through `--nexum-chat-*` CSS custom properties, with no hard-coded color values in component styles. The component SHALL provide a built-in dark theme that activates when the host sets `data-theme="dark"` on the component root, and the host SHALL be able to override any subset of tokens for custom branding.

#### Scenario: Switch to the built-in dark theme

- **WHEN** the host sets `data-theme="dark"` on the component root (or `theme="dark"` on the Web Component)
- **THEN** every rendered area, including messages, cards, request panels and the composer, renders with the dark token set without visual regressions such as unreadable text or light-only surfaces

#### Scenario: Override brand colors

- **WHEN** the host overrides a subset of `--nexum-chat-*` tokens on the component
- **THEN** the affected visual elements adopt the overridden values and untouched elements keep the defaults

### Requirement: ChatSurface SHALL adapt to container widths and input modalities

The component's internal breakpoints SHALL follow the width of its own container rather than the viewport, SHALL cover at least a wide tier, a tablet tier, a compact phone tier and an ultra-narrow tier, and SHALL enlarge interactive targets for coarse pointers. The conversation, requests and composer SHALL remain fully operable at every tier.

#### Scenario: Embed in a narrow drawer

- **WHEN** the host places ChatSurface in a container no wider than 480px
- **THEN** the status cluster collapses to the Session status pill, execution rows wrap their description, request actions stack full-width, and the composer hint shortens, with no horizontal overflow

#### Scenario: Operate with touch on a tablet

- **WHEN** the component renders on a coarse-pointer device such as a tablet
- **THEN** buttons, tabs, request actions and fold headers present touch targets of at least 44px while the wide-tier layout is preserved

### Requirement: ChatSurface SHALL expose permission-settings extension points

ChatSurface SHALL provide optional extension points through which the host surfaces its permission policy UI: a composer-adjacent slot next to the send control and a permission-settings trigger in permission request bars. When the host provides no extension, the entry points SHALL NOT render and chat behavior SHALL be unchanged.

#### Scenario: Host wires its policy UI

- **WHEN** the host supplies the composer slot and/or handles the component's permission-settings event
- **THEN** activating either entry invokes the host handler so the host can present its permission policy UI

#### Scenario: Host provides nothing

- **WHEN** the host does not supply the slot or handle the event
- **THEN** the entries are absent, the composer and request bars render without them, and all chat interactions behave as before

### Requirement: ChatSurface SHALL present the reasoning process as a lifecycle

Reasoning output SHALL render as a lifecycle panel inside its owning turn: an awaiting placeholder while no reasoning text has arrived, a live streaming state with visible character count and preview while reasoning streams, and a collapsible summary (character count, elapsed time, timestamp) once complete. The panel SHALL NOT render when a run produced no reasoning content.

#### Scenario: Watch reasoning while it streams

- **WHEN** reasoning events arrive for the active run
- **THEN** the panel shows a live indicator with a growing character count and a scrolling preview, and collapses automatically once reasoning completes

#### Scenario: Review completed reasoning

- **WHEN** the user expands a completed reasoning panel
- **THEN** the full reasoning text is visible with line breaks preserved, and the component does not auto-collapse it again afterwards

#### Scenario: Run without reasoning content

- **WHEN** a run completes without any reasoning event
- **THEN** no reasoning panel is rendered for that turn
