# Mobile controls and settings handoff

## Purpose and status

This document captures the mobile-controls discovery discussion for a new
GPT-5.6 Terra session using medium reasoning. No implementation has started.
The user selected floating joystick first, joystick-distance hurry, pausing while
settings is open, pausing in portrait on mobile, and excluding mobile editor work.
The final combined summary was presented; the user's next request was to write
this handoff. This document does not itself authorize implementation. A new user
message asking to implement this handoff supplies that authorization.

## Intended experience

Make the existing browser game playable on phones using a floating joystick and
a separate Honk button, while preserving desktop keyboard and gamepad controls.
Provide a small settings menu that can later expose additional control styles.

### Controls

- Floating joystick is the only movement style implemented in this first version.
- A touch beginning in the movement area anchors the joystick under that thumb.
  The anchor stays fixed through that gesture; releasing stops movement and hides
  the joystick. Keep the activation area away from menus and unsafe screen edges.
- Pushing farther from the anchor activates hurry. Use separate enter/exit
  thresholds (hysteresis) to prevent flickering near the boundary. Choose and
  document sensible initial distances after checking the existing movement rules.
- Honk has a separate large button. Movement and honking must work simultaneously;
  a held button must not repeatedly enqueue honks. Preserve existing honk-edge
  handling across render frames and simulation steps.
- Track fingers independently. Cancellation, lost capture, pause, switching modes,
  and app interruption must clear held movement/actions without stuck input.
- Preserve keyboard and gamepad behavior and camera-relative movement.
- Keep control styles replaceable behind a small shared command-producing
  interface. Floating and future fixed joysticks should reuse suitable logic.
  A future tap-to-move adapter can use the same command boundary, but obstacle
  navigation is separate future work. Do not implement those two styles now or
  offer nonfunctional choices in the menu.

### Settings and device behavior

- Add settings accessible during play, styled with the existing HUD palette.
- Proposed initial setting: touch controls Auto / Show / Hide. Auto uses input
  capabilities and actual interaction where appropriate, rather than screen
  width or user-agent identity alone. Retain keyboard/gamepad support on hybrids.
- Save preferences locally with validation, versioning as appropriate, and a
  graceful fallback when browser storage is unavailable. This is not a game save.
- Opening settings pauses gameplay and clears input. Closing settings requires
  fresh input; a dismissal gesture must not also move or honk.
- Pause reasons must compose: closing settings cannot resume a hidden/background
  game, and returning to landscape cannot resume while settings remains open.
- On mobile gameplay, portrait pauses and shows a rotate-to-landscape message.
  Returning to landscape clears old gestures and resumes only if no other pause
  reason remains. A tall desktop browser window should not automatically become
  subject to a phone-only restriction. Define and document a sensible device policy;
  include tablets/hybrid devices in verification rather than assuming width alone
  identifies a phone. Changing touch visibility must not accidentally bypass the
  intended mobile orientation policy.
- Preserve progress on pause, rotation, fullscreen changes, and app switching.
- Mobile editor support is out of scope. Do not add gameplay touch overlays to
  editor or overview modes or alter their existing controls.

### Fullscreen

- Provide an enter/exit fullscreen action where supported, including desktop.
- Landscape rotation automatically relays out the game and controls. It cannot
  reliably enter browser fullscreen by itself: requestFullscreen requires transient
  user activation. Offer a small Play fullscreen action in landscape instead.
- Fullscreen the containing game UI so controls, settings, and overlays remain
  visible. Keep the displayed state synchronized with actual browser state.
- Rejected/unsupported fullscreen requests must leave normal play working. Do not
  repeatedly request fullscreen after dismissal, exit, or refusal.
- Recompute layout safely on rotation, browser viewport changes, and fullscreen
  transitions; account for safe-area insets and mobile browser chrome.
- Home Screen web-app installation is a possible later enhancement, not part of
  this implementation. Do not claim universal mobile fullscreen support.

References checked during discovery:

- https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
- https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/

## Repository constraints and entry points

