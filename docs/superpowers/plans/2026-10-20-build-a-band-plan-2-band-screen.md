# Build-a-Band Plan 2: Band screen, song picker and sessions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build-a-Band opens on a band screen with one column per part (Guitar, Drums, Vocals), a song picker with filters, live input checks and a Go button. Go plays the picked song on the plan 1 stage with only the parts switched on, at the chosen difficulties. When the song ends, or the player is left, the band is back on the band screen with the user's own settings restored.

**Architecture:**
- **Core** indexes whether a song has a drum chart (`has_drum_tab`), puts it and `has_vocal_pitch` on `/api/library` items, and adds a `has_drums` filter.
- **Drums** remembers a band difficulty per canvas and gains `setMidiInput`. **note_detect** gains `setDevice`.
- **The plugin:**
  - Pure modules hold the part registry, prefs, the filter→query builder, the difficulty mappings, device normalisers and a session state machine, each with node tests.
  - The band screen is thin DOM over those.
  - A session runtime replaces plan 1's temporary Band button: Go → `playSong` → stage on `song:ready` → hold auto-exit on `song:ended` → back to the band screen.

**Tech Stack:**
- Python 3 / FastAPI / SQLite with pytest (core).
- Vanilla ES modules with node:test (plugin, `tests/*.test.mjs`).
- CommonJS node:test (drums `tests/screen.test.js`; note_detect `test/*.test.js` through `test/_loader.js`).

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read "User flow", "Song picker and filters" and "Parts are instrument + how you play it". The binding rulings for this plan are in `.superpowers/sdd/plan-2-inputs.md` (R1–R18). Where the spec and a ruling differ, the ruling wins.

**This is plan 2 of 7.** Plan 1 (the one-clock stage) has landed. The later plans are listed at the end.

## Global Constraints

- **Repos and branches:**
  - Repos live under `~/Desktop/repos/feedback-upstream/`.
  - The branch in every repo is `feature/build-a-band-stage`. It already exists in core `feedBack`, `feedBack-plugin-drums` and `feedBack-plugin-build-a-band`.
  - `feedBack-plugin-notedetect` is on `custom`: create the branch from it with `git checkout -b feature/build-a-band-stage custom`.
  - `feedBack-plugin-lyrics-karaoke` is read-only in this plan. Build-a-Band only writes karaoke's `localStorage['lyrics_karaoke.deviceId']`.
- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  - The message ends with the Co-Authored-By line, followed by git's Signed-off-by, as in plan 1's commits.
  - One commit per task unless a step says otherwise.
- **Line endings:**
  - Preserve CRLF in files that use it. Core `CHANGELOG.md` is CRLF.
  - All files this plan touches in `lib/`, drums, note_detect and the plugin are LF.
  - The plugin's `.gitattributes` is `* text=auto eol=lf`.
- **Test commands:**
  - core Python: `.venv/bin/python -m pytest tests/<file> -q`, run from `feedBack/`.
  - core JS (untouched by this plan): `npm run test:js`.
  - build-a-band: `npm test`. This runs `node --check` on `screen.js` and `src/**`, then `node --test "tests/*.test.mjs"`.
  - drums: `node tests/screen.test.js`, then the whole suite with `node --test tests/`.
  - note_detect: `npm test` (`node --test test/*.test.js`).
- **NO SOUND:**
  - Nothing in this plan may play audio.
  - The mic level meter's `AnalyserNode` is never connected to `AudioContext.destination` or to any other node that reaches it.
  - No task launches the app. Tasks 1–12 are unit-tested only.
- **No push**, no PRs and no new GitHub repos.
- **Plugin identity:** id `build_a_band`, screen id `plugin-build_a_band`, prefs key `build_a_band.prefs.v1` (extended, not renamed).
- **Styles:**
  - Plugin styles go in `assets/build-a-band.css` with `bab-`-prefixed class names. Add no new Tailwind classes: dev-sync doesn't regenerate core's Tailwind.
  - Headings and numbers use Unbounded from Google Fonts with a system fallback.
  - Part colours: guitar `#f5c542`, drums `#e0533d`, vocals `#a678ff`, overdrive `#5cc8ff`.
- **Difficulty values:**
  - Band difficulties: `easy | medium | hard | expert`.
  - Guitar mastery: easy 0.25, medium 0.5, hard 0.75, expert 1.0.
  - Drums ids: the same four strings.
  - Default difficulty for every part: `medium`.
- **Fail mode and Full screen stage** are stored only. The UI says nothing about when they take effect.

## Review Focus

1. **Typing a space in the song search box** types a space and does not start the song. Space starts it only when focus is not in a text field. (Task 8 `isGoKey` test.)
2. **Search results arriving out of order:** a slow response for "hol" must not replace the results for "holiday". The latest request wins. (Task 6 `createSearchController` test.)
3. **However the player is left** (song end, Esc/close, `song:stop`, a new song or arrangement load, leaving for another screen), the session ends exactly once. The stage is unmounted, the user's mastery is put back, the `splitscreenActive` pref is put back, and nothing is restored twice. (Task 7 reducer tests, Task 11 runtime tests.)
4. **Hiding the band screen or changing a device** stops every mic stream (no lingering mic indicator) and removes the pad-light MIDI listener without touching the drums plugin's own listener on the same device. (Task 10 meter and pad-light tests.)
5. **Prefs saved by plan 1** (`{split, labelScale}` only), or hand-edited garbage in `parts`, load as per-field defaults without throwing, and keep `split`/`labelScale`. (Task 5 prefs tests.)

---

### Task 1: Core library index knows which songs have a drum chart

**Repo:** `feedBack` (core)

**Files:**
- Modify: `lib/metadata_db.py`:
  - the migration list near line 566, next to the `has_vocal_pitch` ALTER
  - the settle-to-0 UPDATE at 574
  - `_EXTRACTION_MARKER_COLS` at 3151
  - `get()` at 3155–3189
  - `put()` at 3191–3221
- Modify: `lib/sloppak.py` `extract_meta` (1545–1625)
- Test: create `tests/test_library_drum_tab.py`, copying the `_write_pak` helper and structure of `tests/test_library_vocal_pitch.py`.

**Interfaces:**
- Produces:
  - A `songs.has_drum_tab` column: nullable INTEGER. NULL means "never extracted" (sloppak rows predating the column). Non-sloppak rows are settled to 0 at migration.
  - `MetadataDB._EXTRACTION_MARKER_COLS` ends with `("has_vocal_pitch", "has_drum_tab")`.
  - `MetadataDB.get()` returns `"has_drum_tab": None | bool`.
  - `MetadataDB.put(..., meta)` writes `1 if meta.get("has_drum_tab") else 0`, never NULL.
  - `sloppak.extract_meta(path)["has_drum_tab"]: bool`. It is True when the manifest has a non-empty top-level `drum_tab`, or when any arrangement entry's `type` (stripped, lower-cased) is `drums` or `drum` and the entry has a string `drum_tab`.
    - This mirrors what `load_song` keeps. Entries typed drums without a `drum_tab` pointer are dropped (sloppak.py 1043–1051), so the runtime `has_drum_tab` (ws_highway.py:644) is False for them too.

