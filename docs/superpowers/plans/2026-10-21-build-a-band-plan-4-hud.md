# Build-a-Band Plan 4: HUD, scoring and results

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Band songs feel like Rock Band. A band HUD shows the score, stars and band multiplier. Every lane has a crowd meter, multiplier, glow and streak callouts, plus zoom. A shared 3-2-1 count-in runs across the stage, toasts stack, and a results screen with Play again and Next song replaces plan 2's 1.5 s exit. The plugins' own score displays are hidden during band songs and come back afterwards.

**Architecture:**
- **Pure modules in the plugin:**
  - `yarg-rules.js` (LGPL port) and `stars.js`
  - `band-score.js`: a time-stamped judgment ledger that replays into part scores, band bonus, band multiplier and crowd meters
  - `part-events.js`: turns each engine's events into ledger entries
  - `hud-model.js` and `results.js`: what the HUD and results screen show
- **Thin DOM modules:** `hud.js`, `toasts.js`, `count-in-overlay.js`, `results-screen.js`, `icons.js`.
- **The session runtime** wires them to the bus.
- **Other repos:**
  - Each scoring plugin gets a public "hide my score display" switch: note_detect, drums, scorecard. Karaoke's already exists.
  - Drums publishes its judgments and star power events on core's bus.
  - Core's count-in announces its ticks and can be forced on for band songs.

**Tech Stack:** Vanilla ES modules and CommonJS plugin scripts, node:test. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read "Scoring and the HUD", "Look and feel", "Stage → Layout" and "User flow" step 4. The binding rulings are in `.superpowers/sdd/plan-4-inputs.md` (R1–R24, verified facts, Lucide icon data). Where the spec and a ruling differ, the ruling wins.

**This is plan 4 of 7.** Plans 1 (one-clock stage), 2 (band screen and sessions) and 3 (vocals strip) have landed. The later plans are listed at the end.

## Global Constraints

- **Repos and branches.** Repos live under `~/Desktop/repos/feedback-upstream/`. The branch in every repo is `feature/build-a-band-stage`.

  | Repo | State at plan start | Tasks |
  |---|---|---|
  | `feedBack` (core) | branch exists, `e4d965e` | 1 |
  | `feedBack-plugin-drums` | branch exists, `547aac9` | 2, 3 |
  | `feedBack-plugin-notedetect` | branch exists, `78ccfd0` | 4 |
  | `feedBack-plugin-scorecard` | on `main` `8452c5b`, clean: run `git switch -c feature/build-a-band-stage main` | 5 |
  | `feedBack-plugin-build-a-band` | branch exists, `71cd2bd` | 6–13 |
  | `feedBack-plugin-lyrics-karaoke`, `feedBack-plugin-splitscreen` | read-only | — |

- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  - The message ends with the Co-Authored-By line, then git's Signed-off-by.
  - One commit per task.
- **Line endings:** every file this plan touches is LF. Check with `file` before editing anyway.
- **Test commands:**
  - build-a-band: `npm test`
  - core: `npm run test:js`
  - drums: `node tests/<file>.test.js`, one file at a time
  - note_detect: `npm test`
  - scorecard: `npm test`
- **NO SOUND:**
  - Nothing in this plan adds audio. The band count-in only draws: the clicks stay core's existing `playClick` calls.
  - No task launches the app. Task 14 is the controller's silent check and never triggers a real count-in.
- **No push**, no PRs and no new GitHub repos.
- **Plugin identity:** id `build_a_band`, screen id `plugin-build_a_band`, prefs key `build_a_band.prefs.v1` (new field `zoom`).
- **Values (rulings):**
  - Layout: `HUD_HEIGHT_PX = 48`, `STRIP_HEIGHT_PX = 90`.
  - Band rules: `BAND_BONUS_STEP = 0.075`, band multiplier cap 4.
  - Crowd meter: start `0.66`, hit `+0.02`, miss `−0.05`, overhit `−0.03`, passed phrase `+0.08`, failed phrase `−0.10`. Zones: red below `0.25`, yellow below `0.55`.
  - Zoom: 0.7–1.3, step 0.1.
  - Colours: guitar `#f5c542`, drums `#e0533d`, vocals `#a678ff`, overdrive `#5cc8ff`.
  - Toasts: 4000 ms, at most 3.
- **Event names:**
  - drums bus: `drums:hit`, `drums:miss`, `drums:overhit`, `drums:sp-phrase`, `drums:sp-phrase-fail`, `drums:sp-ready`, `drums:sp-activate`, `drums:sp-end`
  - core bus: `count-in:tick {n, total}`, `count-in:hide {completed}`
- **Licences:**
  - `src/yarg-rules.js` and `tests/yarg-rules.test.mjs` are LGPL-3.0 with YARG credit. The rest of the plugin stays MIT.
  - Lucide icons are ISC. Fonts load from Google Fonts (OFL).
  - Copy no YARG art.
- **Karaoke rating strings and star scale:** never compared with a list or assumed to be integers 0–5 (R3, R5).
- **Styles:** plugin styles go in `assets/build-a-band.css` with `bab-` classes; no Tailwind classes.

## Review Focus

1. **Rewinding mid-song** (arrow-key rewind, restart, a seek back) must not double the band score, bonus or stars. Loop wraps stay cumulative. (Task 7 rewind tests; Task 12 `song:seek` test.)
2. **Every way a band session ends** must give each plugin its own score display back and clear the count-in override: Next song, Play again, Esc, a new song, a failed mount, or splitscreen ending it. (Task 12 teardown test across exit paths.)
3. **Judgments that aren't the band's** must not score: splitscreen panel detectors (`isDefault: false`), uncounted re-deliveries, another drum canvas, events while the results show. (Task 8 adapter tests; Task 12 phase test.)
4. **A splitscreen remount mid-song** keeps the score and re-hosts every lane HUD in the new slots. (Task 12 remount test.)
5. **A part with nothing to judge** (no guitar notes at the mastery, nobody sang, a song ended at once) gives no `NaN`. It shows "—" for accuracy and drops out of the band star average. (Task 6 `bandStars` test; Task 13 empty-results test.)

---

### Task 1: Core count-in announces its ticks and can be forced on

**Repo:** `feedBack`

**Files:**
- Modify: `static/js/count-in.js` (`showCountOverlay` 177-184, `hideCountOverlay` 186-188, the loop tick ~405/~437, the song tick ~474/~485)
- Modify: `static/js/player-controls.js` (`_wantSongCountIn` 72-81)
- Modify: `static/app.js` (next to the `autoplayExit` property, 1045)
- Test: create `tests/js/count_in_events.test.js`; modify `tests/js/count_in_auto.test.js`

**Interfaces:**
- Produces:
  - `showCountOverlay(n: number, total?: number): void`:
    - sets the overlay's `id = 'count-in-overlay'`
    - emits `window.feedBack.emit('count-in:tick', { n, total })` inside try/catch, with `total` the call site's `clicks`
  - `hideCountOverlay(completed = false): void`: when an overlay existed, removes it and emits `count-in:hide { completed }`.
    - Both completion branches call `hideCountOverlay(true)`.
    - `_cancelCountIn` keeps `hideCountOverlay()`.
  - `setSongCountInOverride(v: boolean | null): boolean` in `player-controls.js`.
    - Any other value returns `false` and changes nothing.
    - `_wantSongCountIn()` returns the override first when it is a boolean.
  - `window.feedBack.setSongCountInOverride` = that function (app.js).

- [ ] **Step 1: Write the failing tests.**
  - `count_in_events.test.js` uses the `count_in_sweep.test.js` stubs. Give the fake element a writable `id`, and record `body.appendChild` arguments.
    - `showCountOverlay emits count-in:tick with n and total and ids the overlay`: `showCountOverlay(2, 4)` gives one `count-in:tick` with detail `{n:2, total:4}`, and the appended element's `id === 'count-in-overlay'`.
    - `hideCountOverlay(true) emits completed; a second hide emits nothing`: after a show, `hideCountOverlay(true)` gives `count-in:hide {completed:true}`; calling it again adds no event.
    - `cancelling a count-in reports it as not completed`: show, then `_cancelCountIn()`, gives `count-in:hide {completed:false}`.
  - `count_in_auto.test.js`, appended (reset the override to `null` in `beforeEach`):
    - `override true counts in even with the setting off`: `countdownBeforeSong` `'0'` and `setSongCountInOverride(true)` give `_wantSongCountIn() === true`.
    - `override false never counts in`: `countdownBeforeSong` `'1'`, first note at 0.5, override `false`, gives `false`.
    - `null clears the override; junk is refused`: `setSongCountInOverride('yes') === false`. After `setSongCountInOverride(null)`, the plain setting rules apply again.
