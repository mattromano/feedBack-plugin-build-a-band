# Plastic controllers, Plan 6: controller drums

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Xbox controller or a plastic Rock Band kit plays a song's drum chart: alone in the normal player with the Drum Highway (Part A), and as a drop-in drummer in Build-a-Band, next to the real guitarist, the MIDI drummer and 5-fret players (Part B).

**Architecture:**
- **Part A, the drums plugin** gains a **gamepad source**. It can start now, in parallel with Plan 3.
  - It claims a controller through core's `window.feedBack.gamepadInput` (owner `drums`).
  - It names the controller's inputs through drum profiles, and turns pad presses into the same `session.hit(time, pad, { cymbal })` calls the MIDI and keyboard paths make.
  - It holds the claim only while a drum part plays.
  - Per-controller bindings, cymbal flags and input offsets are set on a new **Controllers** card on the Drums screen.
  - `window.feedBackDrums` gains `setController(controllerKey, canvas)` and the controller listing the band screen needs.
- **Part B, Build-a-Band** registers `drums` in Plan 3's `CONTROLLER_KINDS` seam. It runs after Plan 3 lands.
  - A joined controller **plays as** 5-Fret or Drums.
  - A drums controller gets its own drum lane: the drums renderer, pinned with `setController`.
  - It scores through the existing `drums:*` bus events, and its stem follows Plan 3's per-stem sound machine, extended with My kit only.

**Tech Stack:**
- Drums plugin: classic-script IIFEs and UMD assets, CommonJS `node --test tests/*.test.js`, no dependencies.
- Build-a-Band: ES modules, `npm test`.
- The browser Gamepad API, through core's `gamepad-input` domain (Plan 2 Task 2; `watch` and `list().controllerKey` from Plan 3 Task 1).

**Spec:** `docs/superpowers/specs/2026-10-20-plastic-controllers-design.md` in the Build-a-Band repo. Binding sections:
- "Controller drums", "Device profiles", "Xbox controller defaults" (Drums: red LB, yellow RB, blue LT, green RT, kick A, overdrive Y, pause Start);
- "User flow" (plays as), "How it plugs into the band", "Testing and acceptance" check 4;
- from `2026-10-20-build-a-band-design.md`: "Parts are instrument + how you play it" and "Drum sound modes".

Builds on Plan 2 (`…-plan-2-highway-input.md`) and Plan 3 (`…-plan-3-band-controllers.md`), both next to this file. Part B consumes Plan 3's interfaces by name. Re-read them in the built code before editing.

**Heads read for this plan:**