- [ ] **Step 1: Write the failing tests** in `tests/test_library_drum_tab.py`:
  - `test_extract_meta_reports_song_level_drum_tab`: `_write_pak(tmp_path, {"drum_tab": "drum_tab.json"})`, then `extract_meta(pak)["has_drum_tab"] is True`.
  - `test_extract_meta_reports_drums_arrangement`: the manifest's arrangements gain `{"id": "drums", "name": "Drums", "type": "drums", "drum_tab": "drums.json"}`. Expect `True`.
  - `test_extract_meta_drums_entry_without_pointer_is_not_a_drum_chart`: the same entry without `drum_tab` gives `False`.
  - `test_extract_meta_without_drums`: `_write_pak(tmp_path, {})` gives `False`.
  - `test_put_get_round_trips_drum_tab`:
    - `put("d.sloppak", 1.0, 1, {"title": "D", "has_drum_tab": True})` gives `get(...)["has_drum_tab"] is True`.
    - A put without the key gives `False`, not `None`.
  - `test_rows_predating_the_column_are_marked_for_reextraction`:
    - Use the same legacy `CREATE TABLE` as the vocal-pitch test, with one sloppak row and one archive row.
    - `"has_drum_tab" in MetadataDB._EXTRACTION_MARKER_COLS`.
    - The archive row's column is `0`.
    - `get("old.sloppak", 1.0, 1)["has_drum_tab"] is None`.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_library_drum_tab.py -q`. Expected: 6 FAIL (KeyError / missing column).
- [ ] **Step 3: Implement**, following `has_vocal_pitch` exactly:
  - The ALTER and the `UPDATE songs SET has_drum_tab = 0 WHERE has_drum_tab IS NULL AND format != 'sloppak'`.
  - Add the marker col.
  - **In `get()`:** select `has_vocal_pitch, has_drum_tab, {pcols}`. Read `row[17]` as `None if row[17] is None else bool(row[17])`, and start the perspective loop at `start=18`.
  - **In `put()`:**
    - Add `has_drum_tab` after `has_vocal_pitch` in the column list.
    - Change the literal placeholder count from `21 + len(self._PERSPECTIVE_COLS)` to `22 + len(self._PERSPECTIVE_COLS)`.
    - Insert the value after the vocal-pitch value.
  - **In `extract_meta`:** compute the flag from `manifest` and `arr_list`, and return it beside `has_vocal_pitch`.
  - Expect a one-time re-extraction of sloppak rows on the next scan, as when `has_vocal_pitch` landed.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_library_drum_tab.py tests/test_library_vocal_pitch.py -q`. Expected: all PASS. Then run `.venv/bin/python -m pytest tests -q -k "metadata or library or sloppak or scan"`. Expected: no new failures compared with the branch before this task (record the before count first).
- [ ] **Step 5: Commit** `feat(library): index whether a song has a drum chart`.

### Task 2: Core `/api/library` items and the `has_drums` filter

**Repo:** `feedBack` (core)

**Files:**
- Modify `lib/metadata_db.py`:
  - **`_build_intrinsic_where` (3813):** add the param and its predicate after the `has_lyrics` block at 3953–3958.
  - **`_build_where` (3683):** add the param and pass it through at 3807.
  - **`query_page` (4242):**
    - Add the param and pass it at 4289 and 4303.
    - Add the two columns to the flat SELECT at 4459–4463 and to the item dict at 4488–4505.
  - **`_attach_display_charts` (4601):** add the grouped-member SELECT at 4615–4618 and the `display_chart` dict at 4628–4636.
  - **`query_artists` (4641), `query_albums` (4748), `query_stats` (4785):** add the param and pass it at 4662, 4765, 4827 and 4841.
- Modify `lib/library_registry.py`:
  - `_LIBRARY_FILTER_PARAM_KEYS` (277)
  - `_RULE_STR_KEYS` (293)
  - a new `_parse_has_drums`
  - `_library_filter_args` (419)
- Modify `lib/routers/library.py`:
  - **The 5 endpoints:** `list_library` 231, `library_table` 312, `list_library_albums` 375, `list_artists` 403, `library_stats` 435. Each gets the param and passes it into `_library_filter_args`.
  - **`_OPTIONAL_NEW_PROVIDER_KWARGS` (54):** add it there too, so older third-party providers are not sent it.
  - There is no `query_table` method. `/api/library/table` calls `query_page`.
- Modify `CHANGELOG.md` (CRLF): one line under `[Unreleased]`.
- Test: `tests/test_library_drum_tab.py` (append).

**Interfaces:**
- Consumes: the `songs.has_drum_tab` column (Task 1).
- Produces:
  - Query param `has_drums: str` on all 5 endpoints. `"1"` returns only songs with a drum chart, `"0"` only songs without one, and anything else (including empty) applies no filter.
  - `_parse_has_drums(raw: str) -> int | None` returns 1, 0 or None.
  - `_library_filter_args(..., has_drums: str = "")` returns `"has_drums": int | None`.
  - Every `metadata_db` query method above takes `has_drums: int | None = None`.
  - **Predicate:**
    - 1 → `AND {alias}.has_drum_tab = 1`
    - 0 → `AND IFNULL({alias}.has_drum_tab, 0) = 0`
  - **Item fields:** every `/api/library` song item, and every `display_chart`, gains `has_vocal_pitch: bool` and `has_drum_tab: bool`. NULL reads as False.

- [ ] **Step 1: Write the failing tests** with a `client` fixture copied from `test_library_vocal_pitch.py`. Seed three songs (`stem_count` = `len(stem_ids)`):

  | filename | has_drum_tab | has_vocal_pitch | has_lyrics | stem_ids | arrangements | artist |
  |---|---|---|---|---|---|---|
  | `kit.sloppak` | True | True | True | `["drums","vocals"]` | `[{"index":0,"name":"Lead"}]` | "A" |
  | `gtr.sloppak` | False | False | False | `[]` | `[{"index":0,"name":"Lead"}]` | "B" |
  | `bare.sloppak` | False | False | False | `["drums"]` | `[]` | "C" |

  - `test_library_items_carry_drum_tab_and_vocal_pitch`: the `kit` item has `has_drum_tab is True` and `has_vocal_pitch is True`; the `gtr` item has both `False`.
  - `test_has_drums_filter`:
    - `has_drums="1"` gives `{"kit.sloppak"}`
    - `"0"` gives `{"gtr.sloppak", "bare.sloppak"}`
    - `""` and `"x"` give all three
  - `test_has_drums_combines_with_existing_filters`:
    - `has_drums="0", stems_has="drums"` gives `{"bare.sloppak"}`
    - `has_drums="1", has_lyrics="pitch"` gives `{"kit.sloppak"}`
  - `test_has_drums_reaches_every_endpoint`, all with `has_drums=1`:
    - `/api/library/table` gives `total == 1`
    - `/api/library/stats` gives `total_songs == 1`
    - `/api/library/artists` gives `total_artists == 1`
    - `/api/library/albums` gives `total == 1`
  - `test_parse_has_drums`: `"1"` gives 1, `"0"` gives 0, `""` and `"yes"` give None.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_library_drum_tab.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the threading in the order listed under Files. Then add the two columns to both SELECTs:
  - In `query_page` they are `r[19]`, `r[20]`.
  - In the grouped member they are `m[15]`, `m[16]`.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_library_drum_tab.py tests/test_library_vocal_pitch.py -q`. Expected: PASS. Then run `.venv/bin/python -m pytest tests -q -k "library or collection or provider"`. Expected: no new failures compared with the recorded baseline.
- [ ] **Step 5: Commit** `feat(library): has_drums filter; items report drum chart and vocal pitch`.

### Task 3: Drums keeps the band difficulty across a re-init and takes a MIDI input

**Repo:** `feedBack-plugin-drums`

**Files:**
- Modify `screen.js`:
  - module scope near `_instanceForCanvas` (2045)
  - `_loadOwnDifficulty` (2789)
  - the `window.feedBackDrums` object (4732)
  - `module.exports` (5304)
- Modify `README.md`: document `setDifficulty`'s memory, `clearDifficulty` and `setMidiInput` under the band API section (add the section if plan 1 didn't).
- Test: `tests/screen.test.js` (the `// ── Public band API` block, using `freshPlugin()` and `fakeInst`).

**Interfaces:**
- Consumes: the plan 1 `window.feedBackDrums.{setInputTarget, setDifficulty, getInstanceState}`.
- Produces:
  - `_bandDifficulty: WeakMap<canvas, id>` (module scope), plus `_bandDifficultyFor(canvas): string | null`, exported.
  - `_resolveOwnDifficulty({ inSplit: boolean, bandId: string|null, panelId: string|null }): string | null`, exported and pure:
    - `inSplit` gives `panelId` when it is a valid id.
    - Otherwise it gives `bandId` when that is valid.
    - Otherwise `null`.
  - `_loadOwnDifficulty()` becomes `_diffPref = _resolveOwnDifficulty({ inSplit: _ssActive(), bandId: _bandDifficultyFor(_highwayCanvas), panelId: <panel key read, as today> })`.
  - `feedBackDrums.setDifficulty(id, canvas)`:
    - With a canvas and a valid id, it also records `_bandDifficulty.set(canvas, id)`, even when no instance owns the canvas yet. A lane can be pinned before its instance inits.
    - Unknown ids are still ignored and not recorded. `canvas == null` behaviour is unchanged.
    - Plan 1's T4 rule stands: a canvas no instance owns never changes the global difficulty. It is only remembered.
  - `feedBackDrums.clearDifficulty(canvas)`:
    - Deletes the canvas's entry.
    - If an instance owns the canvas, sets its `_diffPref = null` through a new instance method `_clearOwnDifficulty()` and calls `_difficultyChanged()`, so it follows the global difficulty again.
    - Needed because a drums-only band session pins the main `#highway` canvas (Task 11).
  - `feedBackDrums.setMidiInput(logicalSourceKey: string)`:
    - Does exactly what the settings dropdown's change handler does (screen.js 5188–5189): `_saveCfg('midiManual', key ? '1' : '')` then `_midiConnect(key)`.
    - Non-strings are ignored. `''` is the explicit "None".
    - Returns `undefined`.