- [ ] **Step 2: Run** `npm run test:js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS (all existing count-in tests included).
- [ ] **Step 5: Commit** `feat(count-in): announce ticks on the bus; song count-in override for band mode`.

### Task 2: Drums publishes judgments and star power on core's bus

**Repo:** `feedBack-plugin-drums`

**Files:**
- Modify:
  - `assets/session.js` (`createSession` 675, `build` 794-840, the `api` object)
  - `screen.js` (`_startScoring` 2672-2692, test-seam exports 5340-5365)
  - `README.md` (new "Events for other plugins" section)
- Test: `tests/session.test.js`, `tests/screen.test.js`

**Interfaces:**
- Produces:
  - **`session.setOnEvent(fn | null)`.** After each engine event the session already records (session.js:813-837), it calls `fn(detail)` inside try/catch, where `detail` is:
    - every recorded field except `wall`
    - plus `{ multiplier, score, stars, combo, spActive, spAmount }` from `eng.getState()` taken after the event (`spActive = state.starPower.active`, `spAmount = state.starPower.amount`)
    - hits also carry `noteTime` and the `points` the session already computes
    - misses carry `noteTime` from the engine payload
  - **`_bandEventDetail(detail, canvas)`** (pure, exported for tests): returns `{ ...detail, canvas }`.
  - **`_startScoring`** calls `_session.setOnEvent((d) => bus.emit('drums:' + d.type, _bandEventDetail(d, _highwayCanvas)))` (guarded, using `_bus()`), for the types `hit`, `miss`, `overhit`, `sp-phrase`, `sp-phrase-fail`, `sp-ready`, `sp-activate`, `sp-end` (R14). `combo-break` is not re-emitted.

- [ ] **Step 1: Write the failing tests:**
  - `session.test.js`:
    - `setOnEvent hands every judgment to the listener with the engine state after it`: build a session as the test at 246 does. Hit one note and let one pass.
      - The listener gets a `hit` with `points > 0`, `combo === 1`, `multiplier === 1`, finite `stars`, `spActive === false`, and no `wall`.
      - Then a `miss` with `combo === 0`.
    - `a throwing listener never breaks scoring`: the listener throws and `getState().notesHit` still increments.
  - `screen.test.js`:
    - `_bandEventDetail adds the canvas and keeps the payload`: `_bandEventDetail({type:'hit', points:60}, c)` deep-equals `{type:'hit', points:60, canvas:c}`.
- [ ] **Step 2: Run** `node tests/session.test.js` and `node tests/screen.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, then the README section: the event names, the detail fields and "filter by `canvas`".
- [ ] **Step 4: Run** both files, then `node tests/engine.test.js` and `node tests/highway3d.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: public drums:hit/miss/overhit and star power events on the core bus`.

### Task 3: Drums hides its score display per canvas

**Repo:** `feedBack-plugin-drums`

**Files:**
- Modify:
  - `screen.js`: next to `_bandDifficulty` (2047); the 2D HUD branch (3913-3917); `_view3d.render` (2661); `_onSongEnded` (4454); `window.feedBackDrums` (4752-4782); test-seam exports
  - `assets/highway3d.js` (`drawHud` 941)
  - `README.md`
- Test: `tests/screen.test.js`, `tests/highway3d.test.js`

**Interfaces:**
- Produces:
  - **State and pure helpers:**
    - `const _bandScoreHidden = new WeakMap()`; `_scoreHudHiddenFor(canvas): boolean`
    - `_shouldDrawScoreHud({ hitDetection, hidden }): boolean` = `hitDetection && !hidden`
    - `_shouldShowEndCard({ hasSession, ssActive, hidden }): boolean` = `hasSession && !ssActive && !hidden`
  - **`feedBackDrums.setScoreHudHidden(canvas, hidden): boolean`:**
    - returns `false` and changes nothing unless `canvas` is an object and `hidden` a boolean
    - `true` sets the WeakMap entry, `false` deletes it
  - **`feedBackDrums.isScoreHudHidden(canvas): boolean`.**
  - **The instance:**
    - the 2D HUD block runs only when `_shouldDrawScoreHud({ hitDetection: _cfg.hitDetection, hidden: _scoreHudHiddenFor(_highwayCanvas) })`
    - `_view3d.render` receives `hideScore: _scoreHudHiddenFor(_highwayCanvas)`
    - `_onSongEnded` shows the card only when `_shouldShowEndCard(...)` holds
    - the difficulty badge is unchanged
  - **`highway3d.js` `drawHud`:** after clearing the HUD canvas, `if (frame.hideScore) return;`.

- [ ] **Step 1: Write the failing tests:**
  - `screen.test.js`:
    - `band API: setScoreHudHidden remembers per canvas and refuses junk`:
      - `setScoreHudHidden(c, true) === true` and `isScoreHudHidden(c) === true`
      - `isScoreHudHidden(other) === false`
      - `setScoreHudHidden(c, 'yes') === false`, `setScoreHudHidden(null, true) === false`
      - `setScoreHudHidden(c, false) === true`, then `false`
    - `_shouldDrawScoreHud and _shouldShowEndCard follow the hide switch`: the truth table for `hidden` true/false, with `hitDetection`/`hasSession` true and `ssActive` false.
  - `highway3d.test.js`:
    - `drawHud stops after clearing when frame.hideScore`: a source check that the `drawHud` function body contains `if (frame.hideScore) return;` after `clearRect`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement**, then document both methods in README's band API list.
- [ ] **Step 4: Run** `node tests/screen.test.js`, `node tests/highway3d.test.js` and `node tests/session.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: feedBackDrums.setScoreHudHidden(canvas, hidden) for band mode`.

### Task 4: note_detect hides its score HUD and end summary

**Repo:** `feedBack-plugin-notedetect`

**Files:**
- Modify:
  - `screen.js`: a factory-scoped `let scoreHudHidden = false`; `setDevice` (12223-12228); `_endOfSongOnEnded` (15005); `api` (18441-18447)
  - `assets/plugin.css`
  - `README.md` (Settings / API list)
  - `CHANGELOG.md` (Unreleased)
- Test: create `test/score_hud_hidden.test.js`; modify `test/set_device.test.js`

**Interfaces:**
- Produces, on every instance's API:
  - **`setScoreHudHidden(hidden: boolean): boolean`.**
    - A non-boolean returns `false`.
    - Otherwise it sets `scoreHudHidden` and sets or removes `instanceRoot`'s `data-nd-score-hidden="1"` attribute.
    - It never persists.
  - **`isScoreHudHidden(): boolean`.**
  - **CSS:** `[data-nd-score-hidden="1"] .nd-hud, [data-nd-score-hidden="1"] .nd-flash-overlay { display: none !important; }`.
  - **`_endOfSongOnEnded`:** the gig branch condition becomes `if (_inGigSet() || scoreHudHidden)`. While hidden, the take is credited with no overlay and no auto-exit hold.
  - **`setDevice` (R21):** when `isDefault`, it also sets the value of `document.querySelector('.nd-settings-panel .nd-device-select')` to `deviceId` if that select exists.

- [ ] **Step 1: Write the failing tests.**
  - `score_hud_hidden.test.js` (`loadDetectionCore`):
    - `setScoreHudHidden toggles and refuses non-booleans`:
      - `det.isScoreHudHidden() === false`
      - `det.setScoreHudHidden(true) === true` and then `isScoreHudHidden() === true`
      - `setScoreHudHidden('on') === false` and the value stays `true`
    - `the end-of-song summary takes the gig path while the score HUD is hidden`: extract the `function _endOfSongOnEnded` block as `gig_summary_suppressed.test.js` does, and assert it contains `_inGigSet() || scoreHudHidden`.
    - `plugin.css hides the HUD and the flash overlay`: the file contains `[data-nd-score-hidden="1"] .nd-hud` and `[data-nd-score-hidden="1"] .nd-flash-overlay`.
  - `set_device.test.js`:
    - `setDevice updates an open gear select`: in `sandboxBeforeRun`, make `sb.document.querySelector` return `{ value: '' }` for `'.nd-settings-panel .nd-device-select'`. `det.setDevice('dev-9')` leaves that object's `value === 'dev-9'`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, plus the README and CHANGELOG lines.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: setScoreHudHidden() — hide the score HUD and end summary for band mode`.

