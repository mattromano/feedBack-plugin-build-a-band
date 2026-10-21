# Build-a-Band Plan 5: overdrive and fail mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every part gets Rock Band overdrive (drums through its star power, guitar by "Noodle it up", vocals by a mic hit). The HUD's overdrive bars and callouts come alive. A band-wide Fail on mode drops a player whose crowd meter empties, lets a bandmate's overdrive rescue them, and ends the song with "Band failed" when everyone is out. The band screen gets a silent mic-hit sensitivity check.

**Architecture:**
- **Other repos:**
  - note_detect publishes a `notedetect:onset` event for any new attack.
  - Lyrics Karaoke builds KRB-8: a vocal overdrive meter that doubles its own phrase points, plus a mic-hit detector shared through its API.
  - Stems lets automation claims stack and fades them.
- **Pure modules in the plugin:**
  - `yarg-rules.js` gets the overdrive numbers (LGPL)
  - `measure-clock.js` and `overdrive.js`: the band's meter
  - `guitar-od.js`: phrases, gaps, noodle
  - `band-score.js`: fail and rescue, replayed with the ledger
  - `stem-claims.js`: the failed-out stem mute
- **`overdrive-session.js`** owns the per-song overdrive state behind a small interface. `band-runtime.js` only routes events into it and into the ledger.

**Tech Stack:** Vanilla ES modules and CommonJS plugin scripts, node:test. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read "Overdrive" (with the table), "Fail mode", "Scoring and the HUD" and the Changes table. The binding rulings are in `.superpowers/sdd/plan-5-inputs.md` (R1–R23 and the verified facts). Where the spec and a ruling differ, the ruling wins.

**This is plan 5 of 7.** Plans 1 (one-clock stage), 2 (band screen and sessions), 3 (vocals strip) and 4 (HUD, scoring and results) have landed. The later plans are listed at the end.

## Global Constraints

- **Repos and branches.** Repos live under `~/Desktop/repos/feedback-upstream/`. The branch in every repo is `feature/build-a-band-stage`.

  | Repo | State at plan start | Tasks |
  |---|---|---|
  | `feedBack-plugin-notedetect` | branch exists, `1311ef5` | 1 |
  | `feedBack-plugin-stems` | on `custom` `768ef13`, clean: run `git switch -c feature/build-a-band-stage custom` | 2 |
  | `feedBack-plugin-lyrics-karaoke` | branch exists, `81b061a` | 3, 4 |
  | `feedBack-plugin-build-a-band` | branch exists, `bf73fe2` | 5–12 |
  | core `feedBack`, `feedBack-plugin-drums`, `feedBack-plugin-splitscreen`, `feedBack-plugin-scorecard` | read-only | — |

- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  - One commit per task.
- **Line endings:** every file this plan touches is LF. Check with `file` before editing anyway.
- **Test commands:**
  - build-a-band: `npm test`
  - note_detect: `npm test`
  - lyrics_karaoke: `npm test`
  - stems: `npm test`
- **NO SOUND:**
  - Nothing in this plan plays audio.
  - The band-screen check and the mic-hit detector read levels only. Analysers are never connected to `audioContext.destination`.
  - No task launches the app. Task 12 is the controller's silent check.
- **No push**, no PRs and no new GitHub repos.
- **Plugin identity:** id `build_a_band`, prefs key `build_a_band.prefs.v1` (new field `parts.vocals.micHitDb`).
- **Values (rulings):**
  - Overdrive (R2, R3): phrase gain `0.25`, deploy at `0.5`, full bar `8` measures, multiplier `2`.
  - Fallback tempo: 2 s per measure.
  - Guitar earning (R8): clear at `0.9`, grace `0.5` s.
  - Noodle (R9): gap ≥ `2` s, `3` onsets, guard `0.3` s.
  - Onsets (R10): level ≥ `0.05`, rise ×`1.6`, refractory `0.08` s.
  - Mic hit (R6): rise `25` dB, default `−30` dBFS, range `−48`…`−12`, refractory `0.3` s, frame 2048 samples.
  - Rescue crowd `0.4` (R12). Overdrive tick `100` ms (R16). Stem fade time constant `0.004` s (R14).
- **Event and API names:**
  - note_detect: `notedetect:onset { t, midi, confidence, level, source, isDefault }`
  - karaoke bus: `karaoke:od-gain {fill}`, `karaoke:od-ready {fill}`, `karaoke:od-activate {fill, t}`, `karaoke:od-end {t}`, `karaoke:mic-hit {t, db}`
  - karaoke API: `getOverdrive()`, `setMicHitThreshold(db | null)`, `getMicHitThreshold()`, `micHit`
- **Copy:**
  - Callouts: "Overdrive ready", "Noodle it up!", "OVERDRIVE!", "DROPPED OUT", "SAVED!".
  - Results header: "Band failed".
  - Toast: "`<Part>` dropped out: overdrive brings them back".
- **Who doubles (R4):**
  - Only guitar entries carry `factor: 2`.
  - Drums' and karaoke's points already include their own overdrive.
- **Licences:**
  - YARG-derived numbers live only in `src/yarg-rules.js` (band) and `src/yarg-overdrive.js` (karaoke), both LGPL-3.0 with credit.
  - Everything else stays under its repo's terms.
- **Karaoke rating strings** are compared only inside karaoke (`earnsOverdrive`); the band never compares them (plan 4 R3).
- **Styles:** band styles go in `assets/build-a-band.css` with `bab-` classes.

## Review Focus

1. **A rewind mid-song** must leave the overdrive bar, failed players and rescues exactly as they were at the seek time. Loop wraps stay cumulative. (Task 5 meter `rewindTo`; Task 6 tracker rewind and loop tests; Task 7 replay-of-fail test; Task 10 `song:seek` test.)
2. **Doubling twice:** drums and vocals points must never get a band factor, and guitar must get one only while its meter is active at that judgment. (Task 9 `factorFor` test; Task 10 drums/vocals factor test.)
3. **A failed player** must neither score, earn, rescue others nor pin the band multiplier. Their stem claim must be released on every exit path. (Task 7 ignored-entries test; Task 11 teardown test across exit paths.)
4. **The note that opens a gap** (its own late attack), and a held note ringing into it, must not count toward "Noodle it up". (Task 6 guard test; Task 1 decaying-level test.)
5. **A song or chart missing data** (no beats, no phrases or sections, no stems, karaoke or drums API absent) must give no `NaN` and no throw. The affected part just has no overdrive or no stem mute. (Task 5 no-beats test; Task 6 no-phrases test; Task 9 missing-sources test; Task 11 no-stem test.)

---

### Task 1: note_detect publishes `notedetect:onset`

**Repo:** `feedBack-plugin-notedetect`

**Files:**
- Modify: `screen.js`
  - constants next to `latencyOffset` (2864)
  - top-level pure helpers
  - the instance emitter
  - call sites: the desktop level history (5123-5133), the browser level history (5288-5298), the `bridgeNewOnsets` loop (4482-4501)
- Modify: `README.md` (Events table), `CLAUDE.md` (events table)
- Test: create `test/onset_event.test.js`

