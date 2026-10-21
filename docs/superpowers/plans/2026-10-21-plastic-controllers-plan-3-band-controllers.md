# Plastic controllers, Plan 3: Build-a-Band controller parts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone holding an Xbox controller or a plastic guitar presses **Start** on the band screen, picks Lead, Rhythm or Bass and a difficulty, and plays a 5-fret lane next to the real guitarist, drummer and singer. They share one clock, one HUD, overdrive, fail and results, and their part's stem drops out on a miss, Rock Band style.

**Architecture:**
- **Core** (two small additive changes):
  - `gamepadInput.watch(fn)`: a passive listener on **unclaimed** controllers. Start-to-join can then hear any pad without claiming one, so menus keep working until someone joins.
  - `list()` entries gain `controllerKey`.
  - The library's `five_fret` filter takes a comma list. Every entry must match, so "playable by this band" can ask for Lead **and** Bass at once.
- **The five-fret plugin** gets a public band API, `window.feedBackFiveFret`, modelled on `window.feedBackDrums`:
  - `setLane(canvas, …)` pins a renderer instance to one controller, part, difficulty and lefty;
  - per-canvas score-HUD hiding and `getInstanceState`;
  - controller listing and mappers for the band screen;
  - bus events `five_fret:*`, each with `detail.canvas`.
- **Build-a-Band** treats a controller player as a **player id** (`ctl1`, `ctl2`, …) next to the fixed `guitar` / `drums` / `vocals` ids. The ledger, HUD, overdrive, fail and results are already keyed by id strings, so they take any number of players. What is new:
  - controller columns on the band screen, driven by a join manager;
  - N lanes in the stage's bottom row, each a `createHighway()` running the 5-fret renderer;
  - a per-stem part-audio state machine;
  - filters, chips and results cards.
- **Controller drums are Plan 6.** The seam: `CONTROLLER_KINDS` in `src/controller-model.js` has one entry (`five_fret`), and every controller code path goes through it. Plan 6 adds `drums` plus a drums-plugin mapper and lane renderer.

**Tech Stack:**
- Build-a-Band: ES modules, `node --test "tests/*.test.mjs"` through `npm test`, no dependencies.
- Five-fret: UMD/IIFE, CommonJS tests (`node --test tests/*.test.js`).
- Core: classic scripts, `npm run test:js`, and Python/pytest for the library filter.

**Spec:** `docs/superpowers/specs/2026-10-20-plastic-controllers-design.md` in the Build-a-Band repo. The binding sections are "User flow", "How it plugs into the band", "Part audio on a miss (Matt's decision)", "Changes this needs from the Build-a-Band design" and "Testing and acceptance". The part interface comes from `2026-10-20-build-a-band-design.md` ("Parts are instrument + how you play it", "Scoring and the HUD"). Builds on Plan 2 (`2026-10-21-plastic-controllers-plan-2-highway-input.md`, next to this file).

**Heads read for this plan:**

| Repo | Head |
|---|---|
| Build-a-Band | `c476654` on `feature/build-a-band-stage`, actively developed by another session |
| five-fret | `686bb98` on `main` |
| core-five-fret | `d4e7483` |

Line numbers below are from those heads. Re-read the function before you edit it.

## Global Constraints

- **Worktrees:**
  - Build-a-Band work happens in a NEW worktree `feedback-upstream/.worktrees/bab-controllers` on branch `feature/band-controllers`, cut from the current `feature/build-a-band-stage`. Task 0 creates it. Never touch the main build-a-band checkout.
  - Five-fret plugin work is on `main` in its own repo (`feedback-upstream/feedBack-plugin-five-fret`).
  - Core work, where needed, is in `.worktrees/core-five-fret` on `feature/five-fret-charts`.