- [ ] **Step 1: Write the failing tests:**
  - `band API: setDifficulty remembers the band difficulty for a canvas, even before an instance owns it`: `c = {}`, then `setDifficulty('hard', c)`, then `mod._bandDifficultyFor(c) === 'hard'`. The global pref is unchanged.
  - `band API: unknown ids are not remembered`: `setDifficulty('bogus', c)` gives `_bandDifficultyFor(c) === null`.
  - `_resolveOwnDifficulty prefers the panel in split, the band pin otherwise`:
    - `({inSplit:true, bandId:'easy', panelId:'hard'})` gives `'hard'`
    - `({inSplit:false, bandId:'easy', panelId:'hard'})` gives `'easy'`
    - `({inSplit:false, bandId:null, panelId:null})` gives `null`
    - `({inSplit:false, bandId:'nope', panelId:null})` gives `null`
  - `band API: clearDifficulty forgets the pin and hands the instance back to the global level`:
    - Use a `fakeInst(c, { _clearOwnDifficulty: () => cleared++ })`.
    - After `setDifficulty('hard', c)` then `clearDifficulty(c)`, `_bandDifficultyFor(c) === null` and `cleared === 1`.
  - `band API: setMidiInput saves the pick as a manual choice`:
    - After `freshPlugin()`, replace `global.localStorage.setItem` with a recorder.
    - `setMidiInput('webmidi:kit')` gives `mod._cfg().midiInputId === 'webmidi:kit'`, and the recorder saw `drums_midi_manual` = `'1'`.
    - `setMidiInput('')` gives `midiInputId === ''` and `drums_midi_manual` = `''`.
    - `setMidiInput(42)` changes nothing.
- [ ] **Step 2: Run** `node tests/screen.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as specified under Interfaces.
- [ ] **Step 4: Run** `node tests/screen.test.js`, then `node --test tests/`. Expected: all PASS, including plan 1's band API tests.
- [ ] **Step 5: Commit** `feat: band difficulty survives re-init; clearDifficulty and setMidiInput`.

### Task 4: note_detect `setDevice`

**Repo:** `feedBack-plugin-notedetect`. First run `git checkout -b feature/build-a-band-stage custom`.

**Files:**
- Modify `screen.js`: a new `setDevice` beside `onDeviceChange` (12213), added to the public `api` object (about 18431).
- Modify `README.md`: one line in the public API list. Modify `CHANGELOG.md`: one line under the top unreleased section, creating it if absent. There is no version bump: no stylesheet changes.
- Test: create `test/set_device.test.js` using `loadDetectionCore` from `test/_loader.js`.

**Interfaces:**
- Produces: `api.setDevice(deviceId: string): void` on every instance, so it is on `window.noteDetect` (the default instance). It:
  1. Ignores non-strings.
  2. Sets `selectedDeviceId = deviceId`.
  3. Calls `saveSettings()`, which writes `slopsmith_notedetect` only for the default instance.
  4. Calls `restartAudio()` only when `enabled` is true.

  It never opens the mic when detection is off.

- [ ] **Step 1: Write the failing tests** in `test/set_device.test.js`:
  - `setDevice persists the device for the default instance without opening the mic`:
    - `loadDetectionCore({ sandboxBeforeRun(sb) { … } })`, where `sb.localStorage.setItem` records writes and `sb.navigator.mediaDevices.getUserMedia` counts calls.
    - `const det = createNoteDetector({ isDefault: true }); det.setDevice('dev-2');`
    - The last write to `'slopsmith_notedetect'` parses to `deviceId === 'dev-2'`, and the getUserMedia count is `0`.
  - `setDevice on a non-default instance does not write settings`.
  - `setDevice is on the documented API surface`: `typeof det.setDevice === 'function'`.
- [ ] **Step 2: Run** `npm test`. Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement `setDevice`.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS, including `version_sync.test.js`.
- [ ] **Step 5: Commit** `feat: public setDevice(deviceId) for band setups`.

### Task 5: Part registry, difficulty mappings and band prefs (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/parts.js`, `src/mappings.js`
- Modify: `src/prefs.js`
- Test: create `tests/parts.test.mjs` and `tests/mappings.test.mjs`; modify `tests/prefs.test.mjs`.

**Interfaces:**
- Consumes: `findDrumArrangement(arrangements)` from `src/arrangements.js` (plan 1; Task 12 adds an options arg).
- Produces, from `src/mappings.js`:
  - `DIFFICULTIES = ['easy','medium','hard','expert']`
  - `GUITAR_MASTERY = { easy: 0.25, medium: 0.5, hard: 0.75, expert: 1 }`
  - `masteryFor(diff: string): number`. Unknown values give 0.5.
  - `drumsDifficultyId(diff: string): 'easy'|'medium'|'hard'|'expert'`. Unknown values give `'medium'`.
  - `masteryFromPct(pct: unknown): number | null`. A finite value is clamped to 0–100 and divided by 100; anything else gives `null`.
  - `guitarArrIndex(arrangements: Array<{index?, name, smart_name?}>, name: 'Lead'|'Rhythm'|'Bass'): number | undefined`. It takes the first entry whose `smart_name || name` equals `name` (ignoring case) and returns its `index`, or its position when `index` is absent. With no match it returns `undefined`.
- Produces, from `src/parts.js`:
  - `songFacts(itemOrSong): { arrangements: Array, hasDrumTab: boolean, hasVocalPitch: boolean, stemIds: string[] }`. It reads library items (`has_drum_tab`, `has_vocal_pitch`, `stem_ids`) and `feedBack.currentSong` (`hasDrumTab`), and treats missing fields as false/empty.
  - `PART_TYPES: ReadonlyArray<PartType>` in the order guitar, drums, vocals.
    - `PartType` is `{ id, instrument, inputKind, label, icon, color, difficulties, extras, chartFrom(itemOrSong, partPrefs?) }`.
    - **guitar:** instrument `'guitar'`, inputKind `'audio'`, label `'Guitar'`, icon `'guitar'`, color `'#f5c542'`, extras `['arrangement']`. `chartFrom` returns `guitarArrIndex(arrangements, partPrefs?.arrangement || 'Lead')`, falling back to the first Lead/Rhythm/Bass match, or `undefined`.
    - **drums:** instrument `'drums'`, inputKind `'midi'`, label `'Drums'`, icon `'drum'`, color `'#e0533d'`, extras `['soundMode']`. `chartFrom` returns `findDrumArrangement(arrangements)` when `>= 0`. When it is negative, it returns `-1`, or `true` if `hasDrumTab` is true (a drum tab with no named arrangement).
    - **vocals:** instrument `'vocals'`, inputKind `'mic'`, label `'Vocals'`, icon `'mic'`, color `'#a678ff'`, extras `['hearMyself']`. `chartFrom` returns `hasVocalPitch`.
    - `difficulties` is `DIFFICULTIES` for all three.
  - `getPart(id: string): PartType | null`.
  - `hasChart(part: PartType, itemOrSong, partPrefs?): boolean`. A number result counts when `>= 0`; a boolean counts as itself; `undefined` is false.
