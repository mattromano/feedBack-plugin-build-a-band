# Build-a-Band Plan 1: One-clock stage (guitar + drums)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a song plays in the core player, a "Band" button lays out a stage with the guitar highway (wide) and a drum lane side by side, with a draggable divider and readable fret numbers. Both lanes stay on one clock through pause, seek, speed and an A-B loop count-in.

**Architecture:** Core gains one "display time" that follows the count-in rewind sweep. Every extra highway (splitscreen panels, band lanes) reads that instead of `audio.currentTime`. The guitar lane is the main `window.highway`, measured against a slot element through a new `setContainer()`. The drum lane is a `createHighway()` instance with the drums plugin's renderer, fed by the plugin's lane clock. The drums plugin gets a small public API so kit hits and difficulty go to the band's lane.

**Tech Stack:** Vanilla ES modules in the browser. node:test for unit tests (core CommonJS tests in `tests/js/*.test.js`; plugin ESM tests in `tests/*.test.mjs`; drums CommonJS `tests/screen.test.js`). Electron desktop app for real-app checks.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read the sections "Stage", "One clock" and "How it plugs together".

**This is plan 1 of 7.** The later plans are listed at the end. Each plan ends with something playable in the real app.

## Global Constraints

- Repos live under `~/Desktop/repos/feedback-upstream/`. Branch per repo: `feature/build-a-band-stage`, cut from `custom` (core `feedBack`, `feedBack-plugin-splitscreen`, `feedBack-plugin-drums`) or `main` (`feedBack-plugin-build-a-band`).
- Commit as `mattromano <42412983+mattromano@users.noreply.github.com>` with `git commit -s`. Preserve CRLF in files that use it (core `CHANGELOG.md`, `static/v3/songs.js`).
- Test commands:
  - core: `npm run test:js` (from `feedBack/`)
  - build-a-band: `npm test`
  - drums: `node --test tests/`
  - splitscreen: its `npm test` if it has a `package.json`, otherwise `node --test tests/`
- **Real app only** for anything that isn't a unit test: `slopsmith-custom/feedback-fork/debug/README.md` (`dev-sync.sh` to install, `launch-debug.sh` for DevTools on port 9333, `cdp.mjs` to drive it). Never use `run-dev.sh` or the Claude app's browser. Ask before quitting Matt's running copy. After audio tests, pause playback and leave nothing playing.
- **Plugin identity:** id `build_a_band`, name "Build-a-Band", screen id `plugin-build_a_band`, licence MIT (as scorecard and drums).
- **Stage layout values:** guitar/drums split starts at 62% guitar and is clamped to 35–80%. The split is persisted.
- No YARG artwork, logos or sounds anywhere.
- Build-a-Band and splitscreen never run at once.

## Review Focus

1. **Song with no drum chart:** the stage shows the guitar lane alone at full width, with no error and no empty drum lane. (Task 6 `findDrumArrangement`, Task 8 test.)
2. **Leaving the stage, changing songs or leaving the player:** the drum lane highway is stopped and removed, `#highway` gets its normal layout and size back, and the lane clock stops. (Task 8.)
3. **Count-in cancelled mid-sweep** (Matt seeks or pauses during the 400 ms rewind): the display time stops following the sweep and returns to audio time. (Task 1.)
4. **Splitscreen already on when Band starts:** splitscreen switches off cleanly first. (Task 3 `stop()`, Task 8.)
5. **Window resize or divider drag:** both canvases re-measure, so they are not stretched or blurry, and the split stays within 35–80%. (Task 2 `setContainer` ResizeObserver, Task 6 clamp.)

---

### Task 1: Core display time follows the count-in sweep

**Repo:** `feedBack` (core)

