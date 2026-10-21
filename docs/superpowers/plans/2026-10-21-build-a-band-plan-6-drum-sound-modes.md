# Build-a-Band Plan 6: drum sound modes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The drums part's sound mode works:
- **Song drums** leaves the drum stem alone.
- **Rock Band** drops the drum stem on a miss or overhit and brings it back on the next good hit.
- **My kit only** mutes the drum stem for the whole song, so the only drums you hear are your pads through the loaded kit.

All of it goes through stems' non-persisting claim mutes, which stack with fail mode's mute.

**Architecture:**
- **Stems:** an automation mute is never written to the song's saved mutes, and a player's change to a claimed stem becomes what the last restore gives back.
- **Build-a-Band:**
  - A pure state machine, `src/drum-sound.js`, says whether the mode wants the stem muted.
  - `stem-claims.js` takes the claim id.
  - `band-runtime.js` turns each change of that wanted state into one claim operation on the `drums` stem. It uses plan 5's per-part op chain (`queueStemOp`) under its own key, and re-applies the mute whenever stems builds its graph.
- The drums plugin is unchanged: pad hits already always play the kit.

**Tech Stack:** Vanilla ES modules, node:test. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read "Drum sound modes" (190-198) and the band screen's drums extras (75). The binding rulings are in `.superpowers/sdd/plan-6-inputs.md` (R1–R18 and the verified facts). Where the spec and a ruling differ, the ruling wins.

**This is plan 6 of 7.** Plans 1 (one-clock stage), 2 (band screen and sessions), 3 (vocals strip), 4 (HUD, scoring and results) and 5 (overdrive and fail) have landed. The last plan is listed at the end.

## Global Constraints

- **Repos and branches.** Repos live under `~/Desktop/repos/feedback-upstream/`. The branch in every repo is `feature/build-a-band-stage`.

  | Repo | State at plan start | Tasks |
  |---|---|---|
  | `feedBack-plugin-stems` | branch exists, `47949be` | 1 |
  | `feedBack-plugin-build-a-band` | branch exists, `57faf16` | 2–5 |
  | core `feedBack`, `feedBack-plugin-drums` | read-only (R6) | — |

- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
  - One commit per task.
- **Line endings:** every file this plan touches is LF. Check with `file` before editing anyway.
- **Test commands:**
  - build-a-band: `npm test`
  - stems: `npm test`
- **NO SOUND:**
  - Nothing in this plan plays audio.
  - Tests use fake capabilities that only record calls.
  - No task launches the app. Task 6 is the controller's silent check, and it never sends MIDI (a MIDI note plays the kit).
- **No push**, no PRs and no new GitHub repos.
- **Values (rulings):**
  - Modes, as stored: `'song'`, `'rockband'`, `'kit'`. Labels: "Song drums", "Rock Band", "My kit only".
  - Sound claim id: `SOUND_CLAIM_ID = 'build_a_band:sound:drums'` (R3). Its `queueStemOp` key: `'sound:drums'`.
  - The fail claim stays `build_a_band:fail:drums`.
  - Fade: stems' existing `CLAIM_FADE_TC_S = 0.004` (~12 ms). Unchanged.
  - Triggers (R9): `drums:hit` restores; `drums:miss` and `drums:overhit` mute. Only events whose `detail.canvas` is the band's drum canvas count.
- **Stems window event:** `stems:state` with `detail.event === 'provider-ready'` and `detail.stemIds` (stems main.js:1310-1316).
- **Styles:** none. The band screen's existing segment buttons are reused.

## Review Focus

1. **A mute still in flight when a hit, a seek or teardown arrives.** The stem must end in the last wanted state, and every restore and release must follow its mute, also across Play again. (Task 4 pending-mute test; Task 3 Play again ordering test.)
2. **Stems builds its graph after `song:ready`, or rebuilds it.** My kit only must still end muted: stems' teardown clears claim snapshots (main.js:212-241). (Task 3 late-graph test.)
3. **Fail mode and Rock Band both holding the drum stem.** Each claim is restored only by its own rule. Every exit path releases both. (Task 4 stacking test; Task 3 exit-path test.)
4. **A song without a drum stem, no stems plugin, no capability host, or drums not playing.** No dispatch, no throw, and the song's drums play. (Task 3 absent-sources test; Task 5 band-screen test.)
5. **The player touching the stems mixer while a claim holds the drums.** Nothing is saved as muted for the song, and the player's change survives the restore. (Task 1 tests.)

