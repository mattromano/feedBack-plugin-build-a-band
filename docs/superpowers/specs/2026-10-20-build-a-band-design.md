# Build-a-Band: design

Date: 2026-10-20. Status: ready for approval. Visual draft: `.superpowers/brainstorm/17104-1792552885/content/band-mode-draft.html` in `feedback-upstream/` (band screen, stage, results; fake notes).

## Why

A normal session on this Mac is a full band: one person on guitar, one on an electronic drum kit, one singing. Today that means running splitscreen and fighting it:

- **The highways fall out of step.** Rewinding moved one lane and not the other. The likely cause, read from the code: the A-B loop's count-in animates only the main highway (`feedBack/static/js/count-in.js:268-340` `rewindStep`; `feedBack/static/app.js:1944-1982`), while splitscreen keeps pushing the paused audio time to its panels.
- **The layout doesn't fit the parts.** Splitscreen only does equal splits, so the guitar highway is as narrow as the drum lane, and the fret numbers, which scale with lane width (`static/js/highway-draw.js:781`), become hard to read.
- **Nothing feels like a band.** Each part scores alone, vocals are a side pane, and nobody picks a part before the song.

Build-a-Band is a Rock Band-style band mode: before each song everyone picks a part, then all parts play on one stage, on one clock, with a shared HUD and a band results screen.

## Goals

1. A **band screen** before every song: one column per part, with its input, difficulty and per-part settings, and a Go button.
2. A **stage** where guitar, drums and vocals play side by side on **one song clock**. Play, pause, seek, rewind, speed and the A-B loop (including its count-in) move every lane together.
3. A **layout that suits each part**: vocals as a full-width strip on top, guitar and drums side by side below with a draggable divider, plus per-lane zoom and a separate fret-number size on the guitar lane.
4. **Rock Band look and feel**, all of it:
   - band score, star meter (1–5), band multiplier
   - on each lane: crowd meter, overdrive bar, multiplier, part-coloured edge glow, streak callouts
   - vocal phrase ratings in the strip
   - a shared 3-2-1 count-in
   - a band results screen
5. **Overdrive for every part**: drums by the existing fill/star power, guitar by **"Noodle it up"**, vocals by a mic hit.
6. **Fail mode**, a band-wide setting: No fail or Fail on.
7. **Drum sound modes**, independent of difficulty: Song drums, Rock Band, My kit only.
8. A **full-screen stage** that shows only the highways, with the app's main sidebar still reachable.
9. **Solo play** works too: one part on, filling the stage.
10. **In-depth song filters** showing what each song offers (parts, drum stem, vocal pitch, difficulties), including "playable by this band".
11. **Parts modelled as instrument + input kind,** so plastic controllers can be added later without redesigning the band layer.

## Non-goals (for now)

- Playing across machines. Multiplayer stays as it is and is not replaced. A later version can let multiplayer hand each machine its part.
- Plastic controllers: Guitar Hero / Rock Band 5-fret guitar and bass, and controller (HID) drums. These are the next projects after this one (see "Later: play with whatever you have").
- A fourth player (bass or second guitar). The design leaves room for it (see Parts), but v1 ships guitar, drums and vocals.
- Player names, profiles or per-person history. Parts belong to instruments, not people: whoever sits at the kit is the drummer.
- New highway renderers. The lanes use the highways that exist today.
- Saved band run history. Results are shown, not stored (guitar runs keep going to scorecard as today).
- Vocal harmonies.

## Anti-goals (would make it a failure even if it works)

- Lanes drifting apart, or any transport action that moves one lane and not the others.
- Fret numbers still too small to read at the default guitar lane width.
- Breaking solo play, splitscreen or multiplayer for people who don't use Build-a-Band.
- Copying YARG artwork, logos or sounds (see Look and feel).
- Testing in a browser dev server instead of the installed app (see Testing).

## The setup it's built for

All on one Mac, each part on its own device:

| Part | Device | How the app hears it |
|---|---|---|
| Guitar | old USB guitar interface through a dongle | audio input, scored by note_detect |
| Drums | electronic kit over MIDI | Web MIDI through core's `midi-input` capability, judged by the drums plugin's YARG engine |
| Vocals | USB-C microphone | mic, pitch-scored by lyrics_karaoke |