**Interfaces:**
- Produces:
  - **Top-level constants:** `_ND_ONSET_MIN_LEVEL = 0.05`, `_ND_ONSET_RISE = 1.6`, `_ND_ONSET_REFRACTORY_S = 0.08`.
  - **Top-level pure functions** (so `_loader.js` exposes them):
    - `_ndLevelOnset(prevLevel: number, level: number): boolean`. True when `level >= _ND_ONSET_MIN_LEVEL && level >= prevLevel * _ND_ONSET_RISE`. A non-finite `prevLevel` counts as 0.
    - `_ndOnsetDue(lastT: number|null, t: number): boolean`. True when `lastT` is null, `t < lastT` (a backward jump), or `t - lastT >= _ND_ONSET_REFRACTORY_S`.
  - **Instance `_ndEmitOnset(t, { midi = null, confidence = null, level = null, source })`:**
    - does nothing unless `enabled` and `t` is finite
    - otherwise, when `_ndOnsetDue(lastOnsetT, t)`: sets `lastOnsetT = t` and calls `dispatchInstanceEvent('notedetect:onset', { t, midi, confidence, level, source, isDefault })`
    - `lastOnsetT` and the last level reset where `bridgeOnsetSeqSeen` resets (4937-4939)
  - **Call sites:**
    - Desktop level poll: after the push at 5133, `if (_ndLevelOnset(prevOnsetLevel, inputLevel)) _ndEmitOnset(songT - latencyOffset, { level: inputLevel, source: 'level' })`, then `prevOnsetLevel = inputLevel`.
    - Browser `processFrame`: the same with `lvl` after the push at 5298.
    - `bridgeNewOnsets` loop: for each onset accepted into `bridgeNewOnsets` (primed and confident), `_ndEmitOnset(hw.getTime() + avOffsetSec - latencyOffset - ageMs / 1000, { midi: n.midi, confidence: n.confidence, source: 'engine' })`. `avOffsetSec` is `hw.getAvOffset() / 1000` when available, else 0.

- [ ] **Step 1: Write the failing tests** in `test/onset_event.test.js`, using `loadDetectionCore()` and `extractBlock` (copy the pattern from `test/score_hud_hidden.test.js`):
  - `level attack: a 4 dB jump above the floor is an onset`:
    - `_ndLevelOnset(0.05, 0.09) === true`
    - `_ndLevelOnset(0.05, 0.07) === false` (under ×1.6)
    - `_ndLevelOnset(0, 0.04) === false` (under the floor)
    - `_ndLevelOnset(NaN, 0.06) === true`
  - `a ringing note decays without an onset`: feeding the levels `[0.6, 0.5, 0.42, 0.35, 0.3, 0.26]` pairwise gives no `true`.
  - `refractory`:
    - `_ndOnsetDue(null, 1) === true`
    - `_ndOnsetDue(1, 1.05) === false`
    - `_ndOnsetDue(1, 1.08) === true`
    - `_ndOnsetDue(5, 1) === true`
  - `onsets are emitted at both level sites and from engine onsets`: the source has `_ndEmitOnset(` inside the block containing `_ndLevelSamples.push({ songT, level: inputLevel })` and inside `async function processFrame(`, and within 30 lines after `bridgeNewOnsets.set(n.midi`.
  - `the emitter dispatches notedetect:onset with the instance's isDefault`: `extractBlock(SRC, 'function _ndEmitOnset(')` contains `dispatchInstanceEvent('notedetect:onset'` and `isDefault`, and returns early on `!enabled`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block, then document the event in README's Events table and CLAUDE.md's events table. Detail fields: `t` is the chart time of the attack, input latency removed; `source` is `'engine'` or `'level'`; dispatched twice like every notedetect event; only new attacks fire.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, the whole suite.
- [ ] **Step 5: Commit** `feat: public notedetect:onset event for any new note attack`.

### Task 2: Stems automation claims stack and fade

**Repo:** `feedBack-plugin-stems`. First run `git switch -c feature/build-a-band-stage custom` (R1).

**Files:**
- Create: `src/claims.js`
- Modify:
  - `src/main.js`: `applyStemState` 1283-1289, `capMute` 1356-1388, `capRestore` 1390-1411
  - `README.md` ("Capability Provider")
- Test: create `tests/claims.test.mjs`

**Interfaces:**
- Produces (`src/claims.js`, pure, operating on the existing `claimSnapshots` Map shape `key → { claimId, id, prevOn, prevVol }`):
  - `CLAIM_FADE_TC_S = 0.004`
  - `recordClaimMute(snapshots: Map, claimId: string, stem: {id, on, vol}): void`
    - no-op when this claim already holds the stem
    - when another claim holds the stem, stores that claim's `prevOn`/`prevVol`
    - otherwise stores the stem's current `on`/`vol`
  - `releaseClaim(snapshots: Map, claimId: string): Array<{ id, on, vol }>`
    - deletes this claim's entries
    - returns the pre-claim state only for stems no other claim still holds
  - `fadeGain(gainNode, target: number, ctx | null): void`
    - with `ctx`: `gainNode.gain.cancelScheduledValues(ctx.currentTime)`, then `gainNode.gain.setTargetAtTime(target, ctx.currentTime, CLAIM_FADE_TC_S)`
    - without `ctx`: `gainNode.gain.value = target`
- **`main.js`:**
  - `applyStemState(stem, on, vol, { fade = false } = {})` uses `fadeGain(stem.gain, …, S.audioCtx)` when `fade`.
  - `capMute` calls `recordClaimMute` (replacing the inline snapshot), then `applyStemState(stem, false, stem.vol, { fade: true })`.
  - `capRestore` applies `releaseClaim(claimSnapshots, claimId)` with `{ fade: true }` and returns those ids as `restoredIds`.
  - User toggles stay instant.

- [ ] **Step 1: Write the failing tests** (`tests/claims.test.mjs`, real ES import):
  - `one claim: mute then restore gives the user's state back`: stem `{id:'drums', on:true, vol:0.8}`. `recordClaimMute(m, 'a', stem)`, then `releaseClaim(m, 'a')` deep-equals `[{id:'drums', on:true, vol:0.8}]`, and `m.size === 0`.
  - `stacked claims: the first restore keeps the stem muted while the second holds it`:
    - mute by `'a'`; set `stem.on = false`; mute by `'b'`
    - `releaseClaim(m, 'a')` deep-equals `[]`
    - `releaseClaim(m, 'b')` deep-equals `[{id:'drums', on:true, vol:0.8}]`
  - `re-muting under the same claim keeps the first snapshot`.
  - `fadeGain ramps with a context and sets directly without one`: a fake param records `cancelScheduledValues(0.5)` and `setTargetAtTime(0, 0.5, 0.004)` with `ctx.currentTime = 0.5`; without ctx, `gain.value === 0`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, wire `main.js` and add one README paragraph: claims stack (a stem stays muted until every claim on it is restored); automation mutes fade over about 12 ms.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: stem automation claims stack and fade (~12 ms)`.

### Task 3: Karaoke overdrive rules, mic-hit detector and vocal meter (pure)

**Repo:** `feedBack-plugin-lyrics-karaoke`

**Files:**
- Create:
  - `src/yarg-overdrive.js` (LGPL-3.0 header crediting YARG.Core `BaseEngine` `GainStarPower`/`AwardStarPower`/`ActivateStarPower`, the 8-measure bar and the 25 dB vocal onset; modelled on build-a-band's `src/yarg-rules.js` header)
  - `src/mic-hit.js`, `src/measure.js`, `src/overdrive.js`
  - `NOTICE.md` (modelled on build-a-band's NOTICE.md; one LGPL file, the rest of the plugin keeps its existing terms)
  - `LICENSE.LGPL-3.0` and `LICENSE.GPL-3.0`, copied from `feedBack-plugin-drums`
- Modify: `src/scoring.js` (add `earnsOverdrive`)
- Test: create `tests/mic-hit.test.mjs` and `tests/overdrive.test.mjs`; modify `tests/scoring.test.mjs`

**Interfaces:**
- Produces:
  - **`src/yarg-overdrive.js`:** `OVERDRIVE = Object.freeze({ phraseGain: 0.25, deployMin: 0.5, barMeasures: 8, multiplier: 2 })`, `MIC_HIT_RISE_DB = 25`.
  - **`src/mic-hit.js`:**
    - `DEFAULT_MIC_HIT_DB = -30`, `MIC_HIT_MIN_DB = -48`, `MIC_HIT_MAX_DB = -12`, `MIC_HIT_REFRACTORY_S = 0.3`
    - `levelDb(meanSquare: number): number`: `10·log10`, floor `-100`, non-finite → `-100`
    - `clampMicHitDb(v): number | null`: rounds and clamps a finite number; `null` for anything else
    - `createMicHitDetector({ thresholdDb = DEFAULT_MIC_HIT_DB, riseDb = MIC_HIT_RISE_DB, refractoryS = MIC_HIT_REFRACTORY_S } = {})` → `{ push(db, t): boolean, setThreshold(db): boolean, threshold(): number, reset() }`, with the R6 rule
  - **`src/measure.js`:** `createMeasureClock(beats) → { measureAt(t): number, timeAtMeasure(m): number }`, with R3's rules:
    - downbeats are `measure >= 0`
    - else every 4th beat
    - else 2 s per measure from 0
    - linear between downbeats, extrapolated outside them
  - **`src/overdrive.js`:** `createVocalOverdrive({ clock })` → `{ phrase(rating, t): boolean, micHit(t): boolean, stateAt(t): { fill, active, ready }, isActiveAt(t): boolean, reset() }`
    - `phrase` gains `phraseGain` when `earnsOverdrive(rating)` and returns whether it gained
    - `micHit` deploys when ready and returns whether it did
    - drain and end follow R3; times are non-decreasing (an earlier `t` is treated as the latest)
  - **`src/scoring.js`:** `earnsOverdrive(rating): boolean`: true when `RATINGS.indexOf(rating)` is between 0 and `RATINGS.indexOf('Strong')`.

- [ ] **Step 1: Write the failing tests:**
  - `mic-hit.test.mjs`:
    - `a 25 dB jump above the threshold is a hit; the first frame never is`:
      - `push(-20, 0) === false`
      - `push(-60, 0.05)`, then `push(-28, 0.1) === true`
    - `under the rise or the threshold is no hit`:
      - `-60 → -36` (24 dB) is `false`
      - threshold `-30`: `-70 → -40` is `false`
    - `refractory 0.3 s`: a second qualifying jump at `t + 0.2` is `false`, at `t + 0.31` is `true`.
    - `levelDb and clamping`:
      - `levelDb(0) === -100`
      - `levelDb(0.01) === -20`
      - `clampMicHitDb(-60) === -48`, `clampMicHitDb(-5) === -12`, `clampMicHitDb('x') === null`
      - `setThreshold('x') === false`
  - `overdrive.test.mjs` (beats every 0.5 s with `measure` set on every 4th, i.e. 2 s measures):
    - `Strong or better earns a quarter; ready at half`: `phrase('Awesome',1)`, `phrase('Strong',2)` give `stateAt(2)` `{fill:0.5, active:false, ready:true}`; `phrase('Good',3)` returns `false`.
    - `a mic hit deploys only when ready`: `micHit(0.5)` on an empty bar is `false`.
    - `drain: a full bar lasts 8 measures`:
      - four Awesome phrases, then `micHit(10)`
      - `stateAt(18).fill === 0.5`
      - `isActiveAt(25.9) === true`, `isActiveAt(26.1) === false`
    - `a gain while active extends it`.
    - `no beats: 2 s per measure`: `createMeasureClock([]).measureAt(6) === 3`.
    - `reset empties the bar`.
  - `scoring.test.mjs`:
    - `earnsOverdrive follows RATINGS order`: true for `'Awesome'` and `'Strong'`; false for `'Good'`, `'Awful'`, `'nope'` and `undefined`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the licence files.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: KRB-8 rules: vocal overdrive meter and mic-hit detector (YARG numbers, LGPL)`.