---

### Task 1: Stems never saves an automation mute; player changes survive the restore

**Repo:** `feedBack-plugin-stems` (R13)

**Files:**
- Modify:
  - `src/claims.js` (two exports after `clearClaim` 63-68)
  - `src/main.js`: `setStemVolume` 160-169; stem button `onclick` 446-458; `stemsApi.setMuted` 1541-1554; the import at 5
  - `README.md` ("Capability Provider", after the claims-stack paragraph at 118)
- Test: `tests/claims.test.mjs`

**Interfaces:**
- Produces (`src/claims.js`, pure):
  - `persistableStems(stems: Array<{ id, on }>, snapshots: Map): Array<{ id, on }>`
    - One entry per stem, in order.
    - A stem held by any claim reports that claim's `prevOn` (stacked claims carry the same value). Any other stem reports its own `on`.
  - `noteUserChange(snapshots: Map, id: string, { on, vol } = {}): void`
    - For every snapshot entry with `entry.id === id`: sets `prevOn = on` when `on` is a boolean, and `prevVol = vol` when `vol` is a finite number.
    - Nothing else changes, and an id no claim holds is a no-op.
- **`main.js`:**
  - Both `saveMuted(...)` calls become `saveMuted(storageSongKey(), persistableStems(S.stemState, claimSnapshots))`.
  - The button `onclick` and `setMuted` call `noteUserChange(claimSnapshots, s.id, { on: s.on })` after changing `s.on`, before saving.
  - `setStemVolume` calls `noteUserChange(claimSnapshots, stem.id, { vol: clamped })` when `options.persist !== false`.

- [ ] **Step 1: Write the failing tests** in `tests/claims.test.mjs`:
  - `a claimed stem is saved with the player's own state`:
    - stems `drums {on:true, vol:0.8}` and `guitar {on:false, vol:1}`; `recordClaimMute(m, 'a', drums)`; then set `drums.on = false`
    - `persistableStems([drums, guitar], m)` deep-equals `[{id:'drums', on:true}, {id:'guitar', on:false}]`
  - `stacked claims save the same pre-claim state`: claims `'a'` then `'b'` on drums. Before and after `releaseClaim(m, 'a')`, `persistableStems` gives drums `on: true`.
  - `a player change during a claim is what the last restore gives back`:
    - claims `'a'` and `'b'` on drums `{on:true, vol:0.8}`; `noteUserChange(m, 'drums', {vol:0.5})`
    - `releaseClaim(m, 'a')` deep-equals `[]`
    - `releaseClaim(m, 'b')` deep-equals `[{id:'drums', on:true, vol:0.5}]`
    - and with `{on:false}`, the last release gives `on:false`
  - `noteUserChange ignores unclaimed stems and junk`:
    - `noteUserChange(m, 'bass', {on:false})` leaves `m` deep-equal to before
    - `{on:'x', vol:NaN}` changes nothing
  - Source shape, using `MAIN` and `fnBody`:
    - `every saveMuted call saves persistableStems`: every match of `/saveMuted\(/` in `MAIN` is followed by `storageSongKey(), persistableStems(S.stemState, claimSnapshots)`, and there are 2.
    - `player changes reach the claim snapshots`:
      - `fnBody(MAIN, 'function setStemVolume(')` contains `noteUserChange(claimSnapshots, stem.id`
      - `fnBody(MAIN, 'setMuted(id, muted) {')` contains `noteUserChange(claimSnapshots, s.id`
      - the 600 characters after `btn.onclick = (event) =>` contain `noteUserChange(claimSnapshots, s.id` before `saveMuted(`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block. Add one README sentence after the claims-stack paragraph: a stem held by a claim is saved with the player's own on/off, never the automation mute, and a change the player makes while it is held is what the last restore gives back.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, the whole suite.