### Task 5: Scorecard hides its HUD and end card on request

**Repo:** `feedBack-plugin-scorecard` (create the branch first, Global Constraints)

**Files:**
- Create: `src/visibility.js`
- Modify:
  - `src/main.js`: `updateVisibility` 323-329; `end.show` 311; the `song:ended` hold 445-456; `window.feedBackScorecard` 468-473
  - `README.md`, `CHANGELOG.md`
- Test: create `tests/visibility.test.mjs`

**Interfaces:**
- Produces:
  - **`wantsHud({ onPlayer, mode, isDrums, hasRun, frozen, ndEnabled, hudHidden }): boolean`.** It is today's `want` expression (main.js:324-325) `&& !hudHidden`.
  - **`claimsResults({ judged, minJudged, mode, hudHidden }): boolean`** = `judged >= minJudged && mode !== 'off' && !hudHidden`.
  - **`main.js`:**
    - `st.hudHidden = false`; `updateVisibility` uses `wantsHud`
    - the `song:ended` hold uses `claimsResults`
    - `end.show(...)` runs only when `!st.hudHidden`
    - runs are still finalized and posted
  - **`window.feedBackScorecard`** adds:
    - `setHudHidden(hidden): boolean`: a non-boolean returns `false`; otherwise it sets `st.hudHidden`, calls `updateVisibility()` and returns `true`
    - `isHudHidden(): boolean`

- [ ] **Step 1: Write the failing tests** in `tests/visibility.test.mjs`:
  - `wantsHud matches the old rule and hudHidden wins`:
    - `{onPlayer:true, mode:'full', isDrums:false, hasRun:true, frozen:false, ndEnabled:true, hudHidden:false}` gives `true`
    - the same with `hudHidden:true` gives `false`
    - `mode:'off'` gives `false`, and `isDrums:true` gives `false`
  - `claimsResults needs enough judgments, a mode and no hide`:
    - `(10, 5, 'full', false)` gives `true`
    - `(4, 5, …)` gives `false`, and `hudHidden:true` gives `false`
  - `main.js publishes setHudHidden and guards the end card`: the source contains `setHudHidden`, `claimsResults(` and `!st.hudHidden`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, plus the README line ("Other plugins: `setHudHidden(true)` hides the HUD and results card; runs are still saved") and the CHANGELOG.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: feedBackScorecard.setHudHidden() for band mode`.

### Task 6: YARG star rules and band stars (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create:
  - `src/yarg-rules.js`, with an LGPL-3.0 header crediting YARG.Core/YARG and naming the source files (R20)
  - `src/stars.js`
  - `NOTICE.md`
- Copy: `LICENSE.LGPL-3.0` and `LICENSE.GPL-3.0` from `../feedBack-plugin-drums/`
- Modify: `README.md` (a "Licences" line pointing at NOTICE.md)
- Test: create `tests/yarg-rules.test.mjs` (LGPL header) and `tests/stars.test.mjs`

**Interfaces:**
- Produces:
  - **`yarg-rules.js`:**
    - `GUITAR_STAR_MULTIPLIERS = [0.06, 0.12, 0.2, 0.47, 0.78, 1.15]`
    - `starScoreThresholds(baseScore: number, multipliers: number[]): number[]` = `Math.floor(baseScore * m)` each
    - `starsFromScore(score: number, thresholds: number[]): number`: YARG `UpdateStars`. Whole stars count while `score > th[i]`. Below the last threshold it adds `(score − prev) / (next − prev)`, clamped to 0–1, with 0 when `next === prev`.
  - **`stars.js`:**
    - `ND_BASE_SINGLE = 50`, `ND_BASE_CHORD = 100`
    - `ndMultiplierForStreak(streak)`: ×2 at 10, ×3 at 25, ×4 at 50
    - `guitarBaseScore(notes: Array<{t}>, chords: Array<{t}>): number`: merge both lists by `t`; the i-th item (1-based streak i) scores its base × `ndMultiplierForStreak(i)`; non-arrays count as empty
    - `guitarStarThresholds(notes, chords): number[] | null`: `null` when the base is 0
    - `clampStars(v): number | null`: `null` for non-finite, else clamped to 0–6
    - `bandStars(values: Array<number | null>): number | null`: mean of the finite values, `null` when there are none
    - `starDisplay(stars: number | null): { full: number, partial: number, gold: boolean }`:
      - `null` gives `{full:0, partial:0, gold:false}`
      - `stars >= 6` gives `{full:5, partial:0, gold:true}`
      - otherwise `full = min(5, floor(s))` and `partial = full < 5 ? s − full : 0`
- `NOTICE.md` content:
  - MIT for the plugin except the two LGPL files (with the combined-work note, as drums NOTICE.md)
  - Lucide ISC notice (copyright Lucide Contributors; Feather portions copyright Cole Bemis, MIT)
  - Fonts from Google Fonts under the OFL, not bundled

- [ ] **Step 1: Write the failing tests:**
  - `yarg-rules.test.mjs`:
    - `guitar thresholds are YARG's`: deep-equal the array.
    - `starScoreThresholds floors base × multiplier`: `starScoreThresholds(1000, GUITAR_STAR_MULTIPLIERS)` deep-equals `[60, 120, 200, 470, 780, 1150]`.
    - `starsFromScore: whole stars on strictly greater, then the fraction`. With those thresholds:
      - `0` gives `0`, `30` gives `0.5`, `60` gives `1`, `61` gives about `1.0167`
      - `780` gives `5`, `1150` gives `6`, `5000` gives `6`
  - `stars.test.mjs`:
    - `guitarBaseScore follows note_detect's multiplier ladder`:
      - 9 singles give `450`
      - 10 singles give `450 + 100 = 550`
      - one chord at `t:0` plus a single at `t:1` gives `150`
      - `guitarBaseScore(null, undefined) === 0`
    - `guitarStarThresholds is null with no notes`.
    - `bandStars averages what exists`: `bandStars([2, null, 4]) === 3`, `bandStars([null]) === null`, `bandStars([]) === null`.
    - `clampStars`: `7` gives `6`, `-1` gives `0`, `NaN` gives `null`, `3.4` gives `3.4`.
    - `starDisplay`: `3.25` gives `{full:3, partial:0.25, gold:false}`, `5.5` gives `{full:5, partial:0, gold:false}`, `6` gives `gold:true`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `NOTICE.md`, the licence copies and the README line.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: YARG star thresholds (LGPL, credited) and band star maths`.

### Task 7: The band score ledger (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/band-score.js`
- Test: create `tests/band-score.test.mjs`