### Task 4: Karaoke wires overdrive into scoring, the mic and the API

**Repo:** `feedBack-plugin-lyrics-karaoke`

**Files:**
- Modify:
  - `src/scoring.js` (`createScorer` 43, `advanceTo` 114-152)
  - `src/overrides.js`
  - `src/api.js` (event names, `createKaraokeApi` 43-80)
  - `src/main.js`: `rebuildScorer` 151, `drawFrame` 604-612, `drawHud` 762-815, `onaudioprocess` 1097-1123, the API deps 2026-2051, `song:seek` 2240-2249, `resetUserResults` 929
  - `README.md` (Plugin API, Events)
- Test: `tests/scoring.test.mjs`, `tests/overrides.test.mjs`, `tests/api.test.mjs`, `tests/main-api.test.mjs`

**Interfaces:**
- Consumes: Task 3's modules.
- Produces:
  - **Scorer:**
    - `createScorer({ tokens, phrases, difficulty, isOverdriveAt })`. `isOverdriveAt(t)` is optional, default always `false`.
    - A phrase's points are `Math.round(1000 × accuracy) × multiplierBefore × (isOverdriveAt(phrase.end) ? 2 : 1)`.
    - Each event carries `overdrive: boolean`.
    - `multiplier` and `streak` are unchanged (R4).
  - **Overrides:** `micHitDb(): number | null` and `setMicHitDb(db | null): boolean` (`clampMicHitDb` result, or `null` to clear; anything else returns `false`). `clear()` resets it.
  - **`api.js`:**
    - `OD_EVENTS = Object.freeze({ gain: 'karaoke:od-gain', ready: 'karaoke:od-ready', activate: 'karaoke:od-activate', end: 'karaoke:od-end', micHit: 'karaoke:mic-hit' })`
    - API members:
      - `getOverdrive()` → `deps.getOverdrive()`, or `{ fill: 0, active: false, ready: false }`
      - `setMicHitThreshold(db)` → `overrides.setMicHitDb(db)`, applied to the live detector
      - `getMicHitThreshold()` → the threshold in effect
      - `micHit: Object.freeze({ riseDb: 25, defaultDb: -30, minDb: -48, maxDb: -12, createDetector: (opts) => createMicHitDetector(opts) })`
  - **`main.js`:**
    - One `vocalOd` per scorer build. Its clock is `createMeasureClock(window.highway && window.highway.getBeats ? window.highway.getBeats() : [])`, and the scorer gets `isOverdriveAt: (t) => vocalOd.isActiveAt(t)`.
    - After `emitScoring` in `drawFrame`, for each event: `vocalOd.phrase(e.rating, t)` with `t` the latency-corrected time passed to `advanceTo`. On a gain, emit `karaoke:od-gain {fill}`; when that gain made it ready, emit `karaoke:od-ready {fill}`.
    - Also in `drawFrame`: a meter that was active and isn't now emits `karaoke:od-end {t}` once.
    - In `onaudioprocess`, with `diag.rmsDb` computed and the song time moved since the last block (`getNow()` changed):
      - `micHitDetector.push(diag.rmsDb, songT)`
      - on a hit: emit `karaoke:mic-hit {t: songT, db}`
      - if `vocalOd.micHit(songT)`: emit `karaoke:od-activate {fill, t: songT}`
      - the detector's threshold is `overrides.micHitDb() ?? DEFAULT_MIC_HIT_DB`
    - A backward `song:seek` and `resetUserResults` call `vocalOd.reset()` (R5).
    - `drawHud`: when the score HUD isn't hidden, a 4 px blue (`#5cc8ff`) bar under the pill at `fill` width, and an "Overdrive!" flash for 1.2 s after activation (the existing `lastRating` fade pattern).

