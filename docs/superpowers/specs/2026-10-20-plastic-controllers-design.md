# Play with whatever you have: 5-fret controllers and controller drums

Date: 2026-10-20. Status: draft for Matt's review. Builds on the Build-a-Band design (`2026-10-20-build-a-band-design.md`, sections "Parts are instrument + how you play it" and "Later: play with whatever you have"). Nothing here is built until Build-a-Band v1 meets its design.

Visual draft of the highway: `.superpowers/brainstorm/48864-1792556974/content/fivefret-highway-v2.html` in `feedback-upstream/` (Matt picked option A, the classic tilted highway).

## Why

Matt wants feedBack to work like Clone Hero: anyone plays whatever they have in the same band. Today a band needs a real guitar, an e-kit and a mic. Someone holding a plastic Rock Band guitar, a plastic kit or just an Xbox controller can't join. Core already imports Rock Band / Clone Hero drum charts (`feedBack/lib/drumchart.py`) but ignores their guitar and bass parts, and nothing draws, hears or scores a 5-fret part.

## Goals

1. **Controllers as players.** Any number of controllers join a band, in any mix with the real-instrument parts, or with nobody else (controller solo). Examples Matt gave: a guitarist plus two friends on controllers; one person alone on a controller.
2. **Controllers can play any non-vocal part:** guitar (lead or rhythm), bass, or drums. Two players may take the same part.
3. **Three kinds of controller:**
   - plastic Rock Band / Guitar Hero guitar or bass (plays 5-fret charts)
   - plastic Rock Band kit (plays the drum chart)
   - Xbox controller, or any standard gamepad (plays either: 5-fret charts or the drum chart)
4. **5-fret charts for as many songs as possible:**
   1. a real Clone Hero / Rock Band chart, found and lined up automatically, the way the drums library tool already does for drums;
   2. otherwise an **auto-chart** generated from the song's real-guitar chart, labelled "auto", benchmarked against real charts before it is switched on.
5. **A 5-fret highway** in the classic tilted Clone Hero / YARG style (option A).
6. **YARG's five-fret engine** for judging and scoring, ported with LGPL credit in separate files.
7. **Rebindable controls** for everyone, with sensible defaults per known controller.
8. **5-fret charts in feedpak,** kept in Matt's fork of feedpak-spec (not proposed upstream for now).

## Non-goals

- Vocals on a controller (no Fortnite-style vocal lanes).
- Stage Tour's "Arcade" mode (one chart that hops between instruments). Each controller player plays one real part.
- Pro guitar / pro bass (the 17- and 22-fret Rock Band 3 controllers) and keys controllers.
- 6-fret (Guitar Hero Live) controllers. Their charts can be converted later; not in this work.
- Controllers that don't show up as a gamepad (see Input). No raw USB/HID drivers.
- Proposing the format change upstream. Matt's call: keep it in the fork for now.
- Playing across machines (as in Build-a-Band).

## Anti-goals

