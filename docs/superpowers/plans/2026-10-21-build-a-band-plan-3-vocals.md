# Build-a-Band Plan 3: The vocals strip

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vocals becomes a playable band part. Karaoke's pitch strip mounts in a full-width slot above the lanes (or fills the stage for vocals alone), at the band's vocal difficulty and hear-myself setting, with karaoke's mic started for the band song. Teardown puts every karaoke setting back.

**Architecture:**
- **lyrics_karaoke** publishes one object, `window.lyricsKaraoke` (`apiVersion: 1`), built by a pure factory (`src/api.js`) over session overrides (`src/overrides.js`). It can host its strip in any container, take a non-persisted difficulty and hear-myself override, start and stop its mic, hide its score pill, and report phrase ratings and score on core's bus. Karaoke stays single-instance.
- **The plugin:**
  - `computeStageRows` and `planStage` add a strip row and say which lane holds the main highway.
  - `mountStage` creates the strip slot, pushes the lanes down, and hides the main highway for vocals alone.
  - `src/vocals.js` holds the band's calls into karaoke; the session runtime runs them at Go, at `song:ready` and at teardown.
  - The band screen treats vocals as playable, and greys it when karaoke isn't loaded.

**Tech Stack:** Vanilla ES modules with node:test (plugin `tests/*.test.mjs`; karaoke `tests/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read "Stage → Layout", "Scoring and the HUD" (the vocals row of the engine table) and "Changes needed in existing repos" (the lyrics_karaoke rows). The binding rulings for this plan are in `.superpowers/sdd/plan-3-inputs.md` (R1–R18). Where the spec and a ruling differ, the ruling wins.

**This is plan 3 of 7.** Plans 1 (one-clock stage) and 2 (band screen and sessions) have landed. The later plans are listed at the end.

## Global Constraints

- **Repos and branches:**
  - Repos live under `~/Desktop/repos/feedback-upstream/`.
  - The branch in every repo is `feature/build-a-band-stage`. It exists in `feedBack-plugin-build-a-band` (at `d244d6e`).
  - `feedBack-plugin-lyrics-karaoke` is on `main` (`ba8c75c`, clean). Create the branch from it: `git switch -c feature/build-a-band-stage main`.
  - Core `feedBack`, drums, note_detect and splitscreen are read-only in this plan.
- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  - The message ends with the Co-Authored-By line, followed by git's Signed-off-by.
  - One commit per task unless a step says otherwise.
- **Line endings:** every file this plan touches in both repos is LF. Check with `file` before editing anyway.
- **Test commands:**
  - build-a-band: `npm test`. This runs `node scripts/check-syntax.mjs`, then `node --test "tests/*.test.mjs"`.
  - lyrics_karaoke: `npm test` (`node --test tests/*.test.mjs`). One file: `node --test tests/api.test.mjs`. Karaoke's Python tests are not touched.
- **NO SOUND:**
  - Nothing in this plan plays audio. No task launches the app; Tasks 1–6 are unit-tested only.
  - Karaoke's voice monitor is built only while hear-myself is on (R6). Karaoke's existing gain-0 ScriptProcessor sink is left as it is (silent).
- **No push**, no PRs and no new GitHub repos.
- **Plugin identity:** id `build_a_band`, screen id `plugin-build_a_band`, prefs key `build_a_band.prefs.v1` (not renamed; no new pref fields in this plan).
- **Karaoke API identity:** `window.lyricsKaraoke`, `apiVersion: 1`. Bus events `karaoke:phrase` and `karaoke:reset` on `window.feedBack` (`emit`).
- **Layout values:** `HUD_RESERVE_PX = 60`, `STRIP_HEIGHT_PX = 90`. Vocals part colour `#a678ff`.
- **Difficulty values:** band `easy | medium | hard | expert` map to karaoke ids of the same names.
- **Karaoke prefs the band never writes:** `lyrics_karaoke.difficulty`, `.monitorVolume`, `.latencyMs`, `.micFeedback`. `.deviceId` is written only through plan 2's `applyMicDevice`.
- **Styles:** plugin styles go in `assets/build-a-band.css` with `bab-` class names. Add no Tailwind classes.

## Review Focus

1. **A band session that ends while karaoke is still loading** (Esc during the status fetch, or a new song) must never open the mic afterwards. (Task 5 `startVocals` cancellation test; Task 6 runtime test.)
2. **Solo karaoke after a band song:**
   - The strip is back at `#player`, top 60 px, 140 px high.
   - Difficulty, voice volume and the mic-on flag are as the user left them.
   - The in-player difficulty select is enabled again.
   
   (Task 1 override tests; Task 2 `mountStrip` detached-host rule; Task 6 teardown test.)
3. **Splitscreen coming up mid-song** stops it and remounts the stage, and the strip must follow into the new slot rather than vanish with the old one. (Task 6 remount test.)
4. **Vocals alone:** the main highway is hidden and stops drawing, karaoke's clock still moves, and after the session the next solo song's highway is visible again. (Task 4 vocals-only mount/unmount test; Task 7 step 5.)
5. **Karaoke plugin disabled:** the band screen greys vocals with a reason, Playable doesn't filter by vocals, and a Go with vocals switched on plays the other parts without touching karaoke. (Task 3 model test; Task 6 "no karaoke plugin" test.)

---

### Task 1: Karaoke session overrides and the public API factory (pure)

**Repo:** `feedBack-plugin-lyrics-karaoke` (create the branch first, Global Constraints)

**Files:**
- Create: `src/overrides.js`, `src/api.js`
- Test: create `tests/overrides.test.mjs`, `tests/api.test.mjs`

**Interfaces:**
- Consumes: `DIFFICULTIES` from `src/pitch.js`.
- Produces:
  - **`createSessionOverrides({ getSavedDifficulty: () => string })`** returns:
    - `difficulty(): string`: the override if set, else `getSavedDifficulty()`
    - `hasDifficulty(): boolean`
    - `setDifficulty(id: string | null): boolean`: `id` must be an own key of `DIFFICULTIES`; `null` clears. Returns `false` and changes nothing for anything else.
    - `hearMyself(): boolean`: the override if set, else `true`
    - `setHearMyself(on: boolean | null): boolean`: a non-boolean, non-null value returns `false`
    - `scoreHudHidden(): boolean` (default `false`); `setScoreHudHidden(hidden: boolean): boolean` (a non-boolean returns `false`)
    - `clear(): void`: all three back to their defaults
  - **In `src/api.js`:**
    - `API_VERSION = 1`, `PHRASE_EVENT = 'karaoke:phrase'`, `RESET_EVENT = 'karaoke:reset'`
    - **`stripHostStyle(hosted: boolean): Record<string,string>`:**
      - hosted: `{ position:'absolute', left:'0', right:'0', top:'0', bottom:'0', height:'auto', pointerEvents:'none', zIndex:'5' }`
      - not hosted: `{ position:'absolute', left:'0', right:'0', top:'60px', bottom:'', height:'140px', pointerEvents:'none', zIndex:'5' }`
    - **`phraseEventDetail(event, snapshot)`** returns `{ phraseIndex, rating, accuracy, points, multiplierBefore, score, multiplier, streak, stars, ratedCount }`: the event's five fields plus the snapshot's five, copied verbatim (R4).
    - **`emitScoring(emit, events, snapshot): void`:** calls `emit(PHRASE_EVENT, phraseEventDetail(e, snapshot))` once per event, in order. An `emit` that throws is swallowed.
    - **`createKaraokeApi(deps)`** returns a frozen object. `deps`:

      ```
      { overrides, mountStrip(el|null), setKaraokeMode(on): Promise<boolean>, isKaraokeMode(): boolean,
        startMic(): Promise<void>, stopMic(): void, getMicState(): string,
        onDifficultyChanged(): void, applyHearMyself(): void, getSnapshot(): object|null }
      ```

      The API object:
      - `apiVersion: 1`
      - `mountStrip(el | null): boolean`. Returns `false` without calling deps when `el` is neither `null` nor an object with an `appendChild` function.
      - `setKaraokeMode(on): Promise<boolean>` (passes `!!on`)
      - `isKaraokeMode()`
      - `startMic(): Promise<string>`: awaits `deps.startMic()`, then resolves `deps.getMicState()`
      - `stopMic(): void`
      - `getMicState()`
      - `setDifficulty(id | null): boolean`: calls `deps.onDifficultyChanged()` only when the effective difficulty changed
      - `getDifficulty(): string`
      - `setHearMyself(on | null): boolean`: calls `deps.applyHearMyself()` only when the effective value changed
      - `getHearMyself(): boolean`
      - `setScoreHudHidden(hidden): boolean`
      - `isScoreHudHidden(): boolean`
      - `getScore(): object | null`

- [ ] **Step 1: Write the failing tests.**

  `tests/overrides.test.mjs` (with `const saved = { d: 'easy' }` and `getSavedDifficulty: () => saved.d`):
  - `difficulty falls back to the saved one`: `difficulty() === 'easy'` and `hasDifficulty() === false`. After `saved.d = 'hard'`, it reads `'hard'`.
  - `an override wins and null clears it`:
    - `setDifficulty('expert') === true`, then `difficulty() === 'expert'` and `hasDifficulty() === true`
    - `setDifficulty(null) === true`, then `difficulty() === 'easy'`
  - `unknown difficulty ids are refused`: `setDifficulty('beginner')`, `setDifficulty('')` and `setDifficulty(3)` all return `false`, and the previous override stays.
  - `hear-myself defaults on, takes booleans or null`:
    - `hearMyself() === true`
    - `setHearMyself(false)` gives `false`
    - `setHearMyself('off') === false` and the value stays `false`
    - `setHearMyself(null)` gives `true`
  - `score HUD hidden toggles and clear resets everything`: after `setScoreHudHidden(true)`, `setDifficulty('hard')` and `setHearMyself(false)`, then `clear()` gives `scoreHudHidden() === false`, `hasDifficulty() === false` and `hearMyself() === true`.

  `tests/api.test.mjs` (fake deps recording calls into `log`; `getSnapshot` returns `{score:10, multiplier:2, streak:1, stars:1, ratedCount:1}`):
  - `stripHostStyle hosted fills its host; unhosted is karaoke's own placement`: deep-equals both objects from the Interfaces block.
  - `phraseEventDetail merges the scorer event and snapshot verbatim`:
    - `phraseEventDetail({phraseIndex:3, rating:'Strong', accuracy:0.8, points:1600, multiplierBefore:2}, snap)` deep-equals `{phraseIndex:3, rating:'Strong', accuracy:0.8, points:1600, multiplierBefore:2, score:10, multiplier:2, streak:1, stars:1, ratedCount:1}`.
  - `emitScoring emits one karaoke:phrase per event, in order, and survives a throwing emit`.
  - `apiVersion is 1 and the object is frozen`.
  - `mountStrip refuses a non-element`: `mountStrip({})` and `mountStrip('x')` return `false` and `log` stays empty. `mountStrip(null) === true` calls `deps.mountStrip(null)`.
  - `setDifficulty re-scores only when the effective difficulty changes`:
    - with saved `'medium'`: `setDifficulty('medium')` gives no `onDifficultyChanged`
    - `setDifficulty('hard')` gives one
    - `setDifficulty('nope') === false` gives none
    - `setDifficulty(null)` gives one
    - `getDifficulty()` follows each step
  - `setHearMyself applies only on a change`: `setHearMyself(true)` gives no `applyHearMyself`; `setHearMyself(false)` gives one; `setHearMyself(null)` gives one.
  - `startMic resolves the mic state after starting`: `await startMic() === 'listening'` with `getMicState` returning `'listening'` after `deps.startMic` resolves.
  - `setKaraokeMode coerces to a boolean`: `setKaraokeMode(1)` passes `true`.
- [ ] **Step 2: Run** `npm test`. Expected: the new files FAIL (module not found).
- [ ] **Step 3: Implement** `src/overrides.js` and `src/api.js` to the Interfaces block. No DOM access and no `window`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS (58 existing + the new tests).
- [ ] **Step 5: Commit** `feat: session overrides and a public API factory for other plugins`.

### Task 2: Karaoke publishes `window.lyricsKaraoke` and wires the overrides

**Repo:** `feedBack-plugin-lyrics-karaoke`

**Files:**
- Modify `src/main.js`:
  - imports (23-30)
  - `rebuildScorer` (143-149)
  - `showOverlay` (369-403)
  - `drawFrame` scoring (588-589)
  - `drawHud` (740-791)
  - `resetUserResults` (898-908)
  - `startMic` monitor block (1093-1107)
  - `stopMic` (1166-1201)
  - `diffSelect` (1224-1243)
  - `onSongLoaded` (1399-1410)
  - `lyricsKaraokeDiag` (1913-1921)
  - `onDifficultyChanged` (2044-2051)
  - the `song:seek` handler (2066-2072)
- Create: `README.md` (short: what the plugin does, plus a "Plugin API (`window.lyricsKaraoke`)" section). The spec requires each public change to be documented in the repo's README, and this repo has none.
- Modify: `CHANGELOG.md` (one `### Added` bullet under `[Unreleased]`)
- Test: `tests/smoke.test.mjs` (append)

**Interfaces:**
- Consumes: Task 1 (`createSessionOverrides`, `createKaraokeApi`, `stripHostStyle`, `emitScoring`, `RESET_EVENT`).
- Produces: `window.lyricsKaraoke`, assigned once in the IIFE body next to `window.lyricsKaraokeDiag`, and the bus events. The wiring:
  - **Overrides:** `const overrides = createSessionOverrides({ getSavedDifficulty: getDifficulty })`.
    - `rebuildScorer` uses `overrides.difficulty()`.
    - `onDifficultyChanged` syncs both selects to `overrides.difficulty()`.
    - The in-player `diffSelect`'s value is `overrides.difficulty()`. It gets `disabled = overrides.hasDifficulty()`, and while disabled its title is `'Set on the band screen'`. Refresh this in `onDifficultyChanged` and on creation.
  - **Strip host (R3):**
    - Module `let stripHost = null`; `resolveHost()` returns `stripHost` when `stripHost && stripHost.isConnected`, else `#player`.
    - `showOverlay` appends to `resolveHost()` and applies `Object.assign(overlayEl.style, stripHostStyle(host !== #player))`. It requires `#highway` only when unhosted.
    - `deps.mountStrip(el)` sets `stripHost = el`. If `overlayEl` exists, it re-appends it to `resolveHost()`, restyles it and calls `sizeCanvas()`.
  - **Karaoke mode (R9):**
    - `onSongLoaded` stores its body promise in module `songLoad` (and the filename it is for).
    - `deps.setKaraokeMode(on)`:
      - off: `setKaraokeMode(false)`, then resolve `karaokeMode`.
      - on: pin `currentSong.filename`, then `await songLoad`.
        - Return `false` if the song changed or `!status || !status.has_pitch`.
        - `await fetchPitchData(filename)` when `pitchData` is null, and re-check the song.
        - Then `setKaraokeMode(!!pitchData)` and resolve `karaokeMode`.
  - **Mic:**
    - `deps.startMic = startMic`; `deps.getMicState = () => micState`.
    - `deps.stopMic = () => { if (micState !== 'off') { stopMic({ keepFlag: true }); resetUserResults(); } }`.
  - **Hear-myself (R6):**
    - Move the monitor block into `connectMonitor()`. It builds `monitorGain → limiter → destination` and stores the limiter in a module `monitorLimiter`; `routeMonitorToGameOutput` is unchanged.
    - Add `disconnectMonitor()`. It disconnects `micSourceNode → monitorGain`, `monitorGain` and `monitorLimiter`, then nulls both.
    - `startMic` calls `connectMonitor()` only when `overrides.hearMyself()`.
    - `stopMic` nulls `monitorLimiter` as well.
    - `deps.applyHearMyself()`: while `micState === 'listening'`, connect when on and `!monitorGain`, disconnect when off and `monitorGain`.
  - **Score HUD (R8):** `drawHud` skips the score pill (its backing rect and the three texts) when `overrides.scoreHudHidden()`. Warnings and the rating keep their positions.
  - **Events (R4):**
    - `busEmit(name, detail)` calls `window.feedBack.emit` (falling back to `window.slopsmith.emit`) inside try/catch.
    - In `drawFrame`, after `advanceTo`, call `emitScoring(busEmit, events, scorer.snapshot())` when `events.length`.
    - `resetUserResults` and the `song:seek` handler emit `RESET_EVENT` with `scorer ? scorer.snapshot() : null`.
  - **`getSnapshot`:** `() => scorer ? scorer.snapshot() : null`.
  - **`lyricsKaraokeDiag()`** additionally reports `difficulty: overrides.difficulty()`, `hearMyself: overrides.hearMyself()`, `scoreHudHidden: overrides.scoreHudHidden()` and `stripHosted: resolveHost() !== document.getElementById('player')`. It still reports `monitorGain: null` when no monitor is built.

- [ ] **Step 1: Write the failing tests** in `tests/smoke.test.mjs`, which reads `src/main.js` as text:
  - `main.js publishes the API from the factory`: the source matches `/window\.lyricsKaraoke\s*=\s*createKaraokeApi\(/`.
  - `the voice monitor is only built through connectMonitor`: the source contains `function connectMonitor(` and `function disconnectMonitor(`, and `micSourceNode.connect(monitorGain)` occurs exactly once.
  - `the scorer uses the session difficulty`: the source has no `difficulty: getDifficulty()` and does contain `difficulty: overrides.difficulty()`.
  - `README documents the plugin API`: `README.md` contains `window.lyricsKaraoke`, `karaoke:phrase` and `karaoke:reset`.
- [ ] **Step 2: Run** `npm test`. Expected: the 4 new tests FAIL.
- [ ] **Step 3: Implement** the wiring above. Then write `README.md` (the API table from Task 1, the two events and their detail fields, the rule that overrides are not saved and `null` clears them) and the CHANGELOG bullet.
- [ ] **Step 4: Run** `npm test` and `node --check src/main.js`. Expected: all PASS.
- [ ] **Step 5: Self-check by reading the diff.** These must not change:
  - With no API call ever made, `startMic` still builds the monitor at the saved volume.
  - The overlay still lands in `#player` at `60px`/`140px`.
  - `stopMic` from karaoke's own button still writes `micFeedback='0'`.
- [ ] **Step 6: Commit** `feat: window.lyricsKaraoke — mount the strip anywhere, session difficulty and hear-myself, score events`.

### Task 3: Band screen: vocals is playable, and greyed without karaoke

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/vocals.js` (this task adds only `karaokeApi`; Task 5 extends it)
- Modify:
  - `src/band-model.js` (10, 23, 31-34)
  - `src/query.js` (16-17)
  - `src/band-screen.js` (102, 128, 173)
  - `src/mappings.js` (add `vocalsDifficultyId`)
- Test: `tests/vocals.test.mjs` (create), `tests/band-model.test.mjs`, `tests/query.test.mjs`, `tests/mappings.test.mjs`, `tests/band-screen.test.mjs`

**Interfaces:**
- Produces:
  - **`karaokeApi(win): object | null`:** returns `win.lyricsKaraoke` when it is an object with `apiVersion >= 1` and functions `mountStrip`, `setKaraokeMode`, `startMic`, `stopMic`, `setDifficulty` and `setHearMyself`. Otherwise (or on a throwing getter) it returns `null`.
  - **`vocalsDifficultyId(diff): string`:** `diff` when it is in `DIFFICULTIES`, else `'medium'`.
  - **`bandScreenModel({ prefs, item, vocalsSupported = true })`:**
    - With `vocalsSupported === false`, the vocals column is `unavailable: true` with note `'Turn on the Lyrics Karaoke plugin to sing'`, with or without a song.
    - `VOCALS_NOTE` is gone.
    - `goEnabled = !!item && ['guitar','drums','vocals'].some(playable)`.
    - `goHint` is `'Turn on a part'` when a song is picked and nothing is playable.
  - **`buildLibraryQuery`:** Playable adds `has_lyrics=pitch` when `parts.vocals && parts.vocals.on`. The explicit vocals filter is unchanged.
  - **`createBandScreen`:**
    - Both `bandScreenModel` calls pass `vocalsSupported: !!karaokeApi(win)`.
    - The picker's `getParts` returns `prefs.parts` with `vocals.on` forced `false` when karaoke is unsupported.

- [ ] **Step 1: Write the failing tests:**
  - `vocals.test.mjs`:
    - `karaokeApi accepts a v1 API`: a fake with `apiVersion:1` and the six functions is returned as-is.
    - `karaokeApi refuses missing, old or partial APIs`: `{}`, `{lyricsKaraoke:{apiVersion:0, ...fns}}`, and a v1 missing `startMic` all give `null`.
  - `mappings.test.mjs`: `vocalsDifficultyId('expert') === 'expert'`, `vocalsDifficultyId('beginner') === 'medium'`, `vocalsDifficultyId(undefined) === 'medium'`.
  - `band-model.test.mjs`:
    - Update `full band song`: `m.columns.vocals.note === ''`.
    - Replace `only vocals on: ...` with `only vocals on: Go is enabled for a song with vocal pitch`: guitar and drums off, `fullBand` gives `goEnabled === true`.
    - Add `nothing on: Go disabled with "Turn on a part"`.
    - Add `karaoke not loaded greys vocals with its note, even with no song`: `bandScreenModel({ prefs, item: null, vocalsSupported: false }).columns.vocals` deep-includes `{unavailable:true, note:'Turn on the Lyrics Karaoke plugin to sing'}`.
    - Add `karaoke not loaded and only vocals on: Go disabled`.
  - `query.test.mjs`:
    - Rename `playable by this band ignores vocals; ...` to `playable by this band includes vocals; the explicit vocals filter still applies`: playable with only vocals on gives `has_lyrics=pitch`.
    - Playable with vocals off gives no `has_lyrics`.
  - `band-screen.test.mjs`:
    - `without window.lyricsKaraoke the vocals column says to turn the plugin on`: the `.bab-col[data-part="vocals"] .bab-note` text is the note.
    - `with only vocals on and a pitched song, Go is enabled`: the window has a fake v1 API.
- [ ] **Step 2: Run** `npm test`. Expected: the new and updated tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: vocals is a playable band part; greyed when karaoke isn't loaded`.

### Task 4: Stage rows: the strip slot, and the main highway hidden for vocals alone

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/layout.js` (add constants and `computeStageRows`; `computeStageLayout` unchanged, R10)
  - `src/stage.js` (`planStage` 23-33; `mountStage` 44-328)
  - `assets/build-a-band.css` (178-227 plus new rules)
- Test: `tests/layout.test.mjs`, `tests/stage.test.mjs`, `tests/stage-mount.test.mjs`

**Interfaces:**
- Produces:
  - **Layout:**
    - `HUD_RESERVE_PX = 60`, `STRIP_HEIGHT_PX = 90`
    - **`computeStageRows({ strip: boolean, lanes: string[] })`** returns `{ strip: null | { topPx, heightPx, fill }, lanesTopPx }`:
      - no strip: `{ strip: null, lanesTopPx: 0 }`
      - strip and lanes: `{ strip: { topPx: 60, heightPx: 90, fill: false }, lanesTopPx: 150 }`
      - strip, no lanes: `{ strip: { topPx: 60, heightPx: null, fill: true }, lanesTopPx: null }`
  - **`planStage(song, parts)`** returns `{ strip, mainPart, lanes, drumIndex, laneArrangement }` (R11):
    - `strip = !!(parts && parts.vocals && parts.vocals.on === true)`.
    - Guitar on: `mainPart: 'guitar'`; lanes as in plan 2.
    - Guitar off, drums on with a chart (`drumIndex >= 0 || hasDrumTab`):
      - with the strip: `lanes: ['drums']`, `mainPart: 'drums'`
      - without it: `lanes: []`, `mainPart: null` (plan 2 drums-only, unchanged)
    - Otherwise: `lanes: []`, `mainPart: null`.
  - **`mountStage({ player, song, prefs, deps })`** returns `{ unmount(), setSplit(pct), stripSlot: HTMLElement | null }`:
    - **The strip:** when `plan.strip`, it creates `div.bab-strip` (`data-part="vocals"`) as the first child of `.bab-lanes`. Its style is `top: <topPx>px` with `height: 90px`, or with `bottom: 0px` when `fill`. That element is `stripSlot`.
    - **Lanes top:** with a strip and lanes, `player.style.setProperty('--bab-lanes-top', '150px')`. `unmount` calls `removeProperty('--bab-lanes-top')`.
    - **Main highway:**
      - `plan.mainPart` set: `mainHw.setContainer(slots[plan.mainPart])`.
      - `null` (vocals alone): `player.classList.add('bab-main-hidden')` and `mainHw.setVisible(false)`; no `setContainer` call. `unmount` calls `mainHw.setVisible(null)` and removes the class (R12).
    - **Guitar-only chrome:** the fret-number chrome, the label-scale apply/restore and the hover handlers run only when `plan.mainPart === 'guitar'`.
    - **Second drum highway:** created (with `pinDrums`) only when `lanes.includes('drums') && plan.mainPart === 'guitar'`.
    - **The divider** exists only with two lanes.
  - **CSS:**
    - `#player.bab-stage #highway`, `#player .bab-lane` and `#player .bab-divider` use `top: var(--bab-lanes-top, 0px)`.
    - New rule `#player .bab-strip { position:absolute; left:0; right:0; overflow:hidden; pointer-events:none; }`.
    - New rule `#player.bab-stage.bab-main-hidden #highway { visibility:hidden; }`.

- [ ] **Step 1: Write the failing tests:**
  - `layout.test.mjs`: `stage rows: none, strip over lanes, strip alone`, asserting the three results above. `throws on more than two lanes` stays.
  - `stage.test.mjs`:
    - `planStage puts the strip on only for vocals switched on`: plan-1 style `planStage(song)` gives `strip === false` and `mainPart === 'guitar'`.
    - `planStage vocals alone`: `planStage({arrangements:[{name:'Lead'}]}, {guitar:{on:false}, drums:{on:false}, vocals:{on:true}})` deep-includes `{strip:true, mainPart:null, lanes:[]}`.
    - `planStage drums only with vocals puts the main highway in the drums lane`: `{arrangements:[{name:'Lead'},{name:'Drums'}]}` with guitar off, drums on and vocals on gives `{strip:true, mainPart:'drums', lanes:['drums'], drumIndex:1}`.
    - `planStage drums only without vocals is unchanged`: gives `{strip:false, mainPart:null, lanes:[]}`.
  - `stage-mount.test.mjs`:
    - Give the fake `style` `setProperty`, `removeProperty` and `getPropertyValue` backed by a map.
    - Give `mainHw` `setVisible: (v) => log.push('main.setVisible(' + v + ')')`.
    - Tests:
      - `vocals with guitar and drums: strip slot above the lanes, lanes pushed down`:
        - `stripSlot.className === 'bab-strip'`, `stripSlot.style.top === '60px'` and `.height === '90px'`
        - `player.style.getPropertyValue('--bab-lanes-top') === '150px'`
        - exactly one drum highway created
        - `stripSlot` is the first child of `.bab-lanes`
      - `vocals alone: the strip fills, the main highway is hidden and no lane exists`:
        - `stripSlot.style.bottom === '0px'`
        - the log has `main.setVisible(false)` and no `main.setContainer(slot)`
        - the player has `bab-main-hidden`
        - no drum highway and no `label` entries
        - after `unmount()`: the log has `main.setVisible(null)`, the class is gone, `--bab-lanes-top` is empty and the strip is removed
      - `drums alone with vocals: the main highway takes the drums lane, no second highway, no fret chrome`: one `main.setContainer(slot)`, `createHighway` never called, no `.bab-lane-chrome`, no `drums.target(canvas)`.
      - `no vocals: no strip and the plan-2 layout`: `stripSlot === null` and `--bab-lanes-top` unset. Every existing stage-mount test passes unchanged.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, then the CSS.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: stage strip slot above the lanes; vocals alone fills the stage`.

### Task 5: The band's calls into karaoke (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `src/vocals.js` (add three functions)
- Test: `tests/vocals.test.mjs` (append)

**Interfaces:**
- Consumes:
  - `vocalsDifficultyId` (Task 3)
  - `applyMicDevice(deviceId, storage)` (devices.js:131)
  - the karaoke API (Task 1)
- Produces:
  - **`armVocals(api, vocalsPrefs): void`:** `api.setDifficulty(vocalsDifficultyId(vocalsPrefs.difficulty))`, then `api.setHearMyself(!!vocalsPrefs.hearMyself)`. Each call is wrapped so a throw doesn't stop the next.
  - **`startVocals({ api, slot, deviceId, storage, isCurrent }): Promise<'started' | 'no-pitch' | 'mic-error' | 'cancelled'>`:**
    1. `api.mountStrip(slot)`
    2. `ok = await api.setKaraokeMode(true)`; if `!isCurrent()`, return `'cancelled'`; if `!ok`, return `'no-pitch'`
    3. `applyMicDevice(deviceId, storage)`
    4. `state = await api.startMic()`; if `!isCurrent()`, call `api.stopMic()` and return `'cancelled'`
    5. return `state === 'listening' ? 'started' : 'mic-error'`
    - A rejection anywhere resolves `'mic-error'`.
  - **`stopVocals(api): void`:** in this order, each guarded: `api.stopMic()`, `api.setKaraokeMode(false)` (its promise caught and ignored), `api.mountStrip(null)`, `api.setDifficulty(null)`, `api.setHearMyself(null)`.

- [ ] **Step 1: Write the failing tests** with a fake API recording `[name, arg]` calls. `setKaraokeMode` and `startMic` return controllable promises; `startMic` resolves `'listening'` by default.
  - `armVocals sets the band difficulty and hear-myself`: `{difficulty:'hard', hearMyself:false}` gives `[['setDifficulty','hard'],['setHearMyself',false]]`; `'bogus'` gives `'medium'`.
  - `startVocals hosts the strip, turns karaoke on, writes the mic, then starts it`:
    - resolves `'started'`
    - call order: `mountStrip(slot)`, `setKaraokeMode(true)`, `startMic`
    - `storage.getItem('lyrics_karaoke.deviceId') === 'usb-mic'` at the moment `startMic` is called
  - `no pitch: no mic`: `setKaraokeMode` resolves `false`, giving `'no-pitch'` and no `startMic`.
  - `a session that ended while karaoke was loading never opens the mic`: `isCurrent` flips to `false` before `setKaraokeMode` resolves, giving `'cancelled'` and no `startMic`.
  - `a session that ended while the mic was starting stops it`: `isCurrent` flips during `startMic`, giving `'cancelled'` and a final `stopMic`.
  - `mic error`: `startMic` resolves `'error'` gives `'mic-error'`; `startMic` rejecting also gives `'mic-error'`.
  - `stopVocals undoes everything in order, even when one call throws`: `stopMic` throws, and the remaining four calls still happen in order with `null` arguments.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band vocals start and stop karaoke for the band song`.

### Task 6: Vocals joins the band session

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/session.js` (10-31)
  - `src/band-runtime.js` (`effectivePrefs` 45-52, `newSession` 83-111, `EFFECTS` 228-341)
- Test: `tests/session.test.mjs`, `tests/band-runtime.test.mjs`

**Interfaces:**
- Consumes:
  - `karaokeApi`, `armVocals`, `startVocals`, `stopVocals` (Tasks 3 and 5)
  - `planStage` with `strip` and `mountStage` with `stripSlot` (Task 4)
- Produces:
  - **The reducer** (R14): `idle.go` gives `['saveRestorePoint', 'armVocals', 'play']`; same-file `armed.ready` gives `['mount', 'applyDifficulties', 'applyDevices', 'startVocals']`. Every other row is unchanged.
  - **`effectivePrefs(prefs, item, win)`:** vocals is on only when it is on, has a chart, and `karaokeApi(win)` is non-null.
  - **`newSession` adds:**
    - `vocals: isOn(prefs, 'vocals')`
    - `vocalsArmed: false`
    - `vocalsStarted: false`
  - **Effects:**
    - **`armVocals(s)`:** when `s.vocals`, `armVocals(api, s.prefs.parts.vocals)` and `s.vocalsArmed = true`.
    - **`mount(s)`:**
      - Returns early only when `!plan.strip && plan.lanes.length === 0`.
      - After a successful `mountStage`, when `s.vocalsStarted && stage.stripSlot`, it calls `api.mountStrip(stage.stripSlot)`. This covers the splitscreen remount.
    - **`startVocals(s)`:**
      - Runs when `s.vocals && stage && stage.stripSlot`.
      - Sets `s.vocalsStarted = true`.
      - Calls `startVocals({ api, slot: stage.stripSlot, deviceId: s.prefs.parts.vocals.deviceId, storage, isCurrent: () => session === s && state.phase === 'playing' })`.
      - On `'no-pitch'` while still current, it calls `showToast(s, 'No vocal pitch for this song')`.
    - **`teardown(s)`:** first, when `s.vocalsArmed`, `stopVocals(api)`. Then the plan-2 steps, unchanged, starting with `unmountStage()`.
  - **`play(s)`:** unchanged. Vocals-only sessions get `arrIndex === undefined`.

- [ ] **Step 1: Write the failing tests.**

  `session.test.mjs`: update the `idle go` and `armed ready same` rows to the new effect lists.

  `band-runtime.test.mjs`:
  - **Setup changes:**
    - `setup({ karaoke = true })` adds `win.lyricsKaraoke`: a v1 fake recording into `calls.karaoke`.
      - `setKaraokeMode` resolves `true`, unless `setup({ karaokePitch: false })`.
      - `startMic` resolves `'listening'`.
    - The fake `mountStage` returns `stripSlot: prefs.parts.vocals.on ? doc.createElement('div') : null`.
    - `PITCH_ITEM = { ...ITEM, filename: 'Sing.sloppak', has_vocal_pitch: true }`.
  - **Tests:**
    - `Go with vocals arms difficulty and hear-myself before playSong`:
      - vocals `{on:true, difficulty:'hard', hearMyself:false, deviceId:'usb-mic'}`
      - `calls.karaoke` starts with `['setDifficulty','hard'], ['setHearMyself',false]`, recorded before `calls.playSong[0]` (use a shared sequence counter)
    - `song:ready hosts the strip in the stage slot, then starts the mic with the band mic`:
      - after `loadSong(PITCH_ITEM)` and `await flush()`, `mountStrip` received `mounts[0].stripSlot`
      - then `setKaraokeMode(true)`, then `startMic`
      - `storage.getItem('lyrics_karaoke.deviceId') === 'usb-mic'`
    - `vocals alone is a session: no arrangement index, the stage mounts`:
      - guitar and drums off gives `playSong('Sing.sloppak', undefined)`
      - one `mountStage` call, with `prefs.parts.vocals.on === true`
    - `teardown stops karaoke before the stage unmounts and clears every override`:
      - leaving the player gives karaoke calls ending `stopMic`, `setKaraokeMode(false)`, `mountStrip(null)`, `setDifficulty(null)`, `setHearMyself(null)`
      - all of them recorded before `mounts[0].unmounted === 1` (sequence counter)
    - `no karaoke plugin: vocals sits out and karaoke is never called`: `setup({ karaoke: false })` with vocals and guitar on; the mounted prefs have `vocals.on === false`.
    - `karaoke has no pitch for the song: toast, no mic`: `setup({ karaokePitch: false })` gives a `.bab-toast` with text `'No vocal pitch for this song'` and no `startMic`.
    - `leaving the player while karaoke is loading never opens the mic`: hold `setKaraokeMode` pending, emit `screen:changing {from:'player', id:'v3-songs'}`, then resolve it; `startMic` is never called.
    - `a splitscreen remount re-hosts the strip in the new slot`: from the plan-2 `Always Split starting after mount ...` test pattern, with vocals on; after the remount, the last `mountStrip` argument is `mounts[1].stripSlot`.
    - The existing `vocals on with no vocal pitch is ignored` keeps passing (no karaoke calls at all; add that assertion).
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in the reducer, then the runtime.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including every plan-2 runtime test.
- [ ] **Step 5: Commit** `feat: vocals joins band sessions — strip, band difficulty and mic for the band song`.

### Task 7: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 3, and records the results in the plan 3 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`. Nothing may play; hear-myself is forced off throughout.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with build-a-band and lyrics_karaoke on `feature/build-a-band-stage`. Never the plain form: it restarts a running app.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, then reload the page with `debug/cdp-reload.mjs`. If none is up, start one with `launch-debug.sh`.
  3. Never quit a running copy. If a non-debug copy blocks the debug launch, record "acceptance blocked" in the ledger and stop.
- [ ] **Step 2: Snapshot and force silence.**
  1. Record `localStorage` values for `lyrics_karaoke.difficulty`, `.monitorVolume`, `.micFeedback` and `.deviceId`, and `build_a_band.prefs.v1`.
  2. Through `savePrefs`, set `parts.vocals.hearMyself = false`.
  3. Confirm `window.lyricsKaraoke.apiVersion === 1`.
- [ ] **Step 3: Band screen.**
  1. Open `plugin-build_a_band` and pick the song (R17).
  2. Confirm the vocals column has no "next update" note, and that Playable's `/api/library` URL now includes `has_lyrics=pitch`.
- [ ] **Step 4: Full band, silently.**
  1. Hold autoplay with plan 1's silent-load technique: `feedBack.holdAutoplay()` on `song:loading` with `release.settle()`, audio muted, and a guard that pauses on `song:play`/resume/audio `play`. Then press Go.
  2. Confirm, with `#audio.paused === true`:
     - `phase() === 'playing'`
     - `.bab-strip` is at top 60 px and 90 px high
     - `#lyrics-karaoke-overlay`'s parent is `.bab-strip`
     - `--bab-lanes-top` is `150px` and `#highway`'s top is 150 px
     - `lyricsKaraoke.isKaraokeMode() === true` and `getDifficulty()` equals the band vocals difficulty
     - `lyricsKaraokeDiag().monitorGain === null` and `hearMyself === false`
     - `micState` is `'listening'` or `'error'`; record which.
  3. Leave with `window.closeCurrentSong()`. Confirm:
     - the band screen is active and `phase() === 'idle'`
     - `micState === 'off'` and `trackState === null`
     - `lyricsKaraoke.getDifficulty()` equals the saved difficulty and `getHearMyself() === true`
     - the Step 2 karaoke keys are unchanged, except `.deviceId` when a band mic is set
- [ ] **Step 5: Vocals alone.**
  1. Set guitar and drums off, then Go held (as in Step 4).
  2. Confirm:
     - `#player.bab-main-hidden`
     - `getComputedStyle(#highway).visibility === 'hidden'` and `highway.isVisible() === false`
     - `.bab-strip` runs from 60 px to the footer
     - after a paused `seek` of +5 s, `highway.getTime()` moved by about 5 s
  3. Leave the player.
  4. Play the same song solo with `playSong` held: confirm `highway.isVisible() === true`.
  5. Call `lyricsKaraoke.setKaraokeMode(true)`: the overlay's parent is `#player`, top `60px`, height `140px`, and the in-player difficulty select is enabled. Then `setKaraokeMode(false)`. This never starts the mic.
- [ ] **Step 6: Clean up.**
  1. Close the song and restore `build_a_band.prefs.v1` from Step 2.
  2. Navigate away from the band screen (meters stop).
  3. Confirm nothing is playing and the mic is off (`micState === 'off'`; CoreAudio helper `audio-in-use.swift` if available).
  4. Record the results and the commit SHAs in the ledger.

---

## Deviations from the spec in this plan

- **The strip sits 60 px down** (under core's player HUD row) until plan 4 adds the band HUD (R10).
- **Karaoke's own score pill stays visible** in band songs until plan 4's HUD replaces it. The hide switch exists now (R8).
- **Vocals alone hides the main highway** and plays the song's default arrangement underneath (R12).
- **Drums alone without vocals** is unchanged from plan 2: no stage (R11).
- **No mic-device setter.** Karaoke's localStorage key is enough (R7).
- **Karaoke gets a README**, because the spec requires public changes to be documented there and the repo had none.

## Later plans (each written when the previous one has landed)

4. **HUD and scoring.**
   - Band score, multiplier and bonus, stars, crowd meters, callouts, part colours and glow.
   - Per-lane zoom.
   - Hide-score switches: karaoke's `setScoreHudHidden(true)`, plus note_detect and drums.
   - Drums hit/miss events. Vocals via `karaoke:phrase` / `karaoke:reset` / `getScore()`.
   - The 3-2-1 count-in and the results screen, which replaces plan 2's 1.5 s exit wait.
   - The strip's top offset moves to the band HUD height.
5. **Overdrive and fail.** "Noodle it up", the vocal mic hit (KRB-8 pulled forward, in karaoke), drums star power events, and fail mode and rescue (using the stored `failMode`).
6. **Drum sound modes.** Song drums, Rock Band and My kit only, through stems' `mute`/`restore` (using the stored `soundMode`).
7. **Full screen and sidebar.**
   - Full screen stage (using the stored `fullScreenStage`) and the hover transport.
   - The sidebar over the player.
   - Settings over a paused song.