## User flow

1. **Open Build-a-Band** from its own entry in the app's sidebar.
2. **Band screen** (option A from the mockups, "band columns"):
   - The song at the top, with chips for what it has: drum stem, vocal pitch data, its arrangements. The band screen includes the song picker (see "Song picker and filters").
   - One column per part: Guitar, Drums, Vocals, and an "add a part" slot that's disabled for now.
   - Each column has:
     - an on/off toggle (sit this part out)
     - its input device
     - difficulty: Easy, Medium, Hard, Expert (for guitar, see "Guitar difficulty" below)
     - a live signal light. Guitar shows its level, drums show "hit a pad", vocals show the mic level plus the mic-hit sensitivity check (see Overdrive).
   - Per-part extras:
     - **Guitar:** which arrangement (Lead / Rhythm / Bass).
     - **Drums:** drum sound mode (Song drums / Rock Band / My kit only). Rock Band and My kit only are greyed out, with a short note, when the song has no drum stem.
     - **Vocals:** hear myself (on/off). Vocals is greyed out when the song has no vocal pitch data.
   - Band-wide: **Failing** (No fail / Fail on) and **Full screen stage** (on/off).
   - Everything is remembered between songs and sessions, so a normal night is: check the screen, hit Go. Difficulties can be changed here between songs when people swap instruments.
   - **Go** button. Space or any drum pad also starts.
3. **Stage**: the song plays with a shared 3-2-1 count-in, then all lanes run (see Stage).
4. **Results**: band stars and score, then a card per part (accuracy, score, best streak, difficulty, part-specific stats, a small award). Buttons: **Play again** and **Next song**. Next song returns to the band screen.

### Guitar difficulty

*Our call.* Guitar charts have no named levels; core has a mastery percentage (`static/js/player-controls.js:197-208`, `highway.setMastery()`), per highway. For the guitar lane only, Easy/Medium/Hard/Expert map to mastery 25/50/75/100%. On charts without a difficulty ladder the guitar difficulty shows "one level" and is disabled. Build-a-Band sets the guitar lane's mastery for band songs and puts the user's normal mastery setting back when the band song ends. Guitar stars compare score against a no-miss score for the notes shown at that mastery.

## Song picker and filters

Matt wants in-depth filters showing what each song offers, so the band can find songs everyone can play.

- **Search** plus recent songs, as a list or table, with columns or chips for what each song has.
- **Filters** (combinable):
  - **Has part:** guitar lead / rhythm / bass arrangements, drums chart, vocals (lyrics with vocal pitch).
  - **Playable by this band:** only songs that have every part currently switched on. On by default.
  - **Drum stem:** has a separate drum stem (needed for the Rock Band and My kit only sound modes).
  - **Stems:** has stems at all versus full mix only.
  - **Difficulty:** has a guitar difficulty ladder (more than one level); drum chart difficulties available.
  - **Tuning,** plus the library's existing filters (artist, collections and so on) where core already supports them.
- **Core changes:** the library already indexes arrangements, lyrics and `has_vocal_pitch` (`lib/metadata_db.py`) and filters by them (`lib/routers/library.py`). Add the missing facts to the index and the `/api/library` filters: drums chart present, stem ids (at least `drums`), and difficulty-ladder presence. Then Build-a-Band's picker uses the same filters, and so can the main library later.
- Chips on each song row match the band screen's chips, so you see at a glance what a song offers.

## Parts are "instrument + how you play it"

So that plastic controllers slot in later without a redesign, each band part is defined by an instrument and an input kind, not hard-coded:

| Instrument | Input kinds in v1 | Later |
|---|---|---|
| Guitar / Bass | real instrument (audio, note_detect) | 5-fret controller |
| Drums | MIDI kit | controller (HID) drums |
| Vocals | microphone | — |

