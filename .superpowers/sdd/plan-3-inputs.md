# Plan 3 inputs: decisions and verified facts

Plan 3 scope comes from plan 1's later-plans list, plan 2's later-plans list ("Vocals strip": karaoke mount into a container, public events/API and difficulty setter, hide-score switch; strip slot and the strip + lanes layout; vocals joins band sessions) and plan 2's vocals placeholders. Matt won't be consulted: everything below is a controller ruling (R-n) or a fact. Sound tests are assumed passing; real-app checks are silent and hear-myself is forced off.

Each ruling gives its reason and its cost if wrong.

## Rulings

- **R1, karaoke branch.** `feedBack-plugin-lyrics-karaoke` is on `main` at `ba8c75c` with a clean tree (local branches: `main`, `fix/pitch-arrow-jumps`; the latter is merged into `main` by `8b0891d`). Create `feature/build-a-band-stage` from `main`: `git switch -c feature/build-a-band-stage main`.
  - Reason: AGENT-RULES says to cut the branch from the repo's current branch; `main` already contains every karaoke fix.
  - Cost if wrong: none (rebase onto another base later).

- **R2, one public object `window.lyricsKaraoke`, built by a pure factory.** Karaoke stays single-instance (module state in the `src/main.js` IIFE). A new `src/api.js` exports `createKaraokeApi(deps)`, which `main.js` calls once with closures over its module state. The object carries `apiVersion: 1` and the methods listed in the plan (Task 1). Session overrides live in a new pure `src/overrides.js` (`createSessionOverrides`). Both are tested under node; `main.js` only wires them.
  - Reason: main.js is a 2,113-line IIFE with no tests beyond a parse check (`tests/smoke.test.mjs`); a factory keeps the API's argument rules testable, matching the repo's "pure logic in `src/*.js`, wiring in main.js" pattern (KARAOKE-RB-PARITY-PLAN.md "Tickets").
  - Cost if wrong: one extra indirection in main.js.

- **R3, strip hosting.** `mountStrip(el | null)`:
  - sets the strip host; `null` means karaoke's own placement in `#player` (`top: 60px`, `height: 140px`, exactly as today, main.js:377-383).
  - When hosted, the overlay fills the host (`position:absolute; left/right/top/bottom: 0; height: auto`), keeps `pointer-events:none` and `z-index:5`.
  - An existing overlay is moved into the new host at once and its canvas re-sized; otherwise the next `showOverlay` creates it there.
  - A host that is no longer connected (`!el.isConnected`) is treated as `null`, so a torn-down stage can never swallow solo karaoke.
  - `showOverlay` no longer requires `#highway` when hosted (today it bails without it, main.js:372).
  - Reason: the stage creates and destroys slots (splitscreen remounts, teardown); moving one overlay is simpler than recreating karaoke's canvas and rAF loop.
  - Cost if wrong: a stale host for one frame; mitigated by the `isConnected` check.