- [ ] **Step 5: Commit** `fix: an automation mute is never saved with the song; player changes survive the restore`.

### Task 2: The drum sound mode state machine and a claim id for stem mutes (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/drum-sound.js`
- Modify: `src/stem-claims.js` (`claimIdFor` 9, `muteStem` 28-42, `restoreStem` 46-56, header comment 1-5)
- Test: create `tests/drum-sound.test.mjs`; modify `tests/stem-claims.test.mjs`

**Interfaces:**
- Produces:
  - **`src/drum-sound.js`:** `createDrumSound(mode)` → `{ mode, muted(): boolean, judge(type): boolean, seek(): boolean }` (R2, R16)
    - `mode` is `'song' | 'rockband' | 'kit'`. Anything else becomes `'song'`.
    - `muted()` is the wanted state:
      - `'song'`: always `false`
      - `'kit'`: always `true`
      - `'rockband'`: starts `false`
    - `judge(type)`: in `'rockband'`, `'miss'` and `'overhit'` set muted and `'hit'` clears it. Returns `true` only when `muted()` changed. Every other mode or type returns `false`.
    - `seek()`: in `'rockband'`, clears muted and returns whether it changed. Otherwise `false`.
  - **`src/stem-claims.js`:**
    - `export const SOUND_CLAIM_ID = 'build_a_band:sound:drums'`.
    - `muteStem({ caps, part, stemId, claimId = FAIL_CLAIM_PREFIX + part })` and `restoreStem({ caps, part, claimId = FAIL_CLAIM_PREFIX + part })` use `claimId` everywhere they used the fail id.
    - Behaviour with the default is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `drum-sound.test.mjs`:
    - `song drums never mute`: `createDrumSound('song')` gives `muted() === false`, `judge('miss') === false`, `seek() === false`, and `mode === 'song'`.
    - `my kit only is muted for the whole song`: `createDrumSound('kit')` gives `muted() === true`. `judge('hit')` and `seek()` return `false`, and it stays muted.
    - `rock band: a miss or overhit drops out, the next hit comes back`:
      - starts unmuted
      - `judge('miss') === true` and muted
      - `judge('overhit') === false` (no change)
      - `judge('miss') === false`
      - `judge('hit') === true` and unmuted
      - `judge('hit') === false`
      - `judge('overhit') === true`
    - `rock band: a seek brings the drums back`: after a miss, `seek() === true` and unmuted; `seek()` again is `false`.
    - `unknown modes and judgments`: `createDrumSound('loud').mode === 'song'`; in `'rockband'`, `judge('sp-activate') === false`.
  - `stem-claims.test.mjs`, `mute and restore take a claim id`:
    - `SOUND_CLAIM_ID === 'build_a_band:sound:drums'`
    - `muteStem({ caps, part:'drums', stemId:'drums', claimId: SOUND_CLAIM_ID })` records `claim` with `claimId: SOUND_CLAIM_ID`, then `dispatch` with `args {id:'drums', claimId: SOUND_CLAIM_ID}` and `claim {claimId: SOUND_CLAIM_ID, capability:'stems'}`
    - `restoreStem({ caps, part:'drums', claimId: SOUND_CLAIM_ID })` records `restore` and `release` with it
    - the existing default-id tests stay unchanged
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reword the `stem-claims.js` header: fail mode's and the drum sound mode's stem mutes.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: drum sound mode state machine; stem mutes take a claim id`.

### Task 3: Sound modes in band sessions: My kit only, the stems graph, and every exit

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `src/band-runtime.js`:
  - imports 19
  - `newSession` 131-202
  - `dropPart` 310-319
  - new helpers after `restoreFailedStem` 420-425
  - `waitForSplitDown` 548 and `applyDifficulties` 738 (call sites)
  - teardown 879-880
  - `winHandlers` 1083-1085
  - API 1091-1106
- Test: `tests/band-runtime.test.mjs`

**Interfaces:**
- Consumes: `createDrumSound` and `SOUND_CLAIM_ID` (Task 2); `muteStem`, `restoreStem` and `stemIdFor` (`stem-claims.js`); `queueStemOp` and `songStemIds` (runtime).
- Produces:
  - **`newSession`** adds:
    - `drumSound: null`: the session's `createDrumSound` result
    - `soundClaim: false`: a sound mute was sent and not yet restored
  - **`startDrumSound(s)`:**
    - Idempotent. Runs only when `s.score` exists and `s.scoreParts.includes('drums')` (R8).
    - When `s.prefs.parts.drums.soundMode !== 'song'`: `s.drumSound = createDrumSound(soundMode)`, then `syncDrumSound(s)`.
    - Called right after both `startOverdrive(s)` calls.
  - **`syncDrumSound(s, { force = false } = {})`:**
    - `want = !!(s.drumSound && s.drumSound.muted())`.
    - **Wanted muted:**
      - When `stemIdFor('drums', s.prefs.parts.drums, songStemIds())` finds no stem, or `fb.capabilities` is missing, do nothing (a later `provider-ready` retries).
      - Otherwise, when `!s.soundClaim || force`: `s.soundClaim = true`, then `queueStemOp('sound:drums', () => muteStem({ caps, part: 'drums', stemId, claimId: SOUND_CLAIM_ID }))`.
    - **Not wanted, while `s.soundClaim`:** `s.soundClaim = false`, then `queueStemOp('sound:drums', () => restoreStem({ caps, part: 'drums', claimId: SOUND_CLAIM_ID }))`.
  - **`releaseDrumSound(s)`:** `s.drumSound = null`, then `syncDrumSound(s)`, so a held claim is restored and released.
    - Called from `dropPart` when `id === 'drums'`.
    - Called from teardown, next to the fail-claim restores.
  - **Window handler `stems:state`:** when `detail.event === 'provider-ready'` and `scoring()` gives a session with `drumSound`, run `syncDrumSound(s, { force: true })` (R4).
  - **API:** `drumSound()` → `{ mode, muted: s.soundClaim }` for the current session's `drumSound`, else `null` (R17).

- [ ] **Step 1: Write the failing tests** (`band-runtime.test.mjs`). Add `const STEM_ITEM = { ...DRUM_ITEM, stem_ids: ['guitar', 'drums'] }` and `const SOUND_CLAIM = 'build_a_band:sound:drums'`, and filter dispatches by `args.claimId === SOUND_CLAIM`.
  - `My kit only mutes the drum stem under its own claim`:
    - `prefsWith({ drums: { soundMode: 'kit' } })`, `loadSong(STEM_ITEM)`
    - one `claim` with `claimId: SOUND_CLAIM`
    - one stems `mute` with `args {id:'drums', claimId: SOUND_CLAIM}`
    - `rt.drumSound()` deep-equals `{mode:'kit', muted:true}`
  - `the stems graph arriving after song:ready still gets the mute` (Review Focus 2):
    - `const ids = []; setup({ stems: ids })`; kit; `loadSong(STEM_ITEM)` gives no stems dispatch
    - `ids.push('guitar', 'drums')`; `fireWin('stems:state', { event: 'provider-ready', stemIds: ids })` gives one sound `mute`
    - a second provider-ready gives a second sound `mute` and no `restore`
    - `fireWin('stems:state', { event: 'state' })` gives nothing more
  - `song drums never claim; nothing without a playing drums part` (Review Focus 4). Each of these gives no stems dispatch for `SOUND_CLAIM` and `rt.drumSound() === null`:
    - `soundMode: 'song'`
    - kit with `drums: { on: false }`
    - kit with `setup({ drumLane: false })` (the lane fell back to guitar only)
  - `no capability host or no drum stem: no dispatch, no throw` (Review Focus 4):
    - kit with `setup({ caps: false })`, then a provider-ready: no throw, and `rt.drumSound().muted === false`
    - kit with `setup({ stems: ['guitar'] })` on `STEM_ITEM`: no sound dispatch
  - `every exit path restores and releases the kit claim` (Review Focus 3; the same exits as plan 5's fail-claim test: Next song, Play again, `song:stop`, `screen:changing` away, and `dispose()`):
    - after `await flush()`, one sound `restore` and one `release` with `claimId: SOUND_CLAIM`, restore before release
    - `rt.drumSound() === null` once idle
  - `Play again: the replay's kit mute follows the old restore and release` (Review Focus 1):
    - `holdMutes(env)`; kit; `song:ended`; `rt.again()`; `loadSong(STEM_ITEM)`
    - `capKinds` is `['claim', 'dispatch:mute']` until `held[0]()`
    - after `held[0]()` and a flush: `[..., 'dispatch:restore', 'release', 'claim', 'dispatch:mute']`
  - `pausing changes nothing`: kit; set `fb.isPlaying = false`, fire `timers.fire(100)` twice. No sound `restore`, and `rt.drumSound().muted === true` (R10).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (every plan 5 fail-claim test included).
