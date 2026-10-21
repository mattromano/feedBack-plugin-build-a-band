# Plastic controllers, Plan 1: 5-fret charts in feedpak and core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Do not start before Build-a-Band v1 meets its design** (Matt's rule). This plan touches no Build-a-Band code, so it may start before Build-a-Band Plan 2+ only if Matt says so.

**Goal:** Rock Band / Clone Hero guitar, rhythm and bass parts survive import into a feedpak as 5-fret parts, load in core, stream to the player over the highway WebSocket, and show up in the library index and filters.

**Architecture:** Matt's feedpak-spec fork gains a `type: five_fret` arrangement entry pointing at a `five_fret_<id>.json` side file (shape copied from the drums pattern). Core gains `lib/fivefret.py` (schema version, validation, wire helpers), `lib/fivefretchart.py` (importer, sharing `drumchart.py`'s MIDI/.chart parsing), loader support in `lib/sloppak.py`, a `five_fret` stream in `lib/routers/ws_highway.py`, converter support in `scripts/ch_to_sloppak.py` / `scripts/sloppak_to_ch.py`, and a `five_fret_parts` library column and filter. No renderer, input or engine yet (Plan 2).

**Tech Stack:** Python 3 (mido, pytest), JSON Schema (feedpak-spec `tools/validate.py`), core JS tests only where the WS shape is consumed (none in this plan).

**Spec:** `docs/superpowers/specs/2026-10-20-plastic-controllers-design.md` (sections "Charts", "Importer (core)", "feedpak shape (fork only)").

## Global Constraints