**Interfaces:**
- Consumes: `starsFromScore` (Task 6), `clampStars` (Task 6).
- Produces:
  - **Exports:**
    - `BAND_BONUS_STEP = 0.075`, `MAX_BAND_MULTIPLIER = 4`
    - `CROWD = { start: 0.66, hit: 0.02, miss: -0.05, overhit: -0.03, phrasePass: 0.08, phraseFail: -0.10 }`
  - **`Entry`:**

    ```
    { part: 'guitar'|'drums'|'vocals', t: number, kind: 'hit'|'miss'|'overhit'|'phrase',
      points: number, multiplier: number, streak: number,
      stars?: number|null, accuracy?: number, rating?: string|null, passed?: boolean, factor?: number }
    ```

  - **`createBandScore({ parts: string[] })`** returns:
    - `record(entry: Entry): void`: appends the entry and applies it.
    - `rewindTo(t: number): void`: drops entries with `entry.t > t`, then replays the rest from fresh part state.
    - `syncTotals(part, totals | null): void`: sets the part's live `multiplier`, `streak` and `stars` (vocals `karaoke:reset`). `null` gives 1, 0 and `null`. It doesn't touch score.
    - `setStarThresholds(part, thresholds: number[] | null): void`: that part's stars become `starsFromScore(part.score, thresholds)`.
    - `snapshot(): BandSnapshot`.
  - **Applying an entry** (`factor` defaults to 1):
    - `scored = Math.round(points × factor)`
    - The part's `score += scored`, and `multiplier`/`streak` come from the entry.
    - `bestStreak = max`.
    - `hit` and passed `phrase` count `hits`; `miss` and failed `phrase` count `misses`; `overhit` counts `overhits`.
    - Phrases add their `accuracy` to the part's phrase list; `rating` (a string) is tallied as given.
    - Stars come from the entry's `stars` when it is a number (`clampStars`).
    - Crowd moves by `CROWD`, clamped to 0–1.
    - Then `N = min(MAX_BAND_MULTIPLIER, max(1, min over parts of multiplier))`.
    - When `scored > 0`, `bonus = Math.round(scored × BAND_BONUS_STEP × (N − 1))` is added to the band bonus and to the part's `bonus`.
  - **`BandSnapshot`:**

    ```
    { score, bonus, bandMultiplier, stars: number|null,
      parts: { [id]: { score, bonus, multiplier, streak, bestStreak, hits, misses, overhits,
                       crowd, stars: number|null, accuracy: number|null,
                       phrases: Array<{ rating, count, meanAccuracy }> } } }
    ```

    - The band `score` is the sum of the part scores plus `bonus`.
    - Band `stars` is `bandStars` of the part stars.
    - Accuracy:
      - vocals: the mean phrase accuracy
      - others: `hits / (hits + misses)`
      - `null` with nothing judged
    - `phrases` is sorted by `meanAccuracy`, highest first.

- [ ] **Step 1: Write the failing tests** (`const e = (o) => ({ t: 0, points: 0, multiplier: 1, streak: 0, ...o })`):
  - `starts empty`: three parts give score 0, `bandMultiplier` 1, every crowd `0.66`, stars `null` and accuracy `null`.
  - `part scores add up and the band multiplier is the lowest part's`:
    - guitar hit 100 at ×2 and drums hit 60 at ×1 give `bandMultiplier 1` and band score 160
    - a drums hit at ×2 then gives `bandMultiplier 2`
  - `bonus is 7.5 % per step above ×1`: with guitar and drums both at ×3, a guitar hit of 200 at ×3 adds `Math.round(200 × 0.075 × 2) === 30` to `bonus` and to `parts.guitar.bonus`.
  - `a miss earns no bonus and drops the band to ×1`.
  - `crowd moves by the R6 steps and clamps`:
    - 20 guitar hits give `1` (clamped)
    - one miss gives `0.95`
    - 30 drums misses give `0`
    - a drums overhit from `0.66` gives `0.63`
  - `vocals phrases: pass/fail crowd, ratings tallied as given, accuracy is the mean`:
    - phrases `{passed:true, rating:'Awesome', accuracy:0.9}`, `{passed:true, rating:'Grade A', accuracy:0.8}` and `{passed:false, rating:'Awesome', accuracy:0.5}` give accuracy about `0.733`
    - `phrases` is `[{rating:'Grade A', count:1, meanAccuracy:0.8}, {rating:'Awesome', count:2, meanAccuracy:0.7}]`
  - `stars: drums and vocals from the entries, guitar from thresholds`:
    - a drums entry with `stars: 2.5` gives `parts.drums.stars === 2.5`
    - a vocals `stars: 9` gives `6`
    - `setStarThresholds('guitar', [60,120,200,470,780,1150])` after a guitar score of 30 gives `0.5`
    - band stars is the mean
  - `factor scales points (plan 5 hook)`: a guitar hit of 100 with `factor: 2` scores 200; `factor: 0` scores 0 and earns no bonus.
  - `rewindTo drops later entries and replays everything`:
    - hits at t=1, 2, 3, then `rewindTo(1.5)`, give the part score of the first entry only, with `bestStreak`, crowd and bonus as after entry 1
    - recording again continues from there
  - `syncTotals resets the vocals multiplier without touching score`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the entry list and a single `apply(entry, state)` used by both `record` and the replay.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band score ledger — part scores, band multiplier and bonus, crowd meters, rewind`.

### Task 8: Engine events to ledger entries (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/part-events.js`
- Test: create `tests/part-events.test.mjs`

**Interfaces:**
- Produces (each returns an `Entry` from Task 7, or `null` for an event that isn't the band's):
  - **`guitarEntry(detail, t): Entry | null`.**
    - `null` unless `detail && detail.isDefault === true && detail.counted === true`.
    - `kind: detail.hit ? 'hit' : 'miss'`.
    - `points`: finite, else 0. `multiplier`: finite, else 1. `streak`: finite, else 0.
  - **`drumsEntry(type, detail, t, bandCanvas): Entry | null`.**
    - `null` unless `bandCanvas && detail && detail.canvas === bandCanvas && ['hit','miss','overhit'].includes(type)`.
    - `points` only for hits.
    - `multiplier = (finite(detail.multiplier) || 1) / (detail.spActive ? 2 : 1)`.
    - `streak = detail.combo | 0`.
    - `stars = finite(detail.stars) ? detail.stars : null`.
  - **`vocalsEntry(detail, t): Entry | null`.**
    - `null` without an object detail.
    - `kind 'phrase'`.
    - `points`, `multiplier`, `streak` from the detail (totals).
    - `stars` finite or `null`.
    - `accuracy`: finite, else 0.
    - `rating`: a string or `null`.
    - `passed = detail.streak > 0` (R3).
  - **`vocalsTotals(detail): { multiplier, streak, stars } | null`**, for `karaoke:reset`.