- [ ] **Step 5: Commit** `feat: My kit only mutes the drum stem for the song through its own stems claim`.

### Task 4: Rock Band: drum judgments drive the drum stem

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `src/band-runtime.js` (`drumHandler` 979-989; `song:seek` 1025-1041)
- Test: `tests/band-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 3's `s.drumSound` and `syncDrumSound`; `songPaused(s)` (1060-1062); `bandDrumCanvas(s)`.
- Produces:
  - **`drumHandler(type)`:** besides recording the entry, when `s.drumSound` and `e.detail.canvas === bandDrumCanvas(s)`:
    - an `'overhit'` while `songPaused(s)` is ignored (R10)
    - otherwise, when `s.drumSound.judge(type)` returns true, `syncDrumSound(s)`
    - This runs whether or not the drums part has dropped out (R9).
  - **`song:seek`:** before the existing `loop-wrap` and rewind branches, any seek with finite `from`/`to` in a scoring session runs `syncDrumSound(s)` when `s.drumSound.seek()` returns true (R11).

- [ ] **Step 1: Write the failing tests** (`band-runtime.test.mjs`; `rb = prefsWith({ drums: { soundMode: 'rockband' } })`, `STEM_ITEM`, `lane = mounts[0].drumCanvas`):
  - `Rock Band: a miss drops the drum stem, the next hit brings it back`:
    - after `loadSong`, no sound dispatch
    - `fb.emit('drums:miss', { canvas: lane, multiplier: 1, combo: 0 })` gives one sound `mute` and `rt.drumSound().muted === true`
    - a second miss sends nothing more
    - `fb.emit('drums:hit', { canvas: lane, points: 30, multiplier: 1, combo: 1 })`, then `await flush()`, gives one sound `restore` then one `release`, and `muted === false`
    - a second hit sends nothing more
  - `an overhit drops it too, but not while paused` (R10):
    - `fb.isPlaying = false`, then an `overhit` on `lane` sends nothing
    - `fb.isPlaying = true`, then an `overhit` gives one sound `mute`
  - `another canvas's judgments are ignored`: a `miss` with `canvas: doc.createElement('canvas')` sends nothing.
  - `drums alone on #highway follow the mode too`: `prefsWith({ guitar: { on: false }, drums: { soundMode: 'rockband' } })` and a `miss` with `canvas: highwayCanvas` give one sound `mute`.
  - `any seek brings the drums back` (R11). After a miss, each of these gives a sound `restore`:
    - `song:seek {from: 20, to: 5}`
    - (a new miss first) `{from: 5, to: 30}`
    - (again) `{from: 30, to: 10, reason: 'loop-wrap'}`
  - `a hit while the mute is still pending: the restore follows it` (Review Focus 1):
    - `holdMutes(env)`, a miss, then a hit
    - after a flush, `capKinds` filtered to the sound claim is `['claim', 'dispatch:mute']`
    - after `held[0]()` and a flush: `['claim', 'dispatch:mute', 'dispatch:restore', 'release']`
  - `stacked with fail mode: each claim follows its own rule` (Review Focus 3):
    - `failPrefs({ drums: { soundMode: 'rockband' } })`; 14 drums misses on `lane` (display times 1…14) drop drums
    - one `mute` each for `build_a_band:sound:drums` and `build_a_band:fail:drums`
    - a drums `hit` gives a sound `restore` and no `restore` for the fail claim
    - `song:stop`, then a flush, gives the fail claim's `restore` and `release`, and nothing more for the sound claim
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block. Update the `drumHandler` comment: judgments also drive the Rock Band drum stem.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Rock Band mode: a miss or overhit drops the drum stem, the next hit brings it back`.

### Task 5: The band screen shows the sound mode that will play

**Repo:** `feedBack-plugin-build-a-band` (R7)

**Files:**
- Modify: `src/band-model.js` (drums column 29-32), `src/band-screen.js` (`render` 143-147)
- Test: `tests/band-model.test.mjs`, `tests/band-screen.test.mjs`

**Interfaces:**
- Produces:
  - **`bandScreenModel`:** the drums column adds `soundMode`, the mode that will play: `'song'` when `soundModesDisabled`, else the stored `parts.drums.soundMode` (default `'song'`).
  - **`render`:** the `soundMode` segment shows `c.soundMode` as pressed, instead of the stored value. The stored pref is never changed.

- [ ] **Step 1: Write the failing tests:**
  - `band-model.test.mjs`, `the drums column says which sound mode will play`:
    - stored `kit` with a song whose `stem_ids` lack `drums` gives `columns.drums.soundMode === 'song'`
    - with `stem_ids: ['drums']`: `'kit'`
    - with no song picked: `'kit'`
  - `band-screen.test.mjs`, `a song without a drum stem shows Song drums pressed and keeps the stored mode`:
    - stored `soundMode: 'kit'`, `bs.setSong(holiday)`
    - `btn(col('drums'), 'soundMode', 'song')` has `aria-pressed="true"`, and `kit` has `"false"`
    - `prefs().parts.drums.soundMode === 'kit'`
    - `bs.setSong({ ...holiday, stem_ids: ['drums'] })` gives `kit` pressed and enabled
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the band screen shows Song drums when the song has no drum stem`.