- [ ] **Step 1: Write the failing tests:**
  - `scoring.test.mjs`, `phrases in overdrive score double, totals keep the streak multiplier`: with `isOverdriveAt: (t) => t > 5`, a perfect phrase ending at 2 and another ending at 8 give events with `overdrive` `false` then `true`. The second event's `points === 1000 × multiplierBefore × 2`, and `snapshot().multiplier <= 4`.
  - `overrides.test.mjs`, `mic-hit threshold override clamps, clears and refuses junk`:
    - `setMicHitDb(-60)` gives `micHitDb() === -48`
    - `setMicHitDb(null)` gives `null`
    - `setMicHitDb('x') === false`
    - `clear()` resets it
  - `api.test.mjs`:
    - `overdrive API: getOverdrive default, threshold override, shared detector`:
      - with `deps.getOverdrive` missing, `getOverdrive()` deep-equals `{fill:0, active:false, ready:false}`
      - `setMicHitThreshold(-24) === true`, then `getMicHitThreshold() === -24`
      - `micHit.createDetector({thresholdDb:-30}).push` behaves like Task 3's detector (`-60 → -28` hits on the second frame)
      - `micHit.riseDb === 25`
  - `main-api.test.mjs`, `window.lyricsKaraoke exposes the overdrive API`:
    - `typeof getOverdrive`, `setMicHitThreshold` and `micHit.createDetector` are all `'function'`
    - `getOverdrive().fill === 0` with no song
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Then the README: the new members in the Plugin API table, the five events under Events, "phrase events carry `overdrive`; points double while overdrive is active; `multiplier` stays the streak multiplier", and the threshold override in "Overrides are not saved".
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: KRB-8 vocal overdrive: earn on Strong+, deploy by mic hit, double phrase points`.

### Task 5: Band overdrive numbers, measure clock and meter (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `src/yarg-rules.js` (header sources line, plus `OVERDRIVE`), `NOTICE.md` (the `src/yarg-rules.js` row names `BaseEngine` star power too)
- Create: `src/measure-clock.js`, `src/overdrive.js`
- Test: modify `tests/yarg-rules.test.mjs`; create `tests/measure-clock.test.mjs` and `tests/overdrive.test.mjs`

**Interfaces:**
- Produces:
  - **`yarg-rules.js`:** `export const OVERDRIVE = Object.freeze({ phraseGain: 0.25, deployMin: 0.5, barMeasures: 8, multiplier: 2 })`.
  - **`measure-clock.js`:** `createMeasureClock(beats) → { measureAt(t: number): number, timeAtMeasure(m: number): number }`, with the same rules as Task 3's `src/measure.js`.
  - **`overdrive.js`:** `createOverdriveMeter({ clock })` →
    - `gain(t, amount = OVERDRIVE.phraseGain): void`
    - `deploy(t): boolean`
    - `stateAt(t): { fill, active, ready }`
    - `isActiveAt(t): boolean`
    - `rewindTo(t): void`: drops events after `t`
    - `reset(): void`
  - The meter keeps an event log (`gain` / `deploy`, each with `t`) and computes state by replaying it up to the asked time, using R3's drain. An event earlier than the last is stored at the last event's time.

- [ ] **Step 1: Write the failing tests:**
  - `yarg-rules.test.mjs`, `overdrive numbers`: `OVERDRIVE` deep-equals `{phraseGain:0.25, deployMin:0.5, barMeasures:8, multiplier:2}` and is frozen.
  - `measure-clock.test.mjs`:
    - `downbeats map to whole measures`: beats every 0.5 s, `measure` 0,1,2 on every 4th beat (others `-1`). `measureAt(2) === 1`, `measureAt(3) === 1.5`, `timeAtMeasure(2) === 4`.
    - `extrapolates past the last downbeat`.
    - `no measure marks: every 4th beat`.
    - `no beats: 2 s per measure`: `measureAt(6) === 3`.
  - `overdrive.test.mjs` (the 2 s-measure beats):
    - `quarter per gain, capped at a full bar`: five gains give `fill 1`.
    - `deploy needs half a bar`: one gain then `deploy(1) === false`; two gains then `deploy(2) === true`, and a second `deploy` is `false` while active.
    - `a full bar drains over 8 measures`: four gains, `deploy(0)`. `stateAt(8)` gives `{fill:0.5, active:true, ready:false}`; `isActiveAt(15.9) === true`, `isActiveAt(16.1) === false`; `stateAt(20).fill === 0`.
    - `a gain while active extends the end`: deploy at 0 with half a bar, gain at 2, then `isActiveAt(9) === true`.
    - `rewindTo drops later gains and deploys`: gains at 1 and 2, deploy at 3, `rewindTo(2.5)` gives `stateAt(4)` `{fill:0.5, active:false, ready:true}`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band overdrive meter (YARG numbers) with a beat-based measure clock`.

### Task 6: Guitar earning and "Noodle it up" (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/guitar-od.js`
- Test: create `tests/guitar-od.test.mjs`