- Work in **git worktrees**, never in the shared checkouts other sessions use (Matt's instruction). One worktree per repo: `feedpak-spec` and `feedBack`, under `feedback-upstream/.worktrees/`.
- Commit as `mattromano <42412983+mattromano@users.noreply.github.com>` with `git commit -s`.
- Preserve CRLF files (core `CHANGELOG.md` is CRLF): edit in binary mode.
- feedpak change stays in **Matt's fork** (`mattromano/feedpak-spec`): branch `fep/five-fret-charts` off `custom`, merged into `custom`. **Never open an issue or PR on `got-feedBack/feedpak-spec`.**
- Core branch `feature/five-fret-charts` off the fork's integration branch per `slopsmith-custom/FORK-HANDOFF.md`. Push to `origin` (the mattromano fork) only.
- **Silent testing** (Matt): never launch anything with sound without asking; debug while paused, over CDP.
- Testing in the **installed app only** (`slopsmith-custom/feedback-fork/debug/README.md`: `launch-debug.sh`, `cdp.mjs`, `dev-sync.sh`). Never the browser dev server or the Claude app's browser. Ask before quitting Matt's running copy; leave nothing playing.
- Credits: the new importer extends `drumchart.py`'s parsing, so its header carries the same Moonscraper (Alexander Ong) / YARC LGPL-3.0 credit as `drumchart.py` lines 1–58.
- Tests: core `.venv/bin/python -m pytest tests -q`; feedpak-spec `python -m pytest tests -q` and `python tools/validate.py examples/extended.feedpak`.

## Decisions this plan locks in (builder's calls from the spec)

- **Field names follow `drum_tab`:** levels are `{notes, generated?}` (as `drum_tab` uses `generated: true`), not the spec's draft `hand_charted`.
- **HOPOs are resolved at import.** Each note stores its final `h: true` (hammer-on/pull-off) or nothing; there is no `hopo_threshold` in the file. The engine (Plan 2) never recomputes natural HOPOs.
- **Note shape:** `{ "t": seconds, "f": fret bitmask (bit0 green … bit4 orange; 0 = open), "l"?: sustain seconds, "h"?: true, "tap"?: true }`. Times are audio seconds with `song.ini` delay applied, rounded to 4 places (as `drumchart._finish`).
- **Part ids:** `guitar`, `rhythm`, `bass`. Arrangement entry ids `five_fret_guitar`, `five_fret_rhythm`, `five_fret_bass`; files `five_fret_guitar.json` etc.
- **Fork version:** 1.21.0 in the fork's CHANGELOG, headed "(fork only, not upstream)".

## Review Focus

1. **A Clone Hero song with guitar and bass but no drums** must convert (today `ch_to_sloppak.prepare_chart` raises "the expert drums part has no notes"). Test in Task 6.
2. **A pack whose only arrangements are `five_fret` entries** must load without error, with zero fretted arrangements and no crash in `ws_highway` song_info. Test in Task 4.
3. **Open note and fretted note on the same tick** (common in Clone Hero charts): keep the fretted chord, drop the open. Test in Task 3.
4. **Chords are never natural HOPOs**, but a forced-HOPO marker over a chord makes it one. Test in Task 3.
5. **An unreadable or schema-invalid `five_fret_*.json`** disables only that part with a warning and never aborts the load (the `_load_drum_tab_file` posture). Test in Task 4.

---

### Task 1: feedpak fork: five-fret parts (1.21.0, fork only)

**Files (in a `feedpak-spec` worktree on `fep/five-fret-charts`, from `custom`):**
- Modify: `spec/feedpak-v1.md` (§5.2 arrangements table: `type: five_fret` and the `five_fret` / `instrument` / `pairs_with` keys; new §7.10 `five_fret_<id>.json` after §7.9 `rigs.json`; conformance checklist line in §10)
- Create: `schemas/five-fret.schema.json`
- Modify: `schemas/manifest.schema.json` (arrangement entry keys)
- Modify: `examples/extended.feedpak` (add a `five_fret_bass` entry and file)
- Modify: `CHANGELOG.md` (`[1.21.0]` "fork only, not upstream")
- Modify: `tools/validate.py` only if it maps side-file keys to schemas by name (check; follow how `drum_tab` is wired)
- Test: `tests/test_validate.py`

**Interfaces:**
- Produces (on disk, relied on by every later task):
  - arrangement entry: `{ id: "five_fret_bass", name: "Bass (5-fret)", type: "five_fret", instrument: "guitar"|"rhythm"|"bass", five_fret: "five_fret_bass.json", pairs_with?: "<arrangement id>" }`, no `file`, MUST NOT be graded as fretted.
  - file: `{ version: 1, name, instrument, source: { kind: "chart"|"auto", origin?: "chorus"|"local"|"rb", md5?, charter?, generator?, generator_version?, from_arrangement? }, notes: [Note] (Expert), levels?: { easy|medium|hard: { notes: [Note], generated?: true } }, star_power?: [{start_time,end_time}], solos?: [{start_time,end_time}] }` with Note as in "Decisions".
  - Schema: `f` integer 0–31; `t` number ≥ 0; `l` number > 0; `h`, `tap` booleans; `version` const 1; `source.kind` required.

- [ ] **Step 1: Write the failing tests** in `tests/test_validate.py`:
  - `test_five_fret_example_validates`: `validate.py` on `examples/extended.feedpak` exits 0 and reports the `five_fret_bass.json` side file checked.
  - `test_five_fret_rejects_bad_fret_mask`: a five_fret file with a note `{"t":1,"f":32}` fails validation.
  - `test_five_fret_requires_source_kind`: a file without `source.kind` fails.
- [ ] **Step 2: Run** `python -m pytest tests/test_validate.py -q`. Expected: the three new tests FAIL.
- [ ] **Step 3: Write the schema, spec text, example and CHANGELOG.** Spec text is FEP-shaped (Summary, Motivation, On-disk shape, Backward compatibility, Version impact) so it can go upstream later unchanged. Backward compatibility paragraph says: older Readers skip the entry (no `file`/`notation`); a strict older Reader may reject a `file`-less entry that isn't `type: drums`.
- [ ] **Step 4: Run** `python -m pytest tests -q && python tools/validate.py examples/extended.feedpak && python tools/check_versions.py`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(spec): five-fret parts (1.21.0, fork only)`; merge `fep/five-fret-charts` into `custom` with `--no-ff` (as `51facc6` did for drums); push `custom` and the branch to `origin` only.

### Task 2: Core `lib/fivefret.py`: schema version, validation, wire helpers

**Files (core `feedBack` worktree on `feature/five-fret-charts`):**
- Create: `lib/fivefret.py`
- Test: `tests/test_fivefret_lib.py`

**Interfaces:**
- Produces:
  - `SCHEMA_VERSION = 1`, `PARTS = ("guitar", "rhythm", "bass")`, `LEVELS = ("easy", "medium", "hard")`
  - `validate_five_fret(data: object) -> tuple[bool, str]`, the same contract as `drums.validate_drum_tab` (`lib/drums.py:188`), checking exactly what the schema in Task 1 checks.
  - `notes_to_wire(notes: list) -> list[dict]`: drops invalid notes and sorts by `(t, f)`.
  - `levels_to_wire(levels: dict | None) -> dict`: `{level: {"total": n, "generated": bool}}`, the way `drums.levels_to_wire` works.
  - `ranges_to_wire(spans) -> list`: the same as `drums.ranges_to_wire`. Import it; don't copy it.

- [ ] **Step 1: Write the failing tests:** `test_valid_minimal` (`{"version":1,"name":"Bass","instrument":"bass","source":{"kind":"chart"},"notes":[{"t":0.5,"f":1}]}` → `(True, "")`), `test_bad_mask` (`f: 32` → False, reason mentions `f`), `test_bad_instrument` (`"keys"` → False), `test_open_note_ok` (`f: 0` → True), `test_levels_to_wire` (`{"hard":{"notes":[...2],"generated":True}}` → `{"hard":{"total":2,"generated":True}}`), `test_notes_to_wire_sorts_and_drops` (unsorted, plus one `{"t":"x"}`, gives sorted valid notes only).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_fivefret_lib.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/fivefret.py`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five-fret part validation and wire helpers`.

### Task 3: Core importer `lib/fivefretchart.py`

**Files:**
- Create: `lib/fivefretchart.py`
- Modify: `tests/drum_fixtures.py`: `write_chart` gains `section="ExpertDrums"` and `extra_sections: dict[str, list]` so a test can write `[ExpertSingle]` / `[ExpertDoubleBass]` etc. The default keeps today's output byte-identical.
- Test: `tests/test_fivefretchart.py`

**Interfaces:**
- Consumes from `lib/drumchart.py` (public already or used by `vocalchart.py`): `read_mid`, `track_events`, `TempoMap`, `load_song_ini`, `ini_delay_seconds`, `ini_bool`, `find_chart_file`, `DIFF_START`, `_chart_sections`, `_chart_song_section`, `_normalize_text`. **Make the four underscored helpers public** (`chart_sections`, `chart_song_section`, `normalize_text`), keeping the old names as aliases so `drumchart`'s own callers don't change.
- Produces:
  - `@dataclass FretNote(time: float, frets: int, length: float = 0.0, hopo: bool = False, tap: bool = False, tick: int = 0)`
  - `@dataclass FiveFretChart(part: str, notes: list[FretNote], tempo: TempoMap, offset: float = 0.0, star_power: list = [], solos: list = [], levels: dict = {}, levels_generated: list = [], source_format: str = "")` (with `field(default_factory=...)`)
  - `MID_TRACKS = {"guitar": ("PART GUITAR",), "rhythm": ("PART RHYTHM", "PART GUITAR COOP"), "bass": ("PART BASS",)}`
  - `CHART_SECTIONS = {"guitar": "Single", "rhythm": "DoubleRhythm", "bass": "DoubleBass"}` (prefixed `Expert`/`Hard`/`Medium`/`Easy`)
  - `parse_mid(path, ini=None, part="guitar", difficulty="expert") -> FiveFretChart`: raises `ValueError` when the part's track is missing
  - `parse_chart(path, ini=None, part="guitar", difficulty="expert") -> FiveFretChart`: same
  - `load_song_folder(folder) -> tuple[dict[str, FiveFretChart], dict]`: `{part: chart}` for every part with Expert notes (lower levels read into `chart.levels` as `drumchart.load_song_folder` does), plus the ini
  - `five_fret_json(chart, source: dict, name: str | None = None) -> dict`: the Task 1 file shape
  - `ensure_levels(chart) -> None`: fills missing Easy/Medium/Hard by reducing Expert and appends them to `levels_generated`

**Rules (pin these; confirm the numbers against YARG.Core's `MidReader` / `ChartReader` and Moonscraper before coding, and note any correction in the file header):**
- **MIDI**, per difficulty base `b = DIFF_START[d]` (60/72/84/96): frets `b..b+4`; force HOPO `b+5`; force strum `b+6`; tap `104` (all difficulties); solo `103`; overdrive `116`; open notes: when the track has text event `[ENHANCED_OPENS]`, note `b-1` is an open; Phase Shift sysex open markers (type `0x01`) as YARG reads them.
- **.chart:** `N 0..4` frets, `N 5` flips that tick's natural HOPO state, `N 6` tap, `N 7` open; `S 2` star power; `E solo` / `E soloend`. Sustains from the `N` length.
- **Natural HOPO:** a single note (not a chord) whose fret differs from the previous note's, starting within the threshold after it. Threshold in ticks: `song.ini` `hopo_frequency` if set; else `resolution/2 + 1` if `eighthnote_hopo` is true; else `resolution/3 + 1`. Forced HOPO / forced strum override this, and a forced HOPO can apply to a chord. Taps also count as `hopo` = False with `tap` = True.
- **Sustain cutoff:** lengths below `resolution/3` ticks become 0 (or `song.ini` `sustain_cutoff_threshold` if set).
- **Chords:** notes on the same tick merge into one `FretNote` with OR-ed frets. An open plus frets on one tick keeps the frets and drops the open.
- **Delay:** `ini_delay_seconds(ini)` is added to every time, as in drums.
- **`ensure_levels` reduction** (simple on purpose; Plan 5 replaces it once benchmarked):
  - Hard: keep a note only if it starts ≥ 0.10 s after the previous kept note; chords of 3+ keep their lowest and highest fret.
  - Medium: same with 0.20 s; chords keep the lowest and highest fret, at most 2; orange folds to blue (bit 4 → bit 3).
  - Easy: same with 0.35 s; single notes only (the lowest fret); blue and orange fold to yellow.
  - All levels: HOPO flags dropped below Hard.

- [ ] **Step 1: Write the failing tests** (fixtures from `tests/drum_fixtures.py` with `track_name="PART GUITAR"` / `extra_tracks`):
  - `test_mid_expert_frets_and_chords`: notes 96 and 98 at tick 0 plus 100 at tick 480 (TPQ 480, 120 bpm) → `[(0.0, 0b00101), (0.5, 0b10000)]`.
  - `test_mid_forced_hopo_and_strum`: two single notes 120 ticks apart, different frets, gives `hopo` True on the second (natural; the threshold at TPQ 480 is 161). The same pair 240 ticks apart gives False. Adding note 102 over the second gives False; adding 101 over a chord gives True.
  - `test_chord_never_natural_hopo`
  - `test_open_plus_fret_keeps_fret`: `[ENHANCED_OPENS]` with notes 95 and 97 at one tick → frets `0b00010`.
  - `test_tap_note`: note 104 over a note gives `tap` True.
  - `test_sustain_cutoff`: lengths of 100 ticks → 0; 480 ticks → 0.5 s.
  - `test_star_power_and_solo_ranges`
  - `test_delay_applied`: `song.ini delay = 250` shifts every time by 0.25.
  - `test_chart_parts`: a `.chart` with `[ExpertSingle]` and `[ExpertDoubleBass]` → `load_song_folder` returns keys `{"guitar","bass"}`. `N 5` flips HOPO, `N 6` gives tap, `N 7` gives open (`f == 0`).
  - `test_missing_part_raises`: `parse_mid(..., part="bass")` on a guitar-only file raises `ValueError`.
  - `test_bass_only_folder`: only `PART BASS` → `{"bass"}`.
  - `test_lower_levels_read_and_generated`: the chart's own Hard is kept and not in `levels_generated`; missing Medium/Easy are generated, in `levels_generated`, Medium has no orange (bit 4), Easy has single notes only.
  - `test_five_fret_json_validates`: output passes `fivefret.validate_five_fret`.
  - `test_drumchart_unchanged`: the existing `tests/test_drumchart.py` still passes (run, don't duplicate).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_fivefretchart.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/fivefretchart.py` (header credit as in Global Constraints) and the `drumchart` public aliases.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_fivefretchart.py tests/test_drumchart.py tests/test_vocalchart.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Rock Band / Clone Hero 5-fret importer`.

### Task 4: Loader: five-fret parts in `lib/sloppak.py`

**Files:**
- Modify: `lib/sloppak.py` (`LoadedSloppak` near l.700–777; the arrangement loop near l.1025–1050; a `_load_five_fret_file` next to `_load_drum_tab_file` at l.780)
- Test: `tests/test_sloppak_five_fret_parts.py` (model on `tests/test_sloppak_drum_parts.py`)

**Interfaces:**
- Consumes: `fivefret.validate_five_fret`.
- Produces: `LoadedSloppak.five_fret_parts: list[dict] | None`, each entry `{"id", "name", "instrument", "source_kind", "pairs_with", "five_fret": <parsed file>}` in manifest order. `None` when the pack has none.

- [ ] **Step 1: Write the failing tests:**
  - `test_five_fret_entry_loaded`: a dir pack with one `type: five_fret` bass entry → one part with `instrument == "bass"` and `source_kind == "chart"`.
  - `test_five_fret_never_fretted`: `song.arrangements` doesn't include it, even when the entry also carries a `file`.
  - `test_only_five_fret_pack_loads` (Review Focus 2).
  - `test_invalid_file_disables_part_only` (Review Focus 5): bad JSON in one of two parts leaves one part loaded and logs a warning.
  - `test_traversal_rejected`: `five_fret: "../x.json"` gives no part.
  - `test_drum_parts_unchanged`: a pack with drums plus five_fret keeps `drum_parts` as before.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_sloppak_five_fret_parts.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Route on `type` first, exactly like the drums gate (`is_five_fret = _etype == "five_fret"`), before the `file` / `notation` check.
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_sloppak_five_fret_parts.py tests/test_sloppak_drum_parts.py tests/test_sloppak_drumtab_load.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: load five-fret parts from feedpaks`.

### Task 5: Highway WebSocket: stream a five-fret part

**Files:**
- Modify: `lib/routers/ws_highway.py` (song_info near l.640–668; a new block after the drum_tab block; query param next to `drum_part`)
- Test: `tests/test_highway_ws_five_fret.py` (model on `tests/test_highway_ws_drum_parts.py`)

**Interfaces:**
- Consumes: `LoadedSloppak.five_fret_parts`, `fivefret.notes_to_wire` / `levels_to_wire` / `ranges_to_wire`.
- Produces (wire, for Plan 2's renderer):
  - `song_info.five_fret_parts: [{"id","name","instrument","source_kind"}]`: always a list, empty when none.
  - Query `?five_fret_part=<id>`: when given and known, the server sends `{"type":"five_fret","part_id","name","instrument","source_kind","total", "star_power"?, "solos"?, "levels"?: {level:{total,generated}}}`, then `five_fret_notes` chunks `{"type":"five_fret_notes","notes":[...≤500]}`, then per level `five_fret_level_notes` chunks `{"type":"five_fret_level_notes","level","notes":[...≤500]}`. Unknown or absent id: nothing extra (a five-fret stream is opt-in, unlike drums).

- [ ] **Step 1: Write the failing tests:** `test_song_info_lists_parts`, `test_song_info_empty_list_without_parts`, `test_stream_selected_part_chunks` (1,201 notes → 3 `five_fret_notes` frames, totals match), `test_levels_stream`, `test_unknown_part_sends_nothing`, `test_drum_stream_unchanged`.
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_highway_ws_five_fret.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_highway_ws_five_fret.py tests/test_highway_ws_drum_parts.py tests/test_highway_ws_drum_metadata.py -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: stream five-fret parts over the highway WebSocket`.

### Task 6: Converters: `ch_to_sloppak.py` writes 5-fret parts; `sloppak_to_ch.py` writes them back

**Files:**
- Modify: `scripts/ch_to_sloppak.py` (`prepare_chart`, `convert` near l.145–215; bump `FEEDPAK_VERSION` to `"1.21.0"`)
- Modify: `scripts/sloppak_to_ch.py`
- Test: `tests/test_ch_to_sloppak_five_fret.py`; extend `tests/test_sloppak_to_ch.py`

**Interfaces:**
- Consumes: `fivefretchart.load_song_folder`, `ensure_levels`, `five_fret_json`.
- Produces: packs with `five_fret_<part>.json` files and `type: five_fret` entries (names "Guitar (5-fret)", "Rhythm (5-fret)", "Bass (5-fret)"; `source: {"kind":"chart","origin":"local"}`, plus `"md5"` when the source is a `.sng` whose md5 the caller passes in). Drums become **optional**: a folder with 5-fret parts and no drums converts (Review Focus 1); a folder with neither still raises `ValueError`.
- `prepare_chart` splits into `prepare_drums(folder) -> tuple[DrumChart | None, dict]` and the five-fret load; `duration` uses the last time across drums hits and 5-fret notes.
- `sloppak_to_ch`: writes `PART GUITAR` / `PART RHYTHM` / `PART BASS` into the output `notes.mid`, with frets at the difficulty bases, forced HOPO (`b+5`) on notes with `h`, forced strum (`b+6`) on single notes without `h` (so the round trip is exact regardless of threshold), 104 taps, 116 star power, 103 solos, `[ENHANCED_OPENS]` and `b-1` for opens. Generated levels are not written back.

- [ ] **Step 1: Write the failing tests:** `test_guitar_and_bass_no_drums_converts`, `test_drums_plus_bass_converts_both`, `test_neither_raises`, `test_manifest_entries_and_version` (`feedpak_version == "1.21.0"`, entry ids, no `file`), `test_round_trip_expert_exact` (convert, then `sloppak_to_ch`, then import again: identical Expert notes, flags included).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_ch_to_sloppak_five_fret.py tests/test_sloppak_to_ch.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests -q -k "ch_to_sloppak or sloppak_to_ch or drumchart or fivefret"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Clone Hero conversion keeps guitar, rhythm and bass parts`.

### Task 7: Library index and filter

**Files:**
- Modify: `lib/sloppak.py` metadata extraction (near l.1595–1625): `"five_fret_parts": ["bass:chart", "guitar:auto", ...]` from the manifest's `type: five_fret` entries (instrument plus `source.kind`, read from the file's `source` and defaulting to `chart` when it can't be read)
- Modify: `lib/metadata_db.py`: a `five_fret_parts TEXT` column (JSON list) added the way `has_vocal_pitch` was (`ALTER TABLE` migration near l.566; NULL for non-sloppak rows); read/write alongside `has_vocal_pitch` (near l.3153–3212); filter param `five_fret: str | None` in the query builders that take `has_lyrics` (near l.3691, 3818, 3953, 4252, 4651)
- Modify: `lib/routers/library.py`: `/api/library` accepts `five_fret`
- Test: `tests/test_library_five_fret.py` (model on `tests/test_library_vocal_pitch.py`)

**Interfaces:**
- Produces: the `five_fret` filter value grammar: `any` (any 5-fret part); `guitar` | `rhythm` | `bass` (that part, real or auto); `guitar:chart` etc. (that part, real only). Implemented as `EXISTS (SELECT 1 FROM json_each(five_fret_parts) WHERE value = ? / LIKE ?)`. Build-a-Band's song filters (its Plan 2+) consume this.

- [ ] **Step 1: Write the failing tests:** `test_meta_lists_parts`, `test_migration_adds_column`, `test_filter_any`, `test_filter_part`, `test_filter_part_real_only` (an `auto` bass doesn't match `bass:chart`), `test_rescan_updates` (adding a part and rescanning makes the song match).
- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_library_five_fret.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests -q`. Expected: PASS, apart from failures that also happen on the base branch (compare with a base-branch run before claiming any).
- [ ] **Step 5: Commit** `feat: library index and filter for five-fret parts`. Add a CHANGELOG `[Unreleased]` entry (CRLF) for Tasks 2–7.

### Task 8: Real-app check

No new code. Proves the chain end to end in the installed app, **silently**: never start playback, count-in, metronome, hit sounds or previews without asking Matt first. Load and inspect while paused, read state over CDP and WebSocket frames, and take screenshots. If anything starts playing, pause it at once and confirm the playhead stopped.

- [ ] **Step 1: Make a test pack** from a real Clone Hero chart with guitar and bass. The drums cache `~/.cache/slopsmith-drums/sng/` holds `.sng` files that Chorus downloads gave us. Pick one with `PART GUITAR` and `PART BASS` (`python -c` with `lib/sngfile.py` to list its `notes.mid` tracks). Run `scripts/ch_to_sloppak.py` on it into a scratch folder, then `python feedpak-spec/tools/validate.py` on the output: exit 0.
- [ ] **Step 2: Install the core changes** with `slopsmith-custom/feedback-fork/dev-sync.sh`, and copy the test pack into the app's library folder (ask Matt first if the app is running; never quit his copy unasked).
- [ ] **Step 3: With `launch-debug.sh` and `cdp.mjs`:** rescan the library, then confirm `/api/library?five_fret=bass` returns the song, and `?five_fret=guitar:auto` doesn't.
- [ ] **Step 4: Without playing it**, read `song_info.five_fret_parts` from the highway WebSocket via `cdp.mjs` (it lists guitar and bass). Open a second socket with `?five_fret_part=five_fret_bass` and check that the `five_fret` frame `total` equals the note count in the pack's file.
- [ ] **Step 5: Check nothing else moved, silently.** The song's drums (if any) still load in the drums plugin, and a normal guitar song still loads its arrangements. Check both while paused. Leave nothing playing.
- [ ] **Step 6: Record the result** (song used, counts, any surprises) in the plan's review section below and in the shared notes folder.

## Later plans (each written when its turn comes)

2. **Five-fret plugin and gamepad input:** core `gamepad-input` capability domain (claim/release; `static/v3/gamepad.js` ignores claimed controllers); new `feedBack-plugin-five-fret` with the tilted 3D renderer (option A), YARG five-fret engine port (LGPL files + NOTICE.md), Xbox controller profile, controls/rebinding/calibration screen, solo play in the normal player.
3. **Build-a-Band controller parts:** Start-to-join columns, part types `five_fret_controller` and drums `controller`, shared parts, N lanes, part-audio-on-miss state machine, filters and results.
4. **Library tool for real guitar/bass charts:** extend `drums_library.py` / `chorus.py` / `drumjoin.py` to 5-fret parts, reusing drum alignment by md5.
5. **Auto-charter and benchmark:** `lib/fivefret_autochart.py` (Onyx-derived, GPL v3 credit), benchmark report; the pass line is agreed with Matt before switching it on.
6. **Controller drums:** gamepad source in `feedBack-plugin-drums`.

## Review

(Filled in after Task 8.)