- **Commits:** as `mattromano <42412983+mattromano@users.noreply.github.com>` with `-s`, committer email the same:
  `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- **Push** each completed task to `origin` (the mattromano forks). No PRs.
- **Silent testing:** never start sound in the installed app without asking. Check paused, over CDP.
- **Installed app only** for real-app checks (`slopsmith-custom/feedback-fork/debug/README.md`). Never the browser dev server or the Claude app's browser. Ask before quitting Matt's running copy.
- **Performance:** no per-frame DOM queries or allocations (draw paths, rAF loops, the lane clock, gamepad polling).
- **Licences unchanged:**
  - Build-a-Band is MIT (its `LICENSE`) except `src/yarg-rules.js` and its test, which are LGPL-3.0 (`NOTICE.md`). Plan 3 adds no YARG-derived code to it.
  - Five-fret is MIT except `assets/engine.js`, which is LGPL-3.0. The band API goes in MIT `screen.js` / `assets/session.js`.
  - Core is AGPL-3.0.
- **Icons:** Lucide only, vendored verbatim into `src/icons.js` (lucide-static 0.468.0).
- **CRLF:** none of the files touched here use CRLF. Check with `file <path>` before editing anything not listed.
- **Tests:**
  - Build-a-Band: `npm test` in the worktree.
  - Five-fret: `node --test tests/*.test.js`.
  - Core: `npm run test:js`, and `../../feedBack/.venv/bin/python -m pytest tests -q` from the core worktree.

## Decisions this plan locks in

Matt asked for every plan to be finished without his input. Each call below says why.

1. **Player ids.**
   - A controller player is `ctl<N>` (smallest free N ≥ 1), stored in `prefs.controllers`:
     `[{ key, id, name, playsAs: 'five_fret', part: 'guitar'|'rhythm'|'bass', difficulty, lefty, partAudio: 'rockband'|'always' }]`, in join order.
   - `key` is the gamepad-input `controllerKey` (`id#n`). That is the spec's "remembered by id, and by order for identical controllers".
   - Joined controllers stay joined across songs and restarts until they leave. A joined controller that isn't connected shows "Not connected" and sits out.
   - Why: the band ledger, HUD and overdrive are already keyed by id strings, so a short, selector-safe id slots in without restructuring `PART_TYPES`, which stays the three fixed columns.
2. **Start-to-join without stealing the menus.**
   - The band screen hears unclaimed pads through core's new passive `gamepadInput.watch`, not a claim. Claiming would switch core's menus off for every pad (Plan 2's rule).
   - A controller joins when its binding's `pause` action (Start) is pressed.
   - Controllers that need setup (non-standard mapping, no saved binding) can't join. The join slot lists them with a **Set up** link to the 5-Fret controls screen.
3. **Joined controllers on the band screen.**
   - While the band screen is shown, Build-a-Band claims every joined, connected controller (owner `build_a_band`). That gives the live fret lights and satisfies the spec's "menus no longer react to that controller".
   - Because any claim stands core's menus down, **Start** on a joined controller acts as the screen's primary button: **Choose a song** on Setup, **GO** on Confirm.
   - **Hold Back (button 8, standard pads) for 1 s**, or click the column's **Leave**, to leave.
   - Claims are released whenever the band screen hides, so the library pick, the 5-Fret controls screen and the stage get the controllers. On the stage the five-fret renderer claims, as in Plan 2.
4. **Plays as.** Only 5-fret exists in Plan 3. `playsAs` is stored and validated against `CONTROLLER_KINDS`. The column shows no "plays as" choice while only one kind is registered. Plan 6 registers `drums`, and the choice appears then.
5. **Column defaults:**
   - part: the first of Lead → Bass → Rhythm that no other controller holds, else Lead (shared);
   - difficulty `medium`, like every band part;
   - lefty off; Part audio Rock Band.
   - Gamepad mode isn't on the column. Lanes use Plan 2's rule: on for gamepads, off for guitars, or the player's 5-Fret setting.
6. **A part the song lacks:**
   - On Confirm a controller plays its stored part when the song has it, else the first of Lead, Bass, Rhythm the song has (shown selected, as the guitar column does). With no 5-fret part the row is unavailable ("No 5-fret chart for this song") and sits out.
   - Lanes pin the part exactly. `pickPart` gains an `exact` flag so a pinned Rhythm never silently plays Lead.
7. **Lane layout:**
   - Real lanes stay on the left in the existing guitar | divider | drums order, splitting their region by `split`. Controller lanes sit on the right in join order, each `min(22%, 60% / n)` of the row.
   - With no real lane, controllers share the row equally. One controller alone fills it.
   - Controller lanes get no zoom chrome: the lane width is the knob, and zoom wasn't asked for.
8. **Band score uses the five-fret engine's numbers as they are** (spec: same exception as drums).
   - A lane's ledger points are the **engine score delta** since its last event (hits, plus `sustain-end` for held sustain points). The lane's band score therefore equals its engine score.
   - A drop in engine score (Plan 2 resets scoring on a seek) restarts the delta from the new score.
   - The band multiplier reads the lane multiplier halved while star power is active, as drums does.
   - Stars come from the engine's **full-chart** `starThresholds` through `setStarThresholds`, not from `detail.stars`, which after a seek only covers the rest of the chart (the drums M6 lesson).
9. **Overstrum counts as an overhit:** a crowd hit and a stem drop-out.
10. **Part audio, one rule per stem:**
    - Stems: Bass → `bass`; Rhythm → `rhythm` if the song has one, else the guitar stem; Lead → the guitar stem.
    - A stem **drops on a miss or overstrum only when every player on it is a controller set to Rock Band**. Any active controller's hit brings it back, and any seek restores it.
    - An **Always play** controller on a stem, or a real-instrument part on it, keeps that stem playing through misses. Why: the guitarist's stem is "unchanged from v1", and a shared stem is the other player's audio too.
    - **Fail:** a stem mutes when every player on it has failed out and at least one of them is a controller. That is the spec's "unless another active player is still on that stem". Real parts keep their v1 fail claims.
    - Failed players' judgments don't move the stem.
    - Claims: `build_a_band:sound:stem:<stemId>`.
11. **In a band lane, the 5-Fret HUD hides** score, multiplier, streak, SP bar and stars. It keeps the header tag (with **AUTO CHART**) and its status messages ("Controller disconnected").
12. **Filters:**
    - New chips **5-fret part** (`five_fret=any`) and **Real 5-fret** (`five_fret=any:chart`).
    - **Playable by band** adds each on controller's instrument (`five_fret=guitar,bass`), relying on core's AND list and on `mergeParams` joining comma lists.
    - "Real" is core's `chart` source kind.
13. **Names:**
    - A controller's `name` is the gamepad id up to its first ` (`, trimmed to 24 characters, plus ` 2` for the second identical one.
    - Lane tag: `Bass (5-Fret) · Expert · <name>`. Results card: `Bass (5-Fret)` with the controller name under it.
    - Fallback award: "Held the frets".
    - Colour: green `#2ecc40`, from Plan 2's palette, distinct from guitar gold, drums red and vocals purple.
14. **Lanes connect to the song's current arrangement WS** (`song.arrangementIndex`). Core streams every 5-fret part on any arrangement (Plan 2 Task 1). Each lane is its own WS and renderer: one chart, separate engines and scores.
15. **A 5-fret-only pack's placeholder arrangement (`notes: 0`) is not a real guitar part.** `guitarArrIndex` skips entries whose `notes` is exactly 0.
16. **Missing pieces degrade with a note, never a throw:**
    - no five-fret plugin: the join slot says "Install the 5-Fret plugin to play on a controller";
    - an older core with no `watch`: "Update feedBack to join with a controller";
    - a lane that fails to start leaves the band, as the drum lane does.

## Review Focus

1. **A joined controller unplugged** between songs or before Go:
   - its column shows "Not connected";
   - Go plays without it (no dead lane, no ledger entry);
   - plugging it back in re-claims it on the band screen.
   - Mid-song disconnects keep Plan 2's behaviour (lane runs, HUD message).
   - Tests in Tasks 6, 7 and 11.
2. **Two identical controllers:** each keeps its own key (`#1` / `#2`) through join, lights, claims and lanes, and two players on one part get two lanes and two scores. Tests in Tasks 7, 9 and 11.
3. **Fret presses on the band screen** (A is orange on a gamepad) never press GO, Space or menu keys while a controller is joined. Only Start acts. Tests in Tasks 7 and 8.
4. **The song lacks the chosen part**, or is a 5-fret-only pack:
   - the controller falls back to a part the song has, or sits out;
   - the real guitar column is unavailable on a 5-fret-only pack.
   - Tests in Tasks 5 and 6.
5. **Rewinds and seeks with controllers:**
   - a backward seek drops later controller entries;
   - the next score delta starts from the engine's reset score;
   - dropped stems come back.
   - Tests in Tasks 11 and 12.

---

### Task 0: Build-a-Band worktree and baseline

- [ ] **Step 1: Create the worktree** (from `feedback-upstream/`):
  `git -C feedBack-plugin-build-a-band worktree add ../.worktrees/bab-controllers -b feature/band-controllers feature/build-a-band-stage`
- [ ] **Step 2: Baseline.** Run `npm test` in `.worktrees/bab-controllers`. Expected: PASS. Record the test count here.
- [ ] **Step 3: Push** with `git push -u origin feature/band-controllers`.

### Task 1: Core: `gamepadInput.watch` and `controllerKey` in `list()`

**Files (core worktree):**
- Modify: `static/capabilities/gamepad-input.js`:
  - `list()` ~l.236;
  - the poll loop `_poll` ~l.185, `_schedule` ~l.207 and `_onConnection` ~l.218;
  - the public object ~l.336.
- Modify: `specs/014-gamepad-input-domain/spec.md` and `docs/capability-domains.md` (document `watch`).
- Test: `tests/js/gamepad_input_domain.test.js` (extend).

**Interfaces:**
- Produces:
  - `gamepadInput.watch(fn) -> unsubscribe`:
    - `fn(ev)`, with `ev = { pad, type: 'button'|'axis', index, value, pressed (buttons), t }`, is called for controllers that are connected and **not claimed**, any mapping, on change only;
    - axis changes under 0.02 are ignored, as for claims;
    - a pad's baseline is taken when watching starts, when it connects and when its claim is released, so held inputs never fire.
  - Polling runs while there is at least one watcher **or** claim. The steady state allocates nothing (per-slot state arrays reused).
  - A watcher is not a claim: `claimCount()` is unchanged, so core's menus are unaffected.
  - `list()` entries gain `controllerKey`: the claim's key when claimed, else what `claim(index)` would assign now (`_keyFor`).
  - `version` stays 1. Consumers feature-check `typeof gi.watch === 'function'`.

- [ ] **Step 1: Write the failing tests:**
  - `watch reports button and axis changes on unclaimed pads only`
  - `watch is not a claim: claimCount stays 0`
  - `a claimed pad stops reaching watchers; after release it resumes from a fresh baseline`
  - `non-standard mapping pads are watched`
  - `unsubscribing the last watcher with no claims stops polling`
  - `list carries controllerKey for claimed and unclaimed pads; identical ids are #1 and #2`
- [ ] **Step 2: Run** `npm run test:js -- tests/js/gamepad_input_domain.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(capabilities): gamepad-input watch for unclaimed controllers`; push.

### Task 2: Core: `five_fret` filter takes an AND list

**Files (core worktree):**
- Modify:
  - `lib/library_registry.py` `_parse_five_fret` (~l.432);
  - `lib/metadata_db.py` `_five_fret_sql` (~l.106) and its use (~l.4026);
  - the type hints (`five_fret: str | None`) in the `metadata_db` query functions that pass it on;
  - core `CLAUDE.md`, the `/api/library` filter row.
- Test: `tests/test_library_five_fret.py` (extend `test_parse_five_fret`, add filter tests).

**Interfaces:**
- Produces `five_fret=<entry>[,<entry>…]`:
  - each entry is `any`, `any:chart|auto`, `<guitar|rhythm|bass>` or `<inst>:chart|auto`;
  - **every** valid entry must match (AND); invalid entries are dropped; no valid entry means no filter;
  - duplicates collapse;
  - `_parse_five_fret` returns a tuple of entries or `None`, and `_five_fret_sql` ANDs one `EXISTS` per entry (`any:<kind>` is `value LIKE '%:<kind>'`).

- [ ] **Step 1: Write the failing tests:**
  - `test_parse_five_fret_list` (`"guitar,bass"`, `"any:chart"`, `"bass,nope"` → `("bass",)`, `"nope"` → `None`);
  - `test_filter_and_list` (a guitar-only song fails `guitar,bass`; a guitar+bass song passes);
  - `test_filter_any_chart` (an auto-only song fails).
- [ ] **Step 2: Run** `../../feedBack/.venv/bin/python -m pytest tests/test_library_five_fret.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full pytest suite. Expected: PASS (same skips as base).
- [ ] **Step 5: Commit** `feat(library): five_fret filter takes an AND list and any:<kind>`; push.

### Task 3: Five-fret: `window.feedBackFiveFret` band API

**Files (five-fret repo):**
- Modify `screen.js`:
  - `claimable()` ~l.325 and `tryClaim()` ~l.347: a pinned instance claims only its key;
  - `draw` ~l.573: the pinned part, difficulty and lefty;
  - `_mountPanel` ~l.152: never for a pinned instance;
  - the factory section ~l.737: the API object;
  - `_openControls` ~l.686: Back returns to `returnTo`.
- Modify:
  - `assets/session.js`: `pickPart(parts, arrangementName, setting, exact)` ~l.72; `starThresholds()` on the session;
  - `assets/highway3d.js`: `frame.scoreHidden` skips score, multiplier, streak, SP bar and stars in `drawHud` ~l.462;
  - `README.md` (document the API), `CHANGELOG.md` (0.2.0).
- Test: `tests/screen.test.js`, `tests/session.test.js`, `tests/layout.test.js` (HUD flag only if testable there; otherwise the screen test checks the frame flag).

**Interfaces:**
- Produces `window.feedBackFiveFret`:
  - `version: 1`.
  - `setLane(canvas, { controllerKey, part, difficulty, lefty }) -> boolean`:
    - pins the renderer instance drawing on `canvas`, now or when one inits on it (a canvas-keyed map, as drums' `_bandDifficulty`);
    - `part` is `'guitar'|'rhythm'|'bass'`, played exactly (`pickPart(…, true)`; a missing instrument shows "No 5-fret chart for this song");
    - `difficulty` is `easy|medium|hard|expert`; `lefty` is a boolean;
    - a pinned instance claims only `controllerKey`, still only while a part plays (Plan 2's rule);
    - it never mounts the normal-player panel and never saves `five_fret.settings.v1`;
    - false on bad arguments; calling again updates.
  - `clearLane(canvas)`: the pin is forgotten. The instance goes back to its own settings and claim order.
  - `setDifficulty(id, canvas)`: updates a pinned lane's difficulty (drums parity).
  - `setScoreHudHidden(canvas, hidden) -> boolean`, `isScoreHudHidden(canvas) -> boolean` (sets `frame.scoreHidden`).
  - `getInstanceState(canvas) -> null | { ...engine getState(), starThresholds: number[], partId, instrument, sourceKind, controllerKey, connected }`:
    - `starThresholds` is the session engine's full-chart thresholds (`engine.starThresholds`), stable across seeks.
  - `listControllers() -> [{ index, controllerKey, id, mapping, name, kind: 'gamepad'|'guitar'|null, connected, claimedBy }]`:
    - `kind` comes from `resolveBinding` (null: needs setup);
    - `name` follows Decision 13.
  - `createMapper(controllerKey) -> { map(ev) -> [{ action, value }] } | null`: built from the resolved binding.
  - `openControls({ returnTo }) -> void`: shows `plugin-five_fret`; its Back button goes to `returnTo` (default `home`) for that visit.

- [ ] **Step 1: Write the failing tests:**
  - `setLane before init pins the instance that inits on the canvas`
  - `a pinned lane claims only its controllerKey, even with a standard pad in an earlier slot`
  - `a pinned lane plays its part exactly: Rhythm missing shows the no-chart message`
  - `a pinned lane uses the pinned difficulty and lefty and never mounts the panel or saves settings`
  - `clearLane returns the instance to its own settings`
  - `setScoreHudHidden sets frame.scoreHidden for that canvas only`
  - `getInstanceState returns engine state plus full-chart starThresholds, unchanged by a seek`
  - `listControllers names, kinds and keys (two identical pads #1, #2; unknown non-standard kind null)`
  - `createMapper maps a standard pad's Start to pause`
  - `openControls returns to returnTo on Back`
  - Session: `pickPart exact returns null for a missing instrument`
- [ ] **Step 2: Run** `node --test tests/screen.test.js tests/session.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Bump `ASSET_VERSION` to `0.2.0`.
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band API (lanes pinned to a controller, part and difficulty)`; push.

### Task 4: Five-fret: judgment and star power events on core's bus

**Files:** Modify `screen.js` (`draw` ~l.590, where `session.drainEvents()` is discarded today) and `README.md`. Test: `tests/screen.test.js`.

**Interfaces:**
- Produces bus events `five_fret:<type>` for `type` in `hit`, `miss`, `overstrum`, `sustain-end`, `sp-phrase`, `sp-ready`, `sp-activate`, `sp-end`, emitted from every instance's draw:
  - detail: `{ ...engine payload, canvas, controllerKey, partId, instrument, score, combo, multiplier, spActive }`;
  - `score`, `combo`, `multiplier` and `spActive` come from **one** `session.state()` read per draw that has events;
  - a draw with no events allocates nothing;
  - only when the bus can emit (drums' pattern, `feedBack-plugin-drums/screen.js` ~2741–2747);
  - a listener that throws never breaks the draw.

- [ ] **Step 1: Write the failing tests:**
  - `a hit emits five_fret:hit with canvas, controllerKey, points, score, combo, multiplier, spActive`
  - `a missed note emits five_fret:miss; an overstrum emits five_fret:overstrum`
  - `star power activation emits five_fret:sp-activate`
  - `no events: nothing emitted, no state read`
  - `a throwing listener doesn't stop drawing`
- [ ] **Step 2: Run** `node --test tests/screen.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test tests/*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five_fret:* judgment and star power events on the bus`; push.

### Task 5: Build-a-Band: controller players in the prefs and part model

**Files (`.worktrees/bab-controllers`):**
- Create: `src/controller-model.js`, `src/players.js`.
- Modify:
  - `src/prefs.js`: `controllers`, plus `PICK_FILTER_DEFAULTS` ~l.16 and `normalizePrefs` ~l.107;
  - `src/parts.js`: `songFacts` ~l.7 and `FIVE_FRET_PART`;
  - `src/mappings.js`: `guitarArrIndex` ~l.22 skips `notes === 0`;
  - `src/stem-claims.js`: `stemIdFor` ~l.12;
  - `src/icons.js`: add Lucide `gamepad-2`, verbatim;
  - `NOTICE.md` only if the icon list is enumerated there.
- Test: `tests/controller-model.test.mjs`, `tests/players.test.mjs`, and extend `tests/prefs.test.mjs`, `tests/parts.test.mjs`, `tests/stem-claims.test.mjs`, `tests/icons.test.mjs`.

**Interfaces:**
- `src/controller-model.js` (pure):
  - `CONTROLLER_KINDS = { five_fret: { label: '5-Fret', parts: ['guitar','rhythm','bass'] } }`, the Plan 6 seam;
  - `FIVE_FRET_PART_LABELS = { guitar: 'Lead', rhythm: 'Rhythm', bass: 'Bass' }`;
  - `isControllerId(id) -> boolean` (`/^ctl\d+$/`);
  - `nextPlayerId(controllers) -> 'ctlN'`;
  - `defaultPart(controllers) -> part` (Decision 5);
  - `joinController(controllers, { controllerKey, name }) -> controllers` (no-op when the key is already joined);
  - `leaveController(controllers, key) -> controllers`;
  - `updateController(controllers, key, patch) -> controllers`.
  - All return new arrays.
- `src/prefs.js`:
  - `normalizePrefs` adds `controllers` (Decision 1): drop entries with no string key or a duplicate key; re-id invalid or duplicate ids; validate every field with its default.
  - `PICK_FILTER_DEFAULTS` gains `fiveFret: false, fiveFretReal: false`.
  - `savePrefs({ controllers })` replaces the list.
- `src/parts.js`:
  - `songFacts(x).fiveFret: [{ instrument, kind }]`, from a library item's `five_fret_parts` strings (`"bass:chart"`) or a song-info list of `{ instrument, source_kind }`;
  - `FIVE_FRET_PART = { id: 'five_fret', inputKind: 'five_fret_controller', label: '5-Fret', icon: 'gamepad-2', color: '#2ecc40', difficulties: DIFFICULTIES }`;
  - `fiveFretPartFor(itemOrSong, controller) -> { instrument, kind } | null` (Decision 6).
  - `PART_TYPES` is unchanged.
- `src/players.js` (pure):
  - `playingIds(prefs) -> string[]`: guitar, drums, vocals when `on`, then controllers with `on === true`, in join order;
  - `playerStyle(id, prefs, { oneLevel, sourceKind } = {}) -> { name, tag, color, icon, calloutKind }`.
    - Fixed parts reproduce today's `hud.js` `partLabel` and colours.
    - Controllers follow Decision 13. `tag` appends `AUTO CHART` when `sourceKind === 'auto'`. `calloutKind` is `'five_fret'`.
- `stemIdFor('five_fret', controller, stemIds)` follows Decision 10. The other parts are unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `joinController assigns ctl1, ctl2 and ignores a second join of the same key`
  - `defaultPart picks Lead, then Bass, then Rhythm, then Lead again`
  - `leave and update return new arrays`
  - `normalizePrefs keeps valid controllers and repairs bad fields, duplicate keys and ids`
  - `songFacts reads five_fret_parts from library items and song info`
  - `fiveFretPartFor falls back to a part the song has, null with none`
  - `a 5-fret-only pack's placeholder (notes 0) is not a guitar arrangement`
  - `stemIdFor five_fret: bass, rhythm stem or guitar, guitar`
  - `playingIds orders fixed parts then controllers`
  - `playerStyle for parts matches today's labels; controllers get Bass (5-Fret) · Expert · name and AUTO CHART`
- [ ] **Step 2: Run** `node --test tests/controller-model.test.mjs tests/players.test.mjs tests/prefs.test.mjs tests/parts.test.mjs tests/stem-claims.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller players in prefs, parts and players`; push.

### Task 6: Build-a-Band: band-screen model, filters and chips for controllers

**Files:**
- Modify:
  - `src/band-model.js` `bandScreenModel` ~l.28;
  - `src/query.js`: `PICK_FILTERS` ~l.5, `pickFilters` ~l.25, `songChips` ~l.42.
- Test: `tests/band-model.test.mjs` (extend), `tests/query.test.mjs` (update the chip-count test).

**Interfaces:**
- `bandScreenModel({ …today's args, fiveFretLoaded = false, controllerStatus = { available: false, reason: null, connected: new Set() } })` adds `controllers: [{ key, id, name, connected, unavailable, note, part, parts, partAudio, partAudioDisabled, difficulty, lefty }]`:
  - `parts[p]` is `{ has, kind: 'chart'|'auto'|null, takenBy: [names of other controllers on p] }`;
  - notes: "Not connected", "No 5-fret chart for this song", "Install the 5-Fret plugin to play on a controller", and "Part audio needs a <stem> stem" when `stemIdFor` finds none;
  - `goEnabled` and `pickEnabled` count connected, available controllers as playable parts.
- `pickFilters({ parts, on, controllers })`:
  - **Playable by band** adds `five_fret: <unique instruments of the connected controllers, comma-joined>`;
  - new chips `['fiveFret','5-fret part']` → `{ five_fret: 'any' }` and `['fiveFretReal','Real 5-fret']` → `{ five_fret: 'any:chart' }`, appended after today's five.
- `songChips(item)` adds `{ id: 'fiveFret', label, good }`: `label` is `5-fret: Lead · Bass (auto)` (auto-only parts get ` (auto)`), or `No 5-fret parts`.

- [ ] **Step 1: Write the failing tests:**
  - `a joined connected controller makes Go possible with every fixed part off`
  - `a disconnected controller: not connected, not counted` (Review Focus 1)
  - `stored Rhythm on a song with Lead and Bass shows Lead selected` (Review Focus 4)
  - `no 5-fret part: the row is unavailable with its note`
  - `parts show real/auto and who else holds them`
  - `part audio greyed without the part's stem`
  - `playable adds the controllers' instruments; the new chips' params; chip order`
  - `songChips 5-fret chip`
- [ ] **Step 2: Run** `node --test tests/band-model.test.mjs tests/query.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band model, filters and chips know controller players`; push.

### Task 7: Build-a-Band: join manager

**Files:** Create `src/join.js` (DOM-free; everything is injected). Test: `tests/join.test.mjs`, with a fake gamepad-input (`list`/`claim`/`watch`/`on`) and a fake five-fret API (`listControllers`/`createMapper`).

**Interfaces:**
- Consumes `gamepadInput.watch` (Task 1) and `feedBackFiveFret.listControllers` / `createMapper` (Task 3).
- Produces:

  ```js
  createJoinManager({ gamepadInput, fiveFret, setTimer, clearTimer,
      onJoin({ controllerKey, name }), onLeave(key), onPrimary(key), onLight(key, lit), onChange() })
    -> { start(joinedKeys), stop(), setJoined(keys), status() }
  ```

  - `lit` is `{ green, red, yellow, blue, orange, strum }` booleans.
  - `status()` returns `{ available, reason: null|'no-five-fret'|'no-watch', needsSetup: [{ controllerKey, name }], connected: Set<key> }`.
- Rules:
  - `start` watches unclaimed pads and claims each joined, connected key (owner `build_a_band`). `stop` releases every claim, unsubscribes and clears timers. Both are idempotent.
  - Watched pad: look it up by `pad` in `listControllers()`. `kind === null` is setup-needed (never joins). Its mapper's `pause` press calls `onJoin`, and the manager then claims it.
  - Claimed pad: mapper actions drive `onLight`; `pause` press calls `onPrimary(key)`. For a `standard` mapping, button 8 held for `LEAVE_HOLD_MS = 1000` calls `onLeave(key)`, and a release before then cancels.
  - `gamepadInput.on('change')`: refresh `connected`, re-claim a joined key that came back, then call `onChange`.
  - Mappers are cached per key. Input events allocate only what the mapper returns.

- [ ] **Step 1: Write the failing tests:**
  - `Start on an unclaimed set-up pad joins it and claims it`
  - `a pad that needs setup never joins and is listed in needsSetup`
  - `a joined pad lights frets and Start calls onPrimary, not onJoin` (Review Focus 3)
  - `holding Back 1 s leaves; a shorter hold does not`
  - `two identical pads join as #1 and #2 and light separately` (Review Focus 2)
  - `stop releases every claim; start re-claims the joined keys`
  - `a joined pad that disconnects is not connected; reconnecting re-claims it` (Review Focus 1)
  - `no watch or no five-fret API: status says why, nothing throws`
- [ ] **Step 2: Run** `node --test tests/join.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Start-to-join manager for controllers`; push.

### Task 8: Build-a-Band: controller columns on the band screen

**Files:**
- Create: `src/controller-columns.js` (DOM: one Setup column and one Confirm row per joined key, built once per key and kept in a Map).
- Modify:
  - `screen.html` l.36: replace the disabled `.bab-addslot` with `<div class="bab-joinslot" aria-live="polite"></div>`;
  - `src/band-screen.js`: `render` ~l.168, `show` ~l.528, `hide` ~l.546, and creating the join manager;
  - `assets/build-a-band.css`: `.bab-joinslot`, controller column, fret lights;
  - `README.md`: playing on a controller.
- Test: `tests/band-screen.test.mjs` (extend; fake gamepad-input and five-fret API on `win`).

**Interfaces:**
- Consumes `createJoinManager` (Task 7), `bandScreenModel().controllers` (Task 6), and the `controller-model.js` helpers (Task 5).
- `createControllerColumns({ doc, setupHost, confirmHost, onChange(key, patch), onLeave(key), onControls(key) }) -> { render(rows), light(key, lit), destroy() }`:
  - **Setup column:** the name, five fret lights, a "Not connected" note, **Controls** and **Leave**.
  - **Confirm row:** Part (Lead / Rhythm / Bass segment, greyed when missing, each tagged *real* or *auto*, with "also: <names>"), Difficulty, Lefty, Part audio (Rock Band / Always play), and the note.
  - `light` writes only changed classes.
- `band-screen.js`:
  - the join manager runs while the screen is shown (both views) and stops on hide;
  - `onJoin` → `save({ controllers: joinController(...) })`; `onLeave` → `leaveController`;
  - `onPrimary` → `openLibrary()` on Setup when `pickEnabled`, `go()` on Confirm;
  - Controls → `feedBackFiveFret.openControls({ returnTo: 'plugin-build_a_band' })`;
  - the join slot shows "Press Start on a controller to join", the reason when unavailable, and a **Set up** link per `needsSetup` controller.

- [ ] **Step 1: Write the failing tests:**
  - `Start on a new pad adds a Setup column and a Confirm row`
  - `Leave removes them; the join slot explains how to join`
  - `Confirm part segment: missing parts greyed, real/auto tags, also: names`
  - `part audio greyed without the stem`
  - `Start on a joined pad: Choose a song on Setup, GO on Confirm`
  - `fret presses on a joined pad never press GO` (Review Focus 3)
  - `hiding for the library pick releases claims; Confirm re-claims`
  - `Controls opens the 5-Fret controls screen returning to the band screen`
  - `no five-fret plugin: the join slot says so and nothing is watched`
- [ ] **Step 2: Run** `node --test tests/band-screen.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller columns and Start-to-join on the band screen`; push.

### Task 9: Build-a-Band: N lanes in the bottom row

**Files:**
- Modify:
  - `src/layout.js` `computeStageLayout` ~l.11;
  - `src/stage.js`: `planStage` ~l.30; `mountStage` ~l.58 (slots, layout, divider drag ~l.339, canvas adoption ~l.269, unmount ~l.419).
- Test: `tests/layout.test.mjs` (replace `throws on more than two lanes`), `tests/stage.test.mjs`, `tests/stage-mount.test.mjs`.

**Interfaces:**
- `layout.js`:
  - `CONTROLLER_LANE_PCT = 22`, `CONTROLLER_SHARE_MAX = 60`;
  - `computeStageLayout({ lanes, split })` takes any number of lanes (real ids first, then controller ids) and still returns `[{ part, leftPct, widthPct }]` (Decision 7). Real-only input gives exactly today's result.
  - `splitFromPointer(pointerPct, lanes) -> split`: the pointer as a percentage of the real region, clamped.
- `planStage(song, parts, controllers = [])`: `lanes` gains the ids of controllers with `on === true`, after the real lanes. A controllers-only band has `mainPart: null` (main highway hidden).
- `mountStage` deps gain `fiveFretApi` (default `win.feedBackFiveFret`) and `fiveFretRenderer` (default `win.feedBackViz_five_fret`). For each controller lane:
  - slot and box (no chrome) → `createHighway()` → `setRenderer(fiveFretRenderer())` → `init(canvas, box)` → `connect(wsUrl(song.filename, song.arrangementIndex), { onSongInfo() {}, secondary: true })` → lane clock → `fiveFretApi.setLane(canvas, { controllerKey, part, difficulty, lefty })`;
  - `highway:canvas-replaced` re-pins the new canvas;
  - one lane failing removes only that lane and re-lays out.
  - Unmount calls `clearLane` on each canvas and stops each highway.
- The stage API gains `getLaneCanvas(id)`: the drum lane's canvas for `drums`, a controller's canvas for its id, else null. `getDrumCanvas()` stays.

- [ ] **Step 1: Write the failing tests:**
  - layout:
    - `guitar, drums and one controller` (48.36 / 29.64 / 22 at 78, ±0.01);
    - `four controllers beside two real lanes take 15% each`;
    - `controllers alone share the row`;
    - `one controller fills`;
    - `real lanes only are unchanged`;
    - `splitFromPointer`.
  - plan: `controllers on add lanes after the real ones; controllers only hide the main highway`.
  - mount:
    - `each controller lane gets its own highway, WS and pin`;
    - `two controllers on one part: two lanes pinned to their own keys` (Review Focus 2);
    - `canvas replacement re-pins`;
    - `one lane failing leaves the others`;
    - `divider drag with controllers converts through splitFromPointer`;
    - `unmount clears every pin`.
- [ ] **Step 2: Run** `node --test tests/layout.test.mjs tests/stage.test.mjs tests/stage-mount.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: any number of lanes in the stage's bottom row; 5-fret controller lanes`; push.

### Task 10: Build-a-Band: controller players in the band session

**Files:**
- Modify `src/band-runtime.js`:
  - `effectivePrefs` ~l.80 and `playingParts` ~l.74 (use `playingIds`);
  - `newSession` ~l.150; the `mount` effect ~l.972; `applyHides` / `undoHides` ~l.280–316; `syncFailures` ~l.505 (labels via `playerStyle`);
  - `startOverdrive` ~l.544; `teardown` ~l.1132; the `handlers` ~l.1280–1375.
- Modify:
  - `src/part-events.js`: add `fiveFretEntry`;
  - `src/overdrive-session.js`: a `controllers` option.
- Test: `tests/part-events.test.mjs`, `tests/overdrive-session.test.mjs`, `tests/band-runtime.test.mjs` (a fake `feedBackFiveFret` and stage lanes in `setup`).

**Interfaces:**
- Consumes `stage.getLaneCanvas(id)` (Task 9), the five-fret API and events (Tasks 3 and 4), and `playingIds` / `playerStyle` / `fiveFretPartFor` (Task 5).
- `effectivePrefs` maps each controller to `{ ...c, on, part, sourceKind }`. `on` requires a connected controller (`listControllers()`), the five-fret API and renderer, and `fiveFretPartFor(item, c)`. `part` is that part's instrument.
- `fiveFretEntry(type, detail, t, id, lastScore) -> entry | null`, where `type` is the bus suffix:
  - `hit` → `hit`, `miss` → `miss`, `overstrum` → `overhit`, `sustain-end` → `sustain`;
  - `points = max(0, detail.score - lastScore)`, or `detail.score` when it dropped below `lastScore` (an engine reset);
  - `multiplier = (detail.multiplier || 1) / (detail.spActive ? 2 : 1)`, `streak = detail.combo | 0`, `noteTime`.
  - The runtime keeps `lastScore` per lane and updates it on every event, even ones the ledger ignores, so points a failed-out player scores never land later.
- `createOverdriveSession({ …, controllers: [{ id, read }] })` mirrors each controller's `starPower` with `drumsOverdrive`'s shape and the fill rule for ready.
- Runtime:
  - `five_fret:hit|miss|overstrum|sustain-end` on a lane canvas records that player's entry;
  - `five_fret:sp-activate` records a deploy, which rescues as drums' does;
  - other canvases are ignored;
  - `applyHides` calls `setScoreHudHidden(canvas, true)` per lane, and teardown undoes it;
  - stars come from `setStarThresholds(id, getInstanceState(canvas).starThresholds)` once the lane reports them (Decision 8);
  - a controller the stage couldn't start leaves via `dropPart`.

- [ ] **Step 1: Write the failing tests:**
  - part-events:
    - `fiveFretEntry maps types, score deltas and resets, halves the multiplier under star power`.
  - overdrive-session:
    - `controller meters are mirrored and drawn`.
  - runtime:
    - `Go with a joined controller: ctl1 in the ledger and HUD, its score HUD hidden`;
    - `events on ctl1's canvas score ctl1 only`;
    - `sustain-end adds held points`;
    - `two controllers on one part score separately` (Review Focus 2);
    - `sp-activate rescues a failed bandmate`;
    - `stars from the lane's thresholds`;
    - `a controller disconnected at Go sits out` (Review Focus 1);
    - `a lane that failed to start leaves the band`;
    - `a backward seek drops later controller entries and the next delta starts from the reset score` (Review Focus 5);
    - `teardown unhides and the results keep the controller's numbers`;
    - `Play again keeps the lanes`.
- [ ] **Step 2: Run** `node --test tests/part-events.test.mjs tests/overdrive-session.test.mjs tests/band-runtime.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller players score, deploy, fail and rescue in the band`; push.

### Task 11: Build-a-Band: part audio on a miss

**Files:**
- Create `src/stem-sound.js`.
- Modify:
  - `src/drum-sound.js`: export `dropoutStep(dropped, kind) -> boolean`, used by `createDrumSound` and `stem-sound.js`;
  - `src/band-runtime.js`: build at `applyDifficulties` ~l.1013 (rebuilt on stems `provider-ready` when the stem list was empty); judge in the five-fret handlers; `setFailed` in `syncFailures`; `seek` in `song:seek` ~l.1357; restore in teardown.
- Test: `tests/stem-sound.test.mjs`, `tests/drum-sound.test.mjs` (unchanged expectations), `tests/band-runtime.test.mjs`.

**Interfaces:**
- `createStemSound({ members: [{ id, stemId, controller, mode: 'rockband'|'always' }] })` returns:
  - `stems() -> string[]`
  - `muted(stemId) -> boolean`
  - `judge(id, kind) -> changedStemIds`
  - `setFailed(ids) -> changedStemIds`
  - `seek() -> changedStemIds`
- The rules are Decision 10. Members with a null `stemId` are ignored.
- `members` are the playing controllers (`stemIdFor('five_fret', c, ids)`, `mode = c.partAudio`), plus the playing real parts (`stemIdFor(part, …)`, `controller: false`).
- The runtime turns each changed stem into one queued claim op under `'sound:stem:' + stemId`, with claim id `build_a_band:sound:stem:<stemId>`. It reuses `muteStem` / `restoreStem` and re-mutes held claims on `provider-ready`.

- [ ] **Step 1: Write the failing tests:**
  - stem-sound:
    - `a controller miss drops its stem; the next hit by any controller on it restores`;
    - `a bass miss never touches the guitar stem`;
    - `Lead and Rhythm on one guitar stem share it`;
    - `an Always play controller keeps the stem`;
    - `a real part on the stem keeps it through controller misses`;
    - `overstrum drops like a miss`;
    - `a failed controller's stem mutes unless another active player is on it; rescue unmutes`;
    - `failed players' judgments are ignored`;
    - `seek restores` (Review Focus 5);
    - `no stem: nothing changes`.
  - runtime:
    - `a controller miss mutes the bass stem through its claim; a hit restores and releases`;
    - `Always play sends nothing`;
    - `teardown restores held claims`;
    - `provider-ready re-mutes`.
- [ ] **Step 2: Run** `node --test tests/stem-sound.test.mjs tests/drum-sound.test.mjs tests/band-runtime.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Rock Band part audio for controller players (per stem)`; push.

### Task 12: Build-a-Band: HUD labels and results cards

**Files:**
- Modify:
  - `src/hud.js`: `partLabel` ~l.17 and colour → `playerStyle`;
  - `src/hud-model.js`: `CALLOUTS` gains `five_fret: { every: 50, unit: 'NOTE' }`, and `streakCallout` takes the `calloutKind`;
  - `src/results.js` `resultsModel` ~l.87;
  - `src/band-runtime.js` `showResults` ~l.1099, which passes `controllerInfo`.
- Test: `tests/hud.test.mjs`, `tests/hud-model.test.mjs`, `tests/results.test.mjs`.

**Interfaces:**
- `resultsModel({ …, controllerInfo = {} })`:
  - `controllerInfo` is `{ [id]: { sourceKind } }`, read from `getInstanceState` at results time;
  - after the fixed parts' cards, add one card per controller in the snapshot, in join order: `{ part: id, kind: 'five_fret', name, subname: controller name, difficulty, color, icon, …, stats }`;
  - `stats` are Score, Best streak, Notes hit, Overstrums (the ledger's `overhits`), `['Chart', 'Auto']` when auto, and the overdrive / drop-out counts.
  - `pickAwards` falls back by `kind` ("Held the frets").
- HUD: controller lanes get `playerStyle` tags (with AUTO CHART) and colours, and streak callouts every 50 notes.

- [ ] **Step 1: Write the failing tests:**
  - `a card per controller, named by part, with overstrums and Auto chart`
  - `two players on one part get two cards`
  - `awards weigh controller cards`
  - `controller lane tag and colour`
  - `controller streak callouts every 50`
  - `fixed-part labels unchanged`
- [ ] **Step 2: Run** `node --test tests/hud.test.mjs tests/hud-model.test.mjs tests/results.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller lane tags and results cards`; push.

### Task 13: Real-app check

No new code. Silent unless Matt says otherwise.

- [ ] **Step 1: Install:**
  - Sync core from `.worktrees/core-five-fret` with `dev-sync.sh`, as in Plan 2 Task 10 (`FB_ROOT`, empty `dev-plugins`).
  - Copy `feedBack-plugin-five-fret` and `.worktrees/bab-controllers` (without `.git`, `tests`, `docs`) into `/Applications/feedback.app/Contents/Resources/slopsmith/plugins/five_fret/` and `…/build_a_band/`.
  - Ask before quitting Matt's app if it's running.
- [ ] **Step 2: Launch** with `launch-debug.sh` and open Build-a-Band.
  - With no controller: the join slot reads "Press Start on a controller to join", and `gamepadInput.claimCount()` is 0.
  - With an Xbox controller connected, check paused, over CDP and screenshots:
    - Start adds a column;
    - frets light;
    - A does nothing to the menus (Review Focus 3);
    - holding Back leaves.
- [ ] **Step 3: Library pick:** the claims drop (`claimCount()` 0), and the gamepad moves through the grid. The **5-fret part** and **Playable by band** chips (with a Bass controller joined) list "Misery Business (5-fret test)". Confirm shows the Bass row tagged *real*.
- [ ] **Step 4: Ask Matt** before GO: GO plays the song.
  - Only on a yes:
    - play 30 s with the controller on Bass beside any real parts that are on;
    - check the N-lane layout, the lane tag and the HUD;
    - check the bass stem dropping on a deliberate miss;
    - then pause, look at the results card, and leave nothing playing.
  - Without a yes, the stage is covered by the unit tests only. Say so in the Review section.
- [ ] **Step 5: Nothing else moved** (paused):
  - the band screen with no controllers looks as before;
  - the normal player's 5-Fret viz still claims a pad;
  - a drum song still loads.
- [ ] **Step 6: Record** the results below and in the shared notes. Push all three branches.

## Later plans

4. Library tool for real guitar and bass charts.
5. Auto-charter and benchmark: switches the "auto" source on. Chips, tags and results already show it.
6. Controller drums:
   - the drums plugin's gamepad source and mapper;
   - `CONTROLLER_KINDS.drums` with the column's "plays as" choice;
   - a drums `controller` lane (drums renderer pinned to a controller);
   - drum sound modes per controller drummer.

## Self-review

- **Spec coverage:**

  | Spec requirement | Task |
  |---|---|
  | Start-to-join; columns with name, live light, part (real/auto, shared), difficulty, lefty, controls, leave | 7, 8 |
  | Any number of controllers | 5, 9 |
  | Part types guitar / rhythm / bass with input kind `five_fret_controller` | 5 |
  | Shared parts: two lanes, one chart, two scores | 9, 10 |
  | N lanes | 9 |
  | Overdrive, deploy and rescue | 10 |
  | Engine numbers as they are; YARG stars | 10 |
  | Part audio: drop, shared stem, fail-unless-active, per-player setting | 11 |
  | Filters and "playable by this band" | 2, 6 |
  | Results cards with "auto chart" | 12 |
  | Public five-fret API mirroring drums | 3, 4 |
  | Controller drums seam | Decision 4; Plan 6 |
  | Real-app checks 1, 2 (needs GO), 5 (auto-chart songs come with Plan 5) and 9 | 13 |

  Checks 3, 4 and 6 need GO or plastic hardware, and Plan 6 covers check 4's drums.
- **Type consistency:**
  - `setLane` / `clearLane` / `getInstanceState(canvas).starThresholds` (Task 3) are used in Tasks 9–12;
  - `getLaneCanvas(id)` (Task 9) is used in Tasks 10 and 11;
  - `playingIds` / `playerStyle` / `fiveFretPartFor` (Task 5) are used in Tasks 6, 10 and 12;
  - `stemIdFor('five_fret', …)` (Task 5) is used in Tasks 6 and 11;
  - `controllerKey` (core list, Task 1) = five-fret `listControllers().controllerKey` = `prefs.controllers[].key`.

## Review

(Filled in after the build.)

## Builder-check rulings (binding; they override the tasks and decisions above where they differ)

A builder check (2026-10-21) found these; each is decided here.

1. **Detecting a 5-fret-only pack.** Decision 15 is withdrawn: library rows give every sloppak arrangement `notes: 0`.
   - Core's `extract_meta` adds a boolean `five_fret_only` (the pack's only arrangements are `type: five_fret`, with no drum tab). It goes in the library item payload next to `five_fret_parts`; add it to Task 2 with a test.
   - Build-a-Band treats a row as having a real-guitar arrangement only when `five_fret_only` is false.
2. **One `pickPart` signature for Plans 3 and 5:** `pickPart(parts, arrangementName, setting, opts)`, where `opts = { exact?: bool, showAuto?: bool }`. Plan 3 introduces `opts`, and Plan 5 uses `opts.showAuto`. With no `opts`, behaviour is unchanged.
3. **Plan 5's `showAutoCharts` gate is respected everywhere:**
   - `window.feedBackFiveFret.showAutoCharts()` returns the saved flag, default false. It reads `five_fret.settings.v1` directly, with no dependency on `profiles.js`.
   - When it's false:
     - Build-a-Band's `fiveFretPartFor`, the band-model parts list and song chips ignore auto parts;
     - the "5-fret part" filter and playable-by-band use `:chart`;
     - pinned lanes pass `showAuto: false`.
   - Until Plan 5 lands, the flag simply reads false.
4. **Lazy loading.**
   - `listControllers()` and `createMapper()` on `window.feedBackFiveFret` return Promises and load `profiles.js` on demand.
   - Build-a-Band looks up `window.feedBackFiveFret` lazily at call time, never at module start.
5. **Overdrive for auto charts.** The five-fret session synthesises star-power phrases for parts whose `sourceKind` is `auto`: for each song section (`bundle.sections`) with at least 8 notes, the notes in its last 2 measures form one phrase. The engine then earns and deploys normally. YARG's all-notes phrase rule applies, not the spec's 90%; list this as a deviation in the five-fret README. Put it in Task 3 or Task 4 with tests.
6. **Mirrored Start presses.** When a Start press arrives on a slot whose controller `id` matches a slot that pressed Start within the last 50 ms, ignore it. The lowest slot joins. Test: two mirrored slots, one join.
7. **Pinned lanes keep their claim.** A lane pinned with `setLane` holds its controller from `setLane` until `clearLane` (or destroy), even while loading, counting in or paused. During a band song Build-a-Band handles pause itself: Start toggles pause, and holding Back for 1 s opens the leave prompt. The Plan 2 "release while paused" rule applies only to unpinned (normal-player) renderers.
8. **The band model sees controllers everywhere.** `go()`, `openLibrary()` and `pickFilters` must pass the controller players (`band-screen.js` ~217, ~302, ~311). Test: a band of controllers only can Go and open the song pick.
9. **A real seam for Plan 6.**
   - The join manager, `mountStage` and runtime handlers go through a `CONTROLLER_KINDS` registry: `{ five_fret: { api: () => window.feedBackFiveFret, resolveBinding, setupHref, laneRenderer, eventPrefix: 'five_fret' } }`. Nothing is hard-wired to the five-fret plugin outside that entry.
   - The kind choice is remembered per `controllerKey` in a durable `prefs.controllerKinds` map that survives Leave.
   - Standard-mapped pads default to `five_fret` until Plan 6 adds `drums`.
10. **Pinned lanes ignore the saved global `gamepadMode`.** They use `effectiveGamepadMode({ gamepadMode: null }, binding)`, so the controller's kind decides.
11. **Targets:**
    - Task 2 adds a short `/api/library` filter row to core `CLAUDE.md`, creating that table row if needed.
    - Task 3 bumps `plugin.json` `version` along with `ASSET_VERSION`.
    - Plan 5 edits the same `CHANGELOG.md`, `session.js` and `screen.js`; the coordinator merges.
12. **Score resets.** The five-fret band events carry the session's `resets` count. `fiveFretEntry` detects a reset from a change in that count, not from a score drop.

### Amendments after Plan 6's builder check (binding)

- **Ruling 7, extended.** A pinned lane maps Start and a 1 s hold on Back to bus events, so Build-a-Band handles both (toggle pause, open the leave prompt):
  - `five_fret:band-pause` and `five_fret:band-back-hold`, with `detail { controllerKey, canvas }`;
  - Plan 6 adds the same for drums under `drums:`.
  A pinned lane never calls `togglePlay` itself.
- **Ruling 9, extended.**
  - Each `CONTROLLER_KINDS` entry also has `pin(laneCanvas, controllerKey, opts)` and `unpin(laneCanvas)`. For `five_fret` these call `setLane` / `clearLane`.
  - Runtime event handlers are registered once per event name and dispatch by `detail.canvas` to the owning player. Never key a handler map by a kind's prefix in a way that can overwrite another player's handler.
  - `prefs.controllerKinds` stores **only explicit choices**. A standard pad with no entry plays as `five_fret` while that is the only kind; Plan 6 asks when more than one kind is available.