**Interfaces:**
- Produces:
  - **Constants:** `PHRASE_CLEAR = 0.9`, `PHRASE_GRACE_S = 0.5`, `GAP_MIN_S = 2`, `NOODLE_ONSETS = 3`, `NOODLE_GUARD_S = 0.3`.
  - **`chartPhrases(hw): Array<{ start, end }>`.**
    - From `hw.getPhrases()` (`start_time` / `end_time`).
    - Else from `hw.getSections()` sorted by `time` (each ends at the next's `time`, the last at `Infinity`).
    - Else `[]`. Any missing or throwing method counts as none.
  - **`itemTimes(notes, chords): number[]`:** the finite `t` of every note and chord, sorted.
  - **`findGaps(notes, chords, minGapS = GAP_MIN_S): Array<{ start, end }>`:** R9.
  - **`createPhraseTracker({ phrases, times })`** →
    - `judge(noteTime, hit, t): void`
    - `closeUpTo(chartT, t): number`: closes phrases with `end + PHRASE_GRACE_S <= chartT` and returns how many cleared (R8)
    - `rewindTo(t): void`
    - `reopenFrom(chartT): void`: the loop-wrap rule
  - **`createNoodle({ gaps })`** →
    - `zoneAt(chartT): { start, end, index } | null`
    - `onset(onsetT): boolean`: true exactly when this onset is the `NOODLE_ONSETS`-th counted in its gap, once per gap
    - `reset(): void`

- [ ] **Step 1: Write the failing tests:**
  - `chartPhrases: phrases, then sections, then none`:
    - `{getPhrases: () => [{start_time:0, end_time:4}]}` gives `[{start:0, end:4}]`
    - with `getPhrases` returning `null` and sections at 0 and 10: `[{start:0, end:10}, {start:10, end:Infinity}]`
    - `{}` gives `[]`
  - `findGaps uses sustains and keeps gaps of 2 s or more`:
    - notes `[{t:0, sus:1}, {t:3.5}, {t:15}]` and chord `{t:10, notes:[{sus:0.5}, {sus:2}]}`
    - give `[{start:1, end:3.5}, {start:3.5, end:10}, {start:12, end:15}]`
    - notes `[{t:0, sus:1}, {t:2.5}]` give `[]` (1.5 s)
    - no gap before the first note or after the last
  - `a phrase clears at 90 % of its notes`:
    - phrase `{start:0, end:10}`, ten times in it
    - nine hits give `closeUpTo(10.4, 11) === 0` (still in grace), then `closeUpTo(10.5, 11) === 1`
    - eight hits give `0`
    - a duplicate hit on the same `noteTime` counts once
  - `phrases without notes never clear`.
  - `rewind reopens phrases closed after the seek and forgets later judgments`:
    - judge at `t` 1…9, close at `t = 12`, `rewindTo(5)`
    - `closeUpTo(10.5, 13) === 0`, because only four hits remain
  - `loop wrap reopens phrases from the loop start`: after a clear, `reopenFrom(0)` plus nine hits clears it again (`=== 1`).
  - `noodle: three new attacks in an open gap deploy, once`:
    - gap `{start:4, end:8}`
    - `onset(4.1) === false` and isn't counted (guard)
    - `onset(5)`, `onset(5.5)` are `false`; `onset(6) === true`; `onset(6.5) === false`
    - `zoneAt(5).index === 0`, `zoneAt(9) === null`
  - `noodle: onsets outside any gap are ignored`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: guitar overdrive rules: phrases cleared at 90%, Noodle it up gaps and onsets`.

### Task 7: Fail and rescue in the ledger, adapters, session and results (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/band-score.js` (`CROWD` 9-11, `freshPart` 16-22, `bandMultiplier` 30-34, `apply` 46-76, `createBandScore` 86, `snapshot` 135-150)
  - `src/part-events.js`
  - `src/session.js` (`playing` 21-25)
  - `src/results.js` (`partStats` 24-44, `resultsModel` 78-115)
  - `src/results-screen.js` (header 51-65)
  - `assets/build-a-band.css` (`.bab-results-failed`)
- Test: `tests/band-score.test.mjs`, `tests/part-events.test.mjs`, `tests/session.test.mjs`, `tests/results.test.mjs`, `tests/results-screen.test.mjs`

**Interfaces:**
- Produces:
  - **`band-score.js`:**
    - `CROWD.rescue = 0.4`.
    - `createBandScore({ parts, failMode = 'nofail' })`.
    - Entry kind `'deploy'` (`{ part, t, kind: 'deploy' }`): counts the part's `deploys`. With `failMode === 'fail'` and the deploying part not failed, every failed part is rescued: `failed = false`, `crowd = CROWD.rescue`, `saves++`.
    - Judgment and phrase entries of a failed part change nothing.
    - With `'fail'`, an entry that leaves a part's crowd at 0 sets `failed = true` and `drops++`.
    - `bandMultiplier` takes the minimum over parts that aren't failed (1 when none).
    - Snapshot parts add `failed`, `drops`, `saves`, `deploys`; the top level adds `bandFailed` (fail mode on, at least one part, all failed).
  - **`part-events.js`:**
    - `guitarEntry` adds `noteTime`: finite or `null`.
    - `onsetTime(detail): number | null`: `detail.t` when `detail.isDefault === true` and `t` is finite.
    - `drumsOverdrive(state): { fill, active } | null`: from `getInstanceState(...).starPower`; fill clamped 0–1.
    - `vocalsOverdrive(state): { fill, active, ready } | null`: from karaoke's `getOverdrive()`.
  - **`session.js`:** `playing.failed: (s) => [{ phase: 'ending', filename: s.filename }, ['pauseSong', 'showResults']]`.
  - **`results.js`:**
    - `resultsModel({ ..., failed = false })` adds `failed: boolean` and `heading: failed ? 'Band failed' : ''`.
    - `partStats` appends `['Overdrives', n]` when `deploys > 0` and `['Dropped out', n]` when `drops > 0`.
  - **`results-screen.js`:** when `model.heading`, a `.bab-results-failed` heading above the stars, and the dialog's `aria-label` starts with it.

- [ ] **Step 1: Write the failing tests:**
  - `band-score.test.mjs`:
    - `no fail: an empty crowd is only for show`: 30 guitar misses give `failed false` and `bandFailed false`.
    - `fail on: an empty crowd drops the part; its notes stop scoring`:
      - guitar and drums with `failMode:'fail'`; 14 guitar misses give `parts.guitar.failed === true` and `drops === 1`
      - then a guitar hit of 100 leaves `parts.guitar.score === 0` and `hits === 0`
      - `bandMultiplier` follows drums alone (a drums hit at ×3 gives `3`)
    - `a bandmate's deploy rescues with a partly refilled meter`: after the drop, `record({part:'drums', t:9, kind:'deploy'})` gives guitar `failed false`, `crowd 0.4`, `saves 1`, and drums `deploys 1`.
    - `a failed part's deploy rescues nobody`.
    - `everyone out is band failed`: a single guitar part, fail on, misses until the crowd is 0, gives `bandFailed === true`.
    - `rewinding replays drops and rescues`: drop at t 1–14, rescue at 20, `rewindTo(15)` gives guitar `failed true` again.
  - `part-events.test.mjs`:
    - `guitarEntry keeps noteTime`: `noteTime: 4.2` passes through; missing gives `null`.
    - `onsetTime`: `{isDefault:true, t:3}` gives `3`; `isDefault:false` gives `null`; `{isDefault:true, t:NaN}` gives `null`.
    - `drumsOverdrive / vocalsOverdrive`: `{starPower:{amount:0.75, active:true}}` gives `{fill:0.75, active:true}`; `null` gives `null`; `{fill:2, active:false, ready:true}` gives `fill 1`.
  - `session.test.mjs`, `band failed ends the song into the results`: from `playing`, `{type:'failed'}` gives phase `ending` and effects `['pauseSong','showResults']`; from `idle` nothing happens.
  - `results.test.mjs`:
    - `band failed heading and overdrive stats`: `failed:true` gives `heading 'Band failed'`. A guitar part with `deploys:2, drops:1` lists `['Overdrives','2']` and `['Dropped out','1']`; zeros list neither.
  - `results-screen.test.mjs`, `a failed band shows the heading`: `.bab-results-failed` text `Band failed`; absent when `heading` is `''`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `apply` the single path used by `record` and the replay.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (all plan 4 ledger tests included).
- [ ] **Step 5: Commit** `feat: fail mode and rescue in the band ledger; Band failed results`.

### Task 8: HUD overdrive bars, noodle zone and dropped-out lanes

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/hud.js` (part elements 80-109, returned API 160-182)
  - `src/hud-model.js` (copy)
  - `assets/build-a-band.css` (after `.bab-od` 374-382 and `.bab-callout` 409-415)
- Test: `tests/hud.test.mjs`, `tests/hud-model.test.mjs`

**Interfaces:**
- Produces:
  - **`hud-model.js`:** `OD_CALLOUT = Object.freeze({ ready: 'Overdrive ready', noodle: 'Noodle it up!', deploy: 'OVERDRIVE!', out: 'DROPPED OUT', saved: 'SAVED!' })`.
  - **HUD methods:**
    - `setOverdrive(part, fraction, active)` (exists) now writes only changes, through `put`.
    - `setReady(part, on: boolean)`: toggles `.bab-od-ready` on the part root.
    - `setNoodle(on: boolean)`: toggles `.bab-noodle` on the guitar root. The root holds a `.bab-noodle-zone` child (built once, `aria-hidden`).
    - `setFailed(part, on: boolean)`: toggles `.bab-failed` on the part root and on its host (the lane slot or strip).
  - Each method is a no-op for a part without a HUD and after `destroy()`. `destroy()` removes `.bab-failed` from every host.
- **CSS:**
  - `.bab-od-ready .bab-od`: pulsing `#5cc8ff` border.
  - `.bab-od-active`: the glow tinted `#5cc8ff`.
  - `.bab-noodle-zone`: a glowing blue band across the guitar lane's lower third, shown only under `.bab-noodle`.
  - `.bab-lane.bab-failed, .bab-strip.bab-failed`: `filter: grayscale(1) brightness(0.6)`.
  - `.bab-part-hud.bab-failed .bab-tag::after { content: ' · OUT' }`.
  - Reduced motion: no pulse.

- [ ] **Step 1: Write the failing tests** (`hud.test.mjs`, existing fake-stage helpers):
  - `overdrive bar, ready pulse and active glow`: `setOverdrive('guitar', 0.5, false)` gives the guitar `.bab-od i` width `50%`; `setReady('guitar', true)` adds `bab-od-ready`; `setOverdrive('guitar', 0.4, true)` adds `bab-od-active`.
  - `noodle zone only on guitar`: `setNoodle(true)` adds `bab-noodle` to the guitar root, which has a `.bab-noodle-zone` child; no other root has the class.
  - `dropped out greys the lane and the HUD; destroy clears it`: `setFailed('drums', true)` adds `bab-failed` to the drums root and to `stage.laneSlot('drums')`. `destroy()` removes it from the slot.
  - `unknown parts and a destroyed HUD are ignored`: `setFailed('bass', true)` and calls after `destroy()` don't throw.
  - `hud-model.test.mjs`: `OD_CALLOUT` values are exactly the five strings above.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: HUD overdrive ready/active, Noodle it up zone and dropped-out lanes`.

### Task 9: The overdrive session (per-song overdrive state)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/overdrive-session.js`
- Test: create `tests/overdrive-session.test.mjs`

**Interfaces:**
- Consumes:
  - `createMeasureClock` and `createOverdriveMeter` (Task 5)
  - `createPhraseTracker`, `createNoodle`, `findGaps`, `itemTimes` (Task 6)
  - `drumsOverdrive`, `vocalsOverdrive` (Task 7)
  - `OD_CALLOUT` and the HUD methods (Task 8)
- Produces: `createOverdriveSession({ parts, beats, guitar, getHud, readDrums, readVocals })`:
  - `parts`: the ledger's parts.
  - `guitar`: `{ phrases, notes, chords } | null`.
  - `getHud`: `() => hud | null` (a remount swaps it).
  - `readDrums`: `() => getInstanceState-shaped state | null`. `readVocals`: `() => getOverdrive() result | null`.
  - Returns:
    - `factorFor(part, t): 1 | 2`: 2 only for guitar while its meter `isActiveAt(t)`.
    - `guitarJudgment(noteTime, hit, t): void`
    - `onset(onsetT, t): boolean`: true when this onset deployed guitar (a noodle deploy while the zone is open and `meter.deploy(t)` succeeded). It calls out `OD_CALLOUT.deploy`.
    - `deployed(part): void`: calls out `OD_CALLOUT.deploy` on that part (drums/vocals deploys).
    - `tick(chartT, t): void`:
      - closes guitar phrases (`meter.gain(t)` per cleared phrase)
      - updates the noodle zone from `noodle.zoneAt(chartT)` while the guitar meter is ready, calling out `OD_CALLOUT.noodle` on entering a gap
      - reads drums and vocals
      - for every part, `setOverdrive(part, fill, active)` and `setReady(part, ready)`
      - calls out `OD_CALLOUT.ready` when a part becomes ready
    - `rewindTo(t)`: meter and tracker; `noodle.reset()`.
    - `loopWrap(chartT)`: `tracker.reopenFrom(chartT)`; `noodle.reset()`.
    - `snapshot(t)`: `{ guitar: {fill, active, ready} | null, drums: {fill, active} | null, vocals: {fill, active, ready} | null, noodle: boolean }`.
  - Drums are ready when `fill >= 0.5 && !active`. A missing or throwing reader gives that part no state; its bar stays as last written.

- [ ] **Step 1: Write the failing tests** (a fake HUD recording `[method, ...args]`; the 2 s-measure beats; guitar phrases `{start:0, end:5}` and `{start:5, end:10}`; notes at 0…10 and 20, so one gap from 10 to 20; "all hits" = hits on 0…9, `t` equal to `noteTime`):
  - `guitar doubles only while its overdrive is active; drums and vocals never` (Review Focus 2):
    - `factorFor('guitar', 1) === 1`
    - after all hits, `tick(12, 12)` and onsets at 12.4, 13 and 13.5 (the last with `t = 13.5`), `factorFor('guitar', 14) === 2`
    - `factorFor('drums', 14) === 1` and `factorFor('vocals', 14) === 1`
  - `a cleared phrase fills a quarter and the bar shows it`: hits on 0…4, `tick(5.5, 5.5)` gives `setOverdrive('guitar', 0.25, false)`.
  - `Overdrive ready and the noodle zone`:
    - after all hits, `tick(12, 12)` gives `callout('guitar','Overdrive ready')`, `setNoodle(true)` and `callout('guitar','Noodle it up!')`
    - a second `tick(12.5, 12.5)` repeats neither callout
  - `three new attacks in the zone deploy once`: `onset(12.4)`, `onset(13)`, `onset(13.5) === true`, `onset(14) === false`, and `callout('guitar','OVERDRIVE!')`.
  - `drums and vocals mirror their engines`: `readDrums` returning `{starPower:{amount:0.5, active:false}}` gives `setReady('drums', true)` and an "Overdrive ready" callout on drums.
  - `missing sources and charts are harmless` (Review Focus 5): `guitar: null`, readers returning `null` or throwing, `beats: []`. `tick` and `snapshot` don't throw, and `snapshot(0).guitar === null`.
  - `rewind restores the bar as it was`: hits on 0…4 and `tick(5.5, 5.5)`, then `rewindTo(5)`, give `snapshot(6).guitar.fill === 0`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: overdrive session: guitar meter, noodle, mirrored drums and vocals, HUD bars`.

### Task 10: Overdrive wired into band sessions (and drums stars after a seek)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/band-runtime.js`: `newSession` 118-174; `EFFECTS.applyDifficulties` 549-574; `mountHud` 251-262 (the OD session reads the HUD through `getHud`); `teardown` 637-687; drum handler 785-795; `song:seek` 812-821; `onGuitarJudgment` 822-828; `winHandlers` 829; returned API 835-848
  - `src/vocals.js` (`armVocals` 29-39, `stopVocals` 81-88)
- Test: `tests/band-runtime.test.mjs` (extend `setup()`: `win.highway.getBeats`, `getPhrases`, `getTime`; `feedBackDrums.getInstanceState`; `lyricsKaraoke.getOverdrive`/`setMicHitThreshold`), `tests/vocals.test.mjs`

**Interfaces:**
- Consumes: `createOverdriveSession` (Task 9); `chartPhrases` (Task 6); `onsetTime` (Task 7).
- Produces:
  - **`newSession`:** adds `od: null`, `odTimer: null`, `drumsThresholds: null`, `failed: new Set()`, `stemClaims: new Set()`, `bandFailed: false`. `failed`, `stemClaims` and `bandFailed` are used by Task 11.
  - **`startOverdrive(s)`:** called at the end of `applyDifficulties`; idempotent.
    - Creates `s.od` from the ledger parts, `hw.getBeats()`, the guitar data (`chartPhrases(hw)` and the filtered notes and chords, guitar only), `getHud: () => s.hud`, a drums reader (`feedBackDrums.getInstanceState(bandDrumCanvas(s))`) and a vocals reader (`s.karaoke.getOverdrive()` when it exists).
    - Starts a `setTimer` chain every `OD_TICK_MS = 100` while `state.phase === 'playing'`. Each tick calls `s.od.tick(hw.getTime(), displayTime(s))`, then M6 (R20): when `getInstanceState(canvas).starThresholds` has a larger last value than `s.drumsThresholds`, store it and call `s.score.setStarThresholds('drums', th)`, then `refreshHud(s, true)`.
  - **Guitar judgments:** `record` gets `{ ...entry, factor: s.od ? s.od.factorFor('guitar', entry.t) : 1 }`. When the guitar part isn't failed in the snapshot taken before the entry, `s.od.guitarJudgment(entry.noteTime, entry.kind === 'hit', entry.t)` runs.
  - **`notedetect:onset` (window handler):** deduped with its own WeakSet. With `scoring()` and `onsetTime(detail)` finite: when `s.od.onset(t, displayTime(s))` returns true, record `{ part: 'guitar', t: displayTime(s), kind: 'deploy' }`.
  - **`drums:sp-activate`:** on the band's drum canvas, `s.od.deployed('drums')` and record a drums `deploy`. Drums judgment entries never get a factor.
  - **`karaoke:od-activate`:** `s.od.deployed('vocals')` and record a vocals `deploy`.
  - **`song:seek`:** after the existing ledger rewind, `s.od.rewindTo(d.to)`. A `loop-wrap` calls `s.od.loopWrap(d.to)`.
  - **Teardown:** clear the timer; `s.od = null`.
  - **API:** `overdrive(): snapshot | null` = `s.od.snapshot(displayTime(s))`.
  - **`vocals.js`:**
    - `armVocals(api, vocalsPrefs)` also calls `api.setMicHitThreshold(vocalsPrefs.micHitDb)` when it is a function (guarded).
    - `stopVocals` calls `api.setMicHitThreshold(null)`.

- [ ] **Step 1: Write the failing tests** (`band-runtime.test.mjs`; drive time with `clock.t` and a fake `highway.getTime`; fire ticks with `timers.fire(100)`):
  - `guitar overdrive doubles guitar points while active` (Review Focus 2):
    - in a playing session with phrases and a gap, deliver nine hits (`noteTime` 0…8) and tick past the phrase twice to reach half a bar
    - emit three `notedetect:onset` (`isDefault:true`) in the gap, each dispatched twice
    - one deploy entry gives `snapshot().parts.guitar.deploys === 1`
    - then a guitar hit of 100 scores 200
  - `drums and vocals points are never doubled`: with drums star power active (`spActive:true`, `points:120`) and a karaoke phrase of 1600, the ledger adds exactly 120 and 1600.
  - `drums sp-activate and karaoke od-activate record deploys`: each gives that part's `deploys === 1`. A `drums:sp-activate` on another canvas does nothing.
  - `the tick mirrors drums and vocals bars`: after `fire(100)`, `.bab-part-hud[data-part="drums"] .bab-od i` has width `50%` with `getInstanceState` amount `0.5`.
  - `drums stars use the full chart after a seek (M6)`:
    - `getInstanceState` reports thresholds `[60,120,200,450,750,1090]`, and later (after a seek) `[6,12,20,45,75,109]`
    - after both ticks, a drums score of 300 gives `parts.drums.stars` from the first array (`starsFromScore(300, first)`)
  - `rewinding restores the guitar bar` (Review Focus 1): a gain, then `song:seek {from: 30, to: 5}`, gives `overdrive().guitar.fill === 0`.
  - `teardown stops the overdrive tick`: after Next song, no pending timer has a delay of `100`.
  - `vocals.test.mjs`, `the mic-hit threshold goes to karaoke and is cleared`: `armVocals(api, {micHitDb:-27, ...})` records `setMicHitThreshold(-27)`; `stopVocals` records `setMicHitThreshold(null)`. An API without the method is fine.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the plan-5 note comment at 791-792 and say instead that drums never take a factor (R4).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band sessions run overdrive for every part; drums stars measured on the full chart`.

### Task 11: Fail mode wired into band sessions: drop, stem mute, rescue, band failed

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/stem-claims.js`
- Modify: `src/band-runtime.js` (`EFFECTS.mount` where the ledger is created 533-537, `record` 347-351, `EFFECTS` (new `pauseSong`), `showResults` 609-625, `teardown`, `song:seek`)
- Test: create `tests/stem-claims.test.mjs`; modify `tests/band-runtime.test.mjs` (extend `setup()` with `feedBack.capabilities` `{ claim, release, dispatch }` recording calls, `win.stems.getState()`, and an `#audio` element with `pause()`)

**Interfaces:**
- Consumes: Task 7's ledger fields; Task 8's `setFailed` and `OD_CALLOUT`.
- Produces:
  - **`stem-claims.js`:**
    - `FAIL_CLAIM_PREFIX = 'build_a_band:fail:'`.
    - `stemIdFor(part, partPrefs, stemIds: string[]): string | null` (R13):
      - guitar Lead/Rhythm: the first id equal to `guitar` or starting with `guitar`
      - guitar Bass: `bass`
      - drums: `drums`; vocals: `vocals`
      - only ids present in the list; never `other`
    - `muteStem({ caps, part, stemId }): Promise<boolean>`: `caps.claim({...})` then `caps.dispatch({ capability: 'stems', command: 'mute', requester: 'build_a_band', args: { id: stemId, claimId }, claim: { claimId, capability: 'stems' } })`. Resolves `true` when the dispatch status is `'handled'`; `false` without `caps`, on any throw or rejection, or on any other status.
    - `restoreStem({ caps, part }): Promise<void>`: dispatches `restore` with `{ claimId }`, then `caps.release({ capability: 'stems', claimId, requester: 'build_a_band' })`, every step guarded.
  - **Runtime:**
    - The ledger is created with `failMode: s.prefs.failMode`.
    - After every `record` and after a seek rewind, `syncFailures(s, { silent })` compares `snapshot.parts[id].failed` with `s.failed`:
      - **Newly failed:** `hud.setFailed(id, true)`. Unless silent: callout `OD_CALLOUT.out` and toast "`<Part label>` dropped out: overdrive brings them back". Mute its stem when `stemIdFor` finds one (and add the part to `s.stemClaims`).
      - **Back:** `setFailed(id, false)`. Unless silent: callout `OD_CALLOUT.saved`. Restore its stem claim.
    - When `snapshot.bandFailed` and the phase is `playing`: `s.bandFailed = true; dispatch({ type: 'failed' })`.
    - **`EFFECTS.pauseSong(s)`:** R15. Capabilities pause; when that is missing, throws, or its result's `status !== 'paused'`, `doc.getElementById('audio').pause()` if not already paused.
    - **`showResults`:** passes `failed: s.bandFailed`.
    - **Teardown:** restores every part in `s.stemClaims` and clears it.
    - **`mountHud`:** a remount re-applies `setFailed(id, true)` for every part in `s.failed`.

- [ ] **Step 1: Write the failing tests:**
  - `stem-claims.test.mjs`:
    - `stemIdFor picks the part's stem and never other`:
      - `('guitar', {arrangement:'Lead'}, ['guitar_lead','drums']) === 'guitar_lead'`
      - `('guitar', {arrangement:'Bass'}, ['bass']) === 'bass'`
      - `('guitar', {arrangement:'Lead'}, ['other']) === null`
      - `('vocals', {}, []) === null`
    - `muteStem claims, then mutes by id`: the recorded calls are `claim` with `claimId 'build_a_band:fail:drums'`, then `dispatch` with `command 'mute'` and `args {id:'drums', claimId:'build_a_band:fail:drums'}`. Resolves `true`.
    - `muteStem without capabilities resolves false`.
    - `restoreStem restores then releases`.
  - `band-runtime.test.mjs` (Fail on, guitar and drums, stems `['guitar','drums']`):
    - `an empty crowd drops the player: grey lane, stem muted, toast` (Review Focus 3):
      - 14 guitar misses give the guitar lane slot class `bab-failed`
      - a `mute` dispatch for `guitar`
      - a toast `Guitar dropped out: overdrive brings them back`
    - `a bandmate's overdrive rescues them`: `drums:sp-activate` on the band canvas gives `bab-failed` removed, a `restore` dispatch, and guitar crowd `0.4`.
    - `no fail never drops`: the same misses with `failMode:'nofail'` give no `mute` dispatch.
    - `everyone out: the song pauses and the results say Band failed`:
      - a solo guitar, Fail on, misses until empty
      - `phase() === 'ending'`, the capabilities `pause` dispatch was made (or `#audio.pause` ran when it isn't `'paused'`)
      - `.bab-results-failed` reads `Band failed`
    - `a seek back before the drop restores the player silently` (Review Focus 1): drop at t 1–14, `song:seek {from: 20, to: 0.5}` gives the lane un-greyed, a `restore` dispatch, and no `SAVED!` callout.
    - `every exit path releases the stem claim`: for Next song, Play again, `song:stop` and `screen:changing` away, after a drop, a `restore` and a `release` for the claim were recorded.
    - `a song without that stem still drops the player`: stems `[]` gives the lane greyed and no dispatch.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Fail on: players drop out (grey lane, stem muted), overdrive rescues, Band failed ends the song`.

### Task 12: Band screen mic-hit sensitivity check

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/prefs.js` (`PART_DEFAULTS` 10-14, `normalizePart` 47-58)
  - `src/level-meter.js` (`createLevelMeter` 33-90)
  - `src/band-screen.js` (vocals light in `startMeter` 271-290, part setup 365-391, `stopLight`)
  - `screen.html` (vocals column, after the `.bab-signal` at 44)
  - `assets/build-a-band.css` (after the signal styles 135-148)
- Test: `tests/prefs.test.mjs`, `tests/level-meter.test.mjs`, `tests/band-screen.test.mjs`

**Interfaces:**
- Consumes: karaoke's `lyricsKaraoke.micHit` (Task 4), through `karaokeApi(win)`.
- Produces:
  - **Prefs:**
    - `MIC_HIT_DB_MIN = -48`, `MIC_HIT_DB_MAX = -12`, `MIC_HIT_DB_STEP = 3`, `MIC_HIT_DB_DEFAULT = -30`.
    - `clampMicHitDb(v)`: rounded and clamped; a non-number gives the default.
    - `parts.vocals.micHitDb` is normalised with it.
  - **`createLevelMeter({ ..., frameSize })`:**
    - when `frameSize` is given, `analyser.fftSize = frameSize`, and `onLevel(level, ctx.currentTime)` is called at most once per `frameSize / ctx.sampleRate` seconds
    - without it, behaviour is unchanged
    - the analyser stays unconnected
  - **Markup:** `<div class="bab-michit">` holding:
    - `<span class="bab-label">Mic hit</span>`
    - `<input type="range" class="bab-michit-db" min="-48" max="-12" step="3" aria-label="Mic hit level">`
    - `<span class="bab-michit-meter"><i></i><b></b></span>`: the level, and the threshold tick
    - `<span class="bab-michit-light"></span>`
    - `<span class="bab-michit-text">Tap the mic</span>`
  - **Band screen:**
    - The vocals light starts its meter with `frameSize: 2048`. Each reading becomes `db = 20·log10(max(level, 1e-5))`; the meter `<i>` width is `(db + 60) / 60` clamped 0–1, and the threshold `<b>` sits at `(micHitDb + 60) / 60`.
    - The reading goes to a detector from `micHit.createDetector({ thresholdDb: prefs.parts.vocals.micHitDb })`. A hit adds `.bab-hit` to `.bab-michit-light` for 300 ms.
    - The slider shows and saves `micHitDb` on `change`, and updates the detector.
    - Without `micHit`: the block gets `.bab-disabled`, the slider is disabled, and the text reads "Needs Lyrics Karaoke".
    - Stopping the vocals light clears the flash timer.

- [ ] **Step 1: Write the failing tests:**
  - `prefs.test.mjs`, `micHitDb defaults, clamps and rounds`:
    - missing gives `-30`; `-70` gives `-48`; `0` gives `-12`; `-29.6` gives `-30`; `'x'` gives `-30`
    - `savePrefs({parts:{vocals:{micHitDb:-24}}})` round-trips
  - `level-meter.test.mjs`, `frameSize sets the analyser and paces readings`:
    - fake ctx `sampleRate 48000` and `currentTime` stepping by `1/60` per frame
    - `frameSize: 2048` gives `analyser.fftSize === 2048` and one `onLevel` per ≥ 0.0427 s (four readings over frames 0…9: frames 0, 3, 6 and 9)
    - each reading carries the ctx time
    - nothing calls `connect` on the analyser
  - `band-screen.test.mjs`:
    - `the mic-hit check lights on a hit and saves the level`:
      - with `winExtra.lyricsKaraoke` exposing `apiVersion: 1`, the six required functions and `micHit.createDetector`, and a vocals mic picked
      - fake media levels of `0.001` then `0.03` (−60 → −30.5 dB, threshold −33 after a slider change to `-33`)
      - `.bab-michit-light` gains `bab-hit`
      - prefs hold `micHitDb: -33`
    - `without karaoke the check is disabled`: `.bab-michit` has `bab-disabled`, the slider is disabled, and the text is `Needs Lyrics Karaoke`.
    - `leaving the screen stops the check`: after `screen:changing` away, no further `onLevel` reaches the light.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band screen mic-hit check: live level, threshold and Tap the mic light (silent)`.

### Task 13: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 5, and records the results in the plan 5 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`. Nothing may play. The real mic and a real count-in are never started.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with every repo on `feature/build-a-band-stage`: core, build-a-band, drums, note_detect, lyrics_karaoke, stems, scorecard. If stems isn't linked in `dev-plugins/`, record that and skip the stem checks.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, else start `launch-debug.sh`.
  3. Reload with `debug/cdp-reload.mjs`.
  4. Never quit a running copy. If one blocks the debug launch, record "acceptance blocked" and stop.
- [ ] **Step 2: Snapshot and force silence.**
  1. Record `build_a_band.prefs.v1` and `countdownBeforeSong`.
  2. Set `parts.vocals.hearMyself = false` and `failMode = 'fail'`.
  3. Confirm these are functions: `lyricsKaraoke.getOverdrive`, `lyricsKaraoke.setMicHitThreshold`, `lyricsKaraoke.micHit.createDetector`, `feedBackDrums.getInstanceState`, `feedBack.capabilities.dispatch`.
- [ ] **Step 3: Band screen.**
  1. The vocals column shows `.bab-michit` with the slider at the stored value.
  2. Set it to `-27` and confirm `build_a_band.prefs.v1` holds `parts.vocals.micHitDb: -27`.
  3. Do not open the mic: the light is checked by markup only.
- [ ] **Step 4: Full band, held.**
  1. Pick a song with phrases, a drums chart, vocal pitch and stems. Hold autoplay with the plan 1 technique (`holdAutoplay` on `song:loading`, audio muted, pause guard), then Go.
  2. With `#audio.paused === true`, confirm:
     - `lyricsKaraoke.getMicHitThreshold() === -27`
     - every `.bab-part-hud .bab-od i` is `0%`
     - `__buildABandRuntime.overdrive()` returns all three parts
- [ ] **Step 5: Guitar overdrive by synthetic events.**
  1. Read `highway.getPhrases()` and pick two phrases. For each, dispatch `notedetect:hit` on `window` (`isDefault:true, counted:true, hit:true, points:100, multiplier:1, noteTime:` each filtered note time in the phrase).
  2. `feedBack.seek(<phrase end + 0.6>, 'acceptance')` while paused. After 200 ms the guitar bar reads `50%` and "Overdrive ready" called out.
  3. Seek into a gap of ≥ 2 s (computed from the filtered notes). Confirm `.bab-noodle` and the "Noodle it up!" callout.
  4. Dispatch three `notedetect:onset` (`isDefault:true`) with `t` 0.5, 1.0 and 1.5 s into the gap. Confirm `overdrive().guitar.active === true` and the "OVERDRIVE!" callout.
  5. One guitar hit of 100 adds 200 to the guitar score.
- [ ] **Step 6: Drums and vocals.**
  1. Emit `drums:sp-activate` on `feedBack` with `canvas: document.querySelector('.bab-drum-canvas')`. Confirm the drums `deploys === 1`.
  2. Emit `karaoke:od-activate {fill:0.5, t}`. Confirm the vocals `deploys === 1`.
  3. A drums hit with `points:240, spActive:true` adds exactly 240.
- [ ] **Step 7: Fail and rescue.**
  1. Dispatch guitar misses until the guitar crowd is 0. Confirm:
     - the guitar lane has `bab-failed`
     - the toast shows
     - the guitar stem is muted through a claim (`stems.getState()` shows it off; capabilities `inspect` lists the claim)
  2. Emit `drums:sp-activate` on the band canvas: the lane un-greys, the stem is back on, and guitar crowd is `0.4`.
  3. Seek back before the drop: no "SAVED!" callout.
  4. Then drop guitar, drums (misses) and vocals (`karaoke:phrase` with `streak:0`) in turn. Confirm the results show "Band failed", `phase() === 'ending'`, and `#audio.paused === true`.
- [ ] **Step 8: Exit paths.**
  1. Press Enter (Next song): the band screen is active.
  2. Confirm `stems.getState()` has every stem as before the song, no Build-a-Band claim remains in capabilities `inspect`, and `lyricsKaraoke.getMicHitThreshold()` is back to karaoke's default.
  3. Confirm note_detect's detection is in the state it was before the session (plan 4 ledger recheck).
- [ ] **Step 9: Clean up.**
  1. Restore the Step 2 values.
  2. Leave the band screen.
  3. Confirm nothing is playing and the mic is off (`lyricsKaraokeDiag().micState === 'off'`).
  4. Record results and commit SHAs in the ledger.

---

## Deviations from the spec in this plan

- **Vocals double inside karaoke, not through the band's factor** (R4). KRB-8, which the spec places in karaoke, doubles karaoke's own phrase points, so the band treats vocals like drums.
- **Stems changes after all** (R14): claims stack, and automation mutes fade (~12 ms). The spec expected no stems change and an existing fade.
- **No Rock Band rescue timer,** as the spec says. Deploys by a dropped-out player never rescue (R12).
- **Guitar charts with neither phrases nor sections earn no overdrive** (R8).
- **A paused song never deploys vocal overdrive** (R6). Guitar onsets in a gap can (the acceptance relies on it).

## Later plans (each written when the previous one has landed)

6. **Drum sound modes.** Song drums, Rock Band and My kit only, through stems' `mute`/`restore` claims (using the stored `soundMode`; `drums:hit`/`miss` are the triggers). Claims now stack with the fail-mode mute and fade over ~12 ms (Task 2).
7. **Full screen and sidebar.**
   - Full screen stage (using the stored `fullScreenStage`), and the hover transport with the time readout.
   - The sidebar over the player.
   - Settings over a paused song.