**Files:**
- Create: `static/js/display-time.js`
- Modify: `static/js/count-in.js` (`startCountIn`'s `rewindStep` and `_cancelCountIn`)
- Modify: `static/app.js` (expose on `window.feedBack`, next to `emit`/`on` around line 758-796)
- Test: `tests/js/display_time.test.js`

**Interfaces:**
- Produces:
  - `setSweepTime(t: number): void`
  - `clearSweepTime(): void`
  - `getDisplayTime(audioTimeFn: () => number): number`. It returns the sweep time while a sweep is set, else `audioTimeFn()`.
  - `window.feedBack.getDisplayTime(): number`, bound to core's `_audioTime`.
  - A bus event `count-in:sweep` with `{ time }`, emitted on every sweep frame.

- [ ] **Step 1: Write the failing tests** in `tests/js/display_time.test.js` (CommonJS, dynamic `import()` of the module, as `tests/js/count_in_auto.test.js` does):
  - `returns audio time when no sweep is set`: `getDisplayTime(() => 42.5) === 42.5`.
  - `returns the sweep time while sweeping`: `setSweepTime(10.25)`, then `getDisplayTime(() => 99) === 10.25`.
  - `clearSweepTime returns to audio time`: set 10, clear, then `getDisplayTime(() => 7) === 7`.
  - `ignores non-finite sweep values`: `setSweepTime(NaN)` leaves audio time in charge.
- [ ] **Step 2: Run** `npm run test:js`. Expected: the 4 new tests FAIL (module not found).
- [ ] **Step 3: Implement `static/js/display-time.js`** as a module-level holder of `_sweepT` (null when clear).
- [ ] **Step 4: Wire it in:**
  - In `rewindStep`, call `setSweepTime(currentT)` and `window.feedBack.emit('count-in:sweep', { time: currentT })` next to the existing `window.highway.setTime(currentT)`.
  - Call `clearSweepTime()` when the sweep completes (before `_audioSeek`), in the abort branch, and in `_cancelCountIn()`.
  - In `app.js`, add `getDisplayTime: () => getDisplayTime(_audioTime)` to `window.feedBack`.
- [ ] **Step 5: Run** `npm run test:js`. Expected: all pass, including `host_contract.test.js`.
- [ ] **Step 6: Commit** `feat(player): display time that follows the count-in rewind`.

### Task 2: Core highway `setContainer` and fret label scale

**Repo:** `feedBack` (core)

**Files:**
- Modify: `static/highway.js` (`api` object near `setRenderScale`, about line 1912; `resize()` at 1870)
- Modify: `static/js/highway-draw.js` (fret-number label fonts: lines about 118, 134, 142, 781, 805, 866, 912)
- Test: `tests/js/highway_label_font.test.js`

**Interfaces:**
- Produces:
  - `labelFont(hwState, px: number): string` exported from `highway-draw.js`. It returns `` `bold ${Math.round(px * (hwState._labelScale || 1))}px sans-serif` ``.
  - `highway.setLabelScale(f: number)` and `highway.getLabelScale(): number`. The value is clamped to 0.75–2.5, stored on `hwState._labelScale` and persisted to localStorage `highwayLabelScale`. The highway redraws on the next frame; no resize is needed.
  - `highway.setContainer(el: Element | null)`. When set, `resize()` measures `el.getBoundingClientRect()` instead of the viewport, and a `ResizeObserver` on `el` calls `resize()`. `null` restores viewport sizing and disconnects the observer.

- [ ] **Step 1: Write the failing tests** in `tests/js/highway_label_font.test.js`:
  - `labelFont default scale`: `labelFont({}, 20) === 'bold 20px sans-serif'`.
  - `labelFont scales and rounds`: `labelFont({ _labelScale: 1.5 }, 15) === 'bold 23px sans-serif'`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL (`labelFont` not exported).
- [ ] **Step 3: Implement `labelFont`.** Replace each fret-number `ctx.font = \`bold ${…}px sans-serif\`` in `highway-draw.js` with `ctx.font = labelFont(hwState, …)`, keeping each existing `Math.max(…)` expression as the `px` argument. Don't touch the note body size (`sz`).
- [ ] **Step 4: Implement `setLabelScale`, `getLabelScale` and `setContainer`** on `api`, following the `setRenderScale` pattern (validate, clamp, persist). Read the persisted label scale in `init`. `init(canvas, container)` already accepts a container: `setContainer` sets the same `hwState` field after init.
- [ ] **Step 5: Run** `npm run test:js`. Expected: PASS.
- [ ] **Step 6: Real-app check:**
  1. `dev-sync.sh`, `launch-debug.sh`, play any guitar song.
  2. Through `cdp.mjs`, run `window.highway.setLabelScale(2)` and confirm the fret numbers double while the notes keep their size.
  3. Run `setLabelScale(1)` to restore it.
- [ ] **Step 7: Commit** `feat(highway): setContainer and a fret-label scale`.

### Task 3: Splitscreen follows display time and can be stopped

**Repo:** `feedBack-plugin-splitscreen`

**Files:**
- Modify: `screen.js`:
  - `startTimeSync` (about 3019)
  - `_onFollowerTimeMessage`'s broadcaster source, if it reads `audio.currentTime` directly
  - the `window.slopsmithSplitscreen` object (about 507)
- Test: the repo's existing JS test file. If there is none, create `tests/time-source.test.js` (CommonJS, node:test).

**Interfaces:**
- Consumes: `window.feedBack.getDisplayTime()` (Task 1).
- Produces:
  - `panelTime(): number`, a module function. It returns `window.feedBack.getDisplayTime()` when that is a function, else `document.getElementById('audio').currentTime`. Export it for tests through the file's existing `module.exports` block, or add one guarded by `typeof module !== 'undefined'`.
  - `window.slopsmithSplitscreen.stop(): void`, which calls `stopSplitScreen()` when active and is a no-op otherwise.

- [ ] **Step 1: Write the failing tests:**
  - `panelTime prefers display time`: stub `window.feedBack.getDisplayTime = () => 3.5` and an audio element at `currentTime` 9, then expect 3.5.
  - `panelTime falls back to audio`: no `getDisplayTime`, expect 9.
  - `stop is a no-op when inactive`: it does not throw.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** `startTimeSync` calls `p.hw.setTime(panelTime())`, and `stop()` goes on the public object.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Real-app check (Matt's original bug):**
  1. Splitscreen on with two panels.
  2. Set an A-B loop and let it wrap.
  3. Both panels sweep back to A together with the main highway.
- [ ] **Step 6: Commit** `fix: panels follow the count-in rewind; public stop()`.

### Task 4: Drums public band API (input target and difficulty)

**Repo:** `feedBack-plugin-drums`

**Files:**
- Modify: `screen.js`:
  - `_routeTarget` (about 2046)
  - `_setDifficulty` (about 404)
  - the `module.exports` block at the end (about 5271)
  - a new `window.feedBackDrums` object next to `window.feedBackViz_drums` (about 4683)
- Test: `tests/screen.test.js` (uses its `freshPlugin()` loader)

**Interfaces:**
- Produces:
  - `window.feedBackDrums.setInputTarget(canvas: HTMLCanvasElement | null)`. While set, `_routeTarget()` returns the instance whose canvas is that element, if one exists, ignoring splitscreen focus and visibility. `null` restores today's routing.
  - `window.feedBackDrums.setDifficulty(id: string, canvas?: HTMLCanvasElement)`. With a canvas, it sets that instance's own difficulty (reusing the `_setOwnDifficulty` path). Without one, it calls today's global `_setDifficulty(id)`. Unknown ids are ignored.
  - `window.feedBackDrums.getInstanceState(canvas): object | null`, which returns `engine.getState()` for that instance (the same shape `__drumsPanelResults` returns).
  - Export `_routeTarget`, `_instances` and `_setInputTarget` in `module.exports` for tests.

- [ ] **Step 1: Write the failing tests** in `tests/screen.test.js`:
  - `input target overrides focus`: add two fake instances to `_instances`, each `{ _canvas: {}, _isVisible: () => true }`. Set the target to the second canvas and expect `_routeTarget()` to return the second instance.
  - `null target restores default`: expect the first visible instance.
  - `unknown canvas falls back`: a target with no matching instance gives the default routing.
- [ ] **Step 2: Run** `node --test tests/`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match the instance's canvas the same way `__drumsPanelResults` identifies an instance's canvas.
- [ ] **Step 4: Run** `node --test tests/`. Expected: PASS, including the existing tests.
- [ ] **Step 5: Commit** `feat: public band API (input target, per-lane difficulty, state)`.

### Task 5: Plugin skeleton and band prefs

**Repo:** `feedBack-plugin-build-a-band` (`main`)

**Files:**
- Create:
  - `plugin.json`
  - `package.json`
  - `LICENSE` (MIT, copyright mattromano)
  - `README.md`
  - `screen.html` (placeholder band screen: "Band screen arrives in plan 2")
  - `screen.js` (entry; imports `src/*`)
  - `assets/build-a-band.css`
  - `src/prefs.js`
- Test: `tests/prefs.test.mjs`

**Interfaces:**
- Produces:
  - `plugin.json`: `{"id":"build_a_band","name":"Build-a-Band","version":"0.1.0","license":"MIT","nav":{"label":"Build-a-Band","screen":"plugin-build_a_band"},"screen":"screen.html","script":"screen.js","scriptType":"module","styles":"assets/build-a-band.css","fullscreen":true,"standards":["plugin-runtime-idempotent.v1"]}`. Confirm `fullscreen` is still read in core `plugins/__init__.py` (about 1403-1435). It isn't in the manifest schema, so a schema check may need it added there in the core PR.
  - `package.json`: `"type":"module"`, `"test":"node --test \"tests/*.test.mjs\""`.
  - `loadPrefs(storage = globalThis.localStorage): BandPrefs` and `savePrefs(patch: Partial<BandPrefs>, storage?): BandPrefs`. Both use key `build_a_band.prefs.v1`, and every storage call is wrapped in try/catch.
  - `BandPrefs` defaults: `{ split: 62 }`. Later plans add fields to it.

- [ ] **Step 1: Write the failing tests** in `tests/prefs.test.mjs`, with an in-memory storage stub:
  - `defaults when empty`: `loadPrefs(stub).split === 62`.
  - `round-trips split`: after `savePrefs({ split: 70 }, stub)`, `loadPrefs(stub).split === 70`.
  - `bad JSON falls back to defaults`.
  - `storage that throws falls back to defaults`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `src/prefs.js`** and the skeleton files.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Core sidebar entry** (core repo, same branch as Tasks 1–2):
  - Add `{ key: 'build_a_band', screen: 'plugin-build_a_band', label: 'Build-a-Band', group: null, icon: 'users' }` to `NAV` in `static/v3/shell.js`.
  - Add `{ navKey: 'build_a_band', pluginId: 'build_a_band', slotId: 'v3-nav-build-a-band', anchorAfter: 'songs' }` to `PROMOTED_PLUGINS`.
  - Run `npm run test:js` in core. Expected: PASS.
- [ ] **Step 6: Install the plugin** in the dev app: link it into `feedback-upstream/dev-plugins/` the way the other plugins are linked, then `dev-sync.sh`. Real-app check: "Build-a-Band" shows in the sidebar and opens the placeholder screen.
- [ ] **Step 7: Commit** in both repos:
  - plugin: `feat: plugin skeleton and band prefs`
  - core: `feat(shell): Build-a-Band sidebar entry`

### Task 6: Stage layout and drum arrangement lookup (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/layout.js`, `src/arrangements.js`
- Test: `tests/layout.test.mjs`, `tests/arrangements.test.mjs`

**Interfaces:**
- Produces:
  - `clampSplit(pct: number): number`. It clamps to 35–80; a non-finite input gives 62.
  - `computeStageLayout({ lanes: string[], split: number }): Array<{ part: string, leftPct: number, widthPct: number }>`.
    - `lanes` is an ordered list of active lane parts, e.g. `['guitar','drums']`.
    - One lane gives `widthPct` 100.
    - Two lanes give the first lane `clampSplit(split)` and the second the rest.
    - It throws on more than two lanes for now. Plan 2+ extends it.
  - `findDrumArrangement(arrangements: Array<{name: string, type?: string}>): number`. It returns the index of the first arrangement whose `type === 'drums'` or whose name matches `/drum/i`, else `-1`.

- [ ] **Step 1: Write the failing tests:**
  - `clampSplit`: `clampSplit(10) === 35`, `clampSplit(95) === 80`, `clampSplit(NaN) === 62`, `clampSplit(70) === 70`.
  - `two lanes`: `computeStageLayout({lanes:['guitar','drums'], split:62})` deep-equals `[{part:'guitar',leftPct:0,widthPct:62},{part:'drums',leftPct:62,widthPct:38}]`.
  - `one lane fills`: `[{part:'guitar',leftPct:0,widthPct:100}]`.
  - `split is clamped inside layout`: split 99 gives guitar 80.
  - `findDrumArrangement`:
    - `[{name:'Lead'},{name:'Drums'}]` gives 1
    - `[{name:'Lead',type:'guitar'},{name:'Kit',type:'drums'}]` gives 1
    - `[{name:'Lead'}]` gives -1
    - `[]` gives -1
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement both modules.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: stage layout and drum arrangement lookup`.

### Task 7: Lane clock

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/lane-clock.js`
- Test: `tests/lane-clock.test.mjs`

**Interfaces:**
- Produces: `createLaneClock({ getTime: () => number, schedule?: (fn) => handle, cancel?: (handle) => void })`. It returns `{ add(hw), remove(hw), start(), stop(), tick() }`.
  - Each `tick()` calls `hw.setTime(getTime())` on every added highway, with one `getTime()` call per tick shared by all lanes.
  - `schedule` and `cancel` default to `requestAnimationFrame` and `cancelAnimationFrame`.
  - `start()` is idempotent; `stop()` cancels.
  - A highway whose `setTime` throws is skipped for that tick; the others still update.

- [ ] **Step 1: Write the failing tests**, with fake highways recording `setTime` calls and a manual `schedule`:
  - `one getTime per tick shared by all lanes`: two highways both receive the same value, and `getTime` is called once.
  - `remove stops updates`.
  - `throwing lane doesn't block others`.
  - `stop cancels the scheduled frame`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: lane clock`.

### Task 8: Mount the stage in the player (Band button)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/stage.js`
- Modify: `screen.js` (register the Band button), `assets/build-a-band.css`
- Test: `tests/stage.test.mjs` (DOM-free parts only; see the steps)

**Interfaces:**
- Consumes:
  - `window.feedBack.getDisplayTime` (Task 1)
  - `highway.setContainer`, `setLabelScale`, `getLabelScale` (Task 2)
  - `window.slopsmithSplitscreen.stop` (Task 3)
  - `window.feedBackDrums.setInputTarget` (Task 4)
  - `loadPrefs`/`savePrefs` (Task 5)
  - `computeStageLayout`, `clampSplit`, `findDrumArrangement` (Task 6)
  - `createLaneClock` (Task 7)
- Produces:
  - `mountStage({ player: HTMLElement, song: object, prefs: BandPrefs, deps }) → { unmount(): void, setSplit(pct): void }`.
    - `song` is the `song:loaded` detail.
    - `deps` injects `createHighway`, `getWsUrl`, `getDisplayTime`, `drumsApi` and `splitscreen` so the planning logic can be tested.
  - `planStage(song): { lanes: string[], drumIndex: number }`, pure and tested. Guitar is always on. Drums are on when `findDrumArrangement(song.arrangements) >= 0`.

Behaviour:
- **On mount:**
  1. Call `splitscreen?.stop()`.
  2. Add class `bab-stage` to `#player`.
  3. Build `div.bab-lanes` holding `div.bab-lane[data-part=guitar]`, `div.bab-divider` and `div.bab-lane[data-part=drums]`. The widths come from `computeStageLayout`.
  4. CSS for `#player.bab-stage #highway` positions the main canvas absolutely over the guitar slot.
  5. Call `window.highway.setContainer(guitarSlot)`.
- **Drum lane:**
  - Build a canvas inside the drums slot.
  - `hw = createHighway()`. Override `hw.resize` to measure the slot (the splitscreen `recreatePanelHighway` pattern).
  - `hw.setRenderer(window.feedBackViz_drums())`, `hw.init(canvas)`, `hw.connect(getWsUrl(song.filename, drumIndex), { onSongInfo(){} })`.
  - Add it to a lane clock driven by `getDisplayTime`.
  - Call `drumsApi.setInputTarget(canvas)`.
- **Divider:** dragging updates the widths through `computeStageLayout`, calls `resize()` on both highways, and `savePrefs({ split })` on mouseup.
- **Guitar lane chrome:** hovering shows "Fret numbers − / +", which steps `window.highway.setLabelScale` by 0.25.
- **`unmount()`:**
  1. Stop the lane clock.
  2. `hw.stop()` and remove the drum canvas.
  3. `drumsApi.setInputTarget(null)`.
  4. `window.highway.setContainer(null)`.
  5. Remove `bab-stage` and the stage DOM.
  6. `window.highway.resize()`.
- **The stage unmounts automatically** on `song:stop`, on `screen:changing` away from `player`, and on a new `song:loading`.
- **Band button:** put a "Band" toggle in `window.feedBack.ui.playerControlSlot()` that mounts or unmounts for the current song. It's temporary and replaced by the band screen flow in plan 2.

- [ ] **Step 1: Write the failing tests** in `tests/stage.test.mjs`:
  - `planStage with drums`: arrangements `[{name:'Lead'},{name:'Drums'}]` give `{lanes:['guitar','drums'], drumIndex:1}`.
  - `planStage without drums`: `[{name:'Lead'}]` gives `{lanes:['guitar'], drumIndex:-1}`.
  - `planStage missing arrangements`: `{}` gives `{lanes:['guitar'], drumIndex:-1}`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `planStage`, `mountStage` and the Band button.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: one-clock stage with guitar and drum lanes`.

### Task 9: Real-app acceptance for plan 1

No code. Run in the installed app with Matt's real devices. Before launching, ask Matt whether it's OK to quit his running copy.

- [ ] **Step 1: Install and launch.** Install all four branches (`dev-sync.sh`, with the plugin linked in `dev-plugins/`) and run `launch-debug.sh`.
- [ ] **Step 2: Open the stage.** Play a song with a drum chart and press **Band**. Expected: guitar on the left at 62%, drums on the right, with the drum kit driving the drum lane.
- [ ] **Step 3: One clock.**
  1. Pause, use arrow-key rewind, restart, change speed to 75% and back, and set an A-B loop and let it wrap.
  2. At each point read `window.highway.getTime()` and the drum lane's time through `cdp.mjs`.
  3. Expected: within 20 ms of each other, and both sweep back on the loop wrap.
- [ ] **Step 4: Layout.**
  1. Drag the divider to the edges: it stops at 35% and 80%.
  2. Resize the window: neither canvas is stretched.
  3. Leave and re-open the stage: the split is remembered.
  4. Fret numbers + makes the numbers readable from playing distance.
- [ ] **Step 5: Edge cases.**
  1. Song without drums: the guitar fills the stage.
  2. Start Band with splitscreen on: splitscreen turns off.
  3. Leave the player: the layout is back to normal.
  4. Change song: the stage tears down.
- [ ] **Step 6: Clean up.** Pause and leave nothing playing.
- [ ] **Step 7: Push and open PRs.** Push the four branches to Matt's forks and open PRs into `custom` (core, splitscreen, drums), with the plugin pushed to its own new GitHub repo. **Ask Matt before creating the new GitHub repo or opening any PR.**

---

## Later plans (each written when the previous one has landed)

2. **Band screen and song picker.**
   - Band screen columns with on/off, input, difficulty (guitar mastery mapping), per-part extras, signal lights, Failing and Full screen settings, and Go.
   - Song picker with filters, plus core library index and `/api/library` filters for drums chart, stem ids and difficulty ladder.
   - "Instrument + input kind" part model.
   - Next song loop back to the band screen.
3. **Vocals strip.**
   - Karaoke: mount into a container, public events/API and difficulty setter, hide-score switch.
   - Strip slot on the stage and the layout extended to strip + lanes.
4. **HUD and scoring.**
   - Band score, band multiplier and bonus, stars, crowd meters, callouts, part colours and glow.
   - Per-lane zoom −/+ (remembered).
   - Hide-score switches in note_detect and drums, and drums hit/miss events.
   - YARG fonts and Lucide icons, the 3-2-1 count-in overlay, and the results screen.
5. **Overdrive and fail.**
   - Guitar "Noodle it up" (note_detect `notedetect:onset`).
   - Vocal overdrive and mic hit (KRB-8 pulled forward in karaoke).
   - Drums star power events.
   - Fail mode and rescue.
6. **Drum sound modes.** Song drums, Rock Band and My kit only, through stems' `mute`/`restore` automation.
7. **Full screen and sidebar.**
   - Desktop renderer full-screen toggle that doesn't touch the start-full-screen preference.
   - Hover transport.
   - Sidebar sliding in over the player.
   - Settings over a paused song without unloading it, and "Leave the song?" for other screens.