| Repo | Head |
|---|---|
| drums | `b685572` on `feature/build-a-band-stage` (another session's checkout) |
| five-fret | `686bb98` on `main` |
| core-five-fret | `d4e7483` |
| Build-a-Band | `c476654` on `feature/build-a-band-stage`. Plan 3 not built yet. |

Line numbers are from those heads. Re-read the function before you edit it.

## Global Constraints

- **Worktrees:**
  - **Part A:** a NEW worktree `feedback-upstream/.worktrees/drums-gamepad` on branch `feature/drums-gamepad`, cut from `feature/build-a-band-stage` (Task A0). Never touch `feedBack-plugin-drums/`: another session uses that checkout.
  - **Part B:** Plan 3's worktree `feedback-upstream/.worktrees/bab-controllers`. Use a new branch `feature/band-controller-drums`, cut from `feature/band-controllers` once Plan 3's Task 13 is done (Task B0).
  - Never touch other sessions' checkouts.
- **Commits:** as `mattromano <42412983+mattromano@users.noreply.github.com>` with `-s`, committer email the same:
  `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- **Push** each completed task to `origin` (the mattromano forks). No PRs.
- **Silent testing (Matt):** never start sound in the installed app without asking: no playSong, play, count-in, metronome or calibration clicks.
  - Drum pad hits make sound (the kit synth), so every in-app pad-hit check is deferred to Matt.
  - Check paused, over CDP, with screenshots. If something plays, pause it at once.
- **Installed app only** for real-app checks (`slopsmith-custom/feedback-fork/debug/README.md`). Never the browser dev server or the Claude app's browser. Ask before quitting Matt's running copy.
- **Performance:** no per-frame DOM queries or allocations in draw paths, rAF loops or gamepad event handlers. Input events may allocate only what a mapper returns.
- **Licences:**
  - Drums is MIT except `assets/engine.js`, which is LGPL-3.0 (`NOTICE.md`). Every new drums file is MIT.
  - Build-a-Band is MIT except `src/yarg-rules.js`. Plan 6 adds no YARG-derived code.
- **Tests:**
  - Drums: `node --test tests/*.test.js` in the drums worktree (`tests/test_*.py` are unchanged).
  - Build-a-Band: `npm test` in its worktree.
- **CRLF:** check `file <path>` before editing any file. None of the files listed here used CRLF at the heads above.

## Decisions this plan locks in

Matt asked for every plan to be finished without his input. Each call below says why.

1. **The profile code is copied, not imported.**
   - `assets/gamepad.js` in drums is a small MIT module adapted from five-fret's `assets/profiles.js` at `686bb98`: `reading`, the hysteresis mapper, `controllerKey` and `createSetupRecorder`. The whammy-only branch is dropped. Its header credits the source file and commit.
   - Why:
     - plugins install and load independently, and drums must work with five-fret absent;
     - a cross-plugin `<script>` load would tie drums to five-fret's asset URL, version and load order;
     - both are MIT, by the same author;
     - the shared part is about 150 lines of pure code with its own tests on each side.
   - The cost is drift. Accepted, because the drum and fret action sets differ anyway.
2. **Actions, and the standard pad defaults (spec, verbatim).**
   - The actions are `red_pad`, `yellow_pad`, `blue_pad`, `green_pad`, `kick`, `yellow_cymbal`, `blue_cymbal`, `green_cymbal`, `star_power`, `pause`.
   - `STANDARD_GAMEPAD` (any `mapping === 'standard'`, `kind: 'gamepad'`):
     - red_pad button 4 (LB), yellow_pad 5 (RB), blue_pad 6 (LT), green_pad 7 (RT), kick 0 (A);
     - star_power 3 (Y), pause 9 (Start);
     - no cymbals.
3. **Cymbals.**
   - A binding **has cymbals** when it binds at least one `*_cymbal` action. Then pad actions hit with `cymbal: false` and cymbal actions with `cymbal: true`.
   - A controller without cymbals plays its session with **pro drums off** (`proDrums = _cfg.proCymbals && hasCymbals`). Cymbal notes then fall on the pad lanes (engine `laneFor`) instead of being unhittable.
   - Kits that report a cymbal only as **colour button + flag button** pressed together are not supported. Every action binds one control (a button, an axis direction or a hat value).
   - Why combos are out: the Gamepad API delivers a tick's buttons one by one, so a colour button would fire as a pad before its flag arrives. Resolving that needs hardware to test.
   - Plastic-kit profiles stay "press each pad" setups, as Plan 2 did for guitars.
4. **Velocity:** controller hits carry none, like keyboard drumming. Accent and ghost notes score as normal hits. Analog triggers are only press/release.
5. **Two sources, one rule each:**
   - **Free source** (normal player and splitscreen): one module-level source. It claims the first claimable controller and routes hits to `_routeTarget()`, exactly as MIDI does.
     - Claim order: a stored drums binding first, then standard pads, each in slot order.
     - It runs only while some unpinned drum view is visible, has a session and is playing; and the Controllers card is closed; and **no band pin exists** (no `setInputTarget` canvas and no `setController` canvas). In the band only joined controllers are played, so an unjoined pad keeps driving the menus.
   - **Pinned source** (Build-a-Band): `setController(controllerKey, canvas)` gives that canvas's instance its own source, which claims only that key while the instance plays.
     - A pinned instance never receives MIDI or keyboard hits: `_routeTarget()` and `_wireKeyboard` skip it. A kit hit can't land on a controller drummer's lane.
6. **Hold the claim only while a drum part plays** (Plan 2's lesson): playing means `bundle.isPlaying !== false` and a scoring session with a chart.
   - Pausing or leaving releases the claim, so core's menus work again.
   - The source **parks**: `current()` keeps the last controller's key, kind, cymbal flag and offset while released. So the session's pro-drums setting and input offset don't change across a pause; a change would rebuild the session and restart the score.
   - Start (`pause`) calls `window.togglePlay()`, guarded. Resuming after a pause goes through core's menu gamepad support, as for 5-Fret.
7. **Input time.** Controller events use the drums path's own clock, `_inputTime(ev.t * 1000)`: the audio playhead minus the arrival lag. Gamepad-input stamps `t` with `performance.now()/1000`, the clock `_inputTime` expects in ms.
8. **Input offset, per controller.**
   - Stored in `drums.gamepad.settings.v1` `offsetMs[controllerKey]`, range −250..250 ms (`INPUT_OFFSET_MIN/MAX`), step 5.
   - An instance driven by a controller (pinned, or unpinned while the free source has a `current()`) runs its session with **that controller's** offset; otherwise with `_cfg.inputOffsetMs`, as today.
   - The HUD's timing button applies its suggestion to the controller's offset on such an instance.
   - No click calibration: the drums HUD's timing meter already suggests an offset from real play, and the clicks would make sound.
9. **Sound:** a controller hit plays the kit sound like a keyboard hit (`_synthDrumHit(synthMidiForPad(pad, cymbal), 100)`). The spec's sound modes rely on it ("My kit only" plays the kit on pad hits). The Controllers card's pad lights are **silent**.
10. **Storage** (localStorage, every access in try/catch):
    - `drums.gamepad.bindings.v1`: `{ [controllerKey]: { kind: 'gamepad'|'kit', map: { action: { type: 'button'|'axis', index, sign?, value?, tolerance? } } } }`
    - `drums.gamepad.settings.v1`: `{ offsetMs: { [controllerKey]: n } }`
    - `controllerKey` is core's `${id}#${n}`. Use `list()`'s `controllerKey` when present (Plan 3 Task 1), else compute `nth` the way five-fret's `claimable()` does.
11. **Personal bests:** a controller-pinned (band) lane never records a drums best, like scorecard never taking controller runs (spec "Scorecard"). The normal player records as today.
12. **Part B: plays as.**
    - A controller's possible kinds are `playableKinds(fiveFretKind, drumsKind)`:
      - a drums `kit` binding means drums only;
      - a five-fret `guitar` binding means 5-Fret only, unless the controller is also set up as a kit (then both);
      - two `gamepad` kinds (an Xbox pad) means both;
      - a missing API or a `null` kind drops that option.
    - One kind: `playsAs` is that kind. Two: `playsAs` is the remembered choice for the key (`prefs.playsAs[key]`), else `null`.
    - An undecided (`null`) controller sits out with the note "Choose 5-Fret or Drums". On a standard pad, **X** picks 5-Fret and **B** picks Drums. The column also has the two buttons.
    - This is the spec's "asks once and remembers per controller". `prefs.playsAs` outlives leaving and rejoining.
13. **Part B: a drums controller player.**
    - Its part id is `drums_controller` (instrument `drums`, input kind `controller`), label "Drums", Lucide `drum`, colour orange `#f28c28` from Plan 2's palette, distinct from real drums red.
    - Its controller entry has `part: 'drums'` and `soundMode: 'song'|'rockband'|'kit'`, default `rockband`, like 5-Fret's Part audio default.
    - It needs the song's drum chart (`PART_TYPES` drums `chartFrom`), else it sits out ("No drum chart for this song").
    - Lane tag: `Drums (Controller) · Expert · <name>`. Results card: `Drums (Controller)`. Fallback award: "Held it down", as real drums.
14. **Part B: drum stem sound.**
    - Drums controllers join Plan 3's `createStemSound` on the `drums` stem. Modes: `song` maps to `always`, `rockband` to `rockband`, and a new `kit` mode.
    - The stem is muted all song only when **every** member on it is a controller set to `kit`.
    - It drops on a miss or overhit only when every member is a controller set to `rockband` or `kit`. Any `always` member, or a real drummer, keeps it playing.
    - The real MIDI drummer is a `controller: false` member (Plan 3's rule), and keeps its own v1 sound mode and fail claim unchanged.
    - Why: it extends Plan 3's Decision 10 instead of adding a second machine, and the real drummer's v1 behaviour stays exactly as it was.
15. **Part B: scoring.** A drums controller scores exactly like the MIDI drummer:
    - `drumsEntry` (its points, the multiplier halved under star power, `detail.stars`), with the player id;
    - overdrive mirrored from `getInstanceState(canvas).starPower` through Plan 3's `controllers` option;
    - deploys from `drums:sp-activate` on its canvas.

## Review Focus

1. **Kit or keyboard hits leaking onto a controller lane:** with a MIDI drummer and a controller drummer (or only controller drummers), a kit hit or the B key never scores on a controller-pinned lane. Test in Task A3.
2. **The free source in the band:** with any band pin present, the free source claims nothing, so an unjoined pad still drives the menus and a joined one isn't stolen. Test in Task A3.
3. **An Xbox pad on a pro-drums chart** (pro cymbals on by default): cymbal notes are hittable from the pads, and pausing (claim parked) doesn't flip pro drums or rebuild the session. Tests in Tasks A2 and A3.
4. **No drum chart:**
   - in the normal player, a drum view with no chart never claims a controller;
   - in the band, a drums controller on such a song sits out with its note, and a 5-fret choice still works.
   - Tests in Tasks A3 and B2.
5. **Analog triggers** (LT blue, RT green): one hit per pull. A press is ≥ 0.5 and a release ≤ 0.3, so a half-held trigger doesn't machine-gun. A trigger held through a disconnect reads as a fresh press after reconnect, never as a stuck pad. Tests in Tasks A1 and A2.

---

## Part A: drums plugin gamepad source (can start now)

### Task A0: Drums worktree and baseline

- [ ] **Step 1: Create the worktree** (from `feedback-upstream/`):
  `git -C feedBack-plugin-drums worktree add ../.worktrees/drums-gamepad -b feature/drums-gamepad feature/build-a-band-stage`
- [ ] **Step 2: Baseline.** Run `node --test tests/*.test.js` in `.worktrees/drums-gamepad`. Expected: PASS. Record the test count here.
- [ ] **Step 3: Push** with `git push -u origin feature/drums-gamepad`.

### Task A1: Drum profiles, mapper, storage and setup recorder

**Files (drums worktree):**
- Create: `assets/gamepad.js` (MIT, UMD `window.DrumsGamepad`, the same wrapper as five-fret `assets/profiles.js` l.9–15), with a header that credits five-fret `assets/profiles.js` at `686bb98` (Decision 1).
- Create: `tests/gamepad.test.js`.
- Modify: `NOTICE.md` (list `assets/gamepad.js` as MIT; the LGPL table is unchanged).

**Interfaces:**
- Produces `DrumsGamepad`:
  - `ACTIONS`: Decision 2's ten actions, in that order.
  - `PADS`: `{ red_pad: {pad:1,cymbal:false}, yellow_pad: {pad:2,cymbal:false}, blue_pad: {pad:3,cymbal:false}, green_pad: {pad:4,cymbal:false}, kick: {pad:0,cymbal:false}, yellow_cymbal: {pad:2,cymbal:true}, blue_cymbal: {pad:3,cymbal:true}, green_cymbal: {pad:4,cymbal:true} }`, frozen. The numbers are `DrumsEngine.PAD`, and a test checks they match.
  - `STANDARD_GAMEPAD`: Decision 2.
  - `hasCymbals(binding) -> boolean`: Decision 3.
  - `hitFor(action, binding) -> { pad, cymbal } | null`. The cymbal is forced false when the binding has no cymbals. Null for `star_power`, `pause` and unknown actions.
  - `controllerKey(info, nth) -> string|null`, `resolveBinding(info, stored) -> binding|null`: as five-fret's.
  - `controllerName(id, nth) -> string`: the id up to its first ` (`, trimmed to 24 characters, plus ` <nth>` when `nth > 1` (Plan 3 Decision 13).
  - `createMapper(binding) -> { map(ev) -> [{ action, value: 0|1 }], reset() }`:
    - press at ≥ 0.5, release at ≤ 0.3;
    - hat-value bindings read 1 within tolerance;
    - every action is press/release, with no analog pass-through;
    - `reset()` forgets held state.
  - `SETUP_ACTIONS`:
    - `kit`: `red_pad, yellow_pad, blue_pad, green_pad, kick, yellow_cymbal, blue_cymbal, green_cymbal, star_power, pause`;
    - `gamepad`: the `STANDARD_GAMEPAD` actions in Decision 2's order.
  - `OPTIONAL_ACTIONS`: the three cymbals and `star_power`, which the card's **Skip** may leave unbound.
  - `createSetupRecorder(actions, opts) -> { next, feed(ev) -> { done, next, binding, recorded }, skip() }`: copied, minus the whammy branch.
  - `loadBindings()`, `saveBinding(key, binding)`, `forgetBinding(key)`, `loadSettings() -> { offsetMs }`, `setOffset(key, ms) -> settings`. The keys are from Decision 10, and every access is in try/catch.
  - `BINDINGS_KEY`, `SETTINGS_KEY`.

- [ ] **Step 1: Write the failing tests:**
  - `standard profile maps LB, RB, LT, RT, A to red, yellow, blue, green, kick; Y to star_power; Start to pause`
  - `PADS match DrumsEngine.PAD` (`require('../assets/engine.js').PAD`)
  - `trigger hysteresis: 0.6 presses once, 0.4 holds, 0.2 releases, 0.6 presses again` (Review Focus 5)
  - `standard gamepad has no cymbals; hitFor yellow_cymbal on it is a yellow pad hit`
  - `a kit binding with yellow_cymbal has cymbals; hitFor gives cymbal true`
  - `stored binding beats standard; unknown non-standard controller needs setup`
  - `setup walks the kit actions; skip leaves a cymbal unbound; a duplicate control is ignored; a hat value is recorded by value`
  - `controllerName trims to 24 and numbers the second identical controller`
  - `storage survives a throwing localStorage; setOffset merges per key`
- [ ] **Step 2: Run** `node --test tests/gamepad.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `assets/gamepad.js`, and add the NOTICE row.
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drum controller profiles, mapper and setup recorder`; push.

### Task A2: Gamepad source (claim lifecycle)

**Files:** Create `assets/gamepad-source.js` (MIT, UMD `window.DrumsGamepadSource`) and `tests/gamepad-source.test.js`. The test uses a fake gamepad-input with `list`, `claim` (handles with `addListener`/`removeListener`/`release`), `on('change')` and `claimCount`, modelled on five-fret's `tests/screen.test.js` fakes.

**Interfaces:**
- Consumes `DrumsGamepad` (Task A1).
- Produces:

  ```js
  DrumsGamepadSource.createSource({ gamepadInput, G, owner = 'drums',
      onHit(pad, cymbal, tsMs), onActivate(tsMs), onPause(), onChange() })
    -> { setWanted(bool), setKey(controllerKey|null),
         current() -> null | { controllerKey, kind, hasCymbals, claimed, connected },
         refresh(), destroy() }
  ```

- Rules:
  - `setKey(null)` is free mode (Decision 5's claim order, skipping controllers with a `claimedBy`). `setKey(k)` claims only `k`.
  - Claims only while wanted. `setWanted(false)` releases and **parks**: `current()` keeps its fields with `claimed: false` (Decision 6). `setKey` with a different key, or `destroy()`, clears it.
  - On a claim, the key, binding and mapper come from the handle's `controllerKey` (the authority, as five-fret `tryClaim` does).
  - Press edges only:
    - pad and cymbal actions call `onHit(...hitFor(action, binding), ev.t * 1000)`;
    - `star_power` calls `onActivate(ev.t * 1000)`;
    - `pause` calls `onPause()`;
    - releases do nothing.
  - `gamepadInput.on('change')`:
    - disconnect of ours: `connected: false` and `mapper.reset()`;
    - connect: `connected: true`;
    - unclaimed: try to claim.
    - Each calls `onChange()`.
  - `refresh()` re-reads bindings (a binding saved on the Controllers card) and re-resolves the mapper, or drops and re-claims.
  - No `gamepadInput`: `current()` is null and nothing throws.
  - An event allocates only the mapper's array. The re-entrancy guard is copied from five-fret (`claiming`).

- [ ] **Step 1: Write the failing tests:**
  - `free mode claims a stored kit before a standard pad in an earlier slot`
  - `claims only while wanted; setWanted(false) releases (claimCount 0) and parks current()` (Review Focus 3)
  - `pinned mode claims only its key with a free standard pad in slot 0`
  - `pads claimed by another owner are skipped`
  - `LT press hits blue with cymbal false and the event time in ms`
  - `a kit's yellow_cymbal hits yellow with cymbal true`
  - `Y activates; Start pauses; releases do nothing`
  - `disconnect then reconnect resumes the same handle; a trigger held across it reads as a fresh press` (Review Focus 5)
  - `refresh picks up a new binding`
  - `no gamepadInput: current() null, setWanted is a no-op`
- [ ] **Step 2: Run** `node --test tests/gamepad-source.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: gamepad source for drums (claim only while playing)`; push.

### Task A3: Screen wiring, routing guards and the public API

**Files:**
- Modify `screen.js`:
  - asset loading next to `_loadScoring` ~l.839: `_loadGamepad()` loads `gamepad.js` and `gamepad-source.js` with `?v=ASSET_VERSION`. Bump `ASSET_VERSION` ~l.834 to `4.6.0`;
  - `_inputTargetCanvas` / `_bandDifficulty` ~l.2043: add the `_bandController` WeakMap;
  - `_routeTarget` ~l.2116;
  - `_wireKeyboard` ~l.2620;
  - `_startScoring` ~l.2720 (pro and offset at session creation);
  - `_inputOffsetChanged` ~l.2834 and `_proCymbalsChanged` ~l.2843;
  - the timing button ~l.3008;
  - `_draw3D` ~l.2690 and the 2D draw (`message`);
  - `draw` ~l.4538 (want flags), `destroy` ~l.4652 and the instance object (new hooks);
  - the end-card guard ~l.4514;
  - `window.feedBackDrums` ~l.4814;
  - `module.exports` ~l.5432.
- Modify:
  - `plugin.json`: version `4.6.0`, and a `capabilities["gamepad-input"]` entry with the same field set as five-fret's `plugin.json` (`roles: ["requester"]`, `ownership: "requester-only"`, `compatibility: "degrade-noop"`, `mode: "active"`, `safety: "sensitive"`, `version: 1`, a one-line description);
  - `README.md`: playing on a controller, and the new API;
  - `CHANGELOG.md`: `## 4.6.0`.
- Test: `tests/screen.test.js`, extending the `fakeInst` band-API section ~l.773.

**Interfaces:**
- Consumes `createSource` (Task A2) and `DrumsGamepad` (Task A1).
- **Pure helpers, exported for tests:**
  - `_effectivePro({ proCymbals, controller })`: `proCymbals && (!controller || controller.hasCymbals)`.
  - `_effectiveOffset({ cfgMs, controller, offsets })`: the controller's stored offset, normalised, else 0 for a controller with none; `cfgMs` with no controller.
  - `_freePadWanted({ wanters, inputTargetPinned, controllerPins, controlsOpen })`.
  - `_spHint({ meta, controller, spPadName })`:
    - fills: today's text;
    - a standard-pad controller: `Press Y to activate star power`;
    - any other controller: `Press Star power to activate star power`;
    - else today's Enter text.
  - `_shouldRecordBestOnly({ hasSession, ssActive, hidden, controller })`: gains `controller`, and is false when `controller`.
  - `_shouldShowEndCard`: unchanged.
- **Instance hooks:**
  - `_handlePadHit(pad, cymbal, tsMs)`:
    - kit sound as in Decision 9;
    - the 2D lane flash;
    - `_session.hit(_inputTime(tsMs), pad, { cymbal })`;
    - the 2D wrong-hit flash on an overhit, as `_wireKeyboard` does;
    - without a session it only sounds.
  - `_activateSp(tsMs)`.
  - `_controllerPinned() -> boolean`.
  - `_padWant() -> boolean`: visible, session loaded with a chart, playing.
- **Routing:**
  - `_routeTarget()` skips instances where `_controllerPinned()` (Review Focus 1);
  - `_onKeyDown` returns early on a pinned instance.
- **Free source:**
  - created once on first need;
  - wanted per `_freePadWanted`. Each `draw` updates its own boolean and touches the module wanters `Set` **only when that boolean changes**;
  - `onHit` goes to `_routeTarget()._handlePadHit`;
  - `onChange` recomputes pro and offset on every unpinned instance through `_proCymbalsChanged` / `_inputOffsetChanged`, which now apply `_effectivePro` / `_effectiveOffset`.
- **Pinned source:** an instance whose canvas has a `_bandController` key creates its own source in pinned mode (on init, or when `setController` reaches a live instance) and destroys it in `destroy()`. Its want is `_padWant()`, from `draw`, on change only.
- **Status in a pinned lane:**
  - "Controller disconnected" (`current().connected === false`);
  - "Connect a controller and press any button" (pinned key not present). Shown as the 3D view's `message` and drawn at the 2D canvas centre. The text is cached and rebuilt only when the status changes.
- **`window.feedBackDrums` additions** (feature-checked by consumers with `typeof api.setController === 'function'`):
  - `setController(controllerKey, canvas) -> boolean`: false unless a non-empty string key and an object canvas. Stores the key in `_bandController`, now or for an instance that inits on the canvas later. Calling again updates.
  - `clearController(canvas)`: forgets the pin; that instance's source is destroyed and the instance rejoins MIDI/keyboard routing.
  - `listControllers() -> [{ index, controllerKey, id, mapping, name, kind: 'gamepad'|'kit'|null, hasCymbals, connected, claimedBy }]`.
  - `createMapper(controllerKey) -> mapper | null`: from the resolved binding (Plan 3's join manager reads `pause` from it).
  - `openControls({ returnTo } = {})`: `showScreen('plugin-drums')`, scrolls the Controllers card into view (Task A4), and for that visit makes the page's Back button go to `returnTo` (default `home`).
  - `getInstanceState(canvas)`: unchanged.

- [ ] **Step 1: Write the failing tests** (screen.test.js; fake instances and a fake `window.feedBack.gamepadInput`):
  - `routeTarget skips a controller-pinned instance even when focused or pinned as the input target` (Review Focus 1)
  - `free source wanted only with a playing unpinned view and no band pins` (Review Focus 2)
  - `free pad hit reaches the route target's _handlePadHit with pad, cymbal and time`
  - `effectivePro: pro off for a pad without cymbals, on for a kit with them, cfg off wins`
  - `effectiveOffset: the controller's offset, else 0 for one without, else cfg`
  - `parking (setWanted false) leaves effective pro and offset unchanged` (Review Focus 3)
  - `setController before init pins the instance that inits on the canvas; bad arguments return false; clearController restores routing`
  - `listControllers names, kinds, cymbals and keys (two identical pads #1, #2; unknown non-standard kind null)`
  - `createMapper maps a standard pad's Start to pause; unknown key gives null`
  - `a view with no chart never wants a claim` (Review Focus 4)
  - `spHint for a standard pad, another controller and none`
  - `a controller-pinned hidden lane records no best`
  - `openControls shows plugin-drums and Back returns to returnTo once`
- [ ] **Step 2: Run** `node --test tests/screen.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** The renderer must still work with no `gamepadInput` (an older core): no source, and nothing logged per frame.
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: play drums on a controller; feedBackDrums.setController and listControllers`; push.

### Task A4: Controllers card on the Drums screen

**Files:**
- Create: `assets/gamepad-controls.js` (MIT, UMD `window.DrumsGamepadControls`), modelled on five-fret `assets/controls.js` without calibration.
- Modify:
  - `screen.html`: a new `<section class="dr-card" aria-labelledby="dr-h-pads">` titled "Controllers" after "Your kit (MIDI)" (~l.177), with `<div data-dr="padList"></div>`;
  - `screen.js`: `_pageSetVisible` ~l.5379 creates and destroys the card and sets `_padControlsOpen`; `_pageWire` ~l.5282 sets Back's `returnTo`; bindings and offsets saved there call the free and pinned sources' `refresh()` and the offset hooks;
  - `README.md`.
- Test: `tests/gamepad-controls.test.js` (the pure helpers) and `tests/screen.test.js` (stand-down).

**Interfaces:**
- `DrumsGamepadControls.create({ G, gamepadInput, list, owner: 'drums.controls', onBindingSaved(key), onOffsetSaved(key, ms) }) -> { refresh(), destroy() }`:
  - one card per connected controller: name, kind label ("Xbox-style gamepad", "Drum kit", "Needs setup"), a "Cymbals: on/off" note, and silent pad lights for the ten actions;
  - **Set up as drum kit** walks `SETUP_ACTIONS.kit`, with **Skip** on `OPTIONAL_ACTIONS`;
  - **Use gamepad layout**: on a standard pad it forgets the stored binding; on any other controller it walks `SETUP_ACTIONS.gamepad`;
  - **Rebind** one action: pick it, press the control;
  - **Input offset**: a number input, −250..250, step 5;
  - it claims each free connected controller as `owner` while it exists, and releases them all on `destroy()`;
  - DOM nodes are built once per card. Lights write only changed state (`setOn`, as five-fret).
- Pure helpers, exported:
  - `cardModel({ info, nth, binding, offsetMs }) -> { key, name, kindLabel, needsSetup, hasCymbals, offsetMs }`;
  - `clampOffset(ms) -> ms` (−250..250, step 5).
- While the card exists, `_padControlsOpen` is true: the free source isn't wanted and pinned sources release (`_freePadWanted` and the pinned want both read it).

- [ ] **Step 1: Write the failing tests:**
  - `cardModel: standard pad, stored kit with cymbals, unknown controller needing setup`
  - `clampOffset rounds to 5 and clamps to ±250`
  - screen: `opening the Drums screen releases the free and pinned claims; leaving lets them claim again`
  - screen: `a saved binding refreshes the sources`
- [ ] **Step 2: Run** `node --test tests/gamepad-controls.test.js tests/screen.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Controllers card (kit setup, rebinding, input offset)`; push.

### Task A5: Real-app check (silent) and catch-up merge

No new code, except a merge.

- [ ] **Step 1: Stay current.** `git merge origin/feature/build-a-band-stage` into `feature/drums-gamepad` (a merge, never a rebase: the branch is pushed). Re-run `node --test tests/*.test.js`. Push.
- [ ] **Step 2: Install.** Copy the worktree (without `.git`, `tests`, `tools`) into `/Applications/feedback.app/Contents/Resources/slopsmith/plugins/drums/`, as Plan 2 Task 10 did for five-fret. The core installed must have `gamepad-input` (core-five-fret `d4e7483` or later). Ask before quitting Matt's app if it's running.
- [ ] **Step 3: Launch** with `launch-debug.sh`. Check over CDP, paused:
  - the Drums screen shows the Controllers card. With an Xbox controller connected, button presses light the matching actions with no sound;
  - `gamepadInput.claimCount()` is 1 on the screen and 0 after leaving it;
  - a drum song open **paused** in the Drum Highway: `claimCount()` is 0, A reaches core's menus, and the HUD hint mentions Y;
  - with no controller, the card says so and nothing throws.
- [ ] **Step 4: Ask Matt** whether to play 30 s of a drum song on the Xbox controller (pad hits make sound). Only on a yes:
  - claim on play, release on pause;
  - pads score;
  - cymbal notes on pads with pro on (Review Focus 3);
  - LT/RT one hit per pull (Review Focus 5).
  Then pause and leave nothing playing.
- [ ] **Step 5: Nothing else moved** (paused): a MIDI kit still reaches the Drum Highway (`__drumsDebug.midi` injection, no audio context started), and the keyboard keys still map.
- [ ] **Step 6: Record** the results in the Review section and in the shared notes. Push.

---

## Part B: Build-a-Band drums controller part (after Plan 3 lands)

Prerequisites: Plan 3 Tasks 0–13 are done on `feature/band-controllers`, and Part A is pushed. Each step below names a Plan 3 interface. If the built code differs, follow the built code and note it in the Review section.

### Task B0: Branch and baseline

- [ ] **Step 1: Branch:** `git -C .worktrees/bab-controllers switch -c feature/band-controller-drums feature/band-controllers`.
- [ ] **Step 2: Baseline.** Run `npm test`. Expected: PASS. Record the count here.
- [ ] **Step 3: Push** with `git push -u origin feature/band-controller-drums`.

### Task B1: Drums in the controller model, prefs, parts and players

**Files:**
- Modify:
  - `src/controller-model.js` (Plan 3 Task 5);
  - `src/prefs.js` (`controllers`, plus a new `playsAs` map);
  - `src/parts.js` (`DRUMS_CONTROLLER_PART`, `controllerPartFor`);
  - `src/players.js` (`playerStyle`);
  - `src/stem-claims.js` (`stemIdFor`).
- Test: extend `tests/controller-model.test.mjs`, `tests/prefs.test.mjs`, `tests/parts.test.mjs`, `tests/players.test.mjs`, `tests/stem-claims.test.mjs`.

**Interfaces:**
- `CONTROLLER_KINDS.drums = { label: 'Drums', parts: ['drums'] }`.
- `playableKinds(fiveFretKind, drumsKind) -> ('five_fret'|'drums')[]`: Decision 12, with `five_fret` first.
- `joinController(controllers, { controllerKey, name, kinds, remembered })`:
  - `playsAs` per Decision 12;
  - `part`: `'drums'` for drums, Plan 3's `defaultPart` for 5-Fret, `null` while undecided;
  - `soundMode: 'rockband'`.
- `setPlaysAs(controllers, key, kind) -> controllers`: resets `part` to the kind's default and returns a new array. The caller also saves `prefs.playsAs[key] = kind`.
- `prefs`:
  - `controllers[].playsAs` may be `null`;
  - `controllers[].soundMode` is one of `DRUM_SOUND_MODES` (from `src/drum-sound.js`), default `rockband`;
  - `part` is validated against `CONTROLLER_KINDS[playsAs].parts`;
  - `playsAs: { [key]: 'five_fret'|'drums' }`: invalid entries dropped.
- `DRUMS_CONTROLLER_PART` (Decision 13).
- `controllerPartFor(itemOrSong, controller) -> { instrument, kind } | null`:
  - `five_fret`: Plan 3's `fiveFretPartFor`;
  - `drums`: `{ instrument: 'drums', kind: 'chart' }` when the drums `chartFrom` isn't `undefined`;
  - `null` otherwise, and while undecided.
- `playerStyle(id, prefs, opts)` for a drums controller: `{ name: 'Drums', tag: 'Drums (Controller) · <Difficulty> · <controller name>', color: '#f28c28', icon: 'drum', calloutKind: 'drums' }`.
- `stemIdFor('drums_controller', c, ids)`: the `drums` stem when present, else null.

- [ ] **Step 1: Write the failing tests:**
  - `playableKinds: kit → drums; guitar → five_fret; both gamepads → both; null kinds drop out; kit and guitar → both`
  - `join with two kinds and no memory is undecided; the remembered kind is used; one kind needs no memory`
  - `setPlaysAs to drums sets part drums; back to five_fret picks a free 5-fret part`
  - `normalizePrefs keeps playsAs null, validates part per kind and soundMode, cleans the playsAs map`
  - `controllerPartFor: drums needs a drum arrangement or drum tab`
  - `playerStyle for a drums controller`
  - `stemIdFor drums_controller`
- [ ] **Step 2: Run** `node --test tests/controller-model.test.mjs tests/prefs.test.mjs tests/parts.test.mjs tests/players.test.mjs tests/stem-claims.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drums as a controller kind (plays as, part, prefs)`; push.

### Task B2: Band-screen model and filters for drums controllers

**Files:**
- Modify `src/band-model.js` (`bandScreenModel().controllers`, Plan 3 Task 6) and `src/query.js` (`pickFilters`).
- Test: `tests/band-model.test.mjs`, `tests/query.test.mjs`.

**Interfaces:**
- `bandScreenModel({ …, drumsLoaded = false })`. Controller rows gain:
  - `kinds` and `playsAs`;
  - `parts.drums = { has, kind: 'chart'|null, takenBy }`, where `takenBy` lists other drums controllers' names, plus "Drums" when the real drums part is on;
  - `soundMode`, and `soundModeDisabled: ['rockband','kit']` when the song has no drum stem.
  - Notes, in this order:
    - "Choose 5-Fret or Drums" (undecided; sits out);
    - "No drum chart for this song";
    - "Rock Band and My kit only need a drum stem" (shown while one of them is selected; that row then plays as Song drums, as `sessionPrefs` does for the real drummer).
  - `goEnabled` / `pickEnabled` count only rows that are decided, connected and available (Review Focus 4).
- `controllerStatus.reason`:
  - `'no-controller-plugins'` only when neither the five-fret nor the drums API is present ("Install the 5-Fret or Drums plugin to play on a controller");
  - the drums-only case is `drumsLoaded`.
- `pickFilters`: **Playable by band** adds `has_drums: '1'` when a connected, decided drums controller is joined.

- [ ] **Step 1: Write the failing tests:**
  - `an undecided controller sits out with its note and doesn't enable Go`
  - `a drums controller on a song without a drum chart is unavailable; Go uses the others` (Review Focus 4)
  - `drums row: takenBy lists the real drummer and other drum controllers`
  - `sound modes greyed without a drum stem`
  - `playable adds has_drums for a drums controller`
  - `no five-fret but drums loaded: controllers available; neither: reason no-controller-plugins`
- [ ] **Step 2: Run** `node --test tests/band-model.test.mjs tests/query.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band screen model knows drums controllers`; push.

### Task B3: Join manager with two instrument APIs

**Files:** Modify `src/join.js` (Plan 3 Task 7). Test: `tests/join.test.mjs`, adding a fake drums API (`listControllers`, `createMapper`).

**Interfaces:**
- `createJoinManager({ gamepadInput, fiveFret, drums, …, onJoin({ controllerKey, name, kinds }), onPlaysAs(key, kind), onLight(key, lit) })`:
  - **kinds:** a watched pad's kinds are `playableKinds(fiveFret kind, drums kind)`, looked up by `pad` in each API's `listControllers()`. No kinds means `needsSetup`. Start (`pause` from either API's mapper, five-fret first) joins with `kinds`.
  - **mappers:** a joined pad's mapper comes from its `playsAs` kind (`setJoined` now takes `[{ key, playsAs }]`). An undecided pad uses the five-fret mapper when it has one, else the drums mapper, for Start only.
  - **lights:** `lit` is `{ green, red, yellow, blue, orange, strum }` for 5-Fret (Plan 3), and `{ red, yellow, blue, green, kick }` for drums, where a cymbal action lights its colour.
  - **undecided standard pads:** raw button 2 (X) calls `onPlaysAs(key, 'five_fret')` and raw button 1 (B) calls `onPlaysAs(key, 'drums')`, on press edges.
  - `status().reason` follows Task B2. `needsSetup` entries gain `setupWith: ['five_fret','drums']`: the APIs present to set it up with.

- [ ] **Step 1: Write the failing tests:**
  - `a kit set up only in drums joins with kinds [drums]`
  - `an Xbox pad joins with both kinds; X and B pick 5-Fret and Drums`
  - `a joined drums pad lights pads and kick; Start is primary`
  - `a pad with no kinds needs setup and lists both setup routes`
  - `only the drums API present: join works; neither: status says why`
- [ ] **Step 2: Run** `node --test tests/join.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: join manager hears drum kits and asks Xbox pads what they play`; push.

### Task B4: Controller columns for drums

**Files:**
- Modify:
  - `src/controller-columns.js` and `src/band-screen.js` (Plan 3 Task 8);
  - `assets/build-a-band.css` (the drum light row, plays-as segment);
  - `README.md`.
- Test: `tests/band-screen.test.mjs`, adding a fake `feedBackDrums`.

**Interfaces:**
- **Setup column:**
  - a **Plays as** segment (5-Fret | Drums) when a row has two `kinds`, with the hint "X: 5-Fret · B: Drums" on standard pads;
  - lights follow `playsAs`;
  - **Controls** opens `feedBackDrums.openControls({ returnTo: 'plugin-build_a_band' })` for drums, and five-fret's for 5-Fret.
- **Confirm row for drums:**
  - Part (a fixed "Drums" segment, with "also: <names>");
  - Difficulty;
  - Sound (Song drums / Rock Band / My kit only, greyed per `soundModeDisabled`);
  - the note.
  - No Lefty and no Part audio.
- **Wiring:**
  - `onPlaysAs` and the segment both call `save({ controllers: setPlaysAs(...), playsAs: { ...prefs.playsAs, [key]: kind } })`;
  - the join slot's **Set up** offers "as guitar" and "as drum kit" per `setupWith`.

- [ ] **Step 1: Write the failing tests:**
  - `an Xbox pad's column asks plays-as; choosing Drums swaps the lights and the Confirm row`
  - `B on an undecided pad chooses Drums and remembers it after leave and rejoin`
  - `drums Confirm row: difficulty and sound mode saved; modes greyed without a drum stem`
  - `Controls on a drums controller opens the Drums screen returning to the band`
  - `Set up offers guitar and drum kit`
- [ ] **Step 2: Run** `node --test tests/band-screen.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drums controller columns and plays-as choice`; push.

### Task B5: Drums controller lanes on the stage

**Files:** Modify `src/stage.js` (`planStage`, `mountStage` controller lanes, Plan 3 Task 9). Test: `tests/stage.test.mjs`, `tests/stage-mount.test.mjs`.

**Interfaces:**
- `planStage(song, parts, controllers)`: a drums controller adds its lane only when the song has a drum chart (`drumIndex >= 0 || hasDrumTab`).
- `mountStage` controller lanes go through a lane driver per kind (a module-level `LANE_DRIVERS` object in `stage.js`):
  - `five_fret`: Plan 3's (renderer `fiveFretRenderer`, WS `song.arrangementIndex`, `setLane` / `clearLane`).
  - `drums`:
    - renderer `drumRenderer` (deps, default `win.feedBackViz_drums`);
    - WS `plan.laneArrangement`;
    - pin: `drumsApi.setController(c.key, canvas)` plus `drumsApi.setDifficulty(drumsDifficultyId(c.difficulty), canvas)`;
    - unpin: `clearController(canvas)` plus `clearDifficulty(canvas)`.
- `highway:canvas-replaced` re-pins through the driver. A drums lane without `drumsApi.setController` fails to start and leaves (Plan 3's one-lane-fails rule).
- `getLaneCanvas(id)` returns drums controller canvases too.

- [ ] **Step 1: Write the failing tests:**
  - `a drums controller gets a drum-renderer lane on the drum arrangement, pinned to its key and difficulty`
  - `no drum chart: no lane for the drums controller`
  - `canvas replacement re-pins setController`
  - `unmount clears the controller and difficulty pins`
  - `a missing setController drops only that lane`
- [ ] **Step 2: Run** `node --test tests/stage.test.mjs tests/stage-mount.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drums controller lanes`; push.

### Task B6: Drums controllers score, deploy and fail in the band

**Files:**
- Modify:
  - `src/part-events.js` (`drumsEntry` ~l.27);
  - `src/band-runtime.js`: `effectivePrefs`, the `drumHandler` ~l.1308, `drums:sp-activate` ~l.1328, `startOverdrive` ~l.544 (Plan 3's `controllers` option), `applyHides` / `undoHides`, `teardown`.
- Test: `tests/part-events.test.mjs`, `tests/band-runtime.test.mjs` (a fake `feedBackDrums` with `listControllers`, `setController`, `getInstanceState`, `setScoreHudHidden`).

**Interfaces:**
- `drumsEntry(type, detail, t, bandCanvas, id = 'drums')`: `part` is `id`. The existing call sites are unchanged.
- `effectivePrefs`: a drums controller is `on` when:
  - it is connected (`feedBackDrums.listControllers()`);
  - the API has `setController`;
  - the renderer exists;
  - and `controllerPartFor` is non-null.
- **Runtime:**
  - the runtime keeps a `canvas → id` map of drums controller lanes, built at mount and updated on canvas replacement;
  - `drums:<hit|miss|overhit>` on such a canvas records `drumsEntry(type, d, t, canvas, id)` for that player. The real drummer's path is unchanged;
  - `drums:sp-activate` on it records that player's deploy (rescues as drums' does);
  - overdrive `controllers` read `() => feedBackDrums.getInstanceState(canvas)`, which matches `drumsOverdrive`'s shape;
  - `applyHides` calls `setScoreHudHidden(canvas, true)` per drums controller lane, and teardown undoes it;
  - a lane that failed to start leaves via `dropPart`.

- [ ] **Step 1: Write the failing tests:**
  - part-events:
    - `drumsEntry with an id records that part; default stays drums`.
  - runtime:
    - `Go with a drums controller: ctl1 in the ledger and HUD, its drum HUD hidden`;
    - `a MIDI drummer and a controller drummer score only their own canvases` (Review Focus 1);
    - `two drums controllers score separately`;
    - `sp-activate on the controller lane rescues a failed bandmate`;
    - `controller drum meter mirrored from getInstanceState`;
    - `a drums controller disconnected at Go sits out`;
    - `a backward seek drops later drums-controller entries`.
- [ ] **Step 2: Run** `node --test tests/part-events.test.mjs tests/band-runtime.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drums controllers score, deploy and fail in the band`; push.

### Task B7: Drum sound modes for controller drummers

**Files:** Modify `src/stem-sound.js` (Plan 3 Task 11) and `src/band-runtime.js` (members built at `applyDifficulties`; judging in the drum handlers). Test: `tests/stem-sound.test.mjs`, `tests/band-runtime.test.mjs`.

**Interfaces:**
- `createStemSound({ members })`: `mode` may also be `'kit'` (Decision 14).
  - A stem whose members are all controllers in `kit` starts muted and ignores judgments.
  - In mixed `rockband`/`kit`, every member's miss or overhit drops the stem and any member's hit restores it.
  - `seek()` restores unless all are `kit`.
  - The fail rules are unchanged.
- **Members:**
  - drums controllers: `{ id, stemId: stemIdFor('drums_controller', …), controller: true, mode: { song: 'always', rockband: 'rockband', kit: 'kit' }[c.soundMode] }`;
  - the real drummer stays the `controller: false` member Plan 3 adds;
  - with no drum stem, a drums controller's `soundMode` is treated as `song`.
- **Judging:** drum events on a drums controller canvas call `judge(id, 'hit'|'miss'|'overhit')`. An overhit while paused is ignored (the v1 R10 rule).

- [ ] **Step 1: Write the failing tests:**
  - stem-sound:
    - `all-kit controllers: muted from the start, judgments ignored, seek keeps it muted`;
    - `rockband and kit controllers share drop-outs`;
    - `a Song drums controller keeps the stem`;
    - `a real drummer on the stem keeps it through controller misses`.
  - runtime:
    - `a drums controller miss in Rock Band mutes the drums stem under build_a_band:sound:stem:drums; a hit restores`;
    - `a paused overhit is ignored`;
    - `the real drummer's own sound claim is untouched`.
- [ ] **Step 2: Run** `node --test tests/stem-sound.test.mjs tests/band-runtime.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drum sound modes for controller drummers`; push.

### Task B8: HUD and results for drums controllers

**Files:** Modify `src/results.js` (Plan 3 Task 12's controller cards), `src/hud.js` / `src/players.js` (tags), `src/band-runtime.js` (`controllerInfo`). Test: `tests/results.test.mjs`, `tests/hud.test.mjs`, `tests/hud-model.test.mjs`.

**Interfaces:**
- **Results:** a drums controller card is `{ part: id, kind: 'drums_controller', name: 'Drums (Controller)', subname: <controller name>, difficulty, color: '#f28c28', icon: 'drum', stats }`.
  - `stats`: Score, Best streak, Notes hit, Overhits (the ledger's `overhits`), and the overdrive and drop-out counts, as Plan 3's controller card.
  - The fallback award is "Held it down".
- **HUD:** drums controller lanes get `playerStyle` tags and colours, with `calloutKind: 'drums'` (every 50 notes, from `CALLOUTS.drums`).

- [ ] **Step 1: Write the failing tests:**
  - `a drums controller card with overhits, after the 5-fret cards in join order`
  - `fallback award Held it down`
  - `drums controller lane tag and colour`
  - `drums controller streak callouts every 50`
- [ ] **Step 2: Run** `node --test tests/results.test.mjs tests/hud.test.mjs tests/hud-model.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drums controller tags and results cards`; push.

### Task B9: Real-app check

No new code. Silent unless Matt says otherwise.

- [ ] **Step 1: Install:**
  - core as in Plan 3 Task 13;
  - five-fret `main`;
  - drums from `.worktrees/drums-gamepad`;
  - Build-a-Band from `.worktrees/bab-controllers` (each without `.git`, `tests`, `docs`), into the app's `Resources/slopsmith/plugins/` folders.
  - Ask before quitting Matt's app.
- [ ] **Step 2: Band screen, paused, over CDP:**
  - an Xbox controller's Start adds a column asking plays-as;
  - B picks Drums and the drum lights follow presses;
  - leave and rejoin: Drums is remembered;
  - the Confirm row shows Drums, Difficulty and Sound;
  - A does nothing to the menus.
- [ ] **Step 3: Library pick:** **Playable by band** with a drums controller lists only songs with a drum chart, and `claimCount()` is 0 while picking.
- [ ] **Step 4: Ask Matt** before GO (it plays the song, and pad hits make sound). Only on a yes:
  - play 30 s with the controller on drums, beside any real parts (spec check 4: then one 5-fret and one drums controller, then both on drums);
  - check the lanes, tags and HUD;
  - check a Rock Band drop-out on a deliberate miss.
  Then pause, check the results card, and leave nothing playing. Without a yes, record that the stage is covered by unit tests only.
- [ ] **Step 5: Nothing else moved** (paused):
  - the band screen with no controllers;
  - a MIDI-kit drummer's lane still receives kit hits (`__drumsDebug.midi`);
  - 5-fret joins still work.
- [ ] **Step 6: Record** the results below and in the shared notes. Push both branches.

## Self-review

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | Drums plugin gamepad source claiming through `gamepad-input` | A2, A3 |
  | Named pad inputs become the same pad hits as MIDI (`session.hit`) | A1, A3 |
  | Xbox drums defaults (red LB, yellow RB, blue LT, green RT, kick A, overdrive Y, pause Start) | A1 |
  | Device profiles and "press each pad" setup; rebinding per controller | A1, A4 |
  | Cymbal flags where the kit reports them, else cymbals off | Decision 3; A1, A3 |
  | Input offset per controller | A3, A4 |
  | Menus ignore claimed controllers (claim only while playing) | A2, A3 |
  | Plays as 5-fret or drums; plastic kits default to drums; Xbox asks once and remembers | B1, B3, B4 |
  | Controller drummer = instrument `drums`, input kind `controller`, own lane, shared parts | B1, B5, B6 |
  | Scoring, overdrive, fail and rescue through the drums event path | B6 |
  | Drum sound modes work as for MIDI kits | B7 (stem), A3 (kit sound on hits) |
  | Results cards | B8 |
  | Real-app check 4 (needs GO), check 9 (MIDI drums unaffected) | B9, A5 |

- **Type consistency:**
  - `controllerKey` is the same everywhere: core `list()` / claim, `DrumsGamepad.controllerKey`, `listControllers().controllerKey`, and `prefs.controllers[].key`.
  - `setController(controllerKey, canvas)`, `clearController(canvas)`, `listControllers()`, `createMapper(controllerKey)` and `openControls({ returnTo })` (Task A3) are used in B3, B4 and B5.
  - `hitFor` and `hasCymbals` (A1) are used in A2 and A3.
  - `playableKinds`, `setPlaysAs` and `controllerPartFor` (B1) are used in B2–B6.
  - `drumsEntry(…, id)` (B6). `createStemSound` `kit` (B7).

## Review

(Filled in after the build.)

## Builder-check rulings (binding; they override the tasks and decisions above where they differ)

A builder check (2026-10-21) found these; each is decided here. Plan 3's "Builder-check rulings" **and its amendments** are binding on Part B.

1. **Pinned drum lanes** hold their claim from `setController` until `clearController`, even while paused. The Controllers card lists only unpinned controllers and never takes a pinned one.
   - Start on a pinned lane emits `drums:band-pause`; a 1 s hold on Back emits `drums:band-back-hold`, with `detail { controllerKey, canvas }`.
   - Decision 6's release-while-paused applies only to the free (normal-player) source.
2. **Registry shape.** `CONTROLLER_KINDS.drums = { label, parts, api: () => window.feedBackDrums, resolveBinding, setupHref, laneRenderer: 'feedBackViz_drums', eventPrefix: 'drums', pin(canvas, key, opts) → setController + setDifficulty, unpin(canvas) → clearController }`.
   - B3 (join), B5 (lanes) and B6 (scoring) go through the registry only: no `createJoinManager({fiveFret, drums})`, no separate `LANE_DRIVERS`, no hard-wired canvas→id map.
3. **Choice storage.** `prefs.controllerKinds` (Plan 3's key), not `prefs.playsAs`.
   - A pad with no entry that can play both kinds is asked once: X picks 5-Fret, B picks Drums. The choice is stored.
   - Pads that joined before Plan 6 have no entry, so they are asked the next time they join.
4. **Async API.** `feedBackDrums.listControllers()` and `createMapper()` return Promises and load `assets/gamepad.js` on demand. B3/B6 await them.
5. **B1 chart check.** `controllerPartFor` checks for a drum chart with `hasChart(getPart('drums'), item)`. `chartFrom` returns -1, never `undefined`.
6. **Event handlers** are registered once per event name and dispatch by `detail.canvas` to the owning player, so the real drummer's `drumHandler` and `drums:sp-activate` handler keep working (Plan 3 amendment).
7. **Timing suggestion.** On a pinned lane, the 3D view's suggested offset and the `drums:judgment` detail use that controller's offset, not the global `_cfg.inputOffsetMs`. Test it.
8. **Keyboard leaks.** The pinned guard also covers `_onSpKey` (Enter star power) and the difficulty keys. Test: Enter does nothing on a pinned lane.
9. **Drum stem sound.** With a real drummer present, the real drummer's existing v1 claim and sound mode govern the drum stem; controller drummers' misses don't affect it. With only controller drummers, Plan 3's per-stem machine applies, including the new My kit only mode. Decision 14's wording changes to match.
10. **Reconnect test.** Replace "a trigger held across a disconnect reads as a fresh press" with "never stuck: after reconnect, the next pull presses and its release releases" (core keeps the old values on reconnect and emits nothing).
11. **Counting pins.** Keep a `Set` of pinned canvases next to the `_bandController` WeakMap, so `_freePadWanted` can tell whether any pin exists. Remove an entry on `clearController` and on destroy.
12. Decision 5's rationale: while any claim exists, core's menus ignore every pad (`static/v3/gamepad.js:132-133`). The rule itself stays.
13. **Rock Band kit setup.** The setup recorder ignores a second new button in the same poll (same `ev.t`), so a pad's colour button and its flag button don't bind to two actions. Test it.
14. **Performance.** `_padWant` reads the `_hwVisible` flag, never `_isVisible()` / `getClientRects`, per frame.
15. **Mirrored Start.** Keep Plan 3's mirrored-Start dedupe (ruling 6) in B3's rewrite, with its test.
16. **Minor:**
    - the drums `gamepad-input` capability entry includes `requests: ["list-sources"]`;
    - stem ids follow Plan 3's kind-id naming (`stemIdFor('drums')` for both drummer kinds), not `'drums_controller'`.
