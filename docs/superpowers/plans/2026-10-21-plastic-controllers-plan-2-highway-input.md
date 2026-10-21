# Plastic controllers, Plan 2: gamepad input, 5-fret engine and highway

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person with an Xbox controller (or any standard gamepad, or a plastic guitar via the setup screen) plays a song's 5-fret guitar or bass part in feedBack's normal player, on a tilted Clone Hero-style highway, judged and scored by a port of YARG's five-fret engine.

**Architecture:**
- **Core** gains three things:
  - a `gamepad-input` capability domain. Plugins claim a controller and get raw button and axis events, and core's menu gamepad support ignores claimed controllers;
  - the highway WebSocket sends **every** 5-fret part by default, instead of Plan 1's opt-in `?five_fret_part=`;
  - `bundle.fiveFretParts` for renderers, folded from the `five_fret*` frames the way `drum_tab*` frames become `bundle.drumTab`. The renderer picks a part locally, with no reconnect; this works the same in splitscreen panels.
- **A new plugin `feedBack-plugin-five-fret`** (id `five_fret`) copies the drums plugin's shape:
  - an LGPL engine port (`assets/engine.js`);
  - an MIT session wrapper, input mapper and profiles;
  - a three.js tilted highway view;
  - a visualization renderer factory `window.feedBackViz_five_fret`;
  - a controls screen for setup, rebinding and input offset.
- **No Build-a-Band changes:** they are Plan 3.

**Tech Stack:** Vanilla JS (UMD-style IIFEs like the drums plugin), node:test, core's vendored three.js (`/static/vendor/three/three.module.min.js`), the browser Gamepad API, Python only where core already is.

**Spec:** `docs/superpowers/specs/2026-10-20-plastic-controllers-design.md`, in the Build-a-Band repo: sections "The 5-fret highway", "Controller input", "Judging and scoring". Builds on Plan 1 (`2026-10-20-plastic-controllers-plan-1-charts.md`). The YARG porting map is `2026-10-21-yarg-fivefret-porting-map.md` next to this plan.

## Global Constraints

- **Git worktrees:**
  - Core: `feedback-upstream/.worktrees/core-five-fret`, branch `feature/five-fret-charts`.
  - New plugin repo: `feedback-upstream/feedBack-plugin-five-fret`, branch `main`. Nobody else uses it, so no worktree.
  - Never touch other sessions' checkouts.
- **Push as you go:** push each completed task to `origin` on the mattromano forks (Matt's instruction). The plugin repo is created as `mattromano/feedBack-plugin-five-fret` (public, like `feedBack-plugin-build-a-band`) in Task 4.
- **Commits:** as `mattromano <42412983+mattromano@users.noreply.github.com>` with `git commit -s`, committer email the same (GitHub rejects the private one).
- **Silent testing (Matt):** never start anything with sound in the installed app without asking: no playSong, play, count-in, metronome or calibration clicks. Check paused, over CDP, with screenshots. If something plays, pause it at once.
- **Testing location:** installed app only (`slopsmith-custom/feedback-fork/debug/README.md`). Never the browser dev server or the Claude app's browser. Ask before quitting Matt's running copy.
- **Licences:**
  - `assets/engine.js` (and only YARG-derived code) is LGPL-3.0, a port of YARG.Core (`master`), credited in `NOTICE.md` exactly as `feedBack-plugin-drums/NOTICE.md` does.
  - Everything else in the plugin is MIT.
  - Include `LICENSE.LGPL-3.0` and `LICENSE.GPL-3.0`, copied from the drums plugin.
- **No YARG / Clone Hero art, logos or sounds.** Draw our own.
- **Colours:** green `#2ecc40`, red `#e5322d`, yellow `#f7d117`, blue `#2f7de1`, orange `#f28c28`, open-note purple `#b56cff`, overdrive blue `#4aa8ff` (from the approved mockup).
- **Tests:**
  - Core JS: `npm run test:js` (`node --test tests/js/*.test.js ...`); core Python as before.
  - Plugin: `node --test tests/*.test.js`, CommonJS, no dependencies, like the drums plugin.
- **No per-frame DOM queries** in draw or rAF paths (core CLAUDE.md "Performance").

## Decisions this plan locks in

- **Core passes raw input; the plugin names it.**
  - `gamepad-input` delivers raw `{button|axis index, value, pressed}` with the controller's `id`, `mapping`, vendor and product.
  - Profiles and naming (`green`, `strum_down`, …) live in the plugin.
  - The spec put "matched profile" in the domain; moving it to the plugin keeps core generic. Drums reuses the same layer in Plan 6 with its own profiles.
- **Plastic-controller profiles:** only the standard-gamepad profile ships with known indices. Any other controller (plastic guitars included) goes through the "press each button" setup, which saves a profile per controller. The spec's "untested plastic profiles from YARG/Clone Hero lists" is deferred until someone has hardware: unverified indices would be guesses.
- **Picking the part:**
  - The renderer's `matchesArrangement(songInfo)` is true only for a song whose arrangement list is the single 5-fret placeholder (Plan 1's 5-fret-only packs). On any other song the player picks "5-Fret" in the viz picker.
  - The renderer then picks a part from `bundle.fiveFretParts` by the setting `part`: `auto` | `guitar` | `rhythm` | `bass`, by instrument, so it can be declared statically.
  - `auto` chooses bass when the current arrangement name contains "bass", else guitar, else the first part.