- **R4, scoring events forward the scorer verbatim (KRB coordination).** Every event `scorer.advanceTo()` returns (`{phraseIndex, rating, accuracy, points, multiplierBefore}`, scoring.js:149) is emitted on core's bus as `karaoke:phrase` with the scorer's `snapshot()` fields (`score, multiplier, streak, stars, ratedCount`, scoring.js:154-162) merged in. Score resets (new song, difficulty change, mic toggled off, `song:seek`) emit `karaoke:reset` with the snapshot (or `null` with no scorer). `getScore()` returns the snapshot or `null`. The API contains no scoring maths.
  - Reason: KRB-4 (#6) rewrites ratings, points, multiplier and stars inside `scoring.js` but keeps the `advanceTo` event and `snapshot()` shapes; forwarding them means KRB-4 lands without an API change. KRB-8 overdrive and the mic hit are plan 5 (spec: "KRB-8 pulled forward" is listed with overdrive), so plan 3 adds no overdrive events.
  - Cost if wrong: if KRB-4 renames a snapshot field, consumers (plan 4) adjust; the API is untouched.

- **R5, difficulty setter is a session override, never persisted.** `setDifficulty(id | null)`: `id` must be a key of karaoke's `DIFFICULTIES` (pitch.js:8-13, today `easy|medium|hard|expert`); `null` clears the override; anything else returns `false` and changes nothing. A change of the effective difficulty runs karaoke's existing `onDifficultyChanged` path (main.js:2044-2051: rebuild scorer, reset results). `rebuildScorer` (main.js:146) reads the effective difficulty. While an override is active the in-player difficulty `<select>` (main.js:1224-1243) shows it, is disabled, and its title reads "Set on the band screen". The saved `lyrics_karaoke.difficulty` is never written by the band.
  - Reason: "wipe nothing that solo karaoke needs"; the band's difficulty is per band song. When KRB-4 adds Beginner to `DIFFICULTIES`, the setter accepts it automatically.
  - Cost if wrong: a user changing vocal difficulty mid band song must use the band screen.

- **R6, hear-myself = karaoke's voice monitor on/off, a session override.** `setHearMyself(on | null)`; `null` clears; the default (no override) is `true`, which is today's behaviour (the monitor is always built in `startMic`, main.js:1096-1107). When the effective value is `false`, `startMic` builds no monitor branch at all (no `monitorGain`, no limiter), and turning it off while listening disconnects and drops both. Turning it on while listening builds the branch. The saved `lyrics_karaoke.monitorVolume` is untouched. Karaoke's existing gain-0 `muteSink → destination` (main.js:1088-1091, needed to pump the ScriptProcessor) stays as it is: it is silent.
  - Reason: spec "Vocals: hear myself (on/off)"; the acceptance check must open the mic with no path to the speakers.
  - Cost if wrong: none for solo karaoke (default unchanged).

- **R7, no mic-device setter.** Plan 2's `applyMicDevice` (devices.js:131-137) writes `localStorage['lyrics_karaoke.deviceId']`; karaoke's `startMic` reads `getDeviceId()` fresh on every start (main.js:962, 1001). The band writes the id before it calls `startMic`, and karaoke's mic is always off when a band song starts (`resetForNewSong` stops it, main.js:1393). So the key is enough while running.
  - Reason: the task says to add a setter only if the key isn't enough.
  - Cost if wrong: a mic already running on another device keeps it until restarted; impossible at song start.

- **R8, hide-score switch built now, used in plan 4.** `setScoreHudHidden(hidden: boolean)` hides only karaoke's score / multiplier / stars pill in `drawHud` (main.js:745-764). Phrase ratings ("vocal phrase ratings in the strip", spec Goals 4), mic warnings and the feedback notice stay. Build-a-Band does **not** call it in plan 3, because no band HUD exists yet to replace the score.
  - Reason: spec: the band HUD replaces the plugins' score displays (plan 4).
  - Cost if wrong: plan 4 adds one call.

- **R9, `setKaraokeMode(on)` returns a promise that waits for the song's data.** Karaoke fetches status and pitch data asynchronously on `song:loaded` (main.js:1399-1410). The API awaits that in-flight load for the current song, fetches pitch data if still missing, then turns karaoke mode on when pitch data exists. It resolves to the resulting mode (`false` if the song changed meanwhile or has no pitch).
  - Reason: the band's `song:ready` can arrive before karaoke's fetches finish.
  - Cost if wrong: a slow status fetch delays the strip by its duration.

- **R10, layout rows.** New pure `computeStageRows({ strip, lanes })` in `src/layout.js`, with `HUD_RESERVE_PX = 60` and `STRIP_HEIGHT_PX = 90`:
  - no strip: `{ strip: null, lanesTopPx: 0 }` (plan 2 layout, unchanged)
  - strip and lanes: strip at top 60, height 90; lanes start at 150
  - strip and no lanes (vocals only): strip from top 60 to the stage bottom (`fill: true`); no lanes
  - 60 px clears core's `#player-hud` row (v3/index.html:1029, the same offset karaoke uses today); plan 4 swaps it for the band HUD height.
  - The 2-lane limit in `computeStageLayout` (layout.js:12) **stays**: strip + lanes never needs more than two lanes.
  - Reason: spec Stage/Layout ("vocal strip: full width under the HUD, about 90 px ... hidden when vocals are off"); the task says remove the limit "only as far as needed", and nothing needs it.
  - Cost if wrong: 60 px of top margin until plan 4.

- **R11, `planStage` gains `strip` and `mainPart`.**
  - `strip` is true only when `parts.vocals.on === true` (the default `parts` argument has no vocals, so plan 1/2 callers stay strip-free).
  - `mainPart` is the lane holding `window.highway`: `'guitar'` when guitar is on; `'drums'` for drums-only **with** the strip (lanes `['drums']`); `null` otherwise.
  - Drums-only **without** vocals is unchanged from plan 2 (lanes `[]`, no stage, main highway shows the drum chart; plan-2 R14.5).
  - A second drum highway is created only when `lanes` includes `'drums'` and `mainPart === 'guitar'`.
  - Reason: drums-only + vocals needs a stage for the strip, and the drum chart is already on the main highway.
  - Cost if wrong: drums-only + vocals shows the drums lane at full width under the strip, which is the intent.

- **R12, vocals-only session.** Guitar and drums off (or without charts), vocals on: `playSong` gets no arrangement index (core's default). The strip fills the stage; the main highway is hidden with `window.highway.setVisible(false)` (highway.js:2893-2900, stops its drawing) **and** `#player.bab-stage.bab-main-hidden #highway { visibility: hidden }` (setVisible only stops drawing, so the last frame would stay on screen). Unmount calls `setVisible(null)`, core's default "follow the DOM", and removes the class.
  - Song time keeps flowing for karaoke while hidden: `highway.getTime()` falls back from the stale render clock to the `setTime` interpolator (highway.js:1309-1313, 2833-2841), and core's tick keeps calling `setTime` (app.js:1985).
  - Reason: the task's example; nothing else draws on the stage.
  - Cost if wrong: if another host had set an override before the band song, it is cleared at teardown (splitscreen is stopped during band songs, plan-2 Task 11 ruling).

- **R13, band screen: vocals is a playable part.**
  - Remove `VOCALS_NOTE` (band-model.js:10, 23).
  - Go needs a song and at least one playable column among guitar, drums and vocals (band-model.js:31). The hint for none is "Turn on a part" (replaces "Turn on guitar or drums").
  - **Respect karaoke's enable state:** when `window.lyricsKaraoke` is missing (plugin disabled or not loaded) or `apiVersion < 1`, the vocals column is unavailable with the note "Turn on the Lyrics Karaoke plugin to sing", whatever the song. It is checked at every render (plugin load order isn't fixed).
  - "Playable by this band" adds `has_lyrics=pitch` when vocals is on and supported (query.js:16-17; plan 2 left it out until this plan).
  - Reason: the task's scope list.
  - Cost if wrong: none.

- **R14, the vocals part in a band session.**
  - Effective vocals = on && song has vocal pitch && karaoke API present (extends `effectivePrefs`, band-runtime.js:45-52).
  - Session reducer: `go` effects become `['saveRestorePoint', 'armVocals', 'play']`; same-song `ready` becomes `['mount', 'applyDifficulties', 'applyDevices', 'startVocals']` (session.js:12, 16).
  - `armVocals` (before `playSong`, so the scorer built on song load already uses it): `setDifficulty(vocalsDifficultyId(difficulty))`, `setHearMyself(hearMyself)`.
  - `startVocals` (after mount): `mountStrip(stage.stripSlot)`, `await setKaraokeMode(true)`, write the mic id (`applyMicDevice`), `await startMic()`. Every await re-checks that the session is still current; a session that ended meanwhile never starts the mic. `false` from `setKaraokeMode` shows the stage toast "No vocal pitch for this song". A mic error shows nothing extra (karaoke draws its own error in the strip, main.js:714-726).
  - A splitscreen remount (band-runtime.js:146-175) re-hosts the strip in the new slot.
  - Teardown, **before** the stage unmounts: `stopMic()`, `setKaraokeMode(false)`, `mountStrip(null)`, `setDifficulty(null)`, `setHearMyself(null)`, each guarded.
  - Reason: spec: apply mic device, difficulty and hear-myself at Go and restore at teardown; start karaoke's mic for the band song.
  - Cost if wrong: a mic-start failure leaves the singer without scoring for that song; the strip still draws.

- **R15, wipe nothing solo karaoke needs.** The band never writes `lyrics_karaoke.difficulty`, `.monitorVolume`, `.latencyMs` or `.micFeedback`. The API's `stopMic()` uses karaoke's `stopMic({ keepFlag: true })` (main.js:1166-1201), which leaves `.micFeedback` alone. The `.deviceId` write stays as plan-2 R9 decided: it is the same singer's mic on the same machine.
  - Cost if wrong: solo karaoke opens the band's mic next time, which is the mic the singer picked.

- **R16, karaoke's own toggles are not fought.** If the singer turns karaoke or its mic off mid band song with karaoke's own buttons, the band leaves it off. Karaoke's `showScreen` wrapper (main.js:2088-2101) already stops everything when the player is left; the band's teardown is idempotent with it.
  - Cost if wrong: none.

- **R17, silent acceptance tooling.**
  - Install with `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart`, then reload the page with `debug/cdp-reload.mjs`. Plain `dev-sync.sh` restarts a running app, which AGENT-RULES forbids. Karaoke is linked in `dev-plugins/lyrics_karaoke`.
  - Song: `Green-Day_Holiday_RB` (KRB plan's karaoke test song) if `/api/library` reports it with `has_vocal_pitch`; otherwise the first `/api/library?has_lyrics=pitch&has_drums=1&size=5` result.
  - Hear-myself is forced off in band prefs before every Go, and `lyricsKaraokeDiag().monitorGain === null` is checked while the mic is open.
  - Cost if wrong: acceptance blocked, recorded in the ledger.

- **R18, plan-2 deferred minors.** None are picked up: none touches vocals or the stage (pushRecent guard, chartFrom/soundMode tests, `q:null`, undefined-filename Go, Space preventDefault, resolveRecent errors, lazy `.active` loss, LIKE punctuation, nameless entries, late-rejection hint). They stay deferred. The plan-2 ledger's carry-forward ("Playable excludes vocals until plan 3", "vocals-only can't Go in plan 2") is resolved by R13.
  - Cost if wrong: none.

## Verified facts the plan can rely on

### lyrics_karaoke (`main` @ `ba8c75c`)
- `package.json` `"test": "node --test tests/*.test.mjs"`; 58 tests pass. Python tests (`tests/test_*.py`) cover routes only; this plan doesn't touch them.
- No `README.md` and no `CLAUDE.md` exist; `CHANGELOG.md` has `## [Unreleased]` / `### Added`. All touched files are LF.
- `screen.js` is `import './src/main.js';` (smoke test asserts it); main.js is one IIFE that returns early without `window` (main.js:32-35).
- Module state: `scorer` (43), `lastRating` (44), `karaokeMode` (45), `overlayEl`/`canvas`/`ctx` (52-54), `micState` (831), `monitorGain` (855), `micWantOnForSong` (865).
- `rebuildScorer` (143-149) builds `createScorer({ tokens, phrases, difficulty: getDifficulty() })`.
- `setKaraokeMode(on)` (327-365): hides highway text lyrics, `showOverlay()`, restores the mic if `micWantOnForSong`; off: `hideOverlay`, `stopMic({keepFlag:true})`, `resetUserResults`, restores lyrics visibility.
- `showOverlay` (369-403) hard-codes `#player`, `top:60px`, `height:140px` (`RIBBON_HEIGHT_PX`, 69), `zIndex:5`, and bails without `#highway`. `teardownOverlay` (410-424) removes it.
- `getNow()` (457-462) reads `window.highway.getTime()`.
- `drawFrame` (504-735): `scorer.advanceTo(...)` at 588 sets `lastRating` at 589; `drawHud(dpr, playheadX)` at 711. `drawHud` (740-791): score pill 745-764, warnings 767-777, rating 779-789.
- `resetUserResults` (898-908) resets the scorer.
- `startMic` (959-1146): device gate `micStartError(getDeviceId(), [])` (962), `getUserMedia(micConstraints(getDeviceId()))` (1001), gain-0 `muteSink` to destination (1088-1091), monitor `monitorGain → limiter → destination` (1096-1107), sets `micWantOnForSong` and `lyrics_karaoke.micFeedback='1'` (1118-1119).
- `stopMic(opts)` (1166-1201): `keepFlag` false writes `micFeedback='0'`.
- In-player `diffSelect` (1224-1243) persists via `setDifficulty`.
- `resetForNewSong` (1367-1397) turns karaoke mode off and stops the mic; `onSongLoaded` (1399-1410) awaits `fetchStatus`, then `fetchPitchData`.
- `window.lyricsKaraokeDiag()` (1913-1921) reports `micState`, `monitorGain` (value or null), `trackState`, etc.
- `onDifficultyChanged` (2044-2051); `init` (2057-2104): `song:loaded`, `song:seek` (scorer.seek), and a `showScreen` wrapper that leaves karaoke off when the player is left.
- `prefs.js`: keys under `lyrics_karaoke.`: `difficulty`, `deviceId`, `latencyMs`, `monitorVolume` (default 0.5); `getDeviceId()` 29-31.
- `pitch.js:8-14`: `DIFFICULTIES` keys `easy|medium|hard|expert`, `DEFAULT_DIFFICULTY='medium'`.
- `scoring.js`: `advanceTo` events 149, `snapshot()` 154-162 (`stars` is an integer 0–5 from mean accuracy).

### Karaoke parity plan (`slopsmith-custom/KARAOKE-RB-PARITY-PLAN.md`)
- KRB-4 rewrites `scoring.js` (points, grades, multiplier, stars) and adds Beginner; KRB-8 is overdrive plus mic hit (25 dB onset); KRB-6 is authored phrases. Plan 3 touches none of their logic (R4, R5).

### Build-a-Band (`feature/build-a-band-stage` @ `d244d6e`, 190 tests pass)
- `layout.js:11-20` `computeStageLayout({lanes, split})` throws above two lanes.
- `stage.js:23-33` `planStage(song, parts)` returns `{lanes, drumIndex, laneArrangement}`; `on(id)` treats a missing part as on.
- `stage.js:44-328` `mountStage`: splitscreen stop (64); `root.appendChild(slots.guitar)` unconditional (92); label scale (107-109); fret chrome on `slots.guitar` (112-134); `mainHw.setContainer(slots.guitar)` (162); drum lane (195-234); returns `{ setSplit, unmount }` (291-327).
- `assets/build-a-band.css:178-227`: `#player.bab-stage #highway {position:absolute; left:0; top:0}`, `.bab-lanes`, `.bab-lane`, `.bab-divider` all `top:0`. `setContainer` only sizes `#highway` (highway.js:1962-1970); its position comes from this CSS.
- `band-runtime.js`: `effectivePrefs` (45-52), `newSession` (83-111), `showToast` (120-134), splitscreen remount (146-175), `EFFECTS.mount` (257-269) returns early when `planStage(...).lanes.length === 0`, `teardown` (301-330), `dispatch` (345-356).
- `session.js:10-31` effect table.
- `band-model.js:10` `VOCALS_NOTE`; `:23` applies it; `:31` Go needs guitar or drums; `:34` "Turn on guitar or drums".
- `query.js:16-17` Playable leaves vocals out.
- `band-screen.js:102, 128` call `bandScreenModel({ prefs, item: song })`; `:173` `getParts: () => prefs.parts`.
- `devices.js:131-137` `applyMicDevice(deviceId, storage)`; `:143` applied when vocals is on.
- `prefs.js:13` vocals defaults `{on:true, deviceId:'', difficulty:'medium', hearMyself:false}`.
- `mappings.js:9-11` `drumsDifficultyId`.
- Test fakes: `tests/stage-mount.test.mjs:18-42` `makeEl` has a plain-object `style` (no `setProperty`); `tests/band-runtime.test.mjs:51-120` `setup()`, `prefsWith` defaults vocals off (36-46).

### Core (`feature/build-a-band-stage` @ `e4d965e`, read-only this plan)
- `highway.setVisible(v)` (highway.js:2893-2900): `true/false` override, `null` clears; `isVisible()` (2906-2915) forces a fresh DOM sample.
- `#player-hud` is an absolute top row, `z-20` (static/v3/index.html:1029).
- Core bus: `window.feedBack.emit(event, detail)` (app.js:771); `window.slopsmith === window.feedBack` (app.js:338).