Each part type supplies: the chart it needs from the song (used by the filters), how its lane is drawn, how input is bound, how it judges and scores (feeding the band layer's common hit/miss/score/overdrive/crowd interface), and its band-screen settings. v1 implements only the three in the left column. The band layer (score, stars, crowd, overdrive, fail, layout) talks only to that common interface.

## Stage

### Layout

- **Top HUD bar:** band score, star meter, song name, band multiplier.
- **Vocal strip:** full width under the HUD, about 90 px. It shows lyrics, the pitch line and phrase ratings. It's hidden when vocals are off.
- **Lanes:** guitar on the left and drums on the right. They start at about 62% / 38%, with a draggable divider (clamped to roughly 35–80%). The split is remembered.
- **Per lane:**
  - name and difficulty tag
  - crowd meter on the left edge
  - overdrive bar and multiplier top right
  - part-coloured edge that glows brighter as the streak grows and dims on a miss
  - callouts ("150 NOTE STREAK!", "Solo 94%", "Awesome!", "Noodle it up!", "Overdrive ready")
- **Zoom:** hovering a lane shows zoom −/+. The guitar lane also gets **fret numbers −/+**, which scales the note labels on their own, so the numbers can be big without making the whole highway huge. Both are remembered.
- **Solo play:** one part fills the stage.
- **Room for a fourth part:** a second wide lane can share the bottom row later. Layout code should take a list of lanes, not hard-code three.

### One clock

- All lanes follow core's single song clock: the `#audio` time, shimmed by stems when stems are loaded. They are fed the same way the main highway is.
- Pause, seek, arrow-key rewind, restart, speed and the A-B loop must move every lane together.
- **Fix the count-in bug as part of this work.** During `startCountIn`, every band lane follows the rewind sweep from loop B back to loop A, not just `window.highway`. The fix belongs in core, so it also fixes splitscreen: count-in should publish the swept time (an event or a time source) that other highways can follow, instead of moving only `window.highway`.
- Build-a-Band and splitscreen must not run at once. Build-a-Band switches splitscreen off while a band song plays. They fight over `playSong`, note_detect's default suppression and the drums focus logic.

### Full screen

- With **Full screen stage** on, the stage hides all app and player chrome: only the HUD, strip and lanes show.
- Moving the mouse shows the transport (back, rewind 5 s, play/pause, forward 5 s, A-B loop, time, end) and an exit-full-screen button. They hide again after a few seconds.
- The app window goes native full screen on the desktop app. The desktop app needs a new renderer call to enter and leave full screen **without** changing the "start in full screen" preference. Today only `setStartFullscreen` exists, and it persists (`feedBack-desktop/src/main/preload.ts:615-619`).
- **The app's main sidebar stays reachable:** moving the mouse to the left edge, or pressing a key, slides it in over the stage. Today `#player` covers the sidebar completely (`static/style.css:17-25`), so this needs a core change. 
- **Sidebar mid-song (Matt's decision):** opening something from the sidebar during a band song **pauses** the song but **does not leave it**. Settings opens over the paused stage. Closing it returns to the stage exactly where it was, and play resumes from there (with the count-in). This needs a core change: today `showScreen` to any screen other than the player stops playback and unloads audio (`static/js/session.js:199-208`). Core needs a way to show Settings over the player without tearing the song down.
  - *Our call:* only Settings (and Build-a-Band's own band settings) open this way. Sidebar items that genuinely leave the song, such as the library, first ask "Leave the song?", and only then stop it as today.

## Scoring and the HUD

Each part keeps its own scoring engine for judging hits. *Our call:* **Build-a-Band owns the band score.** It takes each judgment's base points from the part's engine and applies the band rules itself: the overdrive ×2, no scoring while a player is failed out, and the band bonus. The engines don't need "boost" or "suspend" hooks. Drums is the exception: its engine already does star power, so the band layer uses its numbers as they are. Scorecard keeps receiving the plain, unboosted guitar run as today.

*Our call:* **during a band song, the band HUD replaces the plugins' own score displays.** note_detect's HUD, karaoke's score/multiplier/stars and the drums panel's score are hidden. Each of those plugins gets a public "hide my score display" switch, listed under Changes. The core player controls are hidden on the stage and shown on mouse move, whether or not full screen is on. Full screen additionally hides the app chrome and makes the window full screen.

| Part | Engine | What Build-a-Band reads |
|---|---|---|
| Guitar | note_detect | `notedetect:hit` / `notedetect:miss` (score, streak, multiplier per judgment), `getStats()` |
| Drums | drums plugin, YARG `DrumsEngine` port | `engine.getState()`: score, combo, multiplier, stars, accuracy, star power. Today only `window.__drumsPanelResults()` exposes it, by polling; hit/miss events need exposing (see Changes). |
| Vocals | lyrics_karaoke scorer | phrase ratings, score, multiplier, streak, stars. Today all internal; needs exposing. |

- **Band score** = the sum of the part scores, plus band bonus.
- **Band multiplier** ("BAND ×N"): N is the lowest current multiplier among active parts, so it only climbs when everyone is streaking and drops as soon as anyone misses. While N ≥ 2, scored notes earn a band bonus on top. *Our call:* exact bonus numbers are the builder's, tuned so the bonus is a noticeable but minor share of the total (around 10–20% in a good run).
- **Stars:** each part already has, or can derive, star progress. Drums and vocals use YARG thresholds; guitar uses score against a no-miss score for the chart at that difficulty. Band stars = the average of the active parts' star progress. *Our call.*
- **Crowd meter, per part:** a rolling health value that rises on hits and good phrases and falls on misses and overhits, starting about 2/3 full. It is always shown. What happens when it empties depends on Fail mode.
- **Multipliers** stay per part, as each engine defines them (note_detect ×2/×3/×4 at 10/25/50 streak, the drums engine's own, karaoke's phrase streak). Overdrive doubles a part's multiplier.

### Fail mode

- **No fail:** crowd meters are only for show; the song always plays through.
- **Fail on:**
  - When a part's crowd meter empties, that player drops out: their lane greys, their stem (if the song has one) mutes, and their notes stop scoring.
  - Any bandmate deploying overdrive brings every dropped-out player back with a partly filled meter.
  - If every active player is out at once, the song ends with a "Band failed" results screen.
  - *Our call:* there's no Rock Band-style "saved within N seconds or the band fails" timer in v1.

### Overdrive

All parts follow the Rock Band rules as YARG implements them:
- Earn a quarter bar for each overdrive phrase completed.
- Deploy at half a bar or more.
- While active, the part's multiplier is doubled and the bar drains over about 8 measures.
- Deploying also rescues dropped-out bandmates in Fail on.

Earning and deploying differ by part:

| Part | Earn | Deploy |
|---|---|---|
| Drums | Existing star power in the drums engine (star power phrases). | Existing: hit the fill at the end of an activation phrase, the configured SP pad, or Enter. |
| Guitar | Our charts have no overdrive phrases, so a quarter bar is earned for each chart phrase cleared at 90% or better. *Our call.* | **"Noodle it up":** when the bar is at least half full and the chart has a gap of 2 s or more with no notes, the lane shows a glowing "Noodle it up!" zone. Playing at least 3 new notes inside the zone deploys overdrive. Notes still ringing from before the gap don't count. |
| Vocals | *Our call:* KRB-8 (vocal overdrive and the mic-hit detector) is **pulled forward and built in the karaoke plugin as part of this work**, without waiting for KRB-6. Until the song has authored overdrive phrases (KRB-6, `vocal_phrases.json`), a quarter bar is earned for each phrase rated Strong or better. *Our call.* | **Mic hit:** a sharp tap or shout into the mic, detected as a fast rise in level (KRB-8 suggests 25 dB or more between frames) above a sensitivity threshold. The drum kit and amp are in the same room, so the threshold is set on the band screen: tap the mic to check it fires and the drums don't. It deploys at any time the bar is half full, as in YARG. |

## Drum sound modes

Independent of difficulty, set per song on the band screen and remembered.

1. **Song drums:** the drum stem always plays (today's behaviour).
2. **Rock Band:** the drum stem drops out on a miss or overhit and comes back on the next good hit. It fades over about 10–15 ms using stems' existing fade, through stems' non-persisting `mute`/`restore` automation path, so the drum volume saved for the song isn't touched.
3. **My kit only:** the drum stem is muted for the whole song; the only drums you hear are your pad hits through the loaded kit.

Pad hit sounds stay on in all three modes, as today. Modes 2 and 3 need a separate drum stem and are disabled for songs that only have a full mix.

## Look and feel

- **Draw our own HUD, in YARG's style.** The YARG check found:
  - YARG's HUD is mostly Unity prefabs, meshes and shaders, not image files.
  - Its few plain HUD images have no clear art licence.
  - Its logo and crowd sounds are off limits; the crowd sounds are non-commercial only.
- **Use:**
  - YARG's fonts (Unbounded for headings and numbers, plus Barlow or Red Hat Display), loaded from Google Fonts under the OFL
  - Lucide icons (ISC)
  - YARG.Core's gameplay numbers (star thresholds, multipliers, overdrive rules), ported with LGPL credit in a separate file, the way the drums plugin already does (`feedBack-plugin-drums/NOTICE.md`)
- **Part colours:** guitar gold, drums red, vocals purple, overdrive blue (as in the draft).
- The visual draft is the reference for layout and feel, not pixels.

## How it plugs together

### The new plugin: `feedBack-plugin-build-a-band`

- **Its own repo,** forked and branched like the other plugins (FORK-HANDOFF.md workflow).
- **Its own sidebar entry.** Individual plugins aren't listed in the sidebar today, so this needs a small core edit: add it to `NAV` / `PROMOTED_PLUGINS` in `static/v3/shell.js:50-67`.
- **The band screen** is its plugin screen (`screen.html`), a full-screen plugin page via `"fullscreen": true` in `plugin.json`.
- **The stage runs inside the core player (`#player`),** not on the plugin's own screen. Leaving the player screen stops playback (`static/js/session.js:199-208`), and the one clock lives there. Go starts the song through core `playSong`, then Build-a-Band lays the stage out inside `#player`.
- **Lanes:**
  - **Guitar:** the main highway (`window.highway`) resized into the guitar slot, or a `createHighway()` instance in the slot like splitscreen panels. *Builder's call.* Using the main highway keeps core features such as 2D/3D renderer choice, and gets the core time tick for free.
  - **Drums:** a `createHighway()` instance with `setRenderer(window.feedBackViz_drums())`, fed time every frame like splitscreen's panels (`feedBack-plugin-splitscreen/screen.js:1349-1390, 3019`).
  - **Vocals:** the karaoke strip mounted into the stage's strip slot.
- **Guitar scoring:** a note_detect instance for the guitar lane bound to the guitar device and channel. Use the default instance, so stats and scorecard aren't double counted (`static/v3/stats-recorder.js:235` counts every instance).
- **Drum stem control:** `window.stems` (`getState()` to find a `drums` stem, plus the `mute`/`restore` automation path).

### Changes needed in existing repos

| Repo | Change |
|---|---|
| core `feedBack` | Library index and `/api/library` filters for drums chart, stem ids and difficulty ladder (see Song picker and filters) |
| | Count-in rewind publishes its swept time so every highway follows it (fixes splitscreen too) |
| | Sidebar entry for Build-a-Band |
| | Sidebar that can slide in over the player |
| | Settings that can open over a paused player without stopping or unloading the song; other screens ask before leaving a band song |
| | A fret-label scale option on the 2D highway (e.g. `highway.setLabelScale(f)`), used by the guitar lane's "fret numbers −/+" |
| `feedBack-desktop` | Renderer call to enter and leave native full screen without touching the start-full-screen preference |
| note_detect | Public switch to hide its own score HUD for a given instance |
| | Public `notedetect:onset` event for any new note played, including in gaps with no charted notes. Feeds "Noodle it up". Hook in at the desktop engine's onset bookkeeping (`screen.js:4462-4490`) and the web path. |
| drums | Public difficulty setter per instance (today `_setDifficulty` is private, `screen.js:404`) |
| | Public events for judgments (hit, miss, overhit) and star power (ready, activate, end), mirroring the engine's private events (`assets/engine.js:426`) |
| | Kit input routed to the band's drum lane without depending on splitscreen focus (`_routeTarget`, `screen.js:2046`) |
| | Public switch to hide its own score display |
| lyrics_karaoke | Mount the strip into a given container (today `showOverlay` hard-codes `#player`, `src/main.js:369`) |
| | Public events or API for phrase rating, score, multiplier, streak and stars |
| | Public difficulty setter |
| | KRB-8 pulled forward: vocal overdrive meter and mic-hit detection, exposed as events (earning by Strong+ phrases until KRB-6 lands) |
| | Public switch to hide its own score display |
| stems | Probably none: the automation `mute`/`restore` path and `getState()` exist. Confirm the fade time when muting through automation. |
| splitscreen | Stays off while a band song plays (Build-a-Band turns it off; no splitscreen change expected) |

Each of those changes is a branch and PR in its own fork, landed before or with the Build-a-Band work that needs it.

### Settings Build-a-Band stores

Per machine (plugin settings or localStorage, *builder's call*):
- parts on/off and each part's input device
- difficulty per part
- guitar arrangement
- drum sound mode
- hear-myself setting
- mic-hit sensitivity
- fail mode and full-screen stage
- lane split, per-lane zoom and fret-number size

## Constraints

- **Real app only for testing.** Use `slopsmith-custom/feedback-fork/debug/README.md`:
  - `launch-debug.sh` (DevTools on port 9333)
  - `cdp.mjs` to drive the app
  - CoreAudio helpers to see which mic and speakers are in use
  - `dev-sync.sh` to install JS/Python changes

  Never use the browser dev server or the Claude app's browser. Ask before quitting the user's running copy. After audio tests, pause, stop the mic, and leave nothing playing.
- **Repo conventions** from `feedback-upstream/CLAUDE.md`:
  - commit as mattromano with `git commit -s`
  - preserve CRLF files
  - tests via plugin `npm test`, `pytest`, core `npm run test:js`
- **Licences:** core is AGPL-3.0; drums is MIT plus separate LGPL engine files. Any YARG.Core-derived logic stays in separate, credited LGPL files.
- **Karaoke parity work is in flight** (`slopsmith-custom/KARAOKE-RB-PARITY-PLAN.md`, milestone A). Coordinate the karaoke changes with it rather than duplicating scoring or overdrive logic.
- **macOS drum input is Web MIDI only.** The plugin's native MIDI bridge is Windows-only.

## Testing and acceptance

- **Unit tests** (pure modules, node):
  - band score and bonus
  - band stars
  - crowd meter
  - fail and rescue rules
  - overdrive meter (earn, deploy, drain)
  - "Noodle it up" gap detection and onset counting, with ringing notes excluded
  - mic-hit onset rule
  - drum sound mode state machine
  - layout split clamping
- **Real-app checks** on this Mac with the three real devices:
  1. Band screen shows all three inputs live (guitar level, pad hit, mic level).
  2. A full song with all three parts: every lane in step through pause, arrow-key rewind, restart, speed change, and an A-B loop wrap with its count-in. Check it visually and with `cdp.mjs`, by reading each highway's time.
  3. The guitar lane at the default split shows fret numbers readable from playing distance. Fret numbers −/+ and the divider work and are remembered.
  4. Each drum sound mode behaves as described, and modes 2 and 3 are disabled on a song with no drum stem.
  5. Overdrive deploys for all three parts. Drums hitting near the mic don't fire the vocal mic hit at the chosen sensitivity.
  6. Fail on: a player drops out, a bandmate's overdrive rescues them, and the band fails when all are out.
  7. Results screen, then Next song back to the band screen with settings kept.
  8. Full screen enters and exits, the transport shows on mouse move, and the sidebar slides in from the left edge.
  9. The song picker's filters return the right songs (spot-check against songs known to have / lack a drum stem, vocal pitch, a drums chart and a difficulty ladder), and "playable by this band" follows the parts switched on.
  10. Solo play of each part alone still works. Splitscreen and multiplayer still work when Build-a-Band isn't in use.

## Later: play with whatever you have

After Build-a-Band meets this design, the next projects (each with its own design) are:
1. **Plastic guitar and bass ("Clone Hero mode"):** 5-fret charts in feedpak, an importer for Rock Band / Clone Hero guitar and bass parts (core already imports their drum charts, `lib/drumchart.py`), a 5-fret highway, controller input, and YARG's five-fret engine ported with credit.
2. **Controller drums:** Rock Band-style plastic kits that show up as game controllers, reusing that controller input.

## Open questions for Matt

None left. Q1 was answered on 2026-10-20 (see "Sidebar mid-song").

## Left to the builder

- Main highway versus a separate highway instance for the guitar lane (either way it needs per-lane mastery; see Guitar difficulty).
- Exact band bonus numbers, crowd-meter rates, and the thresholds for gaps and onsets.
- How the song picker on the band screen looks, using core's library API.
- Where settings are stored.
- How each cross-repo change is shaped (event names, function names), as long as it's public, documented in that repo's README, and covered by a test.
- Order of work. A sensible order:
  1. the core count-in fix and the stage with guitar and drums on one clock
  2. the band screen, with the song picker, filters and the core library filter additions
  3. the vocal strip
  4. the HUD and scoring
  5. overdrive and fail
  6. drum sound modes
  7. full screen and the sidebar

## Song pick flow (v1.1)

Added 2026-10-21 after v1 shipped. Matt's feedback: *"I would like to add a browse screen to choose a song, not a search drop down, so like once the band is confirmed you can go into the browse screen, the confirm instruments before the song starts. Even the current browse selections is confusing if I even selected a song or not."* He chose to reuse the app's own Song Library grid in a "pick for band" mode. This section replaces the band screen's song picker (User flow step 2, "Song picker and filters") wherever they differ. The binding rulings are in `.superpowers/sdd/plan-8-inputs.md`.

### Flow

1. **Band setup.** Who plays and on what: each part's on/off toggle, input device and live signal light, the vocals hear-myself switch and mic-hit check, plus the band-wide Failing and Full screen stage. There's no song and no search box here. Buttons:
   - **Choose a song** (primary) opens the Song Library in pick mode.
   - **Continue with <last song>** goes straight to Confirm with the last song, when that song is still in the library.
2. **Song Library, picking for the band.** This is core's own Songs screen (`v3-songs`): the same grid, art, search, sort and filter drawer. A bar along the bottom shows:
   - the title "Pick a song for the band"
   - band filter chips: **Playable by band** (on by default), **Drum stem**, **Drum chart**, **Vocal pitch**, **Guitar part**
   - what is selected ("Nothing selected yet" or "Selected: Title — Artist")
   - **Back to the band** and **Use this song**

   Clicking a card selects it and never plays it. The selected card gets a ring and a **Selected** badge. Clicking the selected card again, or pressing Use this song, takes the song to Confirm.
3. **Confirm.** The chosen song is shown big: art, title, artist and its chips. Under it is one row per part:
   - its on/off toggle
   - the device it will use
   - its difficulty
   - Guitar: its arrangement (Lead / Rhythm / Bass), with the ones the song lacks greyed out
   - Drums: the drum sound mode, with Rock Band and My kit only greyed out when the song has no drum stem
   - parts the song can't support are greyed, with the existing notes

   Buttons: **Change song** (back to the library with this song already selected), **Band setup**, and **GO**. Space or any drum pad starts the song **only here**.
4. **Stage and results** are unchanged. **Next song** now goes straight to the library pick. Back from there lands on Confirm for the song just played.

### Back and Esc

| Where | Esc / Back goes to |
|---|---|
| Band setup | nothing (the sidebar leaves, as on any screen) |
| Library pick | where the pick was opened from (Setup or Confirm), with the song unchanged |
| Confirm | the library pick, with this song selected |
| Stage, results | unchanged (plan 7 R4) |

Leaving the library through the sidebar cancels the pick. Nothing changes, and the band screen keeps its view for the next visit.

### Core change: `feedBack.library.pick`

A small, generic, additive hook in core, not a copy of the grid:
- `window.feedBack.library.pick({ title, filters, selected, returnTo, confirmLabel, backLabel })` → `Promise<{ item, filters, reason }>`.
- It opens `v3-songs` in pick mode. The chips' params are added to the grid's `/api/library` query.
- It resolves with the picked row (`reason: 'picked'`), or with `item: null` on Back, on leaving the screen, or when another pick replaces it.
- Songs without a pick session behave exactly as today.

### What goes away

- The band screen's search dropdown, its result list and its Recent list (`src/song-picker.js`).
- `recentSongs` is still recorded in the prefs but has no UI.
- `lastSong` stays: it feeds "Continue with" on Setup.