- **Auto-charts that feel random.** An auto-chart that doesn't follow the music's ups and downs is worse than no chart. It ships only after passing the benchmark (see Auto-charts).
- An auto-chart shown as if it were hand-charted. "Auto" is always visible.
- Pressing a controller button triggering app shortcuts while playing (today core's gamepad support turns A into Space, which would pause the song on every orange note).
- Breaking real-instrument play, the drums plugin's MIDI kits, splitscreen or multiplayer.
- Copying YARG / Clone Hero artwork, logos or sounds. Draw our own, in their style.
- Testing in the browser dev server or the Claude app's browser. Real installed app only.

## What Matt decided

| Topic | Decision |
|---|---|
| Who uses a controller | A drop-in player for any free (or shared) non-vocal part, any number of them, or alone. |
| Vocals | Not on controllers. |
| Xbox guitar layout | Copy Clone Hero's. |
| Rebinding | Any player can rebind. |
| Chart sources | Real Clone Hero charts first (Chorus Encore + local folders), auto-charts from real-guitar charts for the rest, labelled and benchmarked. Onyx as the starting point for the auto-charter. |
| Highway look | Option A: classic tilted 3D. |
| Join / input / engine (played back, approved) | Start to join from the band screen; gamepad API with device profiles and a "press each button" setup; Xbox defaults below; YARG five-fret engine port. |
| feedpak change | Keep in Matt's fork; don't open anything upstream. |
| Part audio | Rock Band style: a miss drops that part's own stem (guitar and bass are separate stems). |

## User flow

1. **Band screen.** Any controller pressing **Start** adds a controller column (Rock Band's "press Start to join"). This fills the "add a part" slot that Build-a-Band v1 leaves disabled; more presses from more controllers add more columns. A controller column has:
   - the controller's name and a live button light (press anything, the matching fret / pad lights);
   - **plays as:** 5-fret (guitar-type) or drums. Plastic guitars default to 5-fret and plastic kits to drums; an Xbox controller asks once and remembers per controller;
   - **part:** any part the song has a chart for in that kind. 5-fret: Lead, Rhythm, Bass (each tagged *real* or *auto*). Drums: the drum chart. Parts already taken show who has them and can still be picked (shared part);
   - **difficulty:** Easy / Medium / Hard / Expert;
   - **lefty flip,** **controls** (opens the rebinding screen) and **leave** (Back/Select held, or a button).
2. **Stage.** Each controller player gets their own lane in the bottom row, next to the real-instrument lanes. Same one clock, HUD, overdrive, fail and results as every other part.
3. **Results.** A card per controller player like any part, with the part name and "auto chart" noted where it applies.
4. **Solo.** One controller alone fills the stage, as Build-a-Band's solo play already does.

Controllers are remembered between sessions by their id (and, for two identical controllers, by order). *Our call.*

## Charts

### Where 5-fret charts come from

In priority order, per song and per part (lead, rhythm, bass):

1. **A real chart** from a Clone Hero / Rock Band song folder: local folders first, then Chorus Encore (enchor.us). This is a guitar and bass version of the existing drums library tool (`feedBack/scripts/drums_library.py`, `lib/chorus.py`, `lib/drumjoin.py`, `lib/drumalign.py`, `lib/sngfile.py`).
2. **An auto-chart** generated from the song's real-guitar arrangement (lead → Lead, rhythm → Rhythm, bass → Bass).

A real chart always replaces an auto one when it later becomes available. Each 5-fret chart records which it is.

### Importer (core)

A new `feedBack/lib/fivefretchart.py` alongside `drumchart.py`, sharing its MIDI/.chart parsing, tempo map and `song.ini` handling (refactor shared parts out of `drumchart.py` rather than copying them; *builder's call* how).

Reads, from `notes.mid`:
- tracks `PART GUITAR`, `PART BASS`, `PART RHYTHM` (and `PART GUITAR COOP` as a fallback for rhythm);
- Expert 96–100, Hard 84–88, Medium 72–76, Easy 60–64 (green → orange);
- forced HOPO / forced strum (Expert 101/102 and the matching notes per difficulty), Clone Hero tap (104), open notes (Clone Hero's `[ENHANCED_OPENS]` text event and the sysex open markers), solo 103, overdrive 116;
- sustains (with Rock Band's minimum-sustain rule) and the HOPO threshold from `song.ini` (`hopo_frequency`, `eighthnote_hopo`).

And from `notes.chart`: `[ExpertSingle]`, `[ExpertDoubleBass]`, `[ExpertDoubleRhythm]` (and lower difficulties), with `N 5` forced, `N 6` tap, `N 7` open, `S 2` star power.

The exact track and note numbers above follow the Rock Band / Clone Hero conventions as I understand them; *the builder confirms them against YARG.Core's chart loaders and Moonscraper's parser* (both already credited in `drumchart.py`) and against real files.

Output: one 5-fret chart file per part (shape below), all difficulties that were hand-charted, times in seconds on the song's audio. `scripts/ch_to_sloppak.py` writes them next to the drum tab; `scripts/sloppak_to_ch.py` writes them back out.

### feedpak shape (fork only)

A change to the feedpak spec in **Matt's fork** (`mattromano/feedpak-spec`): a branch `fep/five-fret-charts` with spec text, a JSON schema, an example and a CHANGELOG entry, merged into the fork's `custom` branch. Not proposed upstream (ask Matt before opening anything there). Written up FEP-style anyway (Summary, Motivation, On-disk shape, Backward compatibility, Version impact) so it can go upstream later unchanged.

Proposed shape (*builder's call* on exact key names, keeping the drums pattern):

- **Manifest:** a 5-fret part is an `arrangements[]` entry with `type: "five_fret"`, an `instrument` of `guitar` / `rhythm` / `bass`, a `five_fret` path to its file, and optionally `pairs_with` naming the real-guitar arrangement it belongs to. Like drum parts, it has no `file` and MUST NOT be graded as a fretted arrangement.
- **`five_fret_<part>.json`:**
  - `version`
  - `source`: `{ kind: "chart" | "auto", origin?: "chorus" | "local" | "rb", md5?, charter?, generator?, generator_version?, from_arrangement? }`
  - `levels`: `easy` / `medium` / `hard` / `expert`, each `{ hand_charted: bool, notes: [...] }`; a note is `{ t, frets (bitmask, 0 = open), len?, hopo?: "force_on" | "force_off", tap? }`
  - `hopo_threshold` (seconds or ticks; *builder's call*), `star_power: [{t, len}]`, `solos: [{t, len}]`
- **Version impact:** a new optional side file and arrangement type, so a MINOR bump in the fork (1.21.0-custom or similar; *builder's call*).
- **Backward compatibility:** older Readers ignore unknown keys and files; because the entry has no `file`, an older strict Reader might reject it. Fine for the fork; note it in the write-up for upstream.

Core's sloppak loader (`lib/sloppak.py`) serves the new file to the player, and the library index (`lib/metadata_db.py`, `/api/library` filters) learns "has 5-fret Lead / Rhythm / Bass, real or auto". Build-a-Band's song filters and "playable by this band" use it.

### Finding real charts (the library tool)

Extend the drums library tool to guitar and bass rather than writing a second one: `drums_library.py` grows a parts option (or becomes `charts_library.py` with `drums_library.py` kept as a wrapper; *builder's call*). Per song:

1. Candidates: local Clone Hero folders and `.sng` files, then Chorus Encore results that have the part, ranked by name match, length match and number of hand-charted difficulties (the drums upgrade work already ranks by difficulty count).
2. **Alignment:** if this song's drums were joined from the same chart (same md5 in the drums state file), reuse that offset/warp. Otherwise align the chart's note onsets to the song's guitar or bass stem (or the full mix when there's no stem), with `drumalign.py`'s method and validation, thresholds tuned for guitar (*builder's call*, set from a trial run).
3. Same safety as drums: nothing written without `--write`, a backup before any write, resumable state, a CSV report.

Chorus Encore is a free community service: keep `chorus.py`'s throttling and one-request-at-a-time rule.

### Auto-charts

**Where it runs:** offline, in the library tool (and a per-song command), writing a `source.kind: "auto"` chart into the feedpak. Not at song load. *Our call:* this keeps it benchmarkable and makes the result the same every time.

**Starting point: Onyx** (mtolly/onyx, GPL v3, Haskell). Its Rocksmith import "converts to RB Pro Guitar, autocharts to 5-fret" with pitch-based conversion, and its 2026-10-11 release limits generated Easy/Medium to 3/4 frets. Port its logic to Python in a separate, credited file (`lib/fivefret_autochart.py`, header crediting Onyx under GPL v3; core is AGPL v3, which can combine with GPL v3). If the port turns out impractical, write our own along the same lines and still credit the idea.

**What it does** (the builder refines against the benchmark):
- input: the real-guitar arrangement's notes (time, string, fret, sustain, hammer-on / pull-off / tap / slide) and chords; pitch from string + fret + tuning + capo;
- **pitch to lanes:** within each phrase, map relative pitch onto the five lanes so higher notes go right and lower go left, re-centring between phrases so the chart uses the whole highway; repeated pitches stay on the same lane; big jumps move further than small ones;
- **chords:** become 2–3-fret shapes whose position follows the chord's pitch; power chords become adjacent pairs;
- **hammer-ons, pull-offs, taps:** become forced HOPOs and taps; sustains carry over; bends and slides become sustains;
- **lower difficulties:** thinned to the beat grid and simplified (chords to single notes or pairs), Medium uses at most 4 frets and Easy at most 3 (Onyx's limits);
- **overdrive:** none. Auto-charts use the guitar lane's rule from the Build-a-Band design (a quarter bar per chart phrase cleared at 90% or better).

**Benchmark** (must pass before auto-charts are switched on for players):
- the set: songs that have both a real-guitar arrangement and a real 5-fret chart for the same part (the library tool finds them);
- auto-chart each one and compare with the real chart, per difficulty:
  - **direction agreement:** for consecutive notes, does the auto-chart move left/right/stay the same way the real chart does;
  - **lane closeness:** average lane distance after the best overall shift;
  - **chord size agreement** and **HOPO agreement;**
  - **density:** notes per second compared with the real chart (lower difficulties especially);
- a report per song and overall, plus a few side-by-side highway screenshots for Matt to eyeball;
- the pass line is set from the first run and agreed with Matt (*Matt's call when we get there*). Until then auto-charts are generated but hidden behind a setting.

## The 5-fret highway

A new renderer in the classic tilted style (option A in the visual draft):

- a tilted 3D highway with five lanes, round gems in green, red, yellow, blue and orange, and five fret buttons at the strike line that light when pressed;
- HOPO gems with a white glow (no strum needed); taps drawn distinctly (*our call:* a darker centre, as in Clone Hero); open notes as a purple bar across the highway;
- sustain tails that wobble while whammied; overdrive phrases drawn as white/blue gems; active overdrive tints the highway blue;
- beat lines from the song's beats; solo sections marked with a band across the highway and a running percent;
- the lane header tag shows part, input and difficulty, plus **AUTO CHART** when the chart is auto;
- lefty flip mirrors the lanes;
- hit / miss state comes from the engine through the core highway's note-state provider, like the guitar and drum lanes.

It follows core's visualization contract (`feedBack/CLAUDE.md`, `window.feedBackViz_<id>` factory, `init` / `draw` / `resize` / `destroy`, WebGL2), so it also works in the normal player for one controller player outside Build-a-Band (arrangement selection works the way the drums plugin's does). Look and feel: our own drawing in YARG / Clone Hero's style, using Build-a-Band's part colours for the lane edge and YARG's fonts; no YARG or Clone Hero art.

## Controller input

### One input layer for every controller

A new **core capability domain `gamepad-input`**, owned by core like `midi-input` (`static/capabilities/midi-input.js`, `specs/012-midi-input-domain`). It wraps the browser's Gamepad API (the desktop app blocks WebHID, `feedBack-desktop/src/main/main.ts:904-912`, and this design doesn't change that):

- **discover / list:** connected controllers with id, vendor/product (parsed from `gamepad.id`), whether it's a `standard` mapping, and the matched device profile;
- **claim / release:** a plugin claims a controller for a player. While any controller is claimed, **core's menu gamepad support (`static/v3/gamepad.js`) ignores that controller**, so frets never become Space or Escape. Unclaimed controllers still drive the menus;
- **events:** for a claimed controller, normalised button and axis changes with timestamps, polled every animation frame. Inputs are named per profile (`green`, `red`, … `strum_up`, `strum_down`, `whammy`, `tilt`, `start`, `select`, or for drums `red_pad`, `yellow_pad`, `blue_pad`, `green_pad`, `kick`, cymbals where the kit reports them);
- **non-standard controllers:** unlike core's menu support, this layer accepts `mapping === ''` controllers. Plastic instruments behind USB dongles usually appear that way.

Gamepad polling happens at screen refresh rate, so input timing is quantised to about one frame (≈16 ms at 60 Hz, ≈8 ms at 120 Hz). *Our call:* acceptable for v1, because YARG's hit windows are much wider. Each controller also gets an **input offset** setting (ms) for Bluetooth lag, with a simple "strum along to the clicks" calibration on the controls screen.

### Device profiles

A profile list (JSON, in the five-fret plugin) maps known controllers to named inputs:

- Xbox / standard gamepad (any `standard` mapping);
- the common plastic instruments that show up as gamepads on macOS. The builder fills this from YARG's and Clone Hero's controller lists. Neither Matt nor the builder owns plastic controllers, so these entries are marked "untested" until someone tries one;
- **unknown controllers:** a "press each button" setup screen walks through every input once and saves a profile for that controller id.

Any player can **rebind** any input from the controls screen; the binding is saved per controller.

### Xbox controller defaults

- **5-fret:** Clone Hero's gamepad layout: green LT, red LB, yellow RB, blue RT, orange A, open notes X. **Gamepad mode on by default:** pressing a fret plays the note with no strum (as Clone Hero's Gamepad Mode). Overdrive: Y. Whammy: right stick. Pause: Start.
- **Drums:** red LB, yellow RB, blue LT, green RT, kick A. Overdrive: Y. Pause: Start. *Our call:* Clone Hero has no standard drums layout to copy.

### Plastic guitar defaults

Frets, strum up/down, whammy axis, tilt (overdrive) or Select/Back (overdrive), Start (pause), lefty flip in the band screen. Strum is required (no gamepad mode) unless the player turns it on.

## Judging and scoring

### The five-fret engine (new plugin, LGPL files)

A JavaScript port of YARG.Core's five-fret guitar engine (the guitar engine base, the YARG five-fret engine and its parameters: hit windows, HOPO / tap rules, strum leniency, sustain scoring, whammy, star power), in separate files under LGPL v3, credited the way `feedBack-plugin-drums/NOTICE.md` credits the drums engine port (file table, upstream paths, "JavaScript port, with modifications", deviations listed in the file header, LGPL and GPL licence texts). Unit tests in node, like `feedBack-plugin-drums/tests/engine.test.js`.

**Gamepad mode** is a deviation from YARG's engine: a fret press acts as fret + strum. Listed under deviations.

### How it plugs into the band

Each 5-fret player is a part with instrument `guitar` / `rhythm` / `bass` and input kind `five_fret_controller`. Each controller drummer is instrument `drums`, input kind `controller`. Both talk to the band layer only through the common part interface from the Build-a-Band design (chart it needs, lane drawing, input binding, judge/score with hit / miss / score / overdrive / crowd, band-screen settings), so the band score, band multiplier, stars, crowd meter, fail and rescue work as for any part.

- **Overdrive:** real charts bring authored overdrive phrases (YARG rules: a quarter bar per phrase, deploy at half, doubled multiplier, whammy during an overdrive sustain adds bar). Auto-charts use the guitar lane's rule (see Auto-charts). Deploy with tilt, Select/Back or the Y button.
- **Band score:** the five-fret engine has YARG star power built in, so it gets the same exception as drums in the Build-a-Band design: the band layer uses its numbers as they are. *Our call.*
- **Missing difficulties on real charts:** filled by reducing Expert, as `drumchart_gen.py` does for drums, and marked `hand_charted: false`. *Our call.*
- **Stars:** YARG's five-fret star thresholds.
- **Scorecard:** controller runs don't go to scorecard (scorecard is for real-guitar runs). *Our call.*

### Part audio on a miss (Matt's decision)

Guitar and bass controller players get Rock Band behaviour: **a miss drops that part's stem, and it comes back on the next good hit.** Each part only affects its own stem: a bass miss drops the bass stem, never the guitar stem. It uses the same fade and the stems plugin's non-persisting `mute` / `restore` automation path as Build-a-Band's drum sound mode "Rock Band", so the song's saved volumes aren't touched.

- **Which stem:** Bass uses the `bass` stem. Lead and Rhythm use the `guitar` stem (or a separate `rhythm` stem when the song has one). With no stem for the part (full mix only), nothing drops.
- **Shared stems** (two players on bass, or Lead and Rhythm on one guitar stem): *our reading of Matt's answer:* a miss by any player on that stem drops it, and any player's next good hit brings it back.
- **Fail on:** a failed-out controller player's stem mutes, as in the Build-a-Band design, *unless another active player is still on that stem* (then it keeps playing for them). *Our call.*
- **Setting:** per controller player, **Part audio:** *Rock Band* (default) or *Always play*. *Our call*, mirroring the drum sound modes. The real-instrument guitarist's stem is unchanged from Build-a-Band v1.
- This is a small state machine shared with the drum sound mode one (unit-tested the same way).

### Controller drums

Plastic kits and Xbox-pad drummers reuse the drums plugin's existing YARG `DrumsEngine` port, highway and chart. The drums plugin adds a **gamepad source**: it claims a controller through `gamepad-input` and turns named pad inputs into the same pad hits its MIDI path produces (`padFromMidi` / `midiToPad` today). Pro-drums cymbal flags come from the kit's profile where the kit reports them; otherwise cymbals are off for that player. Drum sound modes (Song drums / Rock Band / My kit only) work as for MIDI kits; "My kit only" plays the loaded kit's samples on pad hits.

## Where the code lives

| Repo | Change |
|---|---|
| `mattromano/feedpak-spec` (fork) | Branch `fep/five-fret-charts`: spec section, `five-fret.schema.json`, example, CHANGELOG; merged into `custom`. Not upstream. |
| core `feedBack` | `lib/fivefretchart.py` importer (shared parsing refactored out of `drumchart.py`); `ch_to_sloppak.py` / `sloppak_to_ch.py` write and read 5-fret parts; `lib/sloppak.py` serves them; library index and `/api/library` filters for 5-fret parts (real / auto) |
| | Library tool extended to guitar / bass (Chorus + local, alignment, validation) |
| | `lib/fivefret_autochart.py` (Onyx-derived, GPL v3 credit) and a benchmark script |
| | `gamepad-input` capability domain, with a spec under `specs/` like `012-midi-input-domain`; `static/v3/gamepad.js` ignores claimed controllers |
| new `feedBack-plugin-five-fret` | 5-fret highway renderer (tilted 3D), YARG five-fret engine port (LGPL files + NOTICE.md), device profiles, controls / rebinding / calibration screen, and normal-player solo play for one controller |
| `feedBack-plugin-drums` | Gamepad source: plastic kits and Xbox pads as drum input via `gamepad-input` |
| `feedBack-plugin-build-a-band` | Controller columns and Start-to-join; part types `five_fret_controller` and drums `controller`; shared parts; N lanes in the bottom row; filters for 5-fret parts; results cards |

Each is a branch and PR in its own fork, following the FORK-HANDOFF workflow, landed before or with the work that needs it.

### Changes this needs from the Build-a-Band design (not edited here)

- **Layout:** the stage must hold any number of bottom-row lanes (Plan 1's `computeStageLayout` throws on more than two). Suggested: real-instrument lanes keep their sizes, controller lanes share the rest equally, with a sensible minimum width; beyond what fits, lanes shrink together.
- **Band screen:** the disabled "add a part" slot becomes the controller join area; columns can be added and removed at runtime.
- **Parts:** the part model must allow two players on the same instrument (two scores, two lanes, one chart).
- **Song filters:** "has 5-fret Lead / Rhythm / Bass (real / auto)" and controller players counted in "playable by this band".

## Constraints

- **Real app only** for testing (`slopsmith-custom/feedback-fork/debug/README.md`: `launch-debug.sh`, `cdp.mjs`, `dev-sync.sh`). Never the browser dev server or the Claude app's browser. Ask before quitting Matt's running copy; leave nothing playing.
- **No plastic hardware available.** Matt owns none. Real-app checks use a standard gamepad; plastic profiles stay "untested" until tried. Engine, importer, auto-charter and input mapping logic are covered by unit tests with fake gamepad states.
- **Licences:** core AGPL v3; YARG-derived code in separate LGPL v3 files with credit; Onyx-derived code in a separate GPL v3-credited file; drumchart's existing Moonscraper / YARG credits extend to the shared parser.
- **Repo conventions:** commit as mattromano with `git commit -s`; preserve CRLF files; tests via plugin `npm test`, pytest, core `npm run test:js`.
- **Chorus Encore politeness:** keep the existing throttling.
- **Order with Build-a-Band:** starts after Build-a-Band v1 meets its design.

## Testing and acceptance

- **Unit tests:**
  - importer: Rock Band `.mid` and Clone Hero `.chart` fixtures for every difficulty, forced HOPO / strum, taps, open notes, sustains, star power, solos;
  - feedpak schema validation of the example and of importer output;
  - five-fret engine: ported YARG behaviour (HOPO chains, strum leniency, sustains, overdrive), gamepad mode;
  - gamepad-input: profile matching, claim / release, menu support ignoring claimed controllers, input offset;
  - auto-charter: pitch-to-lane direction, chord shapes, HOPO carry-over, fret limits per difficulty;
  - library tool: candidate ranking for guitar parts, reuse of drum alignment by md5.
- **Benchmark report** for the auto-charter, agreed with Matt before auto-charts are switched on.
- **Real-app checks** with a standard gamepad (and any plastic controller that turns up):
  1. Pressing Start on the band screen adds a controller column; pressing frets lights them; menus no longer react to that controller.
  2. A song with a real 5-fret chart: a controller player plays bass alongside the real guitarist and drummer, every lane in step through pause, rewind, speed and an A-B loop count-in.
  3. Controller solo: one Xbox controller alone, 5-fret, all four difficulties.
  4. Two controllers: one on 5-fret guitar, one on drums; then both on the same part.
  5. An auto-chart song shows "AUTO CHART" on the band screen, lane tag and results.
  6. Rebinding a fret and the "press each button" setup work and are remembered after restarting the app.
  7. Overdrive deploys from a controller and rescues a failed-out bandmate in Fail on.
  8. The library tool finds and joins guitar / bass charts for a handful of songs, and the filters show them.
  9. Real-instrument parts, MIDI drums, splitscreen and multiplayer still work with no controller connected and with one connected but not joined.

## Left to the builder

- Exact key names in the feedpak shape and the fork's version number.
- Whether the library tool is extended or wrapped; alignment thresholds for guitar.
- How the auto-charter is structured, as long as it passes the benchmark.
- The tilted renderer's exact look (camera, gem shapes, strike line) within option A.
- Device profile contents (from YARG / Clone Hero lists), and the calibration UI.
- Order of work. A sensible order:
  1. feedpak fork change, importer, loader, library index
  2. `gamepad-input` domain and the five-fret plugin (renderer, engine, Xbox controller) playing in the normal player
  3. Build-a-Band controller columns, part types and N-lane layout
  4. the library tool for real guitar / bass charts
  5. auto-charter and benchmark
  6. controller drums in the drums plugin