### Task 6: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 6, and records the results in the plan 6 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`.
- Nothing may play: autoplay is held and the song stays paused.
- Drums judgments are synthetic bus emits only. Never `__drumsDebug.midi`, and never touch a pad: a MIDI note plays the kit.
- The checks read claims and `stems.getState()`, never audio.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with every repo on `feature/build-a-band-stage`: core, build-a-band, drums, note_detect, lyrics_karaoke, stems, scorecard. If stems isn't linked in `dev-plugins/`, record "acceptance blocked" and stop.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, else start `launch-debug.sh`.
  3. Reload with `debug/cdp-reload.mjs`.
  4. Never quit a running copy. If one blocks the debug launch, record "acceptance blocked" and stop.
- [ ] **Step 2: Snapshot.**
  1. Record `build_a_band.prefs.v1`, `countdownBeforeSong`, and every `localStorage` key of stems' per-song mutes and volumes for the songs used.
  2. Set `parts.vocals.hearMyself = false`, and guitar, drums and vocals on.
  3. Confirm `feedBack.capabilities.dispatch` and `stems.getState` are functions.
- [ ] **Step 3: Band screen.**
  1. Pick a song whose stems lack `drums`, with stored `soundMode: 'kit'`. Confirm Rock Band and My kit only are disabled, Song drums is pressed, the note reads "Rock Band and My kit only need a drum stem", and the stored mode is still `kit`.
  2. Pick the plan 5 acceptance song (phrases, drums chart, vocal pitch, stems with `drums`). Confirm My kit only is pressed and enabled.
