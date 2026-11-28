# Spec Delta

## MODIFIED Requirements

### Requirement: ChatSurface SHALL expose a stable embeddable UI contract

ChatSurface SHALL provide a complete default visual UI through both the Solid component API and a Web Component wrapper. The wrapper SHALL use light DOM and CSS variables or equivalent host styling hooks so the host can control size, placement and theme without replacing chat behavior. ChatSurface SHALL expose an optional typed status callback for the host; when a run reaches completed, failed or cancelled, the callback SHALL report the controlled Session ID and terminal status while retaining the result in the conversation view. ChatSurface SHALL expose an optional `showHeader` setting that defaults to true; when it is false, the component SHALL omit its own title header without changing chat behavior. The composer SHALL keep its controls operable in narrow containers by allowing the information and action areas to occupy separate rows rather than clipping or hiding controls.

#### Scenario: Embed in a modal

- **WHEN** the host places `<nexum-chat>` inside a modal and provides a Session ID
- **THEN** the component renders the same history, composer, Permission, Question, Skill and run interactions within the modal bounds

#### Scenario: Host observes terminal state

- **WHEN** a run completes, fails or is cancelled
- **THEN** the component emits the terminal status callback and retains the result in the conversation view

#### Scenario: Hide the component header

- **WHEN** the host passes `showHeader={false}` while a title is available
- **THEN** ChatSurface omits the title header and keeps the message area, composer and status footer usable

#### Scenario: Preserve the default header

- **WHEN** the host omits `showHeader` and provides a title
- **THEN** ChatSurface renders the title header as before

#### Scenario: Use ChatSurface in a narrow container

- **WHEN** the host places ChatSurface in a container narrower than the desktop composer layout
- **THEN** the composer presents its information and action areas on separate responsive rows, keeps upload and send controls visible, and allows the action row to wrap without horizontal clipping

#### Scenario: Configure the Web Component header

- **WHEN** the host sets `show-header="false"` on `<nexum-chat>`
- **THEN** the Web Component passes the false value to ChatSurface and omits the title header