- Produces, from `src/prefs.js` (same key, same guarded storage):
  - `normalizePrefs(raw: unknown): BandPrefs`, exported.
  - `loadPrefs(storage?)`, unchanged signature.
  - `savePrefs(patch, storage?)`. `patch.parts` merges per part, per field (`savePrefs({parts:{drums:{on:false}}})` keeps every other field); the result goes through `normalizePrefs`.
  - `pushRecent(list, song): Array<{filename,title,artist}>`. It puts `song` first, removes any earlier entry with the same `filename`, and keeps at most 10.
  - **`BandPrefs` defaults:**
    ```js
    { split: 62, labelScale: 1,
      parts: { guitar: { on: true, deviceKey: '', arrangement: 'Lead', difficulty: 'medium' },
               drums:  { on: true, deviceKey: '', difficulty: 'medium', soundMode: 'song' },
               vocals: { on: true, deviceId: '', difficulty: 'medium', hearMyself: false } },
      failMode: 'nofail', fullScreenStage: true, lastSong: null, recentSongs: [] }
    ```
    `hearMyself` defaults to false: the safe no-monitoring choice.
  - **Validation**, per field. A bad value falls back to that field's default.
    - `on`/`hearMyself`/`fullScreenStage`: boolean.
    - `deviceKey`/`deviceId`: string.
    - `arrangement`: one of `Lead|Rhythm|Bass`.
    - `difficulty`: one of `DIFFICULTIES`.
    - `soundMode`: one of `song|rockband|kit`.
    - `failMode`: one of `nofail|fail`.
    - `lastSong`: an object with a non-empty string `filename`, plus string `title`/`artist` (default `''`), or `null`.
    - `recentSongs`: the valid entries only, deduplicated by filename, at most 10.
    - `split` and `labelScale` keep plan 1's rules.

- [ ] **Step 1: Write the failing tests:**
  - `mappings.test.mjs`:
    - `masteryFor maps the four levels`: 0.25/0.5/0.75/1, and `masteryFor('x') === 0.5`.
    - `drumsDifficultyId passes the four ids through`: `drumsDifficultyId('expert_plus') === 'medium'`.
    - `masteryFromPct`: `masteryFromPct(80) === 0.8`, `masteryFromPct('100') === null`, `masteryFromPct(140) === 1`, `masteryFromPct(undefined) === null`.
    - `guitarArrIndex`:
      - `[{index:0,name:'Lead'},{index:2,name:'Bass'}]` with `'Bass'` gives `2`.
      - `[{name:'Lead'},{name:'Rhythm'}]` with `'rhythm'` gives `1`.
      - `[{index:0,name:'Combo',smart_name:'Lead'}]` with `'Lead'` gives `0`.
      - `[{name:'Lead'}]` with `'Bass'` gives `undefined`.
  - `parts.test.mjs`:
    - `registry order and kinds`: `PART_TYPES.map(p => [p.id, p.inputKind])` deep-equals `[['guitar','audio'],['drums','midi'],['vocals','mic']]`.
    - `songFacts reads library items and currentSong`:
      - `songFacts({has_drum_tab:true, has_vocal_pitch:true, stem_ids:['drums']})` gives `{arrangements:[], hasDrumTab:true, hasVocalPitch:true, stemIds:['drums']}`.
      - `songFacts({hasDrumTab:true}).hasDrumTab === true`.
      - `songFacts(null)` gives all false/empty.
    - `hasChart`:
      - guitar on `{arrangements:[{name:'Lead'}]}` is true; guitar on `{arrangements:[{name:'Drums'}]}` is false.
      - drums on `{arrangements:[{name:'Drums'}]}` is true.
      - drums on `{has_drum_tab:true, arrangements:[{name:'Lead'}]}` is true.
      - vocals on `{has_vocal_pitch:false}` is false.
  - `prefs.test.mjs` (add):
    - `plan 1 prefs gain the plan 2 defaults`: stored `{"split":70,"labelScale":1.5}` loads `split 70`, `labelScale 1.5`, and `parts`/`failMode`/`fullScreenStage`/`lastSong`/`recentSongs` equal to the defaults above.
    - `garbage parts fall back per field`: stored `parts: {guitar: {on: 'yes', arrangement: 'Keys', difficulty: 'hard'}, drums: 7}` gives guitar `on true, arrangement 'Lead', difficulty 'hard'` and drums equal to the drums defaults.
    - `savePrefs merges parts per field`: after `savePrefs({parts:{drums:{on:false}}})`, `drums.on === false` and `drums.soundMode === 'song'`, and `guitar` is untouched.
    - `pushRecent dedupes, orders newest first, keeps 10`: pushing 12 distinct songs keeps 10, newest first. Re-pushing song 5 moves it to the front with no duplicate.
    - `recentSongs and lastSong are validated`: entries without a filename are dropped; `lastSong: {title:'x'}` becomes `null`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL; plan 1's prefs tests still PASS.
- [ ] **Step 3: Implement the three modules** with no DOM access and no browser globals at module top level.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: part registry, difficulty mappings and band prefs`.

### Task 6: Library query builder, song chips and the search controller (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/query.js`
- Test: `tests/query.test.mjs`

**Interfaces:**
- Consumes: `songFacts`, `getPart`, `hasChart` (Task 5).
- Produces:
  - `DEFAULT_FILTERS = { guitar: false, drums: false, vocals: false, drumStem: false, playable: true }`.
  - `buildLibraryQuery({ q = '', filters = DEFAULT_FILTERS, parts = {}, size = 30 }): string`. It returns a `URLSearchParams` string in this order: `q` (trimmed), `size`, `arrangements_has`, `has_drums`, `has_lyrics`, `stems_has`.
    - `arrangements_has=Lead,Rhythm,Bass` when `filters.guitar`, or when `filters.playable && parts.guitar?.on`.
    - `has_drums=1` when `filters.drums`, or when `filters.playable && parts.drums?.on`.
    - `has_lyrics=pitch` when `filters.vocals`, or when `filters.playable && parts.vocals?.on`.
    - `stems_has=drums` when `filters.drumStem`.
    - The page-size param is `size`. The router (`routers/library.py:231`) has no `page_size`; see the deviation note below.
  - `songChips(item): Array<{ id: 'drumChart'|'drumStem'|'vocalPitch'|'arrangements', label: string, good: boolean }>`, always in that order:
    - `'Drum chart'` (good = drums `hasChart`)
    - `'Drum stem'` (good = `stemIds` includes `'drums'`)
    - `'Vocal pitch'` (good = `hasVocalPitch`)
    - the arrangements chip: its label is the `smart_name || name` values joined with `' · '` (or `'No arrangements'`), and good = there is at least one
  - `createSearchController({ fetchJson, onResults, onError, delay = 250, setTimer = setTimeout, clearTimer = clearTimeout }) → { search(queryString): void, dispose(): void }`.
    - It debounces by `delay`, then calls `fetchJson('/api/library?' + queryString)`.
    - Only the response of the latest issued request reaches `onResults(json.songs || [])`. Older responses are dropped.
    - `dispose()` cancels the pending timer, and responses that arrive afterwards are ignored.
  - `resolveRecent(entry, fetchJson): Promise<item | null>`. It fetches `/api/library?q=<encodeURIComponent(entry.title)>&size=30` and returns the song whose `filename === entry.filename`, else `null`. A fetch error gives `null`.

**Deviation (R13):** the ruling's `page_size=30` would be silently ignored by FastAPI (the default of 24 applies), so the builder sends `size=30`.

- [ ] **Step 1: Write the failing tests:**
  - `query with no filters`: `buildLibraryQuery({ q: ' holiday ', filters: { ...DEFAULT_FILTERS, playable: false } }) === 'q=holiday&size=30'`.
  - `playable by this band follows the parts switched on`: with `parts {guitar:{on:true}, drums:{on:true}, vocals:{on:false}}`, `buildLibraryQuery({ q: '', parts })` gives `'q=&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1'`.
  - `explicit filters add to playable`: `filters {…DEFAULT_FILTERS, playable:false, vocals:true, drumStem:true}` gives `'q=&size=30&has_lyrics=pitch&stems_has=drums'`.
  - `songChips`: the item `{has_drum_tab:true, stem_ids:['drums'], has_vocal_pitch:false, arrangements:[{name:'Lead'},{name:'Bass'}]}` maps to `[['drumChart',true],['drumStem',true],['vocalPitch',false],['arrangements',true]]` (via `[id, good]`), and the last label is `'Lead · Bass'`.
  - `songChips on an item from an older core` (no `has_drum_tab`/`has_vocal_pitch`, `arrangements:[{name:'Drums'}]`): `drumChart` good is true and `vocalPitch` good is false.
  - `search is debounced`: with fake timers, two `search()` calls within the delay give one `fetchJson` call, with the second query.
  - `the latest request wins`:
    - Issue request A, fire its timer, then issue B and fire its timer.
    - Resolve B, then A.
    - `onResults` was called once, with B's songs.
  - `dispose drops a pending response`.
  - `resolveRecent finds the song by filename, or null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `src/query.js`.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: library query builder, song chips and search controller`.