- [ ] **Step 4: My kit only, held.**
  1. Hold autoplay with the plan 1 technique (`holdAutoplay` on `song:loading`, audio muted, pause guard), then Go.
  2. Wait for `stems:state` provider-ready, or poll until `stems.getState()` lists `drums`.
  3. With `#audio.paused === true`, confirm:
     - `drums` has `on: false` and every other stem is as recorded
     - capabilities `inspect` (stems) lists `build_a_band:sound:drums`
     - `__buildABandRuntime.drumSound()` deep-equals `{mode:'kit', muted:true}`
  4. Click the guitar stem button twice while paused. The song's saved stem mutes don't list `drums` (Task 1).
  5. `feedBack.seek(10, 'acceptance')` while paused: drums stay off.
  6. Next song (click): the band screen shows, `drums` is on, and no Build-a-Band claim remains.
- [ ] **Step 5: Rock Band, held.** Set `soundMode: 'rockband'`, `failMode: 'fail'`, and Go with autoplay held.
  1. Drums are on with no sound claim.
  2. Emit `drums:miss` on `feedBack` with `canvas: document.querySelector('.bab-drum-canvas')`: drums off, claim listed, `drumSound().muted === true`.
  3. Emit `drums:hit` on that canvas: drums on, no sound claim (the plan 5 47949be restore fix rechecked), `muted === false`.
  4. Emit `drums:overhit` while paused (`feedBack.isPlaying === false`): no change (R10).
  5. Miss again, then `feedBack.seek(5, 'acceptance')`: drums back on.