- **Where settings live:**
  - **Splitscreen:** `part`, `difficulty`, `lefty` and `gamepadMode` are declared statically in `plugin.json` `capabilities.visualization.settings` (core CLAUDE.md "Per-instance settings"), with `applySetting` on the instance.
  - **Normal player:** while the 5-fret renderer is active, the plugin mounts a small "5-Fret" panel (part, difficulty, lefty, gamepad mode, link to controls) into `window.feedBack.ui.playerControlSlot()` (core CLAUDE.md "v3 UI"), and removes it on destroy.
  - Both save to `five_fret.settings.v1`.
- **Menus while playing:** core's menu gamepad support ignores **all** controllers while any controller is claimed. Steam Input mirrors one pad into extra standard slots (`static/v3/gamepad.js` ~169–173), and identical controllers share an `id`, so ignoring only the claimed slot would leak A → Space → pause. Start (pause) is handled by the plugin.
- **Time:** the engine runs on the **highway's chart clock** (`bundle.currentTime`, which includes song and A/V offsets), as the drums plugin does (`feedBack-plugin-drums/screen.js` ~2563–2595). At each draw the renderer records `(bundle.currentTime, performance.now()/1000)`. An input's time is `lastChartTime + (ev.t − lastFrameT)` minus the controller's input offset. Never mix in `getDisplayTime()`.
- **Gamepad mode** (default on for standard gamepads, off for anything set up as a guitar) is Clone Hero's rule, a separate hit path in the engine and a listed deviation from YARG:
  - no strum events;
  - whenever the set of held frets changes, the next unhit note inside the hit window is hit if the held frets match it (chords exactly; single notes with YARG's anchoring rule);
  - the open-note button hits an open note;
  - wrong presses are ignored (no overstrum), and a note is missed only when its window passes.
- **Storage** (localStorage, every access in try/catch):
  - `five_fret.bindings.v1`: `{ [controllerKey]: { kind: 'gamepad'|'guitar', map: { action: { type: 'button'|'axis', index, sign? } } } }`
  - `five_fret.settings.v1`: `{ difficulty, lefty, gamepadMode, offsetMs: { [controllerKey]: n }, part }`
  - `controllerKey` = `gamepad.id` plus `#n`, for the nth identical controller.

## Review Focus

1. **Menu leaks:** while any controller is claimed, pressing A on any pad (including a mirrored slot) must not reach core's menus (no Space, so no pause). Releasing the last claim restores menu control. Test in Task 3.
2. **Disconnects mid-song:** a claimed controller unplugging must not throw. The session stops reading it, and reconnecting the same `controllerKey` re-claims it. Test in Task 8.
3. **No 5-fret part:** selecting the 5-Fret viz on a song with no 5-fret parts shows a clear "no 5-fret chart" message on the canvas, not a blank or a throw. Test in Task 8.
4. **Seeking or looping:** a jump of more than 0.25 s **in either direction** (against the expected advance since the last frame) resets the engine at the new time without counting skipped notes as misses, as the drums session does (`feedBack-plugin-drums/assets/session.js` ~576–578). Test in Task 8.
5. **Analog triggers:** LT/RT report analog values. A press is value ≥ 0.5 and a release ≤ 0.3 (hysteresis), so a half-held trigger doesn't chatter. Test in Task 6.

---

### Task 1: Core: stream every 5-fret part and give renderers `bundle.fiveFretParts`

**Files (core worktree):**
- Modify: `lib/routers/ws_highway.py`: with no `five_fret_part` param, stream **every** part, in manifest order: one `five_fret` frame and its chunks per part, each frame carrying `part_id`. The param, when given, still restricts the stream to that part.
- Modify: `tests/test_highway_ws_five_fret.py`: `test_unknown_part_sends_nothing` keeps its meaning; add `test_default_streams_all_parts`.
- Modify: `static/highway.js`:
  - `hwState` reset (~l.265 and ~l.1871);
  - the message switch next to `drum_tab` (~l.2614–2660). Five-fret frames carry `notes`, not `data`;
  - `_makeBundle` (~l.610).
- Modify: core `CLAUDE.md` (bundle field list and WebSocket table).
- Test: `tests/js/five_fret_bundle.test.js` (model on `tests/js/drum_tab_metadata.test.js`).

**Interfaces:**
- Produces:
  - `bundle.fiveFretParts`: `{}` when none, else `{ [partId]: { partId, name, instrument, sourceKind, total, notes: [...], levels: { easy|medium|hard: { notes, generated } }, starPower: [{start_time,end_time}], solos: [...] } }`, keyed by the frames' `part_id`. It's a live reference like `bundle.drumTab`.
  - `highway.getFiveFretParts()` returns the same object, for overlays.
  - `getSongInfo().five_fret_parts` is passed through unchanged (part list for UIs).

- [ ] **Step 1: Write the failing tests:**
  - `five_fret frames fold into bundle.fiveFretParts` (two parts, each with a `five_fret` frame, `five_fret_notes` chunks and a `five_fret_level_notes` chunk for `hard`, routed by `part_id`, giving the right counts and fields);
  - `fiveFretParts is empty before any frame and after a new song`;
  - `drumTab still folds unchanged`;
  - Python: `test_default_streams_all_parts`.
- [ ] **Step 2: Run** `npm run test:js -- tests/js/five_fret_bundle.test.js` and `<venv python> -m pytest tests/test_highway_ws_five_fret.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:js` and the full pytest suite. Expected: PASS (same failures as the base branch, if any).
- [ ] **Step 5: Commit** `feat(highway): stream every five-fret part into bundle.fiveFretParts`; push.

### Task 2: Core: `gamepad-input` capability domain

**Files (core worktree):**
- Create: `static/capabilities/gamepad-input.js` (model on `static/capabilities/midi-input.js`, registered with `capabilities.registerOwner('gamepad-input', { pluginId: 'core.gamepad-input', kind: 'provider-coordinator', safety: 'sensitive', … })`)
- Create: `specs/0NN-gamepad-input-domain/spec.md`, next free number, sections as `specs/012-midi-input-domain/spec.md`
- Modify: `static/v3/index.html` (load it right after `midi-input.js`, ~l.138). The module exposes `window.feedBack.gamepadInput` itself, as `midi-input.js` does (~l.361). Also `docs/capability-domains.md`, `docs/capability-safety-matrix.md`, `docs/capability-roadmap.md` (a row each, like midi-input)
- Test: `tests/js/gamepad_input_domain.test.js` (harness: `tests/js/capabilities_test_harness.js` `createWindow`; fake `navigator.getGamepads` and rAF as `tests/js/gamepad.test.js` does)

**Interfaces:**
- Produces `window.feedBack.gamepadInput`:
  - `version: 1`
  - `list() -> [{ index, id, mapping, vendor, product, connected, claimedBy }]`. `vendor` and `product` are parsed from `id` (`Vendor: 045e Product: 02ea` and `(Vendor: 045e Product: 02ea)` forms), else `null`.
  - `claim(index, ownerId) -> handle | null`. `null` when another owner holds it. Claiming again with the same owner returns the same handle.
    - `handle = { index, id, controllerKey, addListener(fn), removeListener(fn), release() }`
    - `fn(ev)` with `ev = { type: 'button'|'axis', index, value, pressed (buttons only), t (performance.now()/1000) }`, fired only on change.
    - Axis changes smaller than 0.02 are ignored.
  - `isClaimed(index) -> boolean`, `claimCount() -> number`
  - `on('change', fn)`: fires on connect, disconnect, claim and release; returns an unsubscribe function.
- Polling runs on rAF only while at least one claim exists.
- On disconnect, the handle stays valid but silent. On reconnect of the same `controllerKey`, events resume on the same handle.
- Capability commands: `inspect` and `list-sources` (read-only snapshots for the capability inspector). Live events go only through the in-page handle, as midi-input does.

- [ ] **Step 1: Write the failing tests:**
  - `list parses vendor/product`
  - `claim/release and isClaimed`
  - `second owner cannot claim`
  - `button and axis change events with deadzone`
  - `polling stops when no claims`
  - `disconnect then reconnect resumes the same handle`
  - `registers the capability owner with inspect and list-sources`
- [ ] **Step 2: Run** `npm run test:js -- tests/js/gamepad_input_domain.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, spec doc, docs rows and `index.html` load.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(capabilities): gamepad-input domain`; push.

### Task 3: Core: menus ignore claimed controllers

**Files (core worktree):**
- Modify: `static/v3/gamepad.js`: `firstLiveStandardPad()` (~l.123) returns no pad while `window.feedBack?.gamepadInput?.claimCount()` is above 0 (see "Menus while playing").
- Test: `tests/js/gamepad.test.js` (extend).

- [ ] **Step 1: Write the failing tests:**
  - `no menu keys while any pad is claimed`: the sandbox gets a `feedBack.gamepadInput.claimCount` stub returning 1; pressing button 0 on pad 0 **and** on a mirrored pad 1 dispatches no keydown.
  - `menus work again when claims drop to 0`.
  - `no gamepadInput present: unchanged behaviour`.
- [ ] **Step 2: Run** `npm run test:js -- tests/js/gamepad.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(gamepad): menus ignore controllers while a plugin has one claimed`; push.

### Task 4: Plugin scaffold and engine, part 1 (notes, strums, HOPOs, scoring)

**Files (new repo `feedBack-plugin-five-fret`):**
- Create:
  - `plugin.json`: id `five_fret`, name "5-Fret", `type: visualization`, `script: screen.js`, `screen: screen.html`, `settings.html`, `standards: ["capability-pipelines.v1"]`, and `capabilities.gamepad-input` with `roles: ["requester"]`, `ownership: "requester-only"`, `compatibility: "degrade-noop"`, `mode: "active"`, `safety: "sensitive"`, `version: 1`. Use the field set the drums plugin uses for `midi-input`.
  - `README.md`, `CHANGELOG.md` (Keep a Changelog, version 0.1.0).
  - `NOTICE.md`: MIT for everything except the LGPL table, with `assets/engine.js` and the YARG.Core files it ports; the "Combined Works" paragraph and the pointer to "Deviations from YARG" as in drums.
  - `LICENSE.LGPL-3.0`, `LICENSE.GPL-3.0` (copied from drums), `.github/workflows/ci.yml` (copied from drums).
  - `assets/engine.js` (LGPL, UMD IIFE setting `module.exports` and `window.FiveFretEngine`).
  - `tests/engine.test.js`.
- Also:
  - create the GitHub repo `mattromano/feedBack-plugin-five-fret` (public) with `gh repo create --public --source . --push` after the first commit;
  - symlink `feedback-upstream/dev-plugins/five_fret` to the repo, like the other dev-plugins.

**Port source:** YARG.Core `master`:
- `YARG.Core/Engine/Guitar/Engines/YargFiveFretGuitarEngine.cs` and `Guitar/GuitarEngine.cs`;
- the parts of `BaseEngine.Generic.cs`, `BaseEngine.cs`, `EngineTimer.cs` and `HitWindowSettings.cs` it needs;
- `GuitarEngineParameters.cs`, `GuitarStats.cs`, `Input/InputActions.cs` (GuitarAction), and the five-fret preset in `Game/Presets/EnginePreset.Instruments.cs`.

Read the raw files (`curl https://raw.githubusercontent.com/YARC-Official/YARG.Core/master/<path>`) and port faithfully. The porting map's Caveats list what the summaries could not confirm.

**Interfaces:**
- Produces: `FiveFretEngine.create(chart, opts) -> Engine`.
  - `chart = { notes: [{t, f, l?, h?, tap?}], starPower: [{start_time,end_time}], solos: [...], beats: [{time, measure}] }` (Plan 1 shape; one entry of `bundle.fiveFretParts` plus `bundle.beats`).
  - `opts = { instrument: 'guitar'|'bass', gamepadMode: bool, params?: overrides }`.
- `Engine` methods:
  - `input(t, action, value)`: `action` is one of `green`, `red`, `yellow`, `blue`, `orange`, `strum_up`, `strum_down`, `open`, `whammy`, `star_power`; `value` is boolean (pressed) or, for `whammy`, 0..1;
  - `update(t)`, `reset(t)`, `getState()`, `noteState(i) -> 'hit'|'miss'|null`, `on(event, fn)`, `off(event, fn)`.
- Task 4 events: `hit`, `miss`, `overstrum`, `combo-reset`.
- `getState()` (Task 4 part): `{ score, combo, multiplier, notesHit, notesMissed, overstrums, ghostInputs }`.
- **Values (YARG five-fret preset):**
  - hit window 0.14 s (front-to-back 1.0, not dynamic); HOPO leniency 0.08 s; strum leniency 0.05 s; small strum leniency 0.025 s;
  - anti-ghosting on; infinite front-end off;
  - 50 points per note plus 50 per extra fret in a chord;
  - multiplier `min(floor(combo/10)+1, max)` with max 4 (guitar) / 6 (bass).

- [ ] **Step 1: Write the failing tests:**
  - `strummed note hit inside window`, `note missed after window`
  - `overstrum with no note breaks combo`
  - `HOPO hit by fret change without strum after a hit`, `HOPO not hittable after a miss until strummed`
  - `tap hittable without strum`
  - `chord needs exact frets` (anchoring: lower frets may be held for single notes, not for chords)
  - `open note hit by strum with no frets`
  - `ghost input breaks HOPO chain` (anti-ghosting)
  - `strum leniency: fret pressed just after strum still hits`
  - `scoring and multiplier steps at 10/20/30 combo`, `bass max multiplier 6`
  - `gamepad mode: held frets matching a strummed note hit it with no strum`, `gamepad mode: chord hit when the last fret of the chord goes down, no overstrum on the way`, `gamepad mode: wrong press is ignored, note missed when its window passes`, `gamepad mode: open button hits an open note`
- [ ] **Step 2: Run** `node --test tests/engine.test.js`. Expected: FAIL.
- [ ] **Step 3: Port** the hit logic, with the file header: LGPL credit, the YARG.Core files and commit SHA ported, and a numbered "Deviations from YARG" list (gamepad mode first).
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five-fret engine port (hit logic and scoring)`; create the GitHub repo and push.

### Task 5: Engine, part 2 (sustains, whammy, star power, solos, stars)

**Files:** Modify `assets/engine.js`, `tests/engine.test.js`.

**Interfaces:**
- Adds events: `sustain-start`, `sustain-end` (`{note, finished}`), `sp-phrase`, `sp-phrase-miss`, `sp-ready`, `sp-activate`, `sp-end`, `solo-start`, `solo-end` (`{percent}`).
- Adds to `getState()`: `{ starPower: { amount (0..1), active }, stars (0..5 incl. fraction), solo: { active, hit, total } }`.
- `input(t, 'star_power', true)` activates star power when the amount is ≥ 0.5.
- **Values:**
  - sustain 25 points per beat (from `chart.beats`); sustain drop leniency 0.025 s; whammy buffer 0.25 s;
  - star power: a completed phrase adds 0.25; activation needs ≥ 0.5; the full bar lasts 8 measures (from `chart.beats` measures); whammy during an SP sustain refills;
  - star thresholds (score ÷ the score of a full-combo, no-SP run): guitar `[0.06, 0.12, 0.2, 0.47, 0.78, 1.15]`, bass `[0.05, 0.1, 0.19, 0.47, 0.78, 1.15]` (YARG `FiveFretGuitarPlayer.cs`, game repo);
  - confirm SP tick sizes and solo bonus against the raw sources. If the solo bonus can't be confirmed, give none and list it as a deviation.

- [ ] **Step 1: Write the failing tests:**
  - `sustain scores per beat while held`, `sustain drop ends sustain early`
  - `SP phrase completed adds a quarter`, `SP phrase broken by a miss gives nothing`
  - `activate at half, refused below half`, `SP drains over 8 measures and doubles multiplier`, `whammy refills during SP sustain`
  - `solo percent`
  - `stars from thresholds for guitar and bass`
  - `reset(t) clears state ahead of t without misses`
- [ ] **Step 2: Run** `node --test tests/engine.test.js`. Expected: FAIL.
- [ ] **Step 3: Port.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five-fret engine port (sustains, star power, solos, stars)`; push.

### Task 6: Profiles, input mapper and bindings

**Files:** Create `assets/profiles.js` (MIT, UMD `window.FiveFretProfiles`) and `tests/profiles.test.js`.

**Interfaces:**
- Produces:
  - `STANDARD_GAMEPAD`: profile for `mapping === 'standard'`, `kind: 'gamepad'`, `map`:
    - green: button 6 (LT); red: button 4 (LB); yellow: button 5 (RB); blue: button 7 (RT); orange: button 0 (A); open: button 2 (X);
    - star_power: button 3 (Y); pause: button 9 (Start); whammy: axis 2 (right stick X, absolute value);
    - strum_down: button 13 (d-pad down); strum_up: button 12 (d-pad up). D-pad strums are used only when gamepad mode is off.
  - `controllerKey(gamepadInfo, nth) -> string`
  - `resolveBinding(info, stored) -> profile | null`: the stored binding, else `STANDARD_GAMEPAD` for standard mapping, else `null` (needs setup).
  - `createMapper(profile) -> { map(ev) -> [{action, value}] }`. Analog buttons press at ≥ 0.5 and release at ≤ 0.3 (Review Focus 5). Whammy is normalised to 0..1. Gamepad mode is the engine's concern (Task 4), not the mapper's.
  - `loadBindings()`, `saveBinding(key, binding)`, `loadSettings()`, `saveSettings(patch)` (localStorage keys from "Decisions", try/catch).
- [ ] **Step 1: Write the failing tests:** `standard profile mapping`, `trigger hysteresis`, `whammy normalised`, `stored binding beats standard`, `unknown controller needs setup`, `storage survives a throwing localStorage`.
- [ ] **Step 2: Run** `node --test tests/profiles.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller profiles, mapper and bindings`; push.

### Task 7: Tilted highway view and layout

**Files:** Create:
- `assets/layout.js` (MIT, pure: `laneX(fretIndex, lefty)`, `noteZ(t, now, speed)`, `gemKind(note) -> 'strum'|'hopo'|'tap'|'open'`, `visibleWindow(notes, now, ahead, behind) -> [i0, i1]` by binary search);
- `assets/highway3d.js` (MIT, `createView(THREE, canvas, { hudCanvas, context }) -> { render(frame), resize(w,h), destroy() }`, like `feedBack-plugin-drums/assets/highway3d.js`);
- `tests/layout.test.js`.

**What the view draws** (spec "The 5-fret highway", option A):
- a tilted highway with five lanes and beat lines from `frame.beats`;
- round gems in the five colours; HOPOs with a white glow; taps with a dark centre; open notes as a purple bar;
- sustain tails that wobble with `frame.whammy`;
- star power: SP-phrase gems white/blue, and the highway tinted blue while SP is active;
- solo sections as a band, with the running percent on the HUD;
- strike-line fret buttons lit from `frame.pressed`;
- hit gems flash and vanish, missed gems dim (from `frame.noteState(i)`);
- lefty mirrors the lanes.

The HUD canvas shows score, multiplier, streak, SP bar, stars, the header tag "PART · INPUT · DIFFICULTY" and **AUTO CHART** when `sourceKind === 'auto'`.

`frame = { now, notes, beats, starPower, solos, pressed: bool[5], whammy, noteState, state (engine getState), lefty, header, sourceKind }`.

- [ ] **Step 1: Write the failing tests:** `laneX order and lefty mirror`, `gemKind`, `visibleWindow binary search`, `createView throws a clear error without WebGL2` (like drums).
- [ ] **Step 2: Run** `node --test tests/layout.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. Load three.js the way drums does (`import('/static/vendor/three/three.module.min.js')`).
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: tilted 5-fret highway view`; push.

### Task 8: Session, renderer factory and player wiring

**Files:** Create:
- `assets/session.js` (MIT, UMD `window.FiveFretSession`), modelled on `feedBack-plugin-drums/assets/session.js` `createSession`;
- `screen.js` (renderer factory and wiring);
- `tests/session.test.js`.

**Interfaces:**
- `FiveFretSession.createSession({ chart, instrument, difficulty, gamepadMode, offsetMs })`:
  - `input(action, value, tSong)`, `update(tSong)`;
  - `update(tSong)` detects a jump of more than 0.25 s either way against the expected advance and calls `engine.reset(tSong)` (Review Focus 4);
  - `pressedFrets()`, `whammy()`, `state()`, `noteState(i)`, `drainEvents()`.
  - The chart's notes for a difficulty are `levels[difficulty].notes`, or the top-level notes for `expert`.
- `window.feedBackViz_five_fret = () => renderer`:
  - `contextType = 'webgl2'` on the renderer **and** as a static on the factory (`window.feedBackViz_five_fret.contextType`), which Auto mode reads (`static/js/viz.js` ~762), as drums does;
  - `matchesArrangement(songInfo)` as in "Decisions";
  - settings as in "Where settings live": static `capabilities.visualization.settings` in `plugin.json` (`part` select auto|guitar|rhythm|bass; `difficulty` select easy|medium|hard|expert, default expert; `lefty` toggle; `gamepadMode` toggle) plus `applySetting(key, value)`, and the normal-player panel in `playerControlSlot()`.
- **On `init`:**
  - claim the first controller with a resolvable binding through `window.feedBack.gamepadInput.claim(i, 'five_fret')`;
  - map its events and feed `session.input(action, value, t)` with `t` from the highway chart clock as in "Decisions → Time".
- **On `draw(bundle)`:**
  - pick the part from `bundle.fiveFretParts` (`pickPart`); when the part or difficulty changes, rebuild the session. Then record the clock pair, `session.update(bundle.currentTime)` and `view.render(frame)`;
  - with no 5-fret parts, draw "No 5-fret chart for this song" on the HUD (Review Focus 3);
  - with no controller, draw "Connect a controller and press any button".
- **On `destroy`:** release the claim, remove the player panel, dispose the view.
- **Disconnect** (Review Focus 2): handled by the domain. The session keeps running without input, and the HUD shows "Controller disconnected" until events resume.
- **Start pauses:** the profile's `pause` action calls the global `window.togglePlay()` (`static/app.js` ~2563), guarded with `typeof window.togglePlay === 'function'`.

- [ ] **Step 1: Write the failing tests** (session.test.js, engine and profiles loaded with `require`):
  - `difficulty picks the level notes`
  - `input offset shifts judgment time`
  - `seek backwards resets without misses`, `seek forwards resets without misses`, `normal frame-to-frame advance does not reset`
  - `forward play through a chart: all hit with perfect inputs scores full combo`
  - `disconnect leaves session running` (no input for a while: misses counted, no throw).
  - Also a pure test of the part-picking helper: `pickPart(fiveFretParts, arrangementName, setting) -> partId|null`, by instrument.
  - And of the clock helper: `inputChartTime(lastChartTime, lastFrameT, evT, offsetMs)`.
  - And of `statusMessage({ hasParts, hasController, connected }) -> string|null`, which the HUD shows: no parts gives "No 5-fret chart for this song"; no controller gives "Connect a controller and press any button"; disconnected gives "Controller disconnected"; otherwise `null`.
- [ ] **Step 2: Run** `node --test tests/session.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `session.js` and `screen.js`. Bump `ASSET_VERSION` in `screen.js` with releases, as drums does.
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: 5-fret session and player renderer`; push.

### Task 9: Controls screen: setup, rebinding and input offset

**Files:** Create `screen.html` (plugin screen "5-Fret controls") and `settings.html` (link to it). Modify `screen.js` (screen logic), `assets/profiles.js` (setup helpers). Test: `tests/setup.test.js`.

**Interfaces:**
- **Screen:**
  - lists controllers (`gamepadInput.list()`) with live button lights;
  - for each controller: **Set up as guitar** / **Set up as gamepad**;
  - **Rebind**: pick an action, press the button or move the axis;
  - **Input offset** (ms, −200..200, step 5);
  - **Calibrate**: strum along to clicks and set the median offset. The clicks make sound, so the real-app check of calibration needs Matt's permission (Task 10).
- `createSetupRecorder(actions) -> { feed(ev) -> {done, next, binding} }`, pure:
  - walks the action list (guitar: green, red, yellow, blue, orange, strum_down, strum_up, whammy, star_power, pause; gamepad: the STANDARD_GAMEPAD actions);
  - takes the first new button press, or an axis moving more than 0.5 from rest (with `sign`), per action;
  - ignores a control already used.
- `calibrationOffset(clickTimes, strumTimes) -> ms`: the median of nearest-pair differences, ignoring pairs more than 150 ms apart.
- The screen claims the controller while open and releases it on leave.

- [ ] **Step 1: Write the failing tests:** `setup records each action once`, `axis recorded with sign`, `duplicate control ignored`, `calibration median ignores outliers`.
- [ ] **Step 2: Run** `node --test tests/setup.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller setup, rebinding and input offset`; push.

### Task 10: Real-app check

No new code. Silent unless Matt says otherwise.

- [ ] **Step 1: Install.** Sync core with `dev-sync.sh` from a clean worktree of the branch, using `FB_ROOT` and an empty `dev-plugins` as in Plan 1's Task 8. Copy the plugin into `/Applications/feedback.app/Contents/Resources/slopsmith/plugins/five_fret/` (dev-sync skips plugins the bundle doesn't have). Ask before quitting Matt's app if it's running.
- [ ] **Step 2: Launch** with `launch-debug.sh`. Open "Misery Business (5-fret test)" (Plan 1's test pack) without playing. Pick the 5-Fret viz, part Bass. **Paused,** seek to 30 s and take a screenshot over CDP: the tilted highway shows bass gems, the HUD and the header tag.
- [ ] **Step 3: Controller, if one is connected:**
  - claim it and press A: the fret lights and the menus don't react (Review Focus 1);
  - leave the screen: menus work again;
  - with no controller, check the "Connect a controller" message instead.
- [ ] **Step 4: Ask Matt** whether to run an audible 30 s play-through with a controller, and whether to test calibration clicks. Do it only on a yes, then pause and leave nothing playing.
- [ ] **Step 5: Check nothing else broke.** A normal song with the default highway, and a drum song with the drums viz, still load (paused).
- [ ] **Step 6: Record** results below and in the shared notes. Push all branches.

## Later plans

3. **Build-a-Band controller parts:**
   - Start-to-join, part types `five_fret_controller` and drums `controller`;
   - shared parts and N lanes;
   - part-audio-on-miss;
   - a public `window.feedBackFiveFret` band API (input target, difficulty, events `five_fret:hit|miss|overstrum|sp-*` with `detail.canvas`), mirroring `window.feedBackDrums`.
4. **Library tool for real guitar/bass charts.**
5. **Auto-charter and benchmark.**
6. **Controller drums:** a drums plugin gamepad source on `gamepad-input`.

## Review

(Filled in after Task 10.)