### Task 7: Band session state machine (pure)

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/session.js`
- Test: `tests/session.test.mjs`

**Interfaces:**
- Produces:
  - `initialSession(): { phase: 'idle', filename: null }`
  - `reduceSession(state, event): { state, effects: string[] }`. It is pure: no I/O, and it never mutates `state`. Events and transitions:

    | phase | event | next phase | effects |
    |---|---|---|---|
    | idle | `{type:'go', filename}` | armed (`filename` stored) | `['saveRestorePoint','play']` |
    | armed | `{type:'ready', filename}`, same filename | playing | `['mount','applyDifficulties','applyDevices']` |
    | armed | `ready`, different filename | idle | `['teardown']` |
    | armed | `{type:'loading'}` | armed | `[]` (Go's own load) |
    | playing | `{type:'loading'}` | idle | `['teardown']` |
    | ending | `loading` | idle | `['cancelExitTimer','teardown']` |
    | playing | `{type:'ended'}` | ending | `['holdExit','startExitTimer']` |
    | ending | `{type:'exitTimer'}` | idle | `['teardown','releaseExit','showBandScreen']` |
    | armed / playing | `{type:'left'}` | idle | `['teardown']` |
    | ending | `left` | idle | `['cancelExitTimer','teardown']` |
    | any other pair (e.g. `go` while not idle, `ready` while playing, `left` while idle) | | unchanged | `[]` |

  `'left'` covers `song:stop`, leaving the player screen, and `dispose`.

- [ ] **Step 1: Write the failing tests**, one per table row. Plus:
  - `a full session`: go, loading, ready, ended, exitTimer gives effects concatenated in exactly that order, ending idle.
  - `teardown happens exactly once however the session ends`: for each path (ready-mismatch, loading while playing, left while armed/playing/ending, exitTimer) followed by a stray `left` and `exitTimer`, count `'teardown'` across all effects. Expect `1`.
  - `reduceSession does not mutate its input`: a frozen state does not throw.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** as a lookup on `phase` + `event.type`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band session state machine`.

### Task 8: Band screen columns, band settings and the Go button

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `screen.html` (static skeleton)
- Create: `src/band-model.js` (pure) and `src/band-screen.js` (DOM)
- Modify: `screen.js` (create the band screen next to the runtime), `assets/build-a-band.css`
- Test: `tests/band-model.test.mjs`

**Interfaces:**
- Consumes:
  - `loadPrefs`, `savePrefs`, `pushRecent` (Task 5)
  - `PART_TYPES`, `hasChart`, `songFacts` (Task 5)
  - `songChips`, `resolveRecent` (Task 6)
- Produces, from `src/band-model.js`:
  - `bandScreenModel({ prefs, item }): { goEnabled: boolean, goHint: string, columns: { guitar: Col, drums: Col, vocals: Col } }`.
    - `Col` is `{ on: boolean, unavailable: boolean, note: string, soundModesDisabled?: boolean }`.
    - A column is `unavailable` when a song is picked and `!hasChart(part, item, prefs.parts[id])`.
    - Guitar is checked against any of Lead/Rhythm/Bass, not only the chosen one.
    - **Exact copy:**
      - guitar unavailable: `'No guitar part in this song'`
      - drums unavailable: `'No drum chart for this song'`
      - vocals unavailable: `'No vocal pitch for this song'`
      - vocals available: `'Vocals lane arrives with the next update'`
      - drums `soundModesDisabled` (song picked without a `drums` stem): `'Rock Band and My kit only need a drum stem'`
    - **`goEnabled`** is true when a song is picked and guitar or drums is `on && !unavailable`. Vocals alone can't start a song until plan 3 brings its lane.
    - **`goHint`:**
      - no song: `'Pick a song'`
      - no playable part: `'Turn on guitar or drums'`
      - otherwise: `'Press Space or hit any pad to start'`
  - `isGoKey(event: {code?, key?, repeat?}, activeElement: {tagName?, isContentEditable?} | null): boolean`. True for `code === 'Space'` or `key === ' '`, when not `repeat`, and when the active element is not an INPUT, TEXTAREA or SELECT and not contentEditable.
- Produces, from `src/band-screen.js`:
  - `createBandScreen({ root, win, doc, loadPrefs, savePrefs, onGo }) → { dispose(), setSong(item | null), getSong(): item | null, isVisible(): boolean }`.
    - `onGo(item, prefs)` is called by the Go button and Space. Task 11 wires it to the runtime.
    - `setSong` stores `lastSong` and `recentSongs` through `savePrefs` / `pushRecent`, and re-renders.
    - On creation, `prefs.lastSong` is restored through `resolveRecent` (Task 6), so the band screen reopens on the last song.
    - Visibility comes from `screen:changed` (`detail.id === 'plugin-build_a_band'`) and, at creation, from `#plugin-build_a_band.classList.contains('active')`.
    - `isGoKey` is checked from a `keydown` listener on `doc`, active only while visible.
