# Plastic controllers, Plan 4: library tool for real guitar/bass charts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/drums_library.py --parts guitar,rhythm,bass` finds real Clone Hero / Rock Band 5-fret charts for every song in a sloppak library (local folders and `.sng` files first, then Chorus Encore), lines them up with the song's audio, validates them, and writes them as feedpak `type: five_fret` parts. It reuses the drum join's alignment when the same chart gave the song its drums.

**Architecture:** The tool is extended, not forked. `drums_library.py` gains `--parts`, and its per-song worker hands five-fret songs to a new `lib/fivefretjoin.py`, the five-fret counterpart of `lib/drumjoin.py`. The new module reuses `drumjoin`'s `SloppakFiles`, name matching and `.sng` unpacking, `drumalign`'s offset / warp / snap / validate, and Plan 1's `fivefretchart` importer and `fivefret` validator. `lib/chorus.py` learns per-part search filtering, per-part difficulty counts and per-part stem fetching. Alignment order for each part: (1) the drum join's stored warp, when the drums came from the same chart; (2) a fresh alignment against our guitar / bass stem (full mix when there's no stem). Output is Plan 1's `five_fret_<part>.json` plus a manifest entry.

**Tech Stack:** Python 3 (numpy, mido, PyYAML, pytest). librosa and scipy only for the audio tests and real runs (see Global Constraints).

**Spec:** `feedBack-plugin-build-a-band/docs/superpowers/specs/2026-10-20-plastic-controllers-design.md`, sections "Where 5-fret charts come from" and "Finding real charts (the library tool)". Builds on Plan 1 (`2026-10-20-plastic-controllers-plan-1-charts.md`: `lib/fivefretchart.py`, `lib/fivefret.py`, loader, library index).

## Global Constraints

- **Worktree:** core work only, in `feedback-upstream/.worktrees/core-five-fret` on `feature/five-fret-charts`. Never touch other sessions' checkouts.
- **Commits:** as `mattromano <42412983+mattromano@users.noreply.github.com>` with `git commit -s`. Push each finished task to `origin` (the mattromano fork) with `git push origin feature/five-fret-charts`. No PRs.
- **Two Pythons** (run from the worktree root):
  - `PY=/Users/mattromano/Desktop/repos/feedback-upstream/feedBack/.venv/bin/python` is the core venv. It has numpy, mido, PyYAML and soundfile, but **no librosa and no scipy**, so audio tests skip there.
  - `APY=~/drums-work/.venv/bin/python` has librosa 0.11.0, scipy 1.17.1, soundfile, pytest and fastapi (the env the drum library run used). Run every audio test, the trial and the real-data check with `APY`. Don't install librosa into the core venv: the app doesn't ship it (`drumalign.py` header).
  - Baseline on this branch: `APY -m pytest tests/test_drumjoin.py tests/test_drums_library.py -q` gives 26 passed; with `PY` it gives 6 passed, 2 skipped.
- **CRLF:** core `CHANGELOG.md` is CRLF. Edit it in binary mode.
- **Spec gate stays OK:** `/private/tmp/claude-501/-Users-mattromano-Desktop-repos-feedback-upstream/c0945d32-92c3-41f1-8b1c-577d2588e200/scratchpad/specvenv/bin/python tools/check_spec_conformance.py --spec ../feedpak-five-fret` must print `feedpak spec conformance: OK` after every task that touches `lib/`. If it reports `lib/fivefretjoin.py` missing from `READERS`, add it there (every key it writes is in the fork spec). Never grow `feedpak-spec-exceptions.yml`.
- **No network in tests.** Monkeypatch `chorus._req` / `chorus._range` / `chorus.search`. Point `drumjoin.SNG_CACHE`, `drums_library.CACHE` and `chorus.THROTTLE` at `tmp_path` in every new test that could reach them (today's drum end-to-end test writes "Band - Song" folders into the real `~/.cache/slopsmith-drums/sng`; don't add more).
- **Matt's library is off limits:** nothing in this plan runs the tool, with or without `--write`, against `~/Desktop/rocksmith/dlc` or any folder in it. The trial and the real-data check use **scratch copies** of packs (made with `cp -c`, outside the library) and the cached charts. Running it on the real library is Matt's step; Task 6 gives him the commands.
- **Chorus Encore politeness unchanged:** `chorus._throttle`, `_req` retries and the `min_gap` values stay as they are. One request at a time per machine.
- **Silent:** nothing in this plan starts the app or plays audio.

## Decisions this plan locks in (Matt said to finish without input; reasons given)

- **Extend `drums_library.py` with `--parts`, no rename.** `--parts drums` (the default) runs exactly today's code path. `--parts guitar,bass` (any of `guitar`, `rhythm`, `bass`) runs the five-fret path. Mixing `drums` with five-fret parts in one run is an argparse error. *Why:* the script name is in Matt's notes, logs and tests. A `charts_library.py` plus wrapper would add a file and an indirection for no behaviour. The five-fret logic lives in `lib/fivefretjoin.py`, so the script grows by one worker and some candidate code.
- **Separate state for five-fret runs.** The default `--state` is `~/drums-work/library/five_fret_state.json` (CSV next to it) when `--parts` isn't `drums`. *Why:* the state is keyed by pack file name, and one song has a drums status and a five-fret status.
- **Reuse rule.** The drum warp is reused when the candidate chart is the one the drums came from, by any of: the same Chorus md5 as the drums state's `chart` label (`chorus:<md5> …`); the same local path as a `local:<path>` label; or the same resolved chart folder as the pack's recorded drum source. The warp itself always comes **from the pack**: `drum_join.json` → `detail.warp` (this tool's joins), else the legacy `arrangements/drums.json` → `drums.source.warp` (all 856 joins in Matt's library are legacy). *Why:* the state stores only offset and method, not warp pairs.
- **A reused warp is still validated** against our part stem with the part's thresholds. If it fails, a fresh alignment is tried before the part is flagged. *Why:* drums passing doesn't prove the guitar chart is synced the same way, for example when a charter re-synced only one part.
- **Fresh alignment mirrors `drumjoin.align_chart`, like with like.** It cross-correlates the chart's own stem for the part (guitar → `guitar`; rhythm → `rhythm`, else `guitar`; bass → `bass`) with our matching stem. With no chart stem, the chart's full audio goes against our mix. With no chart audio at all, an envelope synthesised from the notes goes against our part stem, using `drumalign.synth_env` with every note as pad `"red"` (mid band, where pick attacks sit). The beat-level warp (`drumalign.warp_pairs`) runs on weak correlation or drift, then `snap_correction` against our part-stem onsets.
- **Our stem per part:** guitar and rhythm → `guitar`; bass → `bass`; else the mix (`SloppakFiles.mix_audio`, the `full` stem first). Demucs packs have no rhythm stem.
- **Validation** is `drumalign.validate` (no pad check) plus a **beat-shift margin**: `within_30ms(placed) − max(within_30ms(placed ± one beat))`, where one beat is the median spacing of the chart's beats. This is the guitar stand-in for the drums' kick check (it catches a chart one beat off on a steady strum). Thresholds per part live in `fivefretjoin.THRESHOLDS = {"guitar": {...}, "bass": {...}}` (rhythm uses guitar). They start at the drum values (`min_within_30ms` 0.5, `max_abs_median_ms` 25, `max_drift_span_ms` 40, `min_beat_margin` 0.0) and **Task 4 sets them** from the trial, by this rule: no known-bad placement passes, and as many known-good ones as possible do.
- **What gets written:**
  - A part is written when (a) the song has no five-fret part for that instrument, or (b) the existing one is `source.kind: "auto"`, or (c) `--upgrade` and the candidate has more hand-charted lower levels (Easy/Medium/Hard present and not `generated`) than the existing real chart. That is drums' `--upgrade` rule, per part.
  - An existing `kind: "chart"` part is otherwise never touched.
  - Every chart part the candidate has among `--parts` is written, even when the pack has no matching real-guitar arrangement. `pairs_with` is set only when one exists: guitar → arrangement id `lead`, rhythm → `rhythm`, bass → `bass`, matched on `id`, then on a name starting with that word (case-insensitive), skipping drums and five-fret entries.
- **Part file and entry are Plan 1's.** File `five_fret_<part>.json` from `fivefretchart.five_fret_json(chart, source, "<Part> (5-fret)")` after `ensure_levels`. Entry `{id: five_fret_<part>, name, type: five_fret, instrument, five_fret, pairs_with?}`. `source = {kind: "chart", origin: "chorus"|"local", md5?, charter?}`:
  - `md5` is the Chorus md5, or the md5 of a local `.sng` file's bytes; a plain local folder has none.
  - `charter` is the Chorus result's `charter`, else `song.ini` `charter`, else `frets`.
  - The manifest's `feedpak_version` is raised to `1.21.0` when lower, never lowered.
- **How the part was made** (chart label, reused or fresh, alignment summary, warp, validation, date) goes to a `five_fret_join.json` side file keyed by part, merged with what's already there. Same reason as `drum_join.json`: no non-spec manifest keys.
- **Notes the warp moves before 0 s are dropped** (the schema requires `t ≥ 0`), with their levels' copies. Sustains are re-timed as `warp(t + l) − warp(t)`.
- **Chorus fetch is role-aware.** `chorus.fetch(md5, out, roles=("drums",))` fetches the stems for `roles` when the package has any, else every audio file. `roles=()` fetches only the chart and `song.ini` (used when the drum warp is reused: no audio needed, kinder to Chorus). A cached folder that lacks a wanted role's files gets just the missing files: `.complete` gains `package_files`, and an old `.complete` without it costs one header re-read.
- **Chorus part names** (scan-chart's instrument ids): guitar → `guitar`; rhythm → `rhythm`, `guitarcoop`; bass → `bass`; drums → `drums`. A result also counts as having a part when `diff_<guitar|rhythm|bass|drums> >= 0`, the fallback today's drum filter already uses. Nothing in this plan can check these against the live API (no network); Matt's first online run does, and Task 6 tells him what to look for.
- **Ranking** (online and local): name score (rounded to 0.1) first; then length within 8%; then how many of the wanted parts the chart has; then hand-charted lower levels summed over those parts; then length difference. Same shape as today's drum ranking.
- **Song status** uses the drum words (`joined`, `would-join`, `upgraded`, `would-upgrade`, `flagged`, `no-chart`, `no-better`, `error`), plus `has-parts` (every wanted part already a real chart). A song counts as `joined` when at least one part was written. Per-part results go in `res["parts"]`. The CSV has **one row per song and part**. Resume rules are the drums' rules (skip finished songs; `--retry`; `would-join` reruns with `--write`; `--redo` reruns everything, and existing chart parts still stay untouched).

## Review Focus

1. **A Chorus cache folder first fetched for drums** (drum stems only, `.complete` present: most of the 1,243 in `~/.cache/slopsmith-drums/chorus`) must gain the guitar / bass stem when a fresh guitar alignment needs it, not align silently against no audio or drums. Test in Task 1.
2. **Drums joined from chart A, best guitar candidate is chart B:** no reuse, fresh alignment. **Drums joined from the same chart, warp stored only in the legacy `arrangements/drums.json`:** reuse works. Tests in Task 2.
3. **A warp that puts the first notes before 0 s** (the chart's audio has a longer intro than ours) gives a pack that still passes `fivefret.validate_five_fret`, with those notes gone. Test in Task 3.
4. **Rewriting a zip pack** keeps every other member byte-identical (stems, real-guitar arrangements, drum tab, lyrics), and a second run on a song whose parts are now real charts writes nothing and makes no new backup. Tests in Task 2 and Task 5.
5. **One part passes and another fails in the same chart:** the passing part is written, the failing one isn't, and the CSV has a row for each. Test in Task 5.

---

### Task 1: Chorus client: per-part search, levels and stems

**Files:**
- Modify: `lib/chorus.py` (`search`, `fetch`, new helpers; module docstring mentions guitar / bass)
- Modify: `scripts/drums_library.py` (`chart_levels` calls `chorus.part_levels(r, "drums")`)
- Test: `tests/test_chorus_parts.py`

**Interfaces:**
- Produces:
  - `PART_INSTRUMENTS = {"drums": ("drums",), "guitar": ("guitar",), "rhythm": ("rhythm", "guitarcoop"), "bass": ("bass",)}`
  - `STEM_ROLES = {"drums": ("drums",), "guitar": ("guitar",), "rhythm": ("rhythm", "guitar"), "bass": ("bass",)}`
  - `has_part(r: dict, part: str) -> bool`: notesData instruments or `diff_<part>` ≥ 0 (`diff_rhythm` for rhythm).
  - `part_levels(r: dict, part: str) -> int`: hand-charted lower levels (easy/medium/hard with count > 0) over the part's instrument ids.
  - `search(query: str, per_page: int = 25, parts: tuple = ("drums",)) -> list[dict]`: results with any of `parts`.
  - `fetch(md5: str, out_dir: Path, roles: tuple = ("drums",)) -> Path`: role-aware, incremental, as in "Decisions". `.complete` is `{"md5", "files", "package_files"}`.

- [ ] **Step 1: Write the failing tests** (fake `.sng` via `tests.drum_fixtures.write_sng`, `_range` monkeypatched to slice the blob and count calls; `THROTTLE` in `tmp_path`):
  - `test_search_filters_by_part`: results `a` (instruments `["guitar"]`), `b` (`["drums","bass"]`), `c` (no notesData, `diff_bass: 2`), `d` (`["guitarcoop"]`). `parts=("bass",)` → `["b","c"]`; `("rhythm",)` → `["d"]`; the default → `["b"]`.
  - `test_part_levels`: noteCounts guitar easy 10, guitar medium 0, guitar hard 5, bass expert 9 → `part_levels(r,"guitar") == 2`, `part_levels(r,"bass") == 0`.
  - `test_fetch_guitar_stem`: a package with `notes.mid`, `drums_1.ogg`, `guitar.ogg`, `song.ogg` and `roles=("guitar",)` → folder has `notes.mid`, `song.ini`, `guitar.ogg` only.
  - `test_fetch_adds_missing_role_to_cached_drums_folder` (Review Focus 1): fetch with `("drums",)`, then `("guitar",)` → `guitar.ogg` appears, the drum files are untouched, `.complete` lists both; a third `("guitar",)` call makes no requests.
  - `test_fetch_role_absent_takes_all_audio`: no `bass*` in the package, `roles=("bass",)` → every non-preview, non-crowd audio file.
  - `test_fetch_no_roles_chart_only`: `roles=()` → `notes.mid` and `song.ini` only.
  - `test_old_complete_without_package_files`: an existing `.complete` of the old shape plus `roles=("guitar",)` → one header read, then the missing files.
  - The existing `test_chorus_fetch_takes_only_chart_and_drum_stems` and `test_chorus_search_keeps_only_drum_charts` stay unchanged and pass.
- [ ] **Step 2: Run** `$PY -m pytest tests/test_chorus_parts.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** in `lib/chorus.py`; switch `drums_library.chart_levels` to `chorus.part_levels(r, "drums")`.
- [ ] **Step 4: Run** `$PY -m pytest tests/test_chorus_parts.py tests/test_drums_library.py -q`. Expected: PASS (drum end-to-end skipped under `PY`).
- [ ] **Step 5: Commit** `feat(chorus): per-part search, difficulty counts and stem fetch`; push.

### Task 2: `lib/fivefretjoin.py`, pack side: existing parts, drum warp, writing

**Files:**
- Create: `lib/fivefretjoin.py` (header: mattromano custom build; offline tool; the five-fret counterpart of `drumjoin.py`)
- Modify: `lib/drumjoin.py`: split the `.sng` cache-key code out of `chart_folder` into `sng_cache_dir(path: Path) -> Path` (no extraction); `chart_folder` calls it. Behaviour unchanged.
- Test: `tests/test_fivefretjoin_pack.py` (no librosa needed: `drumalign` imports librosa lazily)

**Interfaces:**
- Consumes: `drumjoin.SloppakFiles`, `drumjoin.chart_folder`, `drumjoin.is_drums_arrangement`, `drumjoin._version_tuple`; `fivefret.validate_five_fret`, `fivefret.PARTS`; `fivefretchart.PART_NAMES`.
- Produces:
  - `FEEDPAK_VERSION = "1.21.0"`, `JOIN_INFO = "five_fret_join.json"`, `PAIRS = {"guitar": "lead", "rhythm": "rhythm", "bass": "bass"}`
  - `existing_parts(sp: SloppakFiles) -> dict[str, dict]`: `{part: {"id", "kind": "chart"|"auto", "levels": int, "md5": str|None}}`. `levels` counts hand-charted lower levels in the part file. An unreadable file counts as `kind "chart"`, `levels 3`, so it is never replaced (safe side).
  - `pairs_with(manifest: dict, part: str) -> str | None`
  - `drum_source(sp: SloppakFiles) -> dict | None`: `{"folder": str, "warp": list | {"offset": float}}` from `drum_join.json` `detail`, else from the legacy drums arrangement's `drums.source`. `None` when there's no warp.
  - `chart_ids(label: str | None = None, folder: Path | None = None) -> set[str]`: `"chorus:<md5>"` from a `chorus:` label or a folder named by an md5 under `…/chorus/`; `"local:<resolved path>"` from a `local:` label; `"folder:<resolved folder>"` (a `.sng` path resolves to `drumjoin.sng_cache_dir(path)`, so nothing is extracted).
  - `reusable_warp(sp, drums_state_entry: dict | None, cand_ids: set[str]) -> dict | None`: the `drum_source` warp when `cand_ids` meets the ids of the state's `chart` label (status `joined`/`upgraded` only) or of the pack's drum source folder.
  - `warp_fn(spec) -> Callable[[float], float]`: a pairs list → `drumalign._pw_linear`; `{"offset": o}` → `t + o`.
  - `write_five_fret(sp: SloppakFiles, parts: dict[str, dict], info: dict[str, dict], backup_dir=None) -> None`: per part, removes the old entry for that instrument and its file, writes `five_fret_<part>.json` (compact JSON), appends the entry (with `pairs_with` when found), merges `info` into `five_fret_join.json`, raises `feedpak_version`, `sp.save(backup_dir)`. It raises `ValueError` when a payload fails `validate_five_fret` (nothing is saved).

- [ ] **Step 1: Write the failing tests** (packs built with `tests.drumjoin_fixtures.make_sloppak`-style zip writing, but without audio: a small local `_pack(tmp_path, manifest, files, zip_form=True)` helper writing JSON / bytes members):
  - `test_existing_parts_kinds_and_levels`: a `chart` bass with hand Easy and generated Medium/Hard → `{"bass": {"kind":"chart","levels":1,…}}`; an `auto` guitar → `kind "auto"`; a broken JSON rhythm → `kind "chart"`, `levels 3`.
  - `test_pairs_with`: arrangements `lead`, `Rhythm 2` (id `rhythm2`), `bass`, drums, a five-fret entry → guitar `"lead"`, rhythm `"rhythm2"` (name match), bass `"bass"`; none of them → `None`.
  - `test_drum_source_legacy_and_new`: a legacy `arrangements/drums.json` whose `drums.source` has `folder` and pairs `warp` → returned; a pack with `drum_join.json` `{"detail":{"folder":…, "warp":{"offset":1.5}}}` → returned; neither → `None`.
  - `test_reuse_same_chart_only` (Review Focus 2): state label `chorus:aaa… X - Y (Z)` and candidate folder `…/chorus/aaa…` → the warp; candidate `…/chorus/bbb…` → `None`; state label `local:/x/Song.sng` and a candidate from the same path → the warp; a state entry with status `flagged` → `None`.
  - `test_sng_cache_dir_matches_chart_folder`: for a `.sng` in `tmp_path` (with `SNG_CACHE` patched), `chart_folder(p) == sng_cache_dir(p)`; `sng_cache_dir` creates nothing.
  - `test_warp_fn`: pairs `[[0,10],[1,11.5]]` maps 0.5 → 10.75; `{"offset": -2}` maps 3 → 1.
  - `test_write_new_part_zip_keeps_other_members` (Review Focus 4): the zip's other members are byte-identical after the write; the manifest gains the entry with `pairs_with: "bass"`; `feedpak_version` goes 1.20.0 → 1.21.0 (and 1.22.0 stays 1.22.0); `five_fret_join.json` has the `bass` key; `sloppak.extract_meta(pack)["five_fret_parts"]` includes `"bass:chart"`.
  - `test_write_replaces_same_instrument_only`: an existing auto bass and a chart guitar; writing bass removes the old bass file and entry and keeps the guitar entry and file as they were.
  - `test_write_rejects_invalid_payload`: a note `{"t":-1,"f":1}` → `ValueError`, and the zip is unchanged.
- [ ] **Step 2: Run** `$PY -m pytest tests/test_fivefretjoin_pack.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions above.
- [ ] **Step 4: Run** `$PY -m pytest tests/test_fivefretjoin_pack.py -q` and the spec gate. Expected: PASS; gate OK (add `lib/fivefretjoin.py` to `READERS` if the gate asks).
- [ ] **Step 5: Commit** `feat: five-fret join pack helpers (existing parts, drum warp reuse, writing)`; push.

### Task 3: `lib/fivefretjoin.py`, audio side: placement, alignment, validation, `join_parts`

**Files:**
- Modify: `lib/fivefretjoin.py`
- Modify: `tests/drumjoin_fixtures.py`: add `guitar_audio(notes, dur, seed=0, noise=0.0)` (a pitched pluck per note, `freq` from the fret: 110 Hz · 2^(fret/12) over bits 0–4, decaying 0.15 s, with chords summed) and `five_fret_notes(n_measures, seed=0, tpq=TPQ)` (aperiodic eighths and quarters on `PART GUITAR` Expert, 96–100, some chords, some sustains, MIDI note tuples for `write_mid`)
- Test: `tests/test_fivefretjoin.py` (`pytest.importorskip` librosa / scipy / soundfile; skip without ffmpeg, like `test_drumjoin.py`)

**Interfaces:**
- Consumes: Task 2's functions; `drumalign.load_audio`, `onset_env`, `synth_env`, `global_offset`, `warp_pairs`, `LAST_RATE`, `snap_correction`, `detect_onsets`, `validate`, `Alignment`; `drumchart.song_audio_files`; `fivefretchart.load_song_folder`, `ensure_levels`, `five_fret_json`, `FiveFretChart`, `FretNote`.
- Produces:
  - `THRESHOLDS: dict[str, dict]` (keys as in "Decisions"; Task 4 fixes the values)
  - `chart_beats(chart: FiveFretChart) -> list[float]`: `tempo.beats(last tick)` → seconds plus `chart.offset`.
  - `place(chart: FiveFretChart, warp: Callable) -> FiveFretChart`: deep copy, every time warped, sustains re-timed, notes < 0 s dropped (in levels too), spans warped, times rounded to 4 places.
  - `our_part_audio(sp, part) -> tuple[np.ndarray | None, str]`: `(y, "guitar"|"bass"|"mix")`
  - `chart_part_audio(folder, part) -> tuple[np.ndarray | None, str]`: `(y, "<role>"|"mix"|"none")`
  - `align_part(folder, sp, chart, part, *, ref_y, ref_kind, onsets, force_method=None, min_conf=3.0, min_ratio=1.08, max_drift=0.035, log=print) -> tuple[FiveFretChart, dict]`: the placed chart and a detail dict `{"chart_audio", "alignment": Alignment.summary(), "warp": pairs | {"offset"}}`, the same `warp` shape `drumjoin.align_chart` stores.
  - `validate_part(times, onsets, beat: float, thresholds: dict) -> drumalign.Validation`: `drumalign.validate`, then `pads["beat_margin"]` and the reason `"one beat off? margin X < Y"` when below `min_beat_margin`.
  - `join_parts(sloppak: Path, chart_folder: Path, parts: list[str], *, source: dict, reuse: dict | None = None, min_levels: dict[str, int] | None = None, thresholds: dict | None = None, dry_run: bool = True, backup_dir=None, log=print) -> dict`. It returns `{"parts": {part: {"ok", "reused_drums", "method", "offset", "median_ms", "within_30ms", "beat_margin", "levels", "reasons", "error"?}}, "written": [part, …]}`.
    - It only considers parts in `parts` that the chart has, and with `min_levels`, only those whose hand-charted lower levels exceed `min_levels[part]`.
    - Per part it tries `reuse` first, then a fresh alignment, and keeps the first that validates.
    - When not `dry_run` and at least one part passed, it calls `ensure_levels`, `five_fret_json(placed, source_with_charter, "<Part> (5-fret)")` and then `write_five_fret` once.
    - Onsets are computed once per stem role, not once per part.

- [ ] **Step 1: Write the failing tests** (chart folder with `write_mid(track_name="PART GUITAR", extra_tracks=[("PART BASS", …)])` and `song.ini`; the chart's `guitar.ogg` / `bass.ogg` from `guitar_audio` in chart time; our pack's `guitar` / `bass` stems from the same notes shifted by a known offset with different seeds and noise; 30 measures at 120 bpm):
  - `test_place_retimes_sustains_and_drops_negative` (Review Focus 3): offset −1.0 with notes at 0.5 s and 2.0 s (sustain 1.0) → one note at 1.0 s with `l` 1.0; a pairs warp at rate 1.1 gives `l` 1.1; `five_fret_json` of the result passes `validate_five_fret`.
  - `test_fresh_offset_recovered`: known offset +1.5 s → `method "offset"`, `|offset − 1.5| < 0.01`, `within_30ms ≥ 0.9`, ok.
  - `test_fresh_mix_when_no_part_stem`: the chart has only `song.ogg` (mixed), the pack only `full` → aligned and ok.
  - `test_fresh_synthetic_when_chart_has_no_audio` → ok; `chart_audio == "synthetic"`.
  - `test_tempo_drift_uses_warp`: our audio time-stretched by 1.02 → `method "warp"`, ok.
  - `test_reused_warp_used_and_recorded`: `reuse={"warp":{"offset":1.5}}` → `reused_drums` True, no `onset_env` call on the chart audio (monkeypatch it to raise).
  - `test_bad_reuse_falls_back_to_fresh`: `reuse` offset +3.0 when the truth is +1.5 → `reused_drums` False, ok, offset ≈ 1.5.
  - `test_one_beat_off_flagged`: a placement deliberately shifted by one beat, with `min_beat_margin` 0.1 → not ok, with the margin reason.
  - `test_wrong_song_flagged_not_written`: another seed's notes as the chart → no part ok, `written == []`, the zip unchanged.
  - `test_min_levels_filters_parts`: the chart's bass has hand Hard only; `min_levels={"bass":1}` → bass not considered.
  - `test_join_writes_passing_part_only` (Review Focus 5, library side): guitar audio matches, bass audio is a different pattern → `written == ["guitar"]`, and the pack has `five_fret_guitar.json` only, with `source == {"kind":"chart","origin":"local","charter":"Tester"}` (`song.ini charter = Tester`).
- [ ] **Step 2: Run** `$APY -m pytest tests/test_fivefretjoin.py -q`. Expected: FAIL. (`$PY` shows the module skipped.)
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `$APY -m pytest tests/test_fivefretjoin.py tests/test_fivefretjoin_pack.py tests/test_drumjoin.py -q`. Expected: PASS. Run the spec gate. Expected: OK.
- [ ] **Step 5: Commit** `feat: align and validate real 5-fret charts against a song's stems`; push.

### Task 4: Threshold trial on the cached real songs

No new library code apart from the `THRESHOLDS` values. Everything runs on **scratch copies**: a scratch dir `$S` under the session scratchpad, with packs copied by `cp -c ~/Desktop/rocksmith/dlc/sloppak/<name> $S/lib/`. The library is only read.

**Trial set:**
- **Local `.sng` joins.** Their charts sit in `~/Desktop/clone_hero_songs/*.sng`, and `drumjoin.chart_folder` maps them to the already-unpacked `~/.cache/slopsmith-drums/sng/<key>/` folders, which hold the full Rock Band stems. The packs: `paramise`, `oasislive`, `oasissome`, `sum41deep`, `sum41fat`, `Paramore_That_s-What-You-Get_v1_0`, `Counting_Crows_-_Accidentally_in_Love`, `Don_t_Look_Back_in_Anger_-_Oasis`, `Oasis_Rock-N-Roll-Star_v1_1_DD`, `Sum_41_Handle_This_v1`, `paracrus` (all `.sloppak`).
- **Chorus joins:** up to 10 packs from `~/drums-work/library/drums_state.json` with status `joined` and a `chorus:` chart whose cached `~/.cache/slopsmith-drums/chorus/<md5>/notes.mid` has `PART GUITAR` or `PART BASS`. Pick them with a scratch script that checks `fivefretchart.load_song_folder`. These folders mostly hold drum stems only, so they test the reuse and synthetic paths.

- [ ] **Step 1: Write the trial script** `$S/trial.py` (scratch only, not committed). It uses only `fivefretjoin` public functions, the drums state and `drumjoin.chart_folder`. For each (pack, part) it records four cases:
  - **A (reuse):** placement with the pack's drum warp, plus its validation numbers.
  - **B (fresh):** a fresh alignment ignoring the warp. Record its validation and the median |B time − A time| over the notes.
  - **C (beat off):** A shifted by +1 and −1 beat. Record `within_30ms`, `median_ms` and `beat_margin`.
  - **D (wrong chart):** another trial song's chart for the same part, aligned fresh.
  It writes `$S/trial.csv`.
- [ ] **Step 2: Run** `$APY $S/trial.py` (from the worktree, `PYTHONPATH=lib`). Expected: a row per pack and part, no tracebacks. A part missing from a chart is listed as skipped.
- [ ] **Step 3: Set `THRESHOLDS["guitar"]` and `THRESHOLDS["bass"]`** by the rule in "Decisions":
  - Take each metric's cut halfway between the worst A and the best C/D, rounded to 0.05 (fractions) or 5 ms. Choose cuts so that **no C or D row passes**.
  - Enable `min_beat_margin` only if `within_30ms` alone lets a C row through.
  - When A and C/D overlap, favour rejecting (no bad passes) and record how many A rows that loses.
  - Also record B's success: the share of pairs where B passes and lands within 30 ms of A.
  - If B succeeds on fewer than 70% of pairs, add a Review note and say so to Matt. Don't widen the thresholds to compensate.
- [ ] **Step 4: Write the trial result in this plan's Review section:** song count, per-part pass rates for A and B, the chosen values and why, and the worst C/D rows. Then run `$APY -m pytest tests/test_fivefretjoin.py -q`. Expected: PASS (the tests pass thresholds explicitly where they depend on them).
- [ ] **Step 5: Commit** `tune: five-fret validation thresholds from a trial on real charts` (the `THRESHOLDS` change only); push.

### Task 5: `drums_library.py --parts`: the five-fret library run

**Files:**
- Modify: `scripts/drums_library.py` (docstring, args, `process` dispatch, a `process_five_fret` worker, `five_fret_candidates`, `write_report` per-part rows, song selection in `main`)
- Modify: `CHANGELOG.md` (CRLF, `[Unreleased]`: "drums_library.py --parts finds and joins real Clone Hero guitar / rhythm / bass charts")
- Test: `tests/test_drums_library_five_fret.py`

**Interfaces:**
- Consumes: `chorus.search(…, parts=)`, `chorus.part_levels`, `chorus.has_part`, `chorus.fetch(…, roles=)`, `chorus.STEM_ROLES`; `fivefretjoin.existing_parts`, `reusable_warp`, `chart_ids`, `join_parts`, `drumjoin.SloppakFiles`; `fivefretchart.load_song_folder` (local candidates' levels).
- Produces (CLI):
  - `--parts` (default `drums`), `--drums-state` (default `~/drums-work/library/drums_state.json`, read only).
  - The `--state` default depends on `--parts` (see "Decisions").
  - `--upgrade`, `--write`, `--backup-dir`, `--local`, `--no-online`, `--only`, `--limit`, `--redo`, `--retry`, `--workers`, `--min-match`, `--max-candidates` mean what they mean for drums.
  - `five_fret_candidates(artist, title, duration, parts, min_match, n=3) -> list[dict]`: online candidates with `parts_have` and `levels` (summed `part_levels` over the wanted parts the result has), ranked as in "Decisions".
  - CSV columns: `file, artist, title, part, status, chart, reused_drums, method, offset, median_ms, within_30ms, beat_margin, levels_before, levels_after, secs, error`.
- Per song, `process_five_fret` works as follows:
  - **Wanted parts:** the `--parts` with no part or an auto one. With `--upgrade`, instead, the chart parts with `levels < 3`, and `min_levels` = their current levels.
  - No wanted parts: status `has-parts` (normal run) or `no-better` (`--upgrade`).
  - **Candidates:** local first (top 2 by name), then online.
  - **Each candidate:**
    1. Fetch with `roles=()` when `reusable_warp` would match, else with the wanted parts' `STEM_ROLES`.
    2. With `--write`, call `ensure_backup` before `join_parts`.
    3. Call `join_parts(dry_run=not a.write)`.
    4. Remove the passing parts from the wanted set; stop when it is empty.
  - **Source per candidate:** `origin` `chorus` with the result's md5 and charter, or `local`, with `md5` = md5 of the `.sng` file's bytes when the candidate is a `.sng`.

- [ ] **Step 1: Write the failing tests.** All of them use `--no-online` or a monkeypatched `chorus.search` / `chorus.fetch`, run `--workers 1`, and point the caches at `tmp_path`. `fivefretjoin.join_parts` is monkeypatched where audio isn't the point (a fake that "passes" chosen parts and writes through the real `write_five_fret`):
  - `test_parts_arg_rejects_mixing`: `--parts drums,bass` → `SystemExit`.
  - `test_default_state_path_per_parts`: no `--state` and `--parts bass` → `five_fret_state.json`; `--parts drums` → `drums_state.json` (parsed args only, nothing run).
  - `test_five_fret_candidates_rank`: results `studio` (guitar+bass, levels 3), `live` (+30% length), `guitaronly` (guitar, levels 3), `other` (low name score). Wanted `guitar,bass` → `["studio","guitaronly","live"]`.
  - `test_has_parts_skipped_and_auto_replaced`: a pack with a chart bass and an auto guitar, and `--parts guitar,bass` → only guitar is wanted; a pack with chart guitar and chart bass → `has-parts`, no backup made (Review Focus 4).
  - `test_dry_run_writes_nothing_then_write_backs_up`: the dry run gives `would-join`, the zip is unchanged and the backup dir is untouched. The `--write` rerun picks the song up again (`would-join` rule), the backup equals the pre-write bytes, and the pack has the part.
  - `test_write_requires_populated_backup_dir_outside_library`: an empty backup dir, or one inside the library → `SystemExit` with the drums messages.
  - `test_partial_song_rows` (Review Focus 5): the fake passes guitar and flags bass → song status `joined`, the CSV has two rows for the file (`guitar joined`, `bass flagged`), and only `five_fret_guitar.json` is written.
  - `test_upgrade_rule`: an existing chart guitar with levels 1. A candidate with 1 hand level → `no-better`, no write; one with 3 → `upgraded`. An existing chart guitar with 3 levels → not selected at all.
  - `test_reuse_fetches_chart_only`: the drums state says `chorus:<md5>` for this pack and the pack has a legacy drum warp, so `chorus.fetch` is called with `roles=()` and `join_parts` gets `reuse` set.
  - `test_resume_skips_finished`: a second run with the same state does no work (the `join_parts` fake isn't called); `--retry flagged` reruns only flagged songs.
  - `test_library_run_end_to_end` (marked `needs_audio`, real `join_parts`): a local `.sng` chart with guitar and bass stems and a library of two packs (one matching with a known offset, one not). The dry run then `--write` give `joined` with both parts written, and `nomatch` gets `no-chart`. The output pack passes `fivefret.validate_five_fret` for both files and `sloppak.extract_meta(...)["five_fret_parts"] == ["guitar:chart", "bass:chart"]` (order as written).
  - The existing `tests/test_drums_library.py` passes unchanged.
- [ ] **Step 2: Run** `$PY -m pytest tests/test_drums_library_five_fret.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the drums path byte-for-byte in behaviour: `process` checks `a.parts == ["drums"]` first and calls today's body unchanged.
- [ ] **Step 4: Run** `$PY -m pytest tests/test_drums_library_five_fret.py tests/test_drums_library.py tests/test_chorus_parts.py -q`, then `$APY -m pytest tests/test_drums_library_five_fret.py tests/test_drums_library.py tests/test_fivefretjoin.py tests/test_drumjoin.py -q`, then `$PY -m pytest tests -q`, then the spec gate. Expected: all pass. Compare any full-suite failure with a run on the base commit before calling it pre-existing.
- [ ] **Step 5: Commit** `feat: drums_library --parts joins real guitar / rhythm / bass charts`; push.

### Task 6: Real-data check on scratch copies (no network, no app)

No new code. Proves the tool end to end on real packs and real charts. Never touches Matt's library.

- [ ] **Step 1: Set up scratch:**
  - Run `S=<scratchpad>/plan4-check`, then `mkdir -p $S/lib $S/bak`.
  - Copy these packs with `cp -c` into `$S/lib`: `paramise.sloppak`, `oasislive.sloppak`, `sum41fat.sloppak`, `Sum_41_Handle_This_v1.sloppak` (guitar-only chart), and one song with no local chart (e.g. `Oasis_Whatever_v3_5.sloppak`).
  - Unzip one of the matching packs into a directory-form copy `$S/lib/oasissome.sloppak/`, to cover dir packs.
  - Put a placeholder file in `$S/bak`.
  - Record `stat -f '%m %z'` of the originals in `~/Desktop/rocksmith/dlc/sloppak` for those packs.
- [ ] **Step 2: Dry run:**
  `$APY scripts/drums_library.py $S/lib --parts guitar,bass --local ~/Desktop/clone_hero_songs --no-online --backup-dir $S/bak --state $S/state.json --workers 2`
  Expected:
  - the four matching packs give `would-join`, with `reused_drums` true for every part whose drums came from that `.sng` (all of them, per `drums_state.json`);
  - `Oasis_Whatever` gives `no-chart`; `Handle This` has a bass row only if its chart has bass (it doesn't: guitar only);
  - no file in `$S/lib` changed (compare `shasum` before and after) and `$S/bak` still holds only the placeholder.
- [ ] **Step 3: Write run:** the same command plus `--write`. Expected:
  - the same songs give `joined`;
  - `$S/bak` holds byte-identical copies of the pre-write packs;
  - every new `five_fret_*.json` passes `python ../feedpak-five-fret/tools/validate.py <pack>` (spec venv Python) with exit 0;
  - `sloppak.load_song` lists the parts with `instrument` and `source_kind "chart"`;
  - `sloppak.extract_meta` gives `five_fret_parts` like `["guitar:chart", "bass:chart"]`;
  - the part's first ten note times sit within 30 ms of guitar-stem onsets for the reused-warp songs (spot check with `drumalign.detect_onsets`).
- [ ] **Step 4: Rerun and upgrade, no-ops:** the write command again → nothing processed (state). With `--redo` → `has-parts` for every joined song, no new backup files. With `--upgrade` → `no-better` or skipped, nothing written.
- [ ] **Step 5: Confirm Matt's library is untouched:** the recorded `stat` values match. Then run the spec gate and `$PY -m pytest tests -q`. Expected: unchanged from Task 5.
- [ ] **Step 6: Record the results in the Review section:** packs, parts, reused or fresh, validation numbers and any surprises. Add Matt's commands, which he runs himself:
  1. Dry run: `~/drums-work/.venv/bin/python scripts/drums_library.py ~/Desktop/rocksmith/dlc/sloppak --parts guitar,rhythm,bass --local ~/Desktop/clone_hero_songs --backup-dir ~/Desktop/rocksmith/sloppak-backup-5fret --workers 6`, then read `~/drums-work/library/five_fret_state.csv`.
  2. The same with `--write` once the backup dir exists and holds a placeholder, so its emptiness check passes and the first write creates each song's copy.
  3. What to look for on the first **online** run: Chorus results with guitar / bass parts are found (if none ever are, the instrument names in `chorus.PART_INSTRUMENTS` need checking against a live response).

## Later plans

5. **Auto-charter and benchmark:** `lib/fivefret_autochart.py` (Onyx-derived, GPL v3 credit). Its benchmark set is the songs this tool gives a real chart that also have a real-guitar arrangement (`pairs_with`). Auto parts it writes are `kind: "auto"`, which this tool replaces when a real chart turns up.
6. **Controller drums:** a gamepad source in `feedBack-plugin-drums`.

## Review

(Filled in when built: trial table and chosen thresholds from Task 4, real-data check results from Task 5–6, changes from the plan.)

## Builder-check rulings (binding; they override the tasks above where they differ)

A builder check (2026-10-21) found these. Each is decided here:

1. **Reused drum warps outside the drummed span.**
   - Outside the span between the first and last drum hit, the reused warp is clamped to the constant lag at the nearest drummed edge.
   - The notes before the first drum hit are also validated on their own, against our stem.
   - If either region fails validation, fall back to fresh alignment for that part.
   - Test with a fixture warp whose lag climbs before the first drum hit (the sum41fat shape).
   - Task 6's "reused_drums true for every part" becomes "reused or fresh, both validated".
2. **Rock Band bass audio is `rhythm.*`.**
   - `STEM_ROLES["bass"] = ("bass", "rhythm")` when the chart has no rhythm part; `("bass",)` otherwise.
   - `STEM_ROLES["rhythm"] = ("rhythm", "guitar")` only when the chart has a rhythm part.
   - `chorus.fetch` role selection uses the same rule.
3. **The pack's own drum source decides warp reuse,** not the drums-state label. Parse Windows paths with `PureWindowsPath`, so `C:\…\chorus\<md5>` gives `<md5>`. Test with a pack whose legacy source folder disagrees with the state label (the Heart_Shaped_Box shape): no reuse.
4. **Partial chart audio offline.**
   - A chart folder's audio counts as usable for a part only when it has `song.*`, or a stem in that part's `STEM_ROLES`.
   - A folder holding only `drums_*` audio counts as having no audio for guitar/bass, so alignment uses the synthetic note envelope.
   - Task 4's trial reports the case-B pass rate separately for real-audio and synthetic cases.
5. **Back up once per song,** before that song's first write in a run, never once per candidate. Test two parts written to one song in one run: exactly one backup, identical to the original.
6. Task 6: "the four matching packs" should read **five** (paramise, oasislive, sum41fat, Sum_41_Handle_This_v1, and the oasissome directory copy).
7. Global Constraints: the drums end-to-end test writes to `~/.cache/slopsmith-drums/sng/<sha1[:16]>` (`lib/drumjoin.py:149-150`); patch `SNG_CACHE` to `tmp_path` in new tests.