- [ ] **Step 1: Write the failing tests:**
  - `guitar: only the default detector's counted judgments score`:
    - `{isDefault:true, counted:true, hit:true, points:100, multiplier:2, streak:12}` maps to `{part:'guitar', t:5, kind:'hit', points:100, multiplier:2, streak:12}`
    - `isDefault:false` gives `null`, `counted:false` gives `null`, `null` gives `null`
  - `guitar: a miss scores nothing`: `hit:false` gives `kind:'miss'` and `points:0`.
  - `drums: only the band's canvas, only judgments`:
    - another canvas gives `null`
    - `'sp-ready'` gives `null`
    - an overhit gives `kind 'overhit'` and `points 0`
  - `drums: star power doesn't lift the band multiplier`: `{multiplier:8, spActive:true}` gives `multiplier 4`.
  - `vocals: totals are authoritative; pass is a running streak`:
    - `{rating:'Strong', accuracy:0.8, points:1600, multiplier:3, streak:2, stars:2.4}` gives `passed:true`, `stars:2.4`, `rating:'Strong'`
    - `streak:0` gives `passed:false`
    - `rating: 7` gives `rating:null`
  - `vocalsTotals reads a reset`: `vocalsTotals(null) === null` and `vocalsTotals({multiplier:1, streak:0, stars:0})` deep-equals `{multiplier:1, streak:0, stars:0}`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: map note_detect, drums and karaoke events to band score entries`.

### Task 9: Stage under the band HUD, drums alone on stage, per-lane zoom

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/icons.js` (all of Task 10's `icons.js` interface, used here for the zoom buttons)
- Modify:
  - `src/layout.js` (22-34)
  - `src/stage.js` (`planStage` 31-44; `mountStage` 56-378)
  - `src/prefs.js` (`DEFAULTS` 9, `normalizePrefs` 69-85; add zoom)
  - `assets/build-a-band.css` (stage rules 173-275)
- Test: `tests/layout.test.mjs`, `tests/stage.test.mjs`, `tests/stage-mount.test.mjs`, `tests/prefs.test.mjs`, create `tests/icons.test.mjs`

**Interfaces:**
- Produces:
  - **`layout.js`:**
    - `HUD_HEIGHT_PX = 48` replaces `HUD_RESERVE_PX` (update every import)
    - `computeStageRows`:
      - no strip: `{ strip: null, lanesTopPx: 48 }`
      - strip and lanes: `{ strip: { topPx: 48, heightPx: 90, fill: false }, lanesTopPx: 138 }`
      - strip alone: `{ strip: { topPx: 48, heightPx: null, fill: true }, lanesTopPx: null }`
  - **`prefs.js`:**
    - `ZOOM_MIN = 0.7`, `ZOOM_MAX = 1.3`, `ZOOM_STEP = 0.1`
    - `clampZoom(v)`: non-finite gives 1; clamps; rounds to 2 decimals
    - prefs gain `zoom: { guitar: 1, drums: 1 }`, each normalised with `clampZoom`; `savePrefs` merges `zoom` per key like `parts`
  - **`planStage`:**
    - guitar off with a drum chart, with or without the strip, gives `mainPart: 'drums'` and `lanes: ['drums']` (R10)
    - no playable lane gives `mainPart: null` and `lanes: []`
  - **`mountStage`:**
    - **Lanes top:** `--bab-lanes-top` is set whenever `rows.lanesTopPx !== null`.
    - **Zoom box per lane:** an invisible `div.bab-zoom-box` (width and height `(100 / z)%`).
      - The main highway uses `setContainer(box)` and `player.style.setProperty('--bab-main-zoom', String(z))`.
      - The drum lane's highway uses `hw.init(drumCanvas, box)`, and `drumCanvas.style.transform = 'scale(z)'`, `transformOrigin = '0 0'`, `position = 'absolute'`. A replaced canvas gets the same in `adoptCanvas`.
    - **Chrome, one `.bab-lane-chrome` per lane:**
      - Guitar: "Fret numbers" `−`/`+` (titles 'Smaller fret numbers' / 'Bigger fret numbers', unchanged), then "Zoom" with Lucide `zoom-out` / `zoom-in` buttons, titled 'Zoom out' / 'Zoom in'.
      - Drums: Zoom only.
      - Zoom steps by `ZOOM_STEP`. It updates the box, the transform and the resize, then calls `persist({ zoom: { ...zoom, [part]: next } })`.
      - Hover reveal works for every lane: generalise `onPointerMove` over the lanes' rects.
    - **Return** adds `laneSlot(part): HTMLElement | null` and `getDrumCanvas(): HTMLCanvasElement | null` (the live drum-lane canvas, or `null` without a second highway). `unmount` also removes `--bab-main-zoom`.
  - **CSS:**
    - `#player.bab-stage #highway { transform: scale(var(--bab-main-zoom, 1)); transform-origin: 0 0; }`
    - `#player .bab-zoom-box { position:absolute; left:0; top:0; visibility:hidden; pointer-events:none; }`
    - `.bab-lane-chrome` moves to `bottom: 0.75rem; right: 0.75rem` (top removed)
    - `#player.bab-stage #player-hud { display: none; }` (R9)
  - Icons: this task creates `src/icons.js` exactly as Task 10's Interfaces block describes, with all 11 icons, and adds `tests/icons.test.mjs`: `icon('star')` contains `viewBox="0 0 24 24"` and `stroke="currentColor"`; `icon('nope') === ''`; `ICON_NAMES.length === 11`.

- [ ] **Step 1: Write the failing tests:**
  - `layout.test.mjs`: update `stage rows` to the three results above.
  - `prefs.test.mjs`:
    - `zoom defaults to 1 per lane and is clamped`:
      - `loadPrefs(empty).zoom` deep-equals `{guitar:1, drums:1}`
      - `savePrefs({zoom:{drums:2}})` gives `drums 1.3` and `guitar 1`
      - `clampZoom(NaN) === 1`, `clampZoom(0.74) === 0.74`
  - `stage.test.mjs`: replace `planStage drums only without vocals is unchanged` with `planStage drums alone gets the drums lane on the main highway`: `{strip:false, mainPart:'drums', lanes:['drums']}`.
  - `stage-mount.test.mjs`:
    - `lanes start under the band HUD without vocals`: `--bab-lanes-top` is `'48px'`.
    - Update the vocals test to `48px`/`138px`.
    - `zoom box: the main highway sizes to it and the player carries the zoom`:
      - with prefs `zoom.guitar = 1.25`, the log has `main.setContainer(box)` where `box.className === 'bab-zoom-box'` and `box.style.width === '80%'`
      - `--bab-main-zoom` is `'1.25'`
    - `zoom buttons step, clamp at 1.3 and persist`: clicking guitar "Zoom in" three times from 1.1 persists `{zoom:{guitar:1.2, drums:1}}` then `{zoom:{guitar:1.3, drums:1}}`, and the third click persists nothing.
    - `the drum lane draws into its zoom box at its zoom`: `hw.init` received the drums lane's `.bab-zoom-box`, and `drumCanvas.style.transform === 'scale(0.9)'` with `zoom.drums = 0.9`.
    - `laneSlot and getDrumCanvas`: `laneSlot('drums')` is the drums slot; `getDrumCanvas()` is the lane canvas; after unmount `--bab-main-zoom` is empty.
    - Update the existing drums-alone-with-vocals test, which now also applies for drums alone without vocals.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** layout, prefs, then stage and CSS.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, with plan 1–3 stage tests updated only where listed.
- [ ] **Step 5: Commit** `feat: stage under the band HUD, drums alone on stage, per-lane zoom`.

### Task 10: The band HUD

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/hud-model.js`, `src/hud.js` (`src/icons.js` comes from Task 9)
- Modify:
  - `assets/build-a-band.css`: line 1 `@import` becomes `family=Unbounded:wght@500;700;800&family=Barlow:wght@500;600;700&display=swap`; add HUD rules
  - `src/band-screen.js`: fill each column's `.bab-ico` with `icon(part.icon)` at render
  - `screen.html`: empty the three `.bab-ico` spans
- Test: create `tests/hud-model.test.mjs`, `tests/hud.test.mjs`; modify `tests/band-screen.test.mjs`

**Interfaces:**
- Produces (`icons.js` is created in Task 9; its interface is listed here):
  - **`icons.js`:**
    - `ICON_NAMES`: the 11 names in plan-4-inputs.md "Lucide icon data"
    - `icon(name, { size = 18, cls = '' } = {}): string`: an `<svg class="bab-icon <cls>" width height viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">…</svg>` string with the verbatim element data; `''` for an unknown name
  - **`hud-model.js`:**
    - `formatScore(n)` (`en-US` grouping, `Math.round`, non-finite gives `'0'`)
    - `difficultyLabel(id)` (`'easy'` gives `'Easy'` …; unknown gives `''`)
    - `crowdZone(c)` (`'red' | 'yellow' | 'green'`, R6)
    - `glowLevel(streak)` (R8)
    - `streakCallout(part, prev, next): string | null` (R7)
    - `bandMultiplierText(n)` gives `'BAND ×' + n`
  - **`hud.js`:**

    ```
    createBandHud({ doc, player, stage, parts: string[], prefs, song: { title, artist }, oneLevel: boolean })
      -> { update(snapshot: BandSnapshot): void, callout(part, text): void,
           setOverdrive(part, fraction, active): void, destroy(): void }
    ```

    - **The bar:** a `.bab-hud` in `player` with `.bab-hud-score`, `.bab-hud-stars` (five `.bab-star`, each a `star` icon with a `.bab-star-fill` whose `style.width` is its share), `.bab-hud-song` (`title · artist`), `.bab-hud-mult` (`bandMultiplierText`, class `bab-hot` when N ≥ 2) and `.bab-hud-bonus` (`'+' + formatScore(bonus) + ' bonus'`, empty at 0). `bab-gold` on the stars when `starDisplay(...).gold`.
    - **Each part:** a `.bab-part-hud[data-part]`, in `stage.laneSlot(part)` (guitar, drums) or `stage.stripSlot` (vocals), with `--bab-c` set to the part colour. It holds:
      - `.bab-lanehud` with:
        - `.bab-tag`: the icon, then the label (guitar: `'Lead · Hard'`-style from prefs, or `'Lead · One level'` when `oneLevel`; drums `'Drums · Hard'`; vocals `'Vocals · Hard'`)
        - `.bab-od > i` (width `0%`, R22)
        - `.bab-mult` (`'×' + multiplier`)
      - `.bab-crowd > i` (`style.bottom = Math.round(crowd × 100) + '%'`, plus a `bab-crowd-<zone>` class)
      - `.bab-glow` (`--bab-glow`; `bab-glow-miss` re-added when a streak drops to 0)
      - `.bab-callout` (`callout()` sets the text and restarts the `bab-show` class)
    - `update()` fires `streakCallout` per part against the previous snapshot.
    - Parts without a host element are skipped.
    - `destroy()` removes everything it added.
  - **CSS:** the draft's look in `bab-` classes. Unbounded for numbers and callouts, Barlow for tags. `.bab-hud` is 48 px, `z-index: 25`. Lane HUD elements are `pointer-events: none`. Callout keyframes as the draft's `pop`.

- [ ] **Step 1: Write the failing tests:**
  - `hud-model.test.mjs`:
    - `formatScore(412880) === '412,880'`, `formatScore(NaN) === '0'`
    - `crowdZone(0.2) === 'red'`, `crowdZone(0.25) === 'yellow'`, `crowdZone(0.55) === 'green'`
    - `glowLevel(0) === 0.15`, `glowLevel(50) === 1`, `glowLevel(25) === 0.575`
    - `streakCallout('guitar', 49, 50) === '50 NOTE STREAK!'`, `streakCallout('drums', 50, 51) === null`, `streakCallout('vocals', 4, 5) === '5 PHRASE STREAK!'`, `streakCallout('guitar', 60, 50) === null`
  - `hud.test.mjs` (fake DOM, a fake stage `{ laneSlot: (p) => slots[p] || null, stripSlot }`):
    - `builds the bar and one HUD per playing part`: guitar and drums give two `.bab-part-hud` and one `.bab-hud`; `.bab-hud-song` text is `'Holiday · Green Day'`.
    - `update shows score, band multiplier, bonus, crowd and multiplier`, from a hand-built snapshot:
      - `.bab-hud-score` is `'1,234'`
      - `.bab-hud-mult` is `'BAND ×2'` with `bab-hot`
      - guitar `.bab-mult` is `'×3'`
      - crowd `i` `style.bottom === '66%'` with `bab-crowd-green`
    - `stars fill by share and turn gold at 6`: `stars: 2.5` gives fills `100%, 100%, 50%, 0%, 0%`; `stars: 6` adds `bab-gold`.
    - `a streak milestone pops a callout`: an update with guitar `streak` 49, then 50, gives the guitar `.bab-callout` text `'50 NOTE STREAK!'`.
    - `the vocals HUD lives in the strip slot`.
    - `destroy removes everything`.
  - `band-screen.test.mjs`: `column icons are Lucide SVGs`: each `.bab-col .bab-ico` contains `<svg`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** icons, model, HUD, CSS and the band-screen icons.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band HUD — score, stars, band multiplier, crowd meters, glow and callouts`.

### Task 11: Toast stack and the band count-in overlay

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/toasts.js`, `src/count-in-overlay.js`
- Modify: `assets/build-a-band.css` (replace `.bab-toast` 278-283 with stack rules; add `.bab-countin` and `body.bab-band-song #count-in-overlay { display: none !important; }`)
- Test: create `tests/toasts.test.mjs`, `tests/count-in-overlay.test.mjs`

**Interfaces:**
- Produces:
  - **`createToastStack({ doc, getHost: () => Element | null, setTimer, clearTimer, ttlMs = 4000, max = 3 })`** returns `{ show(text: string): void, clear(): void, texts(): string[] }`.
    - The container is `div.bab-toasts` (`role="status"`, `aria-live="polite"`), created in `getHost()` on the first `show`.
    - Each toast is `div.bab-toast`.
    - The same text already showing restarts its timer instead of being added again.
    - Over `max`, the oldest is removed.
    - `clear()` removes all toasts, cancels their timers and removes the container.
  - **`createCountInOverlay({ doc, bus, getHost, setTimer, clearTimer })`** returns `{ destroy(): void }`.
    - On `count-in:tick {n, total}`: shows `div.bab-countin` in `getHost()` with text `String(total − n + 1)`. A non-finite `total` shows `n`.
    - On `count-in:hide {completed:true}`: shows `'ROCK!'`, then removes it after 600 ms.
    - On `{completed:false}`: removes it now.
    - `destroy()` unsubscribes, clears the timer and removes the element.
    - It plays nothing.

- [ ] **Step 1: Write the failing tests:**
  - `toasts.test.mjs` (manual timers as in `band-runtime.test.mjs:18-33`):
    - `stacks different messages`: two `show`s give `texts()` of `['A', 'B']` inside one `.bab-toasts`.
    - `the same message is shown once and its timer restarts`.
    - `keeps at most three, dropping the oldest`.
    - `each toast leaves after 4 s`.
    - `clear removes everything and cancels timers`.
  - `count-in-overlay.test.mjs` (an `EventTarget` bus with `on`/`off`/`emit`):
    - `counts down 3-2-1 from core's ticks`: ticks `{n:1,total:3}`, `{n:2,total:3}`, `{n:3,total:3}` give `.bab-countin` text `'3'`, `'2'`, `'1'`.
    - `completed shows ROCK! then goes after 600 ms`.
    - `a cancelled count-in disappears at once`.
    - `destroy unsubscribes`: a tick after `destroy()` creates nothing.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, plus the CSS. The countdown is centred over the stage in Unbounded at about 180 px, with an overdrive-blue glow.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: toast stack and a 3-2-1 count-in overlay driven by core's count-in`.

### Task 12: Scoring, HUD and hide switches wired into band sessions

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/band-runtime.js`: `newSession` 95-129; `showToast` 138-152; `EFFECTS` `play`, `mount`, `applyDifficulties`, `teardown`; `handlers` 455-477; `onCanvasReplaced` 202-209
  - `src/vocals.js`: `armVocals` 29-37, `stopVocals` 78-84
- Test: `tests/band-runtime.test.mjs`, `tests/vocals.test.mjs`

**Interfaces:**
- Consumes:
  - Tasks 6–11: `createBandScore`, `guitarEntry`, `drumsEntry`, `vocalsEntry`, `vocalsTotals`, `guitarStarThresholds`, `createBandHud`, `createToastStack`, `createCountInOverlay`
  - stage `laneSlot` / `getDrumCanvas`
  - the switches from Tasks 1, 3, 4, 5
- Produces:
  - **`vocals.js`:**
    - `armVocals` also calls `api.setScoreHudHidden(true)` when that function exists (guarded; the return value is ignored).
    - `stopVocals` calls `api.setScoreHudHidden(false)` (guarded) after `setHearMyself(null)`.
  - **`newSession`** adds:
    - `goPrefs` (the prefs `startSession` received)
    - `score: null`, `hud: null`, `countIn: null`, `lastT: 0`
    - `hidden: { nd: false, drums: new Set(), scorecard: false }`, `countInOverride: false`
  - **One runtime toast stack** (`getHost` = `#player`). `showToast(s, text)` calls `toasts.show(text)`; `s.toast`/`s.toastTimer` go away.
  - **`play`:** before `playSong`, `fb.setSongCountInOverride(true)` when it is a function, then `s.countInOverride = true`.
  - **`mount`:**
    - After a successful `mountStage`:
      - `s.score ??= createBandScore({ parts: <ids on in s.prefs> })`
      - `s.hud?.destroy()`, then `s.hud = createBandHud({ … oneLevel: !(s.readyDetail && s.readyDetail.hasPhraseData) })` and `s.hud.update(s.score.snapshot())`
      - `doc.body.classList.add('bab-band-song')`
      - `s.countIn ??= createCountInOverlay(...)`
      - `applyHides(s)`
    - The early return is now only `!plan.strip && plan.lanes.length === 0`, which is unreachable for a session with a playable part (R10).
  - **`applyHides(s)`:**
    - Guitar on: `win.noteDetect.setScoreHudHidden(true)` gives `s.hidden.nd = true`.
    - Drums on: the band drum canvas (`stage.getDrumCanvas()`, else `s.drumCanvas`, else `#highway`) goes through `feedBackDrums.setScoreHudHidden(canvas, true)` and is added to `s.hidden.drums`. `onCanvasReplaced` and the stage's adopted canvas are hidden too.
    - `win.feedBackScorecard.setHudHidden(true)` gives `s.hidden.scorecard = true`.
    - Every call is guarded by `typeof === 'function'`.
  - **`applyDifficulties`:** after the mastery is set, `s.score.setStarThresholds('guitar', guitarStarThresholds(hw.getFilteredNotes(), hw.getFilteredChords()))` (guarded).
  - **Listeners** are registered once per runtime and removed in `dispose`. Each acts only while `session && state.phase === 'playing' && session.score`.
    - `win` `notedetect:hit` / `notedetect:miss` give `guitarEntry`.
    - bus `drums:hit|miss|overhit` give `drumsEntry(type, d, t, bandDrumCanvas(s))`.
    - bus `karaoke:phrase` gives `vocalsEntry`; `karaoke:reset` gives `syncTotals('vocals', vocalsTotals(d))`.
    - bus `song:seek` with finite `from`/`to`, `to < from − 0.05` and `reason !== 'loop-wrap'` gives `rewindTo(to)`.
    - Each records, then calls `s.hud.update(s.score.snapshot())`.
    - `t` = `fb.getDisplayTime()`, else `#audio.currentTime`, else `s.lastT`. A finite `t` updates `s.lastT`.
  - **`teardown`:** after `stopVocals`, before `unmountStage`:
    - `hud.destroy()`, `countIn.destroy()`, remove `bab-band-song`
    - undo each hide that was set (`setScoreHudHidden(false)` / `(canvas, false)` / `setHudHidden(false)`)
    - `setSongCountInOverride(null)` when `s.countInOverride`
    - `toasts.clear()`
    - Each step guarded. `s.score` is kept for the results (Task 13).
  - **The returned runtime object** adds `snapshot(): BandSnapshot | null`, the current session's `s.score.snapshot()` (or `null`).

- [ ] **Step 1: Write the failing tests.**
  - `vocals.test.mjs`:
    - `armVocals hides karaoke's score HUD when it can`: the fake API's `setScoreHudHidden` receives `true`.
    - `stopVocals shows it again last`: the calls end with `['setScoreHudHidden', false]`.
    - `an API without setScoreHudHidden still arms and stops`.
  - `band-runtime.test.mjs`, extending `setup()`:
    - `win.noteDetect = { setScoreHudHidden: rec }`, `win.feedBackScorecard = { setHudHidden: rec }`, `feedBackDrums.setScoreHudHidden = rec`, `fb.setSongCountInOverride = rec`, `fb.getDisplayTime = () => clock.t`.
    - The fake stage gains `laneSlot` (a div per lane), `getDrumCanvas` (a canvas when drums is on), `stripSlot`.
    - `win.highway` gains `getFilteredNotes`/`getFilteredChords` returning 10 singles.
  - Tests:
    - `Go forces the song count-in, and teardown clears it`: `setSongCountInOverride(true)` is recorded before `playSong`, and `(null)` after leaving.
    - `mount hides every plugin's own score display; leaving shows them again`:
      - after ready: note_detect `true`, drums `(laneCanvas, true)`, scorecard `true`
      - after `screen:changing` away: each `false`, and `body` no longer has `bab-band-song`
    - `a guitar hit from the default detector scores; a panel detector's doesn't`:
      - dispatch a `window` `notedetect:hit` with `{isDefault:true, counted:true, hit:true, points:50, multiplier:1, streak:1}` → `.bab-hud-score` reads `'50'`
      - the same with `isDefault:false` → still `'50'`
    - `drums events score only from the band's drum canvas`.
    - `karaoke phrases score with their totals`.
    - `a backward seek rewinds the band score; a loop wrap doesn't`:
      - hits at clock 10 and 20, then `song:seek {from:20, to:15}` → score of the first hit
      - `{from:20, to:10, reason:'loop-wrap'}` → unchanged
    - `judgments after the song ended don't score`.
    - `guitar star thresholds come from the filtered notes at the band mastery`: after ready, `rt.snapshot().parts.guitar.stars === 0` (not `null`); with `getFilteredNotes` returning `[]` it stays `null`.
    - `a splitscreen remount keeps the score and re-hosts the HUD`: from the plan-2 remount test pattern, the score from before the remount shows in `mounts[1]`'s guitar lane HUD.
    - `toasts stack: one difficulty and no pitch both show`: replaces the shared-slot behaviour; both texts are in `.bab-toasts`.
    - Existing `div.bab-toast` queries keep working.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `vocals.js`, then the runtime.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (plan 2–3 runtime tests, except the 1500 ms ones Task 13 replaces).
- [ ] **Step 5: Commit** `feat: band sessions score every part, show the band HUD and hide the plugins' own scores`.

### Task 13: The results screen replaces the 1.5 s exit

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/results.js` (pure), `src/results-screen.js` (DOM)
- Modify:
  - `src/session.js` (10-31)
  - `src/band-runtime.js`: drop `EXIT_WAIT_MS`, `startExitTimer`, `cancelExitTimer`, `exitTimer`; add `showResults`, `hideResults`, `dropExit`, `replay`; public `again()` / `next()`
  - `assets/build-a-band.css` (results rules)
- Test: create `tests/results.test.mjs`, `tests/results-screen.test.mjs`; modify `tests/session.test.mjs`, `tests/band-runtime.test.mjs`

**Interfaces:**
- Produces:
  - **`results.js`:**
    - **`resultsModel({ snapshot, prefs, song, oneLevel, drumsExtra })`.**
      - `song` is `{title, artist}`.
      - `drumsExtra` is `{ phrasesHit, phrasesTotal } | null`.
      - Returns `{ stars, starDisplay, score, title, subtitle, cards }`, where `subtitle = 'title · artist'`.
      - `cards` holds one card per part with `prefs.parts[id].on`, in the order guitar, drums, vocals. Each card is `{ part, name, difficulty, color, icon, accuracyPct: number|null, score, bestStreak, stats: Array<[label, value]>, award }`, with the content from R17:
        - `name`: `'Guitar · Lead'` / `'Drums'` / `'Vocals'`
        - `difficulty`: `difficultyLabel`, with guitar `'One level'` when `oneLevel`
        - `accuracyPct = Math.round(accuracy × 100)`
        - stat values as display strings via `formatScore`
    - **`pickAwards(cards): string[]`**, in R17's priority order.
  - **`results-screen.js`:** `showResultsScreen({ doc, win, host, model, onAgain, onNext })` returns `{ hide(): void }`.
    - It renders `div.bab-results` (`role="dialog"`, `aria-modal="true"`) into `host`:
      - the stars header (`star` icons; `bab-gold` when gold)
      - `.bab-results-score`
      - the subtitle
      - one `.bab-card[data-part]` per card (`--bab-c` colour, icon, `.bab-card-pct` with `accuracyPct + '%'` or `'—'`, stat rows, a `.bab-award` with the `trophy` icon)
      - buttons `button.bab-again` (`rotate-ccw` icon, 'Play again') and `button.bab-next` ('Next song', `arrow-right` icon)
    - Keys on `win`:
      - Enter calls `onNext`; `r`/`R` calls `onAgain`
      - each key calls `preventDefault` and is ignored when the target is typing (`input`, `textarea`, `select`, contenteditable)
      - the listener is removed by `hide()`
  - **`session.js` (R16):**
    - `playing.ended` gives `['holdExit', 'showResults']`
    - `ending`:
      - `loading` → `[IDLE, ['hideResults', 'dropExit', 'teardown']]`
      - `again` → `[IDLE, ['hideResults', 'dropExit', 'teardown', 'replay']]`
      - `next` → `[IDLE, ['hideResults', 'teardown', 'releaseExit', 'showBandScreen']]`
      - `left` → `[IDLE, ['hideResults', 'dropExit', 'teardown']]`
    - `exitTimer` is gone.
  - **Runtime:**
    - `showResults(s)`:
      - builds the model from `s.score.snapshot()`
      - `drumsExtra` comes from `feedBackDrums.getInstanceState(bandDrumCanvas(s)).starPower` (guarded)
      - `song` comes from `s.item` (`title`, `artist`)
      - it shows the screen in `#player` with `onAgain: () => dispatch({type:'again'})` and `onNext: () => dispatch({type:'next'})`
    - `hideResults` hides it.
    - `dropExit` sets `release = null`.
    - `replay(s)` calls `startSession({ song: s.item, prefs: s.goPrefs })` and catches and warns on a rejection. It is always the last effect.
    - The returned object adds `again()` and `next()` (dispatch helpers for acceptance).

- [ ] **Step 1: Write the failing tests:**
  - `results.test.mjs`:
    - `a full band card set in part order with R17 stats`:
      - a snapshot with guitar (`hits 90, misses 10, bestStreak 40, score 9000, bonus 500`), drums (`hits 80, misses 20, overhits 3`) and vocals (`accuracy 0.79`, phrases `[{rating:'Awesome', count:12, meanAccuracy:0.95}, {rating:'Strong', count:9, meanAccuracy:0.8}]`, `bestStreak 7`)
      - `drumsExtra {phrasesHit:4, phrasesTotal:5}`
      - cards are `['guitar','drums','vocals']`
      - guitar `accuracyPct 90` with stats including `['Notes hit','90 / 100']` and `['Band bonus','500']`
      - drums stats include `['Overhits','3']` and `['Star power phrases','4 / 5']`
      - vocals stats include `['Phrases','12 Awesome · 9 Strong']` and `['Best run','7 phrases']`
    - `nothing judged gives a dash, not NaN`: `accuracyPct === null` and `score === 0`.
    - `one level guitar`: `difficulty === 'One level'`.
    - `awards`:
      - `pickAwards` on accuracies 100 (judged 25), 80, 70 with best streaks 30, 40, 5 gives `['Flawless', 'Best streak in the band', 'Big voice']`
      - a solo guitar card gives `['Riff keeper']`
      - tied best streaks give no streak award
  - `results-screen.test.mjs`:
    - `renders cards and both buttons`: `.bab-card` count 3; `.bab-results-score` text `'412,880'`.
    - `Play again and Next song call back`.
    - `Enter is Next song, R is Play again, typing is ignored`.
    - `hide removes the screen and the key listener`.
  - `session.test.mjs`: update the `playing ended` row; add rows for `ending again`, `ending next`, `ending left` and `ending loading`; remove `exitTimer`.
  - `band-runtime.test.mjs`:
    - Replace both 1500 ms tests with `song:ended holds auto-exit and shows the results; Next song releases once and shows the band screen`:
      - after `song:ended`: `calls.hold === 1`, `.bab-results` exists, `timers.delays()` has no `1500`
      - `rt.next()` gives `calls.release === 1`, one unmount, `showScreen` `['plugin-build_a_band']`, and the results gone
    - `the band screen is not re-shown when release already returned to it`: the same, via `rt.next()`.
    - `Play again tears down and starts the same song with the same prefs`: `rt.again()` gives `calls.release === 0`, `mounts[0].unmounted === 1`, and a second `playSong` with the same file and arrangement index; the new session is `armed`.
    - `leaving while the results show tears down without releasing`.
    - `the results show this session's numbers`: after a `notedetect:hit` worth 50, the guitar `.bab-card` stat shows `'1 / 1'`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `results.js`, `results-screen.js`, then the reducer and the runtime, then CSS. The CSS follows the draft's results section: cards in a 3-column grid that collapses to 1 below 720 px, the Next song button styled like Go.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band results screen with Play again and Next song`.

### Task 14: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 4, and records the results in the plan 4 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`. Nothing may play. A real count-in is never started, because it clicks.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with every repo on `feature/build-a-band-stage`: core, build-a-band, drums, note_detect, scorecard, lyrics_karaoke. If scorecard isn't linked in `dev-plugins/`, record that and skip its checks.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, else start `launch-debug.sh`.
  3. Reload with `debug/cdp-reload.mjs`.
  4. Never quit a running copy. If one blocks the debug launch, record "acceptance blocked" and stop.
- [ ] **Step 2: Snapshot and force silence.**
  1. Record `build_a_band.prefs.v1` and `countdownBeforeSong`.
  2. Set `parts.vocals.hearMyself = false`.
  3. Confirm these are functions: `feedBack.setSongCountInOverride`, `noteDetect.setScoreHudHidden`, `feedBackDrums.setScoreHudHidden`, and `feedBackScorecard.setHudHidden` (if loaded).
- [ ] **Step 3: Full band, held.**
  1. Pick plan 3's acceptance song. Hold autoplay with plan 1's silent-load technique (`holdAutoplay` on `song:loading`, audio muted, pause guard), then Go.
  2. With `#audio.paused === true`, confirm:
     - `.bab-hud` is 48 px high, and `--bab-lanes-top` is `138px` with vocals or `48px` without
     - `#player-hud` is `display:none`
     - one `.bab-part-hud` per playing part, vocals inside `.bab-strip`
     - `noteDetect.isScoreHudHidden() === true` and `feedBackDrums.isScoreHudHidden(<lane canvas>) === true`
     - `lyricsKaraoke.isScoreHudHidden() === true`
     - `document.body` has `bab-band-song`
- [ ] **Step 4: Scoring by synthetic events.**
  1. Guitar: dispatch 50 `notedetect:hit` CustomEvents on `window` with `{isDefault:true, counted:true, hit:true, points:100, multiplier:4, streak:k}`.
  2. Drums: emit 50 `drums:hit` on `feedBack` with `canvas: document.querySelector('.bab-drum-canvas')` (the drum lane's live canvas), `multiplier:4`, `combo:k`, `points:240`, `stars:3`.
  3. Vocals: emit 5 `karaoke:phrase` with `{rating:'Strong', accuracy:0.85, points:1600, multiplier:4, streak:k, stars:3}`.
  4. Confirm, also through `__buildABandRuntime.snapshot()`:
     - `.bab-hud-mult` reads `BAND ×4`, and the bonus line is non-empty
     - the guitar callout fired "50 NOTE STREAK!"
     - each crowd needle is at 100 %
  5. Emit `song:seek {from: t, to: t − 5}` with the audio paused at the same time base. The score drops back to the entries recorded at or before `t − 5`.
- [ ] **Step 5: Count-in overlay.**
  1. Emit `count-in:tick {n:1,total:3}` then `{n:3,total:3}`: `.bab-countin` reads `3`, then `1`.
  2. Emit `count-in:hide {completed:true}`: `ROCK!`, gone after 600 ms.
- [ ] **Step 6: Results.**
  1. Emit `song:ended {}`. Confirm `.bab-results` shows three cards and the band score equals the HUD score.
  2. Call `__buildABandRuntime.again()` with autoplay held: a new `armed`/`playing` session for the same song, and the score back to 0.
  3. Emit `song:ended` again, then press Enter (CDP key event): the band screen is active and `phase() === 'idle'`.
  4. Confirm every switch is back off:
     - `noteDetect.isScoreHudHidden() === false`
     - drums `false`
     - `lyricsKaraoke.isScoreHudHidden() === false`
     - `feedBackScorecard.isHudHidden() === false`
     - `body` without `bab-band-song`
     - `#player-hud` shown on a solo song
- [ ] **Step 7: Zoom.** On a held Go: hover the guitar lane, click Zoom in once. Confirm `--bab-main-zoom` is `1.1` and `build_a_band.prefs.v1` has `zoom.guitar: 1.1`. Then restore the pref.
- [ ] **Step 8: Clean up.**
  1. Close the song and restore the Step 2 values.
  2. Leave the band screen.
  3. Confirm nothing is playing and the mic is off (`lyricsKaraokeDiag().micState === 'off'`).
  4. Record results and commit SHAs in the ledger.

---

## Deviations from the spec in this plan

- **Core's player HUD row is hidden on the stage** (song info, time, live performance) and the band HUD takes its place. The time readout returns with plan 7's hover transport (R9).
- **Band songs always count in**, whatever "Countdown before song" says (R15).
- **Scorecard also gets a hide switch.** The spec names only note_detect, karaoke and drums, but scorecard's own results card would cover the band results (R13).
- **Zoom is lane-only;** the vocal strip has none (R11).
- **Guitar gold stars need overdrive (plan 5),** as in YARG (R5).
- **The band multiplier and bonus follow the spec's "lowest part multiplier" rule,** not YARG's overdrive-count band multiplier (R4).

## Later plans (each written when the previous one has landed)

5. **Overdrive and fail.**
   - Guitar "Noodle it up" (note_detect `notedetect:onset`).
   - Vocal overdrive and mic hit (KRB-8 pulled forward, in karaoke).
   - Drums star power through the `drums:sp-*` events (Task 2).
   - Overdrive bars and ×2 through the ledger's `factor` and the HUD's `setOverdrive`.
   - Fail mode and rescue, from each part's `crowd` (using the stored `failMode`).
   - "Band failed" results.
6. **Drum sound modes.** Song drums, Rock Band and My kit only, through stems' `mute`/`restore` (using the stored `soundMode`; `drums:hit`/`miss` are the triggers).
7. **Full screen and sidebar.**
   - Full screen stage (using the stored `fullScreenStage`), and the hover transport with the time readout.
   - The sidebar over the player.
   - Settings over a paused song.