Read AGENTS.md, docs/game-architecture.md, and README.md before implementation.
Work only in the active src/ browser game. Preserve the existing cel-shaded art
direction, shared palette, fixed simulation step, objective progress, and command
boundary. DOM, Three.js, and audio do not belong in simulation rules.

The working tree contains substantial unrelated edits and untracked assets from
other work. Inspect current status, preserve those changes, and reread the current
files: do not assume this handoff is a complete snapshot or revert existing work.

Relevant entry points inspected during discovery:

- src/game/InputController.ts: keyboard/gamepad sampling, movement, hurry, honk
  edges, device callbacks, and input clearing.
- src/game/Game.ts: maps input to camera-relative world commands, advances the
  simulation, handles focus/visibility pause, HUD hints, and resizing. Existing
  pause behavior needs coordinated reasons rather than competing boolean setters.
- src/game/GameAudio.ts: audio unlocking and pause behavior; verify touch still
  unlocks sound appropriately.
- src/game/simulation/: existing command resolution and fixed-step state. New
  browser input should feed these rules rather than duplicate them.
- index.html and src/style.css: HUD, viewport metadata, responsive layout, and
  touch behavior. Existing viewport includes viewport-fit=cover.
- tests/simulation.test.ts and package.json: headless regression coverage and
  npm test / npm run build commands.

## Suggested implementation sequence

1. Inspect the current input, simulation, pause, and UI wiring and existing tests.
2. Factor only the small shared input/state boundaries needed for floating touch
   input and future movement styles. Keep gesture calculations independently
   testable without a browser or Three.js where practical.
3. Add floating joystick, hurry hysteresis, and multitouch honk through existing
   commands, with complete gesture cleanup.
4. Add settings, preference handling, device policy, and composed pause reasons.
5. Add fullscreen capability/error handling and responsive safe-area layout.
6. Add behavioral regressions, run required checks, and verify browser/mobile UX.
   Update user-facing controls documentation to match actual implementation.

## Acceptance and verification

- Joystick anchors at the initial valid touch, has a forgiving dead zone, preserves
  existing speed limits, and stops immediately on release/cancellation.
- Hurry enters/exits at stable distinct thresholds; simultaneous honk and movement
  work, and honk edges are consumed exactly once by the existing gameplay loop.
- Pointer cancellation, lost capture, app switching, and rotation never leave
  movement or actions held or replay stale actions after resume.
- Portrait pauses mobile gameplay. Progress survives rotation, and landscape does
  not override settings/background pause. Desktop portrait-shaped windows remain
  usable under the documented device policy.
- Settings pauses; closing cannot trigger gameplay from the same gesture. Keyboard
  focus is usable, labels are accessible, and a settings modal cannot leak gameplay
  keypresses through to the goose.
- Auto / Show / Hide works, preferences survive reload when storage is available,
  and corrupt or unavailable storage does not prevent play.
- Fullscreen entry/exit updates UI accurately; unsupported or rejected requests
  are handled without breaking play or losing progress.
- Controls remain reachable and do not obscure essential HUD content across phone
  sizes, landscape directions, notches, and viewport changes.
- Existing keyboard/gamepad behavior and editor/overview behavior remain intact.
- Add headless behavioral tests for input state, hysteresis, pause composition,
  and preference validation as appropriate. Do not require a browser to test
  simulation rules. Browser checks supplement those tests for actual gestures/UI.
- Run npm test and npm run build. Test iPhone Safari and Android Chrome on real
  devices if available, including sound, rotation, interruption, and performance.
  Clearly report which devices were actually tested; emulation is not proof of
  real-device support. Do not claim checks that were unavailable were completed.

## Remaining implementation judgment

Exact button sizes, joystick radius/dead zone, hurry thresholds, and tablet/hybrid
classification were not specified numerically. Choose reasonable defaults and
document them. Future left-handed layout, configurable button size, tap-to-move
navigation, fixed joystick, installation/offline support, and broader mobile
performance optimization are not automatically included in this feature.