- [ ] **Step 6: Stacked with fail.**
  1. Emit 14 `drums:miss` on the band canvas: the drums lane has `bab-failed`, drums off, and both `build_a_band:sound:drums` and `build_a_band:fail:drums` are listed.
  2. Emit `drums:hit`: drums still off, and only the fail claim is listed.
  3. Emit `karaoke:od-activate {fill:0.5, t}` (vocals rescue): the lane un-greys, drums are on, and no claim remains.
  4. Emit `drums:miss` until drums drop again (8 misses from the rescued crowd of 0.4), then rescue again: drums stay off with only the sound claim listed, because the last judgment was a miss.
- [ ] **Step 7: Exit paths.**
  1. Emit `song:ended`, then click Play again: the replay starts with drums on and no claims. Emit one `drums:miss` to confirm the claim works in the replay.
  2. Click Next song: the band screen is active, no Build-a-Band claim remains in `inspect`, and `stems.getState()` and the stems localStorage keys match Step 2.
- [ ] **Step 8: Clean up.**
  1. Restore the Step 2 values.
  2. Leave the band screen.
  3. Confirm nothing is playing and the mic is off (`lyricsKaraokeDiag().micState === 'off'`).
  4. Record results and commit SHAs in the ledger.

---

## Deviations from the spec in this plan

- **Stems changes after all** (R13). The spec expected none. An automation mute could be saved with the song when the player touched the stems mixer during a claim, which breaks the spec's "the drum volume saved for the song isn't touched".
- **One stored mode for every song** (R15), read from "set per song on the band screen and remembered".
- **No time-based debounce in Rock Band** (R2). Commands go out only when the wanted state changes.
- **An overhit while paused is ignored** (R10). The spec doesn't mention pause.
- **A seek brings Rock Band drums back** (R11).

## Later plans (written when this one has landed)

7. **Full screen and sidebar.**
   - Full screen stage (using the stored `fullScreenStage`), and the hover transport with the time readout.
   - The sidebar over the player.
   - Settings over a paused song.
   - `#player-hud` and `#section-map`, hidden on the stage since plan 4 (R9): bring the A/V offset readout, Up Next and the section map back through the hover chrome.
   - Carried forward (each fixed here or ruled out, with a reason):
     - Gamepad Escape: core `gamepad-nav.js:88` handles the synthetic Escape after the player's own Escape closed the song, so gamepad users land on v3-home instead of the origin screen.
     - Plan 4 M4: drums keyboard mode vs the results keys.
     - Plan 4 M5: the media key on the results screen.
     - note_detect's `alert()` on input failure during a band song.
     - Results awards shown on 0% parts ("Held it down" at 0/14).
     - Stems' release-without-restore (core requester-gone path) drops snapshots without unmuting.