- **Layout** (the draft's section 1, "band columns"):
  - **Song head:** title, artist and `songChips`.
  - **Song picker slot:** `div.bab-picker`, filled by Task 9.
  - **Three part columns** (`div.bab-col[data-part]`, coloured from `PartType.color` via `--bab-c`). Each column has:
    - an on/off toggle (`button.bab-toggle[aria-pressed]`)
    - an input slot `div.bab-input`, filled by Task 10
    - a four-way difficulty segment `div.bab-seg[data-field=difficulty]`
    - its extras:
      - guitar: Lead/Rhythm/Bass segment
      - drums: Song drums / Rock Band / My kit only, with values `song|rockband|kit`
      - vocals: Hear myself On/Off
    - a signal slot `div.bab-signal`, filled by Task 10
    - its note line
  - **A disabled "Add a part" slot.**
  - **Go bar:** Failing segment (`No fail` / `Fail on`), a Full screen stage checkbox, `goHint`, and `button.bab-go` "GO".
- Every control writes through `savePrefs` immediately. Unavailable columns get class `bab-unavailable` (greyed) and keep their stored settings. Disabled sound modes get the `disabled` attribute.
- **Screen code:** `screen.js` keeps the plan 1 runtime for now. It creates the band screen with `onGo: () => {}`, and disposes the previous band screen on re-run (stored on `window.__buildABandScreen`).
- **CSS:**
  - Put `@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&display=swap');` first.
  - Headings and numbers use `font-family: 'Unbounded', system-ui, sans-serif`.
  - Every selector is under `.bab-screen` or prefixed `bab-`.

- [ ] **Step 1: Write the failing tests** in `tests/band-model.test.mjs`:
  - `no song: go disabled with "Pick a song"`.
  - `full band song`: the item `{arrangements:[{name:'Lead'}], has_drum_tab:true, has_vocal_pitch:true, stem_ids:['drums']}` with default prefs gives `goEnabled` true, all columns available, and `drums.soundModesDisabled` false.
  - `song without vocal pitch greys vocals with its note`.
  - `song without a drum stem disables sound modes 2 and 3`.
  - `song without a drum chart greys drums; guitar alone still enables Go`.
  - `only vocals on: go disabled with "Turn on guitar or drums"`.
  - `isGoKey`:
    - `({code:'Space'}, null)` is true
    - `({key:' '}, {tagName:'BUTTON'})` is true
    - `({code:'Space'}, {tagName:'INPUT'})` is false
    - `({code:'Space', repeat:true}, null)` is false
    - `({code:'Enter'}, null)` is false
    - `({code:'Space'}, {tagName:'DIV', isContentEditable:true})` is false
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `band-model.js`, then `screen.html`, `band-screen.js`, `screen.js` and the CSS. `screen.html` keeps `#build-a-band-root` as the root (it exists synchronously before `screen.js` runs) and holds the static skeleton above.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including `node --check` of the new files.
- [ ] **Step 5: Commit** `feat: band screen columns, band settings and Go button`.

### Task 9: Song picker with filters and recent songs

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create: `src/song-picker.js` (DOM)
- Modify: `src/band-screen.js` (mount it in `div.bab-picker`), `assets/build-a-band.css`
- Test: `tests/song-picker.test.mjs`. This uses the fake-element helpers style of `tests/stage-mount.test.mjs`, copied locally.

**Interfaces:**
- Consumes:
  - `buildLibraryQuery`, `DEFAULT_FILTERS`, `songChips`, `createSearchController`, `resolveRecent` (Task 6)
  - `loadPrefs` for `parts` and `recentSongs` (Task 5)
  - `createBandScreen().setSong` (Task 8)
- Produces: `mountSongPicker({ host, doc, fetchJson, getParts: () => BandPrefs['parts'], getRecent: () => Array, onPick(item), timers? }) → { dispose(), refresh() }`.
  - **Controls:**
    - a search `input.bab-search` (type `search`, placeholder `'Search songs'`)
    - five filter toggles `button.bab-filter[data-filter=guitar|drums|vocals|drumStem|playable]`, labelled `Guitar part`, `Drum chart`, `Vocal pitch`, `Drum stem`, `Playable by this band`, with `playable` pressed by default
    - a result list `ul.bab-results`
  - **Results:** each row (`li.bab-row`) shows title, artist and the four `songChips`. Clicking a row calls `onPick(item)`.
  - **Searching:** input or filter changes call `controller.search(buildLibraryQuery({ q, filters, parts: getParts() }))`.
  - **Empty search:** shows `getRecent()` rows labelled "Recent". Clicking one resolves it with `resolveRecent`; when that returns `null`, the row shows `'Not in the library any more'` and nothing is picked.
  - **`refresh()`** re-runs the current search. The band screen calls it when a part is switched on or off, so "Playable by this band" follows the parts.
  - **Errors:** a fetch error shows `'Could not load songs'` in the list.

- [ ] **Step 1: Write the failing tests**, using fake timers and a fake `fetchJson` recording URLs:
  - `typing searches with playable-by-band params`: with parts guitar+drums on, typing "holiday" and firing the timer fetches `'/api/library?q=holiday&size=30&arrangements_has=Lead%2CRhythm%2CBass&has_drums=1'`.
  - `turning playable off and drum stem on changes the query`.
  - `empty search lists recent songs; a missing one says so and picks nothing`.
  - `clicking a result picks that item`: `onPick` receives the exact item object.
  - `refresh re-runs with the current parts`.
  - `dispose cancels the pending search`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `song-picker.js` and mount it from the band screen. `fetchJson` defaults to `(url) => win.fetch(url).then(r => r.json())`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: song picker with band filters and recent songs`.

### Task 10: Input devices and signal lights

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Create:
  - `src/devices.js` (DOM-free; `win` and `storage` are injected)
  - `src/level-meter.js` (DOM-free; media and audio constructors are injected)
  - `src/pad-light.js` (DOM-free)
- Modify: `src/band-screen.js` (device `<select>` per column in `div.bab-input`, lights in `div.bab-signal`, a "Find my kit" button), `assets/build-a-band.css`
- Test: `tests/devices.test.mjs`, `tests/level-meter.test.mjs`, `tests/pad-light.test.mjs`

**Interfaces:**
- Consumes: band prefs `parts.*.deviceKey`/`deviceId` (Task 5); `feedBackDrums.setMidiInput` (Task 3); `noteDetect.setDevice` (Task 4).
- Produces, from `src/devices.js`:
  - `listGuitarInputs(win): Promise<{ via: 'session'|'browser', items: Array<{key, label}> }>`.
    - When `win.feedBack.audioSession.listInputSources({ includeUnavailable: false })` has a non-empty `payload.sources`, it returns `via 'session'` with items `{ key: logicalSourceKey, label }`.
    - Otherwise it returns `via 'browser'` from `navigator.mediaDevices.enumerateDevices()`, using `audioinput` entries only: `{ key: deviceId, label: label || 'Input N' }`.
    - It never calls `getUserMedia`.
  - `listDrumInputs(win): Array<{key, label}>`, from `win.feedBack.midiInput.listSources()` as `{ key: logicalSourceKey, label }`. It returns `[]` when the capability is missing.
  - `findKit(win): Promise<Array<{key,label}>>`: `await midiInput.discover()`, then `listDrumInputs`. This may show the Web-MIDI permission prompt, which plays no sound.
  - `listMicInputs(win): Promise<Array<{key, label}>>`: `enumerateDevices()` audioinput entries.
  - `applyGuitarDevice(key, win): Promise<'session'|'browser'|'none'>`.
    - With an empty key it returns `'none'`.
    - If the session source list is non-empty, it calls `audioSession.selectInputSource({ logicalSourceKey: key }, 'build_a_band')`.
    - Otherwise it calls `win.noteDetect?.setDevice(key)`.
  - `applyDrumDevice(key, win): 'ok'|'none'`: `midiInput.select(key)` and `feedBackDrums.setMidiInput(key)`.
  - `applyMicDevice(deviceId, storage): void`: `storage.setItem('lyrics_karaoke.deviceId', deviceId)` as a raw string, in try/catch.
  - `applyDevices(prefs, win, storage): Promise<void>`: applies each part that is `on` and has a non-empty key.
  - `isPadHit(data): boolean`: `(data[0] & 0xF0) === 0x90 && data[2] > 0`.
- Produces, from `src/level-meter.js`:
  - `METER_CONSTRAINTS(deviceId)` returns `{ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`.
  - `rmsLevel(buf: Float32Array): number` (0–1).
  - `createLevelMeter({ deviceId, via, mediaDevices, AudioContext, onLevel, onState, schedule, cancel }) → { stop(): void }`.
    - **`via === 'session'`:** it calls `onState('check-in-game')` and opens nothing.
    - **Otherwise:**
      1. `getUserMedia(METER_CONSTRAINTS(deviceId))` → `ctx.createMediaStreamSource(stream).connect(analyser)`.
      2. Each scheduled frame calls `onLevel(rmsLevel(...))`. `onState('live')` is called once.
      3. The analyser is never connected anywhere.
    - **Errors:** a `NotAllowedError` or `SecurityError` gives `onState('no-access')`; any other error gives `onState('check-in-game')`.
    - **`stop()`:**
      - It cancels the frame, stops every track and closes the context. It is idempotent.
      - If `stop()` is called before `getUserMedia` resolves, the resolved stream's tracks are stopped at once.
- Produces, from `src/pad-light.js`: `openPadLight({ midiInput, key, onHit }) → Promise<{ close(): void }>`.
  - Opening calls `midiInput.open({ logicalSourceKey: key, requester: 'build_a_band' })`, then `handle.addListener(fn)`. Each `isPadHit(data)` calls `onHit()`.
  - `close()` calls `handle.removeListener(fn)`, then `midiInput.close({ logicalSourceKey: key, requester: 'build_a_band' })`. It is idempotent and never touches other listeners.
- **Band screen wiring:**
  - Device lists load when the screen becomes visible.
  - Picking a device saves it to prefs and applies it at once (`applyGuitarDevice` / `applyDrumDevice` / `applyMicDevice`).
  - **Lights run only while the screen is visible:**
    - the guitar meter (from the guitar list's `via` and key)
    - the vocals meter
    - the drums pad light, which flashes `div.bab-signal` and also calls `onGo` when the screen is visible and Go is enabled (spec: "any drum pad also starts")
  - They are stopped on hide, on a device change (before the new one starts) and on dispose.
  - Light labels: `'Signal'`, `'Hit a pad'`, `'Level'`. The states `no-access` and `check-in-game` show `'no access'` and `'check in game'`.

- [ ] **Step 1: Write the failing tests:**
  - `devices.test.mjs`:
    - `guitar inputs prefer the desktop session list`.
    - `guitar inputs fall back to browser audio inputs`: video and audiooutput are dropped, and a blank label becomes `'Input 1'`.
    - `listing never calls getUserMedia`: the fake gum counter stays 0 across all list calls.
    - `applyGuitarDevice routes to the session or to note_detect`.
    - `applyDrumDevice selects the core source and the drums pref`: both fakes receive `'webmidi:kit'`.
    - `applyMicDevice writes karaoke's key raw`: `'lyrics_karaoke.deviceId'` becomes `'usb-mic'`.
    - `applyDevices skips parts that are off or have no key`.
    - `isPadHit`:
      - `[0x99, 38, 100]` is true
      - `[0x99, 38, 0]` is false
      - `[0x89, 38, 64]` is false
      - `[0xB0, 4, 90]` is false
  - `level-meter.test.mjs` (fake `AudioContext` records every `connect` target):
    - `meter constraints turn off all processing`: `METER_CONSTRAINTS('d1')` deep-equals the object above.
    - `the analyser is never connected to the destination or anything else`: the analyser's `connect` is never called, and no recorded `connect` target is `ctx.destination`.
    - `stop stops every track and closes the context, once`.
    - `stop before permission resolves still stops the late stream`.
    - `denied permission reports no-access`.
    - `a desktop session source reports check-in-game without opening the mic`.
  - `pad-light.test.mjs`:
    - `pad hits light, other messages don't`.
    - `close removes only our listener and closes as build_a_band`: a pre-existing fake listener on the same handle stays registered.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules, then the band-screen wiring.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band input devices and silent signal lights`.

### Task 11: Go, the band session on the stage, and ending it

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify:
  - `src/band-runtime.js` (rewrite: sessions replace the Band button)
  - `src/stage.js` (`planStage` takes the parts; band drum difficulty)
  - `screen.js` (`onGo` → `runtime.startSession`)
  - `assets/build-a-band.css` (`.bab-toast`; remove `.bab-band-btn`)
- Test: rewrite `tests/band-runtime.test.mjs`; add to `tests/stage.test.mjs` and `tests/stage-mount.test.mjs`.

**Interfaces:**
- Consumes:
  - `reduceSession`, `initialSession` (Task 7)
  - `masteryFor`, `drumsDifficultyId`, `masteryFromPct`, `guitarArrIndex` (Task 5)
  - `findDrumArrangement` (plan 1 / Task 12)
  - `applyDevices` (Task 10)
  - `mountStage`, `planStage` (plan 1)
  - `feedBackDrums.setDifficulty` / `clearDifficulty` / `setInputTarget` (Task 3)
  - `window.highway.setMastery(f)`, which does not persist. Never use `window.setMastery`, which persists.
  - `window.feedBack.holdAutoExit()` returns `release()`. `release()` calls `closeCurrentSong()`, which returns to the recorded origin.
  - `window.feedBack.setReturnScreen(id)`
  - `window.playSong(encodedFilename, arrIndex)`
- Produces:
  - `planStage(song, parts = { guitar: { on: true }, drums: { on: true } }): { lanes: string[], drumIndex: number }`:
    - guitar off gives `lanes: []` (no stage)
    - guitar on and drums off, or `drumIndex < 0`, gives `['guitar']`
    - otherwise `['guitar','drums']`
    - `drumIndex` is always computed
  - `mountStage({ player, song, prefs, deps })`, same signature. It now:
    - plans with `prefs.parts`
    - calls `drumsApi.setDifficulty(drumsDifficultyId(prefs.parts.drums.difficulty), canvas)` right after each `drumsApi.setInputTarget(canvas)` (initial mount and `adoptCanvas`), guarded by `typeof drumsApi.setDifficulty === 'function'`
  - `createBandRuntime({ win, doc, mountStage, loadPrefs, storage = win.localStorage, fetchJson, setTimer = win.setTimeout, clearTimer = win.clearTimeout }) → { dispose(), isMounted(), startSession({ song, prefs }): boolean, phase(): string }`.
    - `song` is the picked library item.
    - The Band button `#bab-band-btn` and `toggle()` are removed.
  - **Effect handlers** (the runtime runs the reducer's effects in order):
    - **`saveRestorePoint`:**
      - Read `storage.getItem('splitscreenActive')` (raw, possibly null).
      - Read mastery as `masteryFromPct(#mastery-slider.value)`. If that is null, use `masteryFromPct((await fetchJson('/api/settings')).master_difficulty)`, which fills in asynchronously; failures keep it null.
    - **`play`:**
      - Guitar on: `arrIndex = guitarArrIndex(item.arrangements, prefs.parts.guitar.arrangement)`.
      - Guitar off and drums on: `arrIndex = findDrumArrangement(item.arrangements)`, or `undefined` when negative. This is the drums-only stage: the main highway shows the drum arrangement and no extra lane is mounted.
      - Then `fb.setReturnScreen('plugin-build_a_band')` and `win.playSong(encodeURIComponent(item.filename), arrIndex)`.
    - **`mount`:** `mountStage({ player: #player, song: fb.currentSong, prefs })` when `planStage(fb.currentSong, prefs.parts).lanes.length > 0`.
    - **`applyDifficulties`:**
      - **Guitar on:** if the `song:ready` detail has `hasPhraseData`, call `win.highway.setMastery(masteryFor(prefs.parts.guitar.difficulty))`. Otherwise show `div.bab-toast` "This chart has one difficulty" in `#player` for 4 s.
      - **Drums-only:** `feedBackDrums.setDifficulty(drumsDifficultyId(...), #highway)`, re-applied on `highway:canvas-replaced` to `detail.newCanvas` while the session is playing.
    - **`applyDevices`:** `applyDevices(prefs, win, storage)`.
    - **`holdExit` / `startExitTimer`:** `release = fb.holdAutoExit()`, then `setTimer(() => dispatch({type:'exitTimer'}), 1500)`.
    - **`teardown`:**
      1. Unmount the stage.
      2. Drums-only: `feedBackDrums.clearDifficulty(#highway)`.
      3. If the saved mastery is not null, `win.highway.setMastery(saved)`.
      4. Restore `splitscreenActive`: `setItem(saved)`, or `removeItem` when it was null. Never call splitscreen's start.
      5. Remove the toast and the canvas-replaced listener.
    - **`releaseExit`:** `release()`.
    - **`showBandScreen`:** `win.showScreen('plugin-build_a_band')`, only if `#plugin-build_a_band` is not already `.active`. `release()` already returns to the band screen as the origin.
  - **Bus → events:**
    - `song:loading` → `loading`
    - `song:ready` → `ready` with `fb.currentSong.filename`, keeping `detail.hasPhraseData`
    - `song:ended` → `ended`
    - `song:stop` → `left`
    - `screen:changing` with `from === 'player'` and `id !== 'player'` → `left`
    - `splitscreen:panels-changed` with splitscreen active → `left`
    - `dispose()` dispatches `left`, then removes the listeners

**Deviation note (R14.5):** with guitar off and drums on, the "stage" is the core player showing the drum arrangement on the main highway. No lane layout is mounted.

- [ ] **Step 1: Write the failing tests.** Extend plan 1's `band-runtime.test.mjs` setup with:
  - fake `playSong`, `showScreen`, `setReturnScreen` and `holdAutoExit` (returning a counting `release`)
  - `highway.setMastery` recording calls
  - `feedBackDrums` recording calls
  - a `#mastery-slider` with `value: '80'`
  - a `#highway` canvas
  - an in-memory `storage`
  - manual timers

  `band-runtime.test.mjs`:
  - `no Band button is injected any more`: `doc.getElementById('bab-band-btn') === null` after `song:loaded`.
  - `Go plays the chosen guitar arrangement from the band screen`:
    - item `{filename:'My Song.sloppak', arrangements:[{index:0,name:'Lead'},{index:1,name:'Bass'}]}`, guitar arrangement `'Bass'`
    - `playSong` is called with `('My%20Song.sloppak', 1)` and `setReturnScreen` with `'plugin-build_a_band'`
    - `startSession` returns true, and a second call returns false
  - `the band song's song:ready mounts the stage and applies guitar mastery`: medium plus `hasPhraseData: true` gives one `mountStage` call and `setMastery(0.5)`.
  - `a one-difficulty chart shows the toast and leaves mastery alone`.
  - `song:ready for a different song ends the session without mounting`.
  - `drums only: plays the drum arrangement, mounts nothing, pins the drum difficulty to #highway`:
    - item arrangements `[{index:0,name:'Lead'},{index:1,name:'Drums'}]`, guitar off, drums `hard`
    - gives `playSong(_, 1)`, no `mountStage` call, and `setDifficulty('hard', highwayCanvas)`
    - a `highway:canvas-replaced` event re-applies it to the new canvas
  - `song:ended holds auto-exit, then after 1500 ms releases once and shows the band screen`.
  - `leaving the player ends the session and restores mastery and the splitscreen pref`:
    - `splitscreenActive` is `'true'` at Go; the fake stage's mount sets it to `'false'`.
    - On `screen:changing {from:'player', id:'v3-songs'}`: the stage is unmounted, `setMastery(0.8)` is called, and `splitscreenActive === 'true'`.
    - The splitscreen fake's start is never called.
  - `a null splitscreen pref is removed again on teardown`.
  - `mastery falls back to /api/settings when the slider is missing`: `master_difficulty: 60` gives `setMastery(0.6)` on teardown.
  - `dispose ends a running session and removes every listener`.

  `stage.test.mjs`:
  - `planStage drums off`: `planStage({arrangements:[{name:'Lead'},{name:'Drums'}]}, {guitar:{on:true}, drums:{on:false}})` deep-equals `{lanes:['guitar'], drumIndex:1}`.
  - `planStage guitar off`: gives `{lanes:[], drumIndex:1}`.
  - The plan 1 `planStage(song)` tests stay as they are.

  `stage-mount.test.mjs`: `the band drum difficulty is pinned to the drum canvas and follows a replacement`. With prefs drums difficulty `'hard'`, `drumsApi.setDifficulty` receives `('hard', drumCanvas)`, and after a canvas replacement `('hard', newCanvas)`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL; plan 1's Band-button tests are deleted with the button.
- [ ] **Step 3: Implement** the stage changes, then the runtime around `reduceSession`, then wire `screen.js`: `onGo: (item, prefs) => runtime.startSession({ song: item, prefs })` after `savePrefs(prefs)`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Go starts a band session on the stage; song end returns to the band screen`.

### Task 12: `findDrumArrangement` matches the drums plugin

**Repo:** `feedBack-plugin-build-a-band`

**Files:**
- Modify: `src/arrangements.js`; `src/stage.js` `planStage` (pass `{ hasDrumTab: !!song?.hasDrumTab }`); `src/parts.js` drums `chartFrom` (pass `{ hasDrumTab }`)
- Test: `tests/arrangements.test.mjs`, `tests/parts.test.mjs`

**Interfaces:**
- Produces: `findDrumArrangement(arrangements, { hasDrumTab = false } = {}): number`.
  1. The first entry with `type === 'drums'`.
  2. Else the first whose `name` matches `DRUMS_PATTERNS = /\b(?:drums|percussion|drum\s*kit)\b/i`. This is the drums plugin's pattern (screen.js:59); export it.
  3. Else, when `hasDrumTab`, the last entry whose name doesn't match `/\b(?:lead|rhythm|bass|combo|guitar)\b/i`.
  4. Else `-1`.

- [ ] **Step 1: Update the tests:**
  - `[{name:'Lead'},{name:'Drums'}]` gives 1.
  - `[{name:'Lead',type:'guitar'},{name:'Kit',type:'drums'}]` gives 1.
  - `[{name:'Lead'},{name:'Percussion'}]` gives 1.
  - `[{name:'Lead'},{name:'Drum Kit'}]` gives 1.
  - `[{name:'Drumsticks'}]` gives -1.
  - `[{name:'Lead'},{name:'Drum'}]` gives -1, and with `{hasDrumTab:true}` gives 1.
  - `[{name:'Lead'},{name:'Bass'},{name:'Kit A'},{name:'Kit B'}]` with `{hasDrumTab:true}` gives 3.
  - `[{name:'Lead'},{name:'Bass'}]` with `{hasDrumTab:true}` gives -1.
  - `[]` gives -1, and `undefined` gives -1.
  - In `parts.test.mjs`: drums `hasChart` on `{has_drum_tab:true, arrangements:[{name:'Lead'},{name:'Kit'}]}` is true.
- [ ] **Step 2: Run** `npm test`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement** and pass `hasDrumTab` from `planStage` and `parts.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including every stage and runtime test.
- [ ] **Step 5: Commit** `fix: drum arrangement lookup matches the drums plugin`.

### Task 13: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 2, and records the results in the plan 2 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`.

- [ ] **Step 1: Install.**
  1. `dev-sync.sh` with core, drums, note_detect and build-a-band on `feature/build-a-band-stage`.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up; otherwise start it with `launch-debug.sh`.
  3. Never quit a running copy. If a non-debug copy blocks the debug launch, record "acceptance blocked" in the ledger and stop.
- [ ] **Step 2: Band screen.**
  1. Open `plugin-build_a_band`. Confirm the three columns, the "Add a part" slot and the Go bar render.
  2. Confirm device lists load in each column with no `getUserMedia` call from listing (check with a CDP console spy).
  3. Confirm the filters change the `/api/library` URL: `has_drums=1`, `has_lyrics=pitch`, `stems_has=drums`, and the playable params.
- [ ] **Step 3: Pick Holiday** (`sloppak/greeholi.sloppak`). Confirm the chips, and that the greyed columns and disabled sound modes match the song's `/api/library` flags.
- [ ] **Step 4: Go, silently.**
  1. Hold autoplay with the controller's silent-load technique before triggering Go. This is plan 1's ledger technique: `feedBack.holdAutoplay()` on `song:loading` with `release.settle()`, audio muted, and a guard that pauses on `song:play`/resume/audio `play`.
  2. Through `cdp.mjs`, confirm the following, with `#audio.paused === true` and no audio context running output:
     - `window.__buildABandRuntime.phase() === 'playing'`
     - `#player.bab-stage` exists, with the lanes matching the parts switched on
     - `window.highway.getMastery()` equals the guitar difficulty's mastery when the chart has phrase data, or the "one difficulty" toast shows
- [ ] **Step 5: End the session by leaving the player** (`window.closeCurrentSong()`). Confirm:
  - the active screen is `plugin-build_a_band`
  - `phase() === 'idle'` and no `bab-stage`
  - `getMastery()` is back to the pre-Go value
  - `localStorage.splitscreenActive` equals its pre-Go value
- [ ] **Step 6: Clean up.** Navigate away from the band screen, so the meters stop and the mic indicator is off. Confirm nothing is playing. Record the results and the commit SHAs in the ledger.

---

## Deviations from the spec in this plan

- **No difficulty-ladder filter (R3).** Ladder data lives per arrangement, not in the manifest. Guitar difficulty is always offered. On `song:ready` without phrase data, the stage shows "This chart has one difficulty" instead of the band screen showing "one level".
- **Tuning and stems-at-all filters** stay with the main library. The picker offers the five R13 filters.
- **Drums-only play** uses the main highway with the drum arrangement and no lane layout (R14.5).
- **Vocals** is fully configurable and stored, but has no lane until plan 3. Vocals alone can't start a song.

## Later plans (each written when the previous one has landed)

3. **Vocals strip.**
   - Karaoke: mount into a container, public events/API and difficulty setter, hide-score switch.
   - Strip slot on the stage and the layout extended to strip + lanes.
   - Vocals joins band sessions.
4. **HUD and scoring.**
   - Band score, multiplier and bonus, stars, crowd meters, callouts, part colours and glow.
   - Per-lane zoom.
   - Hide-score switches and drums hit/miss events.
   - The 3-2-1 count-in and the results screen, which replaces plan 2's 1.5 s exit wait.
5. **Overdrive and fail.** "Noodle it up", the vocal mic hit, drums star power events, and fail mode and rescue (using the stored `failMode`).
6. **Drum sound modes.** Song drums, Rock Band and My kit only, through stems' `mute`/`restore` (using the stored `soundMode`).
7. **Full screen and sidebar.**
   - Full screen stage (using the stored `fullScreenStage`) and the hover transport.
   - The sidebar over the player.
   - Settings over a paused song.
