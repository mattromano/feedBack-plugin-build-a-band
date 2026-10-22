# Plastic controllers, Plan 5: auto-charter and benchmark

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 5-fret Expert/Hard/Medium/Easy charts from a song's real-guitar arrangement (Onyx's method, ported to Python). Benchmark them against real Clone Hero charts for the same songs. Keep them hidden from players until they pass a fixed pass line.

**Architecture:**
- **`lib/fivefret_autochart.py`** (GPL v3 credit) holds the port: pitch events from an `Arrangement`, Onyx's midi-ch lane assignment and `distinguishFrets`, the HOPO/tap/sustain rules, and the `gryboReduce` lower levels with 4- and 3-lane limits.
- **`lib/fivefret_bench.py`** (our own code, AGPL) holds the pure metrics and the pass line.
- **Two scripts:**
  - `scripts/five_fret_benchmark.py` is read-only on the library. It works on scratch copies.
  - `scripts/five_fret_autochart.py` is the offline per-song and library command. It writes only with `--write`, and only after a backup.
- **The player-side gate** is a five-fret plugin setting, `showAutoCharts`, default off.

**Tech Stack:** Python 3 (pytest, numpy, PyYAML as already used), plugin JS (node `npm test`).

**Spec:** `feedBack-plugin-build-a-band/docs/superpowers/specs/2026-10-20-plastic-controllers-design.md`, section "Auto-charts" (also "Testing and acceptance": auto-charter unit tests and benchmark report).

**Onyx source ported:** [mtolly/onyx](https://github.com/mtolly/onyx) at commit `be402a777cb668fb9133471030c055c5e6956e3e` (GPL-3.0):
- `haskell/packages/onyx-autochart/cbits/midi-ch.cpp`: `midich_compute` (l.42–174), `midich_findInGroups`, `midich_mergable`. This is Onyx's C++ port of Edward Haas's midi-ch autocharter, [EFHIII/midi-ch](https://github.com/EFHIII/midi-ch), GPL-3.0.
- `haskell/packages/onyx-autochart/src/Onyx/AutoChart.hs`: `autoChart` (l.109–117), `distinguishFrets` (l.34–107).
- `haskell/packages/onyx-lib/src/Onyx/Mode.hs`: `simplifyChord` (l.394), `adjustRocksmithHST` (l.407), `proGuitarToFiveFret` (l.467–536).
- `haskell/packages/onyx-lib/src/Onyx/Guitar.hs`: `guitarify'` (l.229), `standardBlipThreshold` = 3/8 beat, `standardSustainGap` = 1/8 beat.
- `haskell/packages/onyx-lib/src/Onyx/Reductions.hs`: `gryboComplete` (l.138–153), `gryboReduce` (l.175–315), `limitFrets*` (l.83–135).

## Global Constraints

- **Core work** happens in the worktree `feedback-upstream/.worktrees/core-five-fret`, branch `feature/five-fret-charts`.
- **Plugin work** happens in `feedback-upstream/feedBack-plugin-five-fret`, branch `main`. Nobody else uses that repo.
- **Commits:** commit as `mattromano <42412983+mattromano@users.noreply.github.com>` with `git commit -s`. Push each finished task to `origin` (the mattromano forks) only. Open no PRs or issues upstream.
- **Core tests:** run from the core worktree with `/Users/mattromano/Desktop/repos/feedback-upstream/feedBack/.venv/bin/python -m pytest tests -q` (shortened below to `PY -m pytest`). **Plugin tests:** `npm test`.
- **The spec gate must stay OK.** Run it from the core worktree: `/private/tmp/claude-501/-Users-mattromano-Desktop-repos-feedback-upstream/c0945d32-92c3-41f1-8b1c-577d2588e200/scratchpad/specvenv/bin/python tools/check_spec_conformance.py --spec ../feedpak-five-fret`. Expected output: OK. This plan changes no schema: auto charts use the existing `source.kind: "auto"`, `generator`, `generator_version` and `from_arrangement`.
- **Never write to `~/Desktop/rocksmith/dlc`.** That rules out stems, packs, unpack caches and app library copies there. The benchmark reads the library only to copy the few JSON members it needs into a scratch stage. Every write goes under the session scratchpad or `pytest`'s `tmp_path`. The Clone Hero caches (`~/.cache/slopsmith-drums/sng/`, `~/Desktop/clone_hero_songs/`) are also read-only.
- **Silent testing:** never start playback, count-in, metronome or previews. **Real installed app only**, through `slopsmith-custom/feedback-fork/debug/` (`launch-debug.sh`, `cdp.mjs`, `dev-sync.sh`). Ask before quitting Matt's running copy, and leave nothing playing.
- **Licence header.** `lib/fivefret_autochart.py` opens with this credit:

  > Ported from Onyx (Michael Tolly, mtolly/onyx, commit be402a7…, GPL-3.0), whose autochart is a port of Edward Haas's midi-ch (EFHIII/midi-ch, GPL-3.0). Licensed GPL-3.0-or-later as a separate file; core feedBack is AGPL-3.0, which GPL-3.0 §13 allows combining with.

  The file also lists the Onyx files and functions above. Nothing else in core copies Onyx code.
- **Labelling.** Auto charts are always labelled. The file has `source.kind: "auto"` and its name ends in "(auto)". The plugin already shows **AUTO CHART** for `sourceKind === 'auto'`.

## Decisions this plan locks in (Matt said finish without his input)

- **Port the algorithm, not the bugs.** `midi-ch.cpp` l.149 dereferences `distinct[g].end()`; port it as `rbegin()` (the last pitch). Its padding bounds `g - gd > 0` / `g + gd < groups.size() - 1` become `g - gd >= 0` / `g + gd <= len(groups) - 1`. Note both in the header.
- **Lane assignment runs on seconds, not ticks.** Only the order of gaps matters to midi-ch, so seconds give the same result. Ties are broken by index.
- **Power chords become adjacent pairs.** This is a spec rule that Onyx doesn't have. A 2-pitch chord with 2 or fewer distinct pitch classes (a power chord or an octave) is limited to adjacent-fret pairs when it is placed and when `distinguish_lanes` moves it.
- **Open notes.** An event whose notes are all muted (`mute` / `fret_hand_mute` with no slide) becomes an open note (`f = 0`), as in Onyx (`maybe [Nothing]`).
- **Tremolo stays a sustain.** Onyx splits it into 1/4-beat notes; we don't (YAGNI). It is listed in the header as left out.
- **HOPO and tap carry-over follows Onyx's `adjustRocksmithHST`.** Resolved flags are stored as `h` / `tap`, as Plan 1 does, and no natural-HOPO pass is added on top.
- **Lower levels chain Hard ← Expert, Medium ← Hard, Easy ← Medium** with `gryboReduce`. The lane limit is **always on**: Medium ≤ 4 lanes (G–B), Easy ≤ 3 lanes (G–Y). Onyx makes this optional; the spec doesn't.
- **Plan 1's `ensure_levels` reducer for real charts.** It gets a `reducer` argument: `"simple"` is Plan 1's reducer, `"onyx"` is `reduce_level`. Task 9 runs the reducer benchmark (real Expert → real Hard/Medium/Easy on every cached chart with hand-charted levels). It switches `DEFAULT_REDUCER` to `"onyx"` only if, on the holdout half, `"onyx"` beats `"simple"` on at least 3 of these 4 medians: direction agreement, lane closeness, chord-size agreement, and |log density ratio|. It must do so at every level (Hard, Medium and Easy) and break no fret limit. Otherwise `"simple"` stays the default, and the decision and numbers go in the Review. Auto charts always use `"onyx"`: they are made by the auto-charter, so their levels come from it.
- **Benchmark pairing without Plan 4.** The set is every library pack that has a real 5-fret chart for a part plus a real-guitar arrangement. The real chart is found in one of two ways, tried in order:
  1. the pack's own `type: five_fret` entries with `source.kind: "chart"` (Plan 4 output, already aligned);
  2. the pack's drum part `source.folder` (a cached Clone Hero folder), whose `PART GUITAR` / `PART BASS` / `PART RHYTHM` come through `fivefretchart.load_song_folder`, with every time mapped through the drum part's stored `source.warp` (chart time → song time; `{"offset": x}` or `[[chart_t, song_t], …]`).

  A recon scan on 2026-10-21 found **730 packs** that pair through (2) (most with `PART GUITAR` and `PART BASS`), including the Paramore, Oasis, Sum 41 and Counting Crows songs.
- **Which arrangement a real chart is compared with.** A real `guitar` / `rhythm` chart is compared with every non-bass fretted arrangement; a real `bass` chart with every bass arrangement. The arrangement with the best **onset F1** is kept. Selection uses note timing only, never the scored lane metrics. A song-part whose best onset F1 is below 0.50 is a different transcription or a bad alignment: it is reported as `unpaired` and left out of the verdict.
- **Holdout.** `split(pack_filename)` is `"tune"` when the first byte of `sha1(filename)` is even, otherwise `"holdout"`. Rule changes may only be tuned on the tune half, at most 3 rounds, each one bumping `GENERATOR_VERSION`. The verdict is computed on the holdout half, once per generator version.
- **Pass line.** Medians over holdout song-parts (Expert direction-, lane- and chord-size checks use song-parts with ≥ 20 matched notes), and at least 20 song-parts:

  | Check | Level | Line | Why |
  |---|---|---|---|
  | Direction agreement | Expert | ≥ 0.70 | Three outcomes (left / right / same). Chance is about 0.33, and "always the same lane" scores only the share of repeated notes (about 0.3–0.4 in guitar parts). Two moves in three going the right way is where a chart starts to feel like the song. Two human charts of the same song don't agree perfectly either. |
  | Lane closeness after best shift | Expert | ≤ 1.0 lane | On average within one lane of the real chart's shape once the whole part is slid to line up. |
  | Chord-size agreement | Expert | ≥ 0.60 | A missing or extra chord gem is a miss or a ghost press, so chord size matters for playability. 0.60 allows for Onyx keeping 2–3 notes where a charter wrote 1–2. |
  | Density ratio (auto ÷ real notes per second) | Hard, Medium, Easy | 0.80–1.20 each | Lower levels exist to be easier by a known amount. ±20 % keeps an auto Easy within the effort of a real Easy. |
  | Fret-limit violations | Medium, Easy | 0 | Spec rule (Medium ≤ 4 lanes, Easy ≤ 3), checked on every chart, not as a median. |

  HOPO agreement (accuracy on matched notes, `h` or `tap`) and onset F1 are **reported but not gating**. YARG's engine lets a player strum any HOPO, so a wrong HOPO flag costs nothing at Expert. The report also shows two baselines for direction agreement and lane closeness, as context only: `stay` (every note green) and `absolute` (lane = the pitch's quintile over the whole song).
- **Where auto charts are hidden.** The five-fret plugin setting **`showAutoCharts`** lives in `five_fret.settings.v1`, default `false`, with a checkbox on the plugin's settings page. When it is off:
  - `pickPart` never returns a part whose `sourceKind` is `'auto'`;
  - a song with only auto parts shows the plugin's existing no-part status;
  - Build-a-Band's controller part list (its Plan 3) must read the same flag through `FiveFretProfiles.loadSettings().showAutoCharts`. Note this in Plan 3 when it is written.

  On the generation side, auto charts are made only by `scripts/five_fret_autochart.py`, which is opt-in, a dry run by default, and never run on Matt's library by this plan. If Task 9's holdout verdict passes, the plugin default flips to `true` in a separate commit. Otherwise it stays `false`, and the report says which checks failed.
- **Side-by-side visuals are SVG lane strips in the report, not app screenshots.** A pack can only be shown in the app from Matt's library, and this plan may not write there.
- **The library-tool hook.** The spec asks for the auto-charter to run "in the library tool (and a per-song command)". This plan ships it as its own command, `scripts/five_fret_autochart.py`, which takes single packs or `--library`. It does not depend on Plan 4, which is being written in parallel. If Plan 4's library tool has landed by Task 7, it gets an `--auto` flag that calls `auto_parts()` for the parts it found no real chart for, using the same `--write` / `--backup-dir` rules. That is one extra test, `test_library_tool_auto_flag`, in Plan 4's test file.
- **Real charts win.** `five_fret_autochart.py` never touches a part with `source.kind: "chart"`, and it replaces an older auto part for the same instrument. Plan 4's writer already lets a real chart replace an auto one.

## Review Focus

1. **Bend-only and slide-only notes** (a sustain with `bend > 0` or `slide_to >= 0`) must keep their sustain and not be dropped as blips under 3/8 beat when the RS sustain is long. Test in Task 3.
2. **An arrangement with no beats** (old packs, or `beats: []`) must still chart: `BeatGrid` falls back to 120 bpm from 0 s. Test in Task 1.
3. **A one-pitch phrase between long gaps** (a riff on one note) must stay on one lane, not spread across the highway, and a song whose notes are all one pitch must give all-green. Test in Task 2.
4. **Notes and chords at the same time** (Rocksmith sometimes has a single note inside a chord's time): they merge into one event, with pitches combined before `simplify_chord`. Test in Task 1.
5. **The benchmark must never write under the library root,** even with `--out` or `--stage` pointing there by mistake. It refuses, and a test checks the library file mtimes are unchanged. Test in Task 6.

---

### Task 1: Pitch events and the beat grid

**Files:**
- Create: `lib/fivefret_autochart.py` (header as in Global Constraints)
- Test: `tests/test_fivefret_autochart.py`

**Interfaces:**
- Consumes: `song.Arrangement`, `song.Beat`, `song.base_open_string_midis`, `song.pitch_from_base`, `song.arrangement_string_count`, `song.arrangement_is_bass`; `drumchart.TempoMap` (`tick_to_time`, `beats(end_tick)`, `time_to_tick`).
- Produces:
  - `GENERATOR = "feedback-fivefret-autochart"`, `GENERATOR_VERSION = "1"`
  - `@dataclass BeatGrid(times: list[float], downbeats: list[bool])` with:
    - `from_beats(beats: list[Beat]) -> BeatGrid` (a downbeat is `measure >= 0`)
    - `from_tempo(tempo: TempoMap, end_time: float, offset: float = 0.0) -> BeatGrid`
    - `beat_at(t: float) -> float` (fractional beat index; extrapolated with the edge beat's length; 120 bpm from 0 s when there are fewer than 2 beats)
    - `time_at(b: float) -> float`
    - `beat_len(t: float) -> float` (seconds)
    - `beats_since_measure(t: float) -> float`
  - `@dataclass PitchEvent(time: float, pitches: tuple[int, ...], length: float, sht: str, slide_or_bend: bool = False)`. `pitches` are sorted ascending, and `()` means muted (open). `sht` is `"strum" | "hopo" | "tap"`.
  - `simplify_chord(pitches) -> tuple[int, ...]`
  - `arrangement_events(arr: Arrangement) -> list[PitchEvent]`

**Rules:**
- **Pitch** = `pitch_from_base(base_open_string_midis(count, is_bass), capo, tuning, string, fret)`.
- **Merging and skipped notes:**
  - Notes and chord notes within 1 ms of each other merge into one event.
  - Notes with `ignore` are skipped.
  - A muted note (`mute` / `fret_hand_mute`) with no `slide_to >= 0` contributes no pitch.
- **`simplify_chord` follows Onyx:**
  - 1–2 distinct pitches are kept as they are.
  - If there are 2 or fewer distinct pitch classes, keep the 2 lowest pitches.
  - Otherwise keep the 3 lowest.
- **`sht`:** `hopo` if any note has `hammer_on` / `pull_off`, else `tap` if any has `tap`, else `strum`.
- **`length`** is the longest sustain in the event.
- **`slide_or_bend`** is true when any note has `slide_to >= 0`, `slide_unpitch_to >= 0` or `bend > 0`.

- [ ] **Step 1: Write the failing tests:**
  - `test_pitch_from_tuning_and_capo`: a 6-string guitar note on string 0, fret 3, with tuning `[-2,0,0,0,0,0]` and capo 2 → pitch 43.
  - `test_bass_uses_bass_base`
  - `test_note_inside_chord_merges` (Review Focus 4)
  - `test_simplify_chord`:
    - `(40,47,52)` → `(40,47)`;
    - `(40,44,47,52)` → `(40,44,47)`;
    - `(40,)` → `(40,)`.
  - `test_muted_chord_is_open_event`
  - `test_ignore_skipped`
  - `test_sht_priority`: HO plus tap in one event → `"hopo"`.
  - `test_grid_from_beats_and_extrapolates`
  - `test_grid_without_beats_is_120bpm` (Review Focus 2): `beat_at(1.0) == 2.0`.
  - `test_grid_from_tempo`: TPQ 480 at 120 bpm with `offset=0.25` gives `time_at(4) == 2.25`, and `beats_since_measure(2.25) == 0`.
- [ ] **Step 2: Run** `PY -m pytest tests/test_fivefret_autochart.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the pieces above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: auto-charter pitch events and beat grid (Onyx port, GPL v3 credit)` and push.

### Task 2: Lane assignment (midi-ch) and `distinguish_lanes`

**Files:** Modify `lib/fivefret_autochart.py`. Test: `tests/test_fivefret_autochart.py`.

**Interfaces:**
- Produces:
  - `assign_lanes(groups: list[tuple[int, ...]], times: list[float], lanes: int = 5) -> list[tuple[int, ...]]`. Input is one pitch tuple per event (a non-empty tuple). Output is one sorted lane tuple (0..lanes-1) per event.
  - `distinguish_lanes(groups: list[tuple[int, ...]], out: list[tuple[int, ...]], lanes: int = 5, power: list[bool] | None = None) -> list[tuple[int, ...]]`

**Algorithm** (`midich_compute`; the signature doesn't determine it, so it is spelled out here):
```
flatten events to notes (one per pitch, same time within an event); if only one note → lane 0
rank[i] = index of note i's pitch among the song's sorted distinct pitches
gap[i]  = time[i] - time[i-1] for i ≥ 1 (0 inside an event); visit i in order of (gap, i)
for each i: a = group of i-1, b = group of i
    neither → new group {i-1, i} if distinct ranks ≤ lanes
    one     → add the other note if the group's distinct ranks stay ≤ lanes
    both, different → merge if the union's distinct ranks ≤ lanes
notes left ungrouped become singleton groups
pad: a group with < lanes distinct ranks borrows ranks alternately from the previous group's
     highest and the next group's lowest, widening outwards; then sentinel ranks 9999+k on top
lane(note) = index of its rank in its group's sorted padded rank set
```
**`distinguish_lanes`** (`distinguishFrets`):
- Walk consecutive events.
- When two *different* pitch sets came out as the *same* lane set, move the second event to the nearest lane set of the same size, in the direction of the average-pitch change (up when equal), that differs from both neighbours.
- If the second event can't move that way, move the first event the opposite way.
- Same pitch set → same lanes is never changed.
- When `power[i]`, only adjacent pairs are candidates. The same applies to the initial placement: a power event's two lanes become `(lo, lo+1)`, or `(3, 4)` when `lo == 4`.

- [ ] **Step 1: Write the failing tests:**
  - `test_rising_line_moves_right`: pitches 40, 42, 43, 45, 47 one beat apart → lanes 0, 1, 2, 3, 4.
  - `test_falling_line_moves_left`
  - `test_repeated_pitch_same_lane`
  - `test_bigger_jump_moves_further`: 40, 41, 47 → the second step is larger than the first.
  - `test_one_pitch_riff_stays_put` (Review Focus 3): a 4-note riff on one pitch between two long gaps → one lane. An all-one-pitch song → all lane 0.
  - `test_window_reanchors_after_gap`: two 5-pitch phrases an octave apart, 4 s between them → each phrase uses lanes 0–4.
  - `test_chords_two_or_three_lanes_follow_pitch`: a higher chord gets a higher lowest lane.
  - `test_power_chord_adjacent`
  - `test_distinguish_moves_collision`: two different pitch sets that come out on the same lanes end up on different lanes, moved in the pitch direction.
  - `test_distinguish_keeps_same_pitch_same_lane`
- [ ] **Step 2: Run** `PY -m pytest tests/test_fivefret_autochart.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: auto-charter lane assignment (midi-ch / distinguishFrets port)` and push.

### Task 3: Expert auto-chart

**Files:** Modify `lib/fivefret_autochart.py`. Test: `tests/test_fivefret_autochart.py`.

**Interfaces:**
- Consumes: Tasks 1–2; `fivefretchart.FretNote`, `FiveFretChart`, `five_fret_json`; `drumchart.TempoMap` (a placeholder `TempoMap(resolution=480)` for auto charts; times are absolute).
- Produces:
  - `autochart(arr: Arrangement, grid: BeatGrid, part: str) -> FiveFretChart`: Expert notes only, `levels == {}`, `source_format == "auto"`.
  - `apply_sustains(notes: list[FretNote], grid: BeatGrid, keep: list[bool]) -> None`
  - `apply_hst(notes: list[FretNote]) -> None`

**Rules:**
- Frets are the OR of `1 << lane`; an open event is `0`.
- **Sustains** (`guitarify'`):
  - A sustain is trimmed to end at least 1/8 beat before the next note.
  - A sustain shorter than 3/8 beat becomes 0, unless that event is `slide_or_bend` (`keep[i]`). Such a sustain is only trimmed.
- **`apply_hst`** (`adjustRocksmithHST`, in seconds, in order):
  1. A HOPO right after a tap becomes a tap.
  2. A HOPO that comes ≥ 0.5 s after the previous note and is followed by a tap becomes a tap.
  3. A strum single note within 0.1 s of a single note of a different colour becomes a HOPO when the previous note is not a tap and this note is not open.
- **Chord HOPOs:** chords keep `hopo` when their event was `hopo` (Plan 1 allows forced-HOPO chords).

- [ ] **Step 1: Write the failing tests:**
  - `test_hammer_on_becomes_hopo`
  - `test_tap_carries`
  - `test_tap_then_hopo_becomes_tap`
  - `test_fast_strum_becomes_hopo`: two single notes of different colours, 0.08 s apart.
  - `test_short_sustain_dropped_long_kept`: at 120 bpm, 0.15 s → 0, and 0.5 s is kept.
  - `test_sustain_trimmed_before_next`: the gap is ≥ 1/8 beat.
  - `test_bend_and_slide_keep_sustain` (Review Focus 1)
  - `test_open_from_muted`
  - `test_no_overdrive`: `chart.star_power == []`, and the JSON has no `star_power` key. The spec says auto charts get no overdrive; the lane's quarter-bar-per-phrase rule from Build-a-Band applies.
  - `test_autochart_json_validates`: `five_fret_json(autochart(...), {"kind": "auto", "generator": GENERATOR, "generator_version": GENERATOR_VERSION, "from_arrangement": "lead"}, name="Guitar (auto)")` passes `fivefret.validate_five_fret`.
- [ ] **Step 2: Run** `PY -m pytest tests/test_fivefret_autochart.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Expert auto-chart with HOPO, tap and sustain carry-over` and push.

### Task 4: Lower levels (`gryboReduce`, lane limits) and the `ensure_levels` hook

**Files:**
- Modify: `lib/fivefret_autochart.py`
- Modify: `lib/fivefretchart.py` (`ensure_levels` near l.409; add `DEFAULT_REDUCER = "simple"`)
- Test: `tests/test_fivefret_autochart.py`, `tests/test_fivefretchart.py`

**Interfaces:**
- Produces:
  - `reduce_level(notes: list[FretNote], level: str, grid: BeatGrid, star_power=()) -> list[FretNote]`: `level` is `"hard"`, `"medium"` or `"easy"`, and the input is the level above.
  - `limit_lanes(notes: list[FretNote], lanes: int) -> list[FretNote]`: re-runs `assign_lanes` on the notes' lane sets as "pitches". Skipped when the notes already fit; at a merged position it keeps the strongest of tap > hopo > strum and the shortest sustain.
  - `auto_levels(chart: FiveFretChart, grid: BeatGrid, only_missing: bool = True) -> None`: builds Hard from Expert, Medium from Hard, Easy from Medium, then `limit_lanes(medium, 4)` and `limit_lanes(easy, 3)`. Each generated level is added to `levels_generated`.
  - `fivefretchart.ensure_levels(chart, reducer: str | None = None)`. `None` means `DEFAULT_REDUCER`. `"onyx"` imports `fivefret_autochart` lazily and calls `auto_levels(chart, BeatGrid.from_tempo(chart.tempo, last_time, chart.offset))`.

**`reduce_level` rules** (constants by level: Hard / Medium / Easy):
- **Grid unit and padding:** 0.5 / 1 / 2 beats.
- **Jump limit:** 3 / 2 / 2 frets, applied within 0.5 / 1 / 2 beats.
- **Grace notes:** a strum single note followed within 0.25 beat by a sustained HOPO merges into one strummed sustain, when the first note is on an 8th-note in its measure and the pair doesn't cross into overdrive.
- **Chords:**
  - Hard: chords of 3 or more notes become [lowest, highest] fret, and G+O becomes G+B.
  - Medium: G+X becomes [G, min(X, Y)], R+X becomes [R, min(X, B)], anything else [lowest, highest].
  - Easy: the lowest fret only.
- **Which notes are kept:**
  - Priority = 8·(not in overdrive) + 4·(not sustained) + 2·(not on a measure line) + 1·(not on the grid unit). Lower is kept first; ties go by time.
  - A note is kept only if no kept note lies within ± the padding.
- **HOPOs and chords:**
  - Hard: single-note HOPOs become strums; HOPO chords and taps stay.
  - Medium and Easy: everything becomes a strum.
  - A chord followed by a HOPO chord becomes its lowest note.
  - A HOPO with the same top fret as the previous note becomes a strum.
- **Fast jumps:** when (next top fret − this lowest fret) > the jump limit within the jump time, shift the next note one fret toward this one. One step only, not recursive.
- **Medium and Easy sustains:** cut to end ≥ 1 beat before the next note, and dropped when under 1 beat.

- [ ] **Step 1: Write the failing tests:**
  - `test_easy_three_lanes_medium_four`: a dense 5-lane Expert gives Easy frets ⊆ `0b00111` and Medium ⊆ `0b01111`.
  - `test_easy_single_notes_only`
  - `test_hard_chord_pairs_green_orange_to_blue`
  - `test_medium_chord_rules`
  - `test_density_falls_by_level`: count(Expert) > count(Hard) > count(Medium) > count(Easy) on a 16th-note run.
  - `test_measure_line_notes_preferred`
  - `test_hopos_only_on_hard`
  - `test_medium_sustain_gap`
  - `test_jump_limited`
  - `test_generated_marked`
  - `test_ensure_levels_reducer_switch`: `reducer="onyx"` on a parsed `.mid` fixture yields levels that pass `fivefret.validate_five_fret`; the default (`"simple"`) is byte-identical to before (the existing `test_lower_levels_read_and_generated` still passes).
- [ ] **Step 2: Run** `PY -m pytest tests/test_fivefret_autochart.py tests/test_fivefretchart.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `tests/test_ch_to_sloppak_five_fret.py`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: auto-chart lower levels (gryboReduce port, Medium 4 / Easy 3 lanes)` and push.

### Task 5: Benchmark metrics and pass line, `lib/fivefret_bench.py`

**Files:** Create `lib/fivefret_bench.py` (AGPL, no Onyx code). Test: `tests/test_fivefret_bench.py`.

**Interfaces:**
- Produces:
  - `TOL = 0.07`, `MIN_MATCHED = 20`, `MIN_SONG_PARTS = 20`, `MIN_ONSET_F1 = 0.50`
  - `PASS_LINE = {"expert_direction": 0.70, "expert_lane_closeness": 1.0, "expert_chord_size": 0.60, "density_low": 0.80, "density_high": 1.20}`
  - `lane_center(frets: int) -> float`: the mean set-bit index; open is `-1.0`.
  - `match_notes(real, auto, tol=TOL) -> list[tuple[FretNote, FretNote]]`: greedy one-to-one by smallest |Δt|, returned in time order.
  - `onset_f1(real, auto, tol=TOL) -> float`
  - `direction_agreement(pairs) -> float | None`: over consecutive matched pairs; the sign of the Δcenter must agree, with 0 meaning "same". `None` below 2 pairs.
  - `lane_closeness(pairs) -> float | None`: the minimum over integer shifts −4..4 of the mean |auto − real + shift|.
  - `chord_size_agreement(pairs) -> float | None`: popcount equality, with an open counting as 1.
  - `hopo_agreement(pairs) -> float | None`: equality of `hopo or tap`.
  - `density_ratio(real, auto) -> float | None`: notes per second over the overlap window `[max(first), min(last)]`.
  - `fret_limit_ok(notes, level: str) -> bool`: Easy ⊆ `0b00111`, Medium ⊆ `0b01111`, opens allowed, Hard/Expert always true.
  - `score_levels(real: dict[str, list[FretNote]], auto: dict[str, list[FretNote]]) -> dict[str, dict]`. The keys are `expert`, `hard`, `medium` and `easy`. Each value is `{matched, onset_f1, direction, lane_closeness, chord_size, hopo, density_ratio, fret_limit_ok}`.
  - `split(name: str) -> str`: `"tune"` / `"holdout"` as in Decisions.
  - `verdict(rows: list[dict]) -> dict`:
    - returns `{"pass": bool, "n": int, "checks": [{"name", "level", "value", "line", "ok"}]}`;
    - `rows` are `{"pack", "part", "split", "paired": bool, "levels": score_levels(...)}`;
    - only paired holdout rows count;
    - `n < MIN_SONG_PARTS` gives `pass: False` with a check named `enough_songs`.

- [ ] **Step 1: Write the failing tests:**
  - `test_match_one_to_one_within_tol`
  - `test_direction_perfect_and_inverted`: a mirrored chart scores 0 except on stays.
  - `test_lane_closeness_shift_invariant`: the real chart shifted up by 2 lanes → 0.0.
  - `test_chord_size_and_open`
  - `test_density_ratio_overlap_only`
  - `test_fret_limit`
  - `test_split_deterministic`
  - `test_verdict_pass_and_each_failure`: one check fails per case; a fret-limit violation in any row fails the verdict.
  - `test_verdict_needs_twenty`
  - `test_unpaired_rows_ignored`
- [ ] **Step 2: Run** `PY -m pytest tests/test_fivefret_bench.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five-fret auto-chart benchmark metrics and pass line` and push.

### Task 6: Benchmark script, `scripts/five_fret_benchmark.py`

**Files:** Create `scripts/five_fret_benchmark.py`. Test: `tests/test_five_fret_benchmark.py` (packs built in `tmp_path` with a small zip writer in the test; real-chart folders written with `tests/drum_fixtures.write_mid`).

**Interfaces:**
- Consumes: `fivefret_autochart`, `fivefret_bench`, `fivefretchart.load_song_folder`, `song.arrangement_from_wire`, `song.Beat`, `sloppak.read_member_bytes`, `drumjoin.is_drums_arrangement`.
- Produces:
  - **CLI:** `five_fret_benchmark.py LIBRARY --out DIR [--stage DIR] [--only REGEX] [--limit N] [--split tune|holdout|all] [--reducers] [--svg N]`.
    - `--stage` defaults to `OUT/stage`.
    - Exit code 0 always; the verdict is in the report.
  - `stage_pack(src: Path, stage: Path) -> Path`: copies only `manifest.yaml`, `arrangements/*.json`, `five_fret_*.json` and the drum part's JSON into a dir-form pack under `stage`. Stems are never copied.
  - `real_parts(staged: Path) -> dict[str, dict[str, list[FretNote]]]`: part → level → notes, via (1) the pack's chart five_fret parts or (2) the drum source folder plus warp (Decisions).
  - `warp_fn(warp) -> Callable[[float], float]`: `{"offset": x}` gives `t + x`; pairs give linear interpolation with edge-slope extrapolation.
  - `bench_pack(staged: Path, name: str) -> list[dict]`: rows as in `verdict`, plus `arrangement`, `onset_f1` and baseline numbers (`stay`, `absolute`).
  - `bench_reducers(folder: Path) -> dict`: for a chart with hand-charted levels, `score_levels` of `"simple"` and `"onyx"` against the real levels.
  - **Outputs in `--out`:**
    - `report.json`: rows, verdicts and `generator_version`;
    - `songs.csv`;
    - `report.md`: verdict table, per-level medians, baselines, worst 10 and best 10;
    - `svg/<pack>__<part>.svg`: lane strips, real above auto, the first 30 s of Expert and Easy, for `--svg` songs (default 6: two best, two median, two worst by Expert direction);
    - with `--reducers`: `reducers.json` and `reducers.md`.
  - **Safety:** refuses (exit 2, message) when `--out` or `--stage` resolves inside `LIBRARY`. Opens library zips read-only and never calls `sloppak.resolve_source_dir` / `load_song` (which unpack the whole pack).

- [ ] **Step 1: Write the failing tests:**
  - `test_pairs_via_drum_source_and_warp`: a pack whose drum part's `source.folder` holds a `PART GUITAR` chart, with warp `{"offset": 1.0}` → real notes shifted by 1 s; a lead arrangement with the same tune → row `paired`, Expert onset F1 1.0.
  - `test_pack_own_chart_part_preferred`
  - `test_best_onset_arrangement_chosen`
  - `test_low_onset_unpaired`
  - `test_warp_pairs_interpolate_and_extrapolate`
  - `test_refuses_out_inside_library` (Review Focus 5)
  - `test_library_untouched`: the library's file list and mtimes are identical after a run (Review Focus 5).
  - `test_report_files_written`
  - `test_reducers_mode`
- [ ] **Step 2: Run** `PY -m pytest tests/test_five_fret_benchmark.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: five-fret auto-chart benchmark script (read-only, holdout split)` and push.

### Task 7: The auto-chart command, `scripts/five_fret_autochart.py`

**Files:** Create `scripts/five_fret_autochart.py`. Test: `tests/test_five_fret_autochart_cmd.py`.

**Interfaces:**
- Consumes: `fivefret_autochart.autochart`, `auto_levels`, `BeatGrid.from_beats`; `fivefretchart.five_fret_json`; `drumjoin.SloppakFiles` (read, `save(backup_dir)`); `fivefret.validate_five_fret`.
- Produces:
  - **CLI:** `five_fret_autochart.py PACK... | --library DIR [--only REGEX] [--parts guitar,rhythm,bass] [--write --backup-dir DIR] [--report CSV]`.
    - It is a dry run unless `--write`.
    - `--write` without `--backup-dir` exits 2.
  - `pick_arrangements(manifest: dict) -> dict[str, str]`: part → arrangement id. It skips `type` `drums` / `five_fret` / `keys` / `piano`. It then picks by name, case-insensitive:
    - `guitar` ← the first "Lead", else the first "Combo";
    - `rhythm` ← the first "Rhythm", else the next unused "Combo";
    - `bass` ← the first bass (`type == "bass"` or "Bass" in the name).
  - `auto_parts(sp: SloppakFiles, parts) -> list[dict]`: one action per part, `{"part", "action": "write"|"skip-chart"|"skip-none", "file", "notes"}`.
  - **Written per part:**
    - the file `five_fret_<part>.json` (`source: {"kind": "auto", "generator", "generator_version", "from_arrangement": <id>}`, name "Guitar (auto)" / "Rhythm (auto)" / "Bass (auto)", all four levels with `generated: true` on the lower three);
    - the manifest entry `{"id": "five_fret_<part>", "name": <same>, "type": "five_fret", "instrument": <part>, "five_fret": <file>, "pairs_with": <arrangement id>}`;
    - `feedpak_version` raised to at least `"1.21.0"`.
  - **Never** touches a part whose existing file has `source.kind: "chart"`. It replaces an existing auto part.

- [ ] **Step 1: Write the failing tests** (packs in `tmp_path`):
  - `test_dry_run_writes_nothing`
  - `test_write_adds_parts_and_validates`: the loader (`sloppak.load_song` on the tmp pack) returns `five_fret_parts` with `source_kind == "auto"` for guitar and bass.
  - `test_chart_part_never_replaced`
  - `test_auto_part_replaced`
  - `test_write_requires_backup_dir`
  - `test_backup_made_before_write`
  - `test_pick_arrangements_combo_and_bass`
  - `test_pack_without_beats_still_charts`
- [ ] **Step 2: Run** `PY -m pytest tests/test_five_fret_autochart_cmd.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `PY -m pytest tests -q`. Expected: PASS, apart from failures that also happen on the base commit (compare before claiming any). Then run the spec gate command. Expected: OK.
- [ ] **Step 5: Commit** `feat: offline five-fret auto-chart command (dry run by default)`, add a CHANGELOG `[Unreleased]` entry (CRLF, binary-safe edit) for Tasks 1–7, and push.

### Task 8: Plugin gate `showAutoCharts` (feedBack-plugin-five-fret)

**Files:**
- Modify: `assets/profiles.js` (`defaultSettings` and `normaliseSettings` near l.121–142: `showAutoCharts: false`, boolean-coerced)
- Modify: `assets/session.js` (`pickPart` l.71)
- Modify: `screen.js` (the `pickPart` call at l.286 passes `settings.showAutoCharts`; the default settings object at l.247)
- Modify: `settings.html` (a "Show auto charts" checkbox with the hint "Generated from the guitar arrangement; not yet benchmarked to our pass line", saved through `FiveFretProfiles.saveSettings({showAutoCharts})`)
- Modify: `CHANGELOG.md`
- Test: `tests/session.test.js`, `tests/profiles.test.js`

**Interfaces:**
- Produces:
  - `pickPart(parts, arrangementName, setting, showAuto = false)`: when `!showAuto`, parts with `sourceKind === 'auto'` are filtered out first, and it returns `null` when nothing is left.
  - `FiveFretProfiles.loadSettings().showAutoCharts: boolean`. Build-a-Band Plan 3 reads this.

- [ ] **Step 1: Write the failing tests:**
  - `pickPart hides auto parts by default`
  - `pickPart shows auto parts when enabled`
  - `pickPart prefers a real part of the asked instrument over nothing`
  - `only-auto song gives null when hidden`
  - `settings default showAutoCharts false and coerces non-booleans`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: hide auto charts unless "Show auto charts" is on` and push `main` to `origin`.

### Task 9: First benchmark run, reducer decision, verdict

No new modules. Everything is written under `$SCRATCH/plan5-bench/`, where `SCRATCH` is the session scratchpad.

- [ ] **Step 1: Reducer benchmark.** Run `PY scripts/five_fret_benchmark.py ~/Desktop/rocksmith/dlc/sloppak --out $SCRATCH/plan5-bench/reducers --reducers --split all`. Apply the Decisions rule to the holdout medians. If `"onyx"` wins:
  - set `fivefretchart.DEFAULT_REDUCER = "onyx"`;
  - update `test_lower_levels_read_and_generated` to the new numbers;
  - run `PY -m pytest tests -q` and the spec gate;
  - commit `feat: real charts' missing levels use the Onyx reducer (benchmarked)` and push.

  Either way, record the medians and the decision in the Review.
- [ ] **Step 2: Tune run.** Run `PY scripts/five_fret_benchmark.py ~/Desktop/rocksmith/dlc/sloppak --out $SCRATCH/plan5-bench/tune-v1 --split tune`. Read `report.md` and the SVGs.
  - Up to 3 rounds of rule changes are allowed, each with a unit test, a `GENERATOR_VERSION` bump and a commit.
  - Only rules already in this plan may change, and only within their stated meaning (thresholds such as the 0.1 s / 0.5 s HST times, padding beats, the sustain blip length).
  - The pass line itself never changes.
- [ ] **Step 3: Holdout run, once per final generator version.** Run `... --out $SCRATCH/plan5-bench/holdout-v<N> --split holdout`. Copy `report.md`'s verdict table into the Review.
- [ ] **Step 4: Act on the verdict.**
  - **Pass:** in the plugin, change the `showAutoCharts` default to `true` (test updated), commit `feat: show auto charts by default (benchmark passed, see plan 5 review)`, and push.
  - **Fail:** the default stays `false`. The Review names the failed checks and the closest miss.

  In both cases, nothing is written to the library.
- [ ] **Step 5: Copy** `report.md` and 6 SVGs into the shared notes folder for Matt, and link them from the Review.

### Task 10: Real-app check (silent, read-only)

No new code. Nothing plays. Never start playback, previews or count-ins.

- [ ] **Step 1:** Install the plugin change with `slopsmith-custom/feedback-fork/dev-sync.sh` (core needs no install: the auto-charter is offline only). Ask Matt before quitting his running copy.
- [ ] **Step 2:** Run `launch-debug.sh`, then use `cdp.mjs` to read `FiveFretProfiles.loadSettings()`. Expected: `showAutoCharts` matches Task 9's outcome.
  - Toggle the settings-page checkbox and read the setting back: it changed.
  - Restore it.
- [ ] **Step 3:** While paused, load `paramore-misery_business-5fret_test.sloppak`, which is already in the library and has real parts only. The 5-Fret panel still picks the real bass/guitar part with the gate on and with it off.
- [ ] **Step 4:** Showing an auto part in the app needs a pack with auto parts in Matt's library. That is a library write, which this plan doesn't make. Record in the Review that the in-app auto-chart check waits for Matt to run `scripts/five_fret_autochart.py --write --backup-dir …` on songs he picks. Leave nothing playing, and quit the app only if it wasn't running before.

## Later plans

6. **Controller drums:** a gamepad source in `feedBack-plugin-drums`.

## Review

Built 2026-10-21 with subagent-driven development: a fresh implementer per task, a task review after each, and a final whole-branch review on the most capable model followed by one fix wave. Nothing is merged; the coordinating session merges.

**Branches (pushed to origin):**
- Core `feature/five-fret-autochart` (worktree `.worktrees/core-p5`, cut from `feature/five-fret-charts` @ d4e7483), 12 commits, head **d89d11f**:
  9043ac6 pitch events + beat grid · e9de3f2 lane assignment · d489616 Expert auto-chart · e52ff6c, ae563d4 lower levels (+ ms-rounding tolerance fix) · a449cf5 metrics + pass line · 67f3cae, 35eb103 benchmark script (+ safety fix) · a0bb599 auto-chart command + CHANGELOG · 0930451, 9605c93 tune rounds 1–2 · d89d11f final-review fixes (generator v4).
- Plugin `feature/auto-chart-gate` (worktree `.worktrees/fivefret-p5`, cut from `main` @ 686bb98), 3 commits, head **00d9dc6**: 87b9536 gate, 1ca7c00 test fix, 00d9dc6 hint text. `main` is untouched.

**Tests:**
- Core full suite: 3207 passed, 6 skipped. The base had 3097 passed, so this adds 110 tests and introduces no failures.
- Spec gate: OK. There is no schema change.
- Plugin: `node --test tests/*.test.js` gives 138/138. The plugin has no `package.json`, so `npm test` does not exist.

**Reducer benchmark (Task 9 Step 1, commit 35eb103, `--split all`, 804 s).**
- Pairing counts: 2334 packs, 831 staged, 1371 song-parts paired, 40 unpaired.
- Skipped: no_drum_source 1418, no_five_fret_parts 97, gp_no_folder 54, windows_path_unmapped 30, null_warp 1.
- The comparison runs over 1269 real chart parts that have hand-charted levels; 645 of them are in the holdout half. Holdout medians:

| level | reducer | direction ↑ | lane closeness ↓ | chord size ↑ | \|log density\| ↓ | fret-limit violations |
|---|---|---|---|---|---|---|
| hard | simple | 0.984 | 0.063 | 1.000 | 0.181 | 0 |
| hard | onyx | 0.970 | 0.071 | 1.000 | 0.112 | 0 |
| medium | simple | 0.900 | 0.359 | 0.997 | 0.351 | 0 |
| medium | onyx | 0.851 | 0.407 | 1.000 | 0.161 | 0 |
| easy | simple | 0.758 | 0.438 | 1.000 | 0.422 | 0 |
| easy | onyx | 0.723 | 0.468 | 1.000 | 0.336 | 0 |

**Decision: `DEFAULT_REDUCER` stays `"simple"`.** `"onyx"` beats it on at most 2 of the 4 medians at each level (density everywhere, plus chord size at Medium). It loses on direction and lane closeness.

**Tuning (tune half only):**
- **v1** (n 680):
  - Expert: direction 0.862, lane closeness 0.674, chord size 0.965.
  - Density: Hard 1.024, Medium 0.883, Easy **0.717 ✗**.
  - Fret-limit violations: 0 / 0.
- **Round 1, v2:** Easy padding goes from 2 to 1.5 beats (grid unit and jump time stay at 2). Easy density is then 0.795.
  - The other candidates were unit 1 / padding 1 and unit 2 / padding 1, both giving 1.382.
  - In the same commit, the per-level constants were split into Onyx's four values. Hard and Medium are unchanged, verified as identical note lists.
- **Round 2, v3:** Easy padding goes to **1.25 beats**, giving Easy density 0.810. Padding 1.125 tied at 0.810, and the tie went to the larger padding.
- Round 3 was not used.
- **v4** is not a tuning round. It holds the final-review fixes:
  - HOPO/tap thresholds get a float tolerance;
  - a slide/bend sustain is kept only when its untrimmed length is ≥ 3/8 beat;
  - the full GPL credit is added.

**Holdout verdict (pass line unchanged).**

| check | level | v1 | v3 | v4 | line |
|---|---|---|---|---|---|
| song-parts | | 691 | 691 | 691 | ≥ 20 |
| direction | Expert | 0.863 | 0.863 | 0.863 | ≥ 0.70 |
| lane closeness | Expert | 0.671 | 0.671 | 0.671 | ≤ 1.0 |
| chord size | Expert | 0.964 | 0.964 | 0.964 | ≥ 0.60 |
| density ratio | Hard | 1.005 | 1.005 | 1.005 | 0.80–1.20 |
| density ratio | Medium | 0.865 | 0.865 | 0.865 | 0.80–1.20 |
| density ratio | Easy | **0.698 ✗** | 0.805 | 0.805 | 0.80–1.20 |
| fret-limit violations | Medium / Easy | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| **verdict** | | FAIL | **PASS** | **PASS** | |

Notes on the verdict:
- In every column, 46 holdout rows were left out of the density medians because the real chart lacks hand-charted lower levels.
- HOPO agreement (not gating): Expert 0.943.
- Baselines (context only):
  - Expert direction: `stay` 0.415, `absolute` 0.744, auto 0.863.
  - Expert lane closeness: `stay` 0.948, `absolute` 0.873, auto 0.671.

**Disclosure:**
- The v1 holdout numbers came from Step 1's `--split all` reducer run, which printed the holdout verdict alongside its reducer tables. Tuning still used only tune-half numbers.
- The v3 and v4 holdout runs are the official runs, one per generator version.
- The Easy pass is marginal: 0.805 against a 0.80 line.

**Recommendation (ruling 6, so no default changes):**
- **What the benchmark supports:** on its pass line the auto charts are ready to be offered behind the setting. Showing them by default is Matt's call. Easy charts are the thinnest part.
- **What stays as is:** `showAutoCharts` stays **false** in `five_fret.settings.v1`. The checkbox hint now reads "Generated from the Rocksmith arrangements; off by default until approved".

**Real-app check (Task 10): not done in this session.**
- The coordinator is doing one combined app check for Plans 3–5.
- Installing an unmerged plugin branch here could clobber the parallel sessions' installs.
- Showing an auto part in the app still needs auto-chart files merged into packs. That is Plan 4's writer with `--auto`, after the coordinator merges. `scripts/five_fret_autochart.py` only writes to `--out`.

**For the coordinator:**
- Plan 4's tool needs `--auto`, which calls this command's `auto_parts` / `write_pack`.
- `scripts/five_fret_autochart.py` decides "skip-chart" from the loader's validated part list. A real chart that fails validation would therefore be planned as "write". Before wiring `--auto`, read `source.kind` from the raw manifest/JSON instead.
- `pickPart` now takes `opts = { exact?, showAuto? }`. `exact` is accepted and ignored, because Plan 3 defines what it means.

**Artifacts in the shared notes folder** (`side-session-notes/local_a67a5a90-…/5fret-plan5-bench/`):
- `holdout-v4-report.md` and `holdout-v3-report.md`;
- `tune-v1-report.md`;
- `reducers.md`;
- `svg/` (v3) and `svg-v4/`: six lane strips each (two best, two median, two worst by Expert direction).

**Rulings made while building:**
- **Worktrees and push targets:** dispatch overrides.
- **A:** `assign_lanes` takes `grid=` and quantises gaps to 1/32 beat.
- **B:** `PitchEvent.power` is computed from the pitches before simplifying.
- **C:** `score_levels` scores only real levels that are present. Density exclusions are counted.
- **D:** the auto-chart command reuses the benchmark's staging.
- **E:** the auto-chart command writes to `--out` only. It picks the arrangement by Plan 4's rule first, then the Combo/bass fallbacks.
- **F:** `pickPart` takes `opts`.
- **G:** Task 10 is deferred to the coordinator.
- **H:** the report goes to the notes folder in the a67a5a90 session.
- **Groups and padding:** groups are time-sorted for padding (ruling 1 reading).
- **Onyx `fixOne` tie rule:** kept as written.
- **Task 4 Onyx-faithful choices:**
  - the grace merge also applies to chords;
  - open notes stay open until a lane limit applies;
  - `only_missing` keeps Plan 1's semantics.
- **Fret-limit checks:** they count every row, in any split.
- **`--reducers` scope:** only drum-folder-paired packs.
- **`feedpak_version` bump:** left to Plan 4's writer.
- **Plugin hint text:** reworded.

The full ledger lines, with what each ruling costs if wrong, are in this session's report.

## Builder-check rulings (binding; they override the tasks and decisions above where they differ)

A builder check (2026-10-21) found these; each is decided here. The general rule: **follow Onyx and midi-ch as written** (mtolly/onyx @ be402a7) wherever the plan paraphrased them differently.

1. **midi-ch padding.** Borrow by position exactly as midi-ch.cpp l.126–137 does, but time-sort each group's notes first: the previous group's last-added notes and the next group's first-added notes, which are then the nearest in time.
2. **Lane steps.** Drop `test_bigger_jump_moves_further`. A lane is the note's rank inside its group, so add `test_lane_is_rank_within_group` (40, 41, 47 give lanes 0, 1, 2).
3. **Power chords.** A source chord becomes an adjacent pair only when, before `simplify_chord`, it has at most 2 pitch classes and its outer interval is a perfect 4th, 5th or octave. Test a major-third double-stop that stays non-adjacent.
4. **`pickPart` signature:** `pickPart(parts, arrangementName, setting, opts)` with `opts = { exact?, showAuto? }`, as in Plan 3's ruling 2. Plan 5 uses `opts.showAuto`.
5. **The setting** is `five_fret.settings.v1.showAutoCharts`, default false.
   - The settings checkbox writes localStorage directly (the Settings page may not have `profiles.js`), then emits `five_fret:settings-changed` on core's bus.
   - Renderers listen for that event and re-read their settings.
   - The pick cache key includes `showAuto`.
   - Plan 3 owns `window.feedBackFiveFret.showAutoCharts()`; Plan 5 doesn't implement it.
6. **Switching auto charts on.** The pass line in this plan is fixed in advance (Matt asked for no input). The verdict only gets recorded: **the player default stays off even on a pass**, because the spec says switching on is agreed with Matt. Task 9 Step 4 records the verdict and a one-line recommendation, and changes no default.
7. **Off-by-one.** Fix midi-ch l.140's off-by-one along with the other two bounds, and test borrowing from the second-to-last neighbour.
8. **Gap sorting.** Quantise gaps to the beat grid at 1/32-beat resolution (from the chart's beats, or the arrangement's tempo) before sorting. Break ties by index.
9. **`reduce_level` padding** blocks a note only when another kept note lies **strictly** inside ±padding, as in Reductions.hs l.251. Test: steady 8th notes survive on Hard.
10. **Hard HOPOs.** Strum only unsustained single-note HOPOs (Onyx l.264).
11. **`auto_levels`** follows Onyx:
    - Medium is lane-limited to 4 before Easy is reduced from it;
    - `limit_lanes` runs `distinguish_lanes` after `assign_lanes`;
    - open notes become Green when lanes are limited (l.88, l.103).
12. **Fast jumps** follow Onyx l.288–294: both directions, gaps measured from the previous note's sustain end too, and the shifted lane clamped to 0..4.
13. **Benchmark pairing source.**
    - Use the pack's real `type: five_fret` parts first, from Plan 4 once merged.
    - Otherwise use `arrangements/drums.json` → `drums.source.{folder, warp}`.
    - Windows paths (`C:\…`) are remapped by their last folder name under `~/.cache/slopsmith-drums/chorus/` or `sng/` when that exists, else skipped.
    - Skip a null warp, and skip drum parts from Guitar Pro (no folder).
    - Report the counts of each skip reason.
14. **Loading packs in the benchmark.** Stage `manifest.yaml`, the arrangement JSONs and `song_timeline.json` into scratch, then load with `sloppak.load_song` on the staged copy. Never use `arrangement_from_wire` alone, so the manifest's name, type, tuning and capo overrides and the beats apply.
15. **Density medians** use only levels the real chart **hand-charted**. Levels it lacks, or marked `generated`, are excluded and counted.
16. **No pack writer in Plan 5.**
    - Plan 5 builds in its own worktree `.worktrees/core-p5` on `feature/five-fret-autochart`, cut from `feature/five-fret-charts`.
    - Task 7's command writes auto-chart JSON files plus a summary into an `--out` directory only; it never modifies packs.
    - Plan 4's tool, on `feature/five-fret-library`, will gain `--auto` after the coordinator merges both branches.
    - Pairing an auto part with an arrangement follows Plan 4's rule (plan-4 l.40).
    - Remove Task 7's pack-writing tests; add `test_out_dir_only` and `test_refuses_out_inside_library`.
17. **Dry runs** read only `manifest.yaml` and the JSON members, through `zipfile`, never the stems.
18. **Smaller Onyx matches:**
    - a muted note stays pitched if it has either kind of slide (Mode.hs l.500);
    - `distinguish_lanes` moves whole runs of repeated events (AutoChart.hs l.43–45).
19. **Low:**
    - fix the `test_no_overdrive` comment: auto parts get synthesised star-power phrases from the five-fret session (Plan 3 ruling 5), not from the auto-charter;
    - the "shared notes folder" is `/Users/mattromano/Library/Application Support/Claude/side-session-notes/local_a67a5a90-040a-47da-b178-b8f29953a901`.
