# RockHeroSmith: band play as a main way to play feedBack

Date: 2026-10-21. Status: design, awaiting Matt's approval. Reviewed by a builder check; its four open questions were answered by Matt. Supersedes the open questions in
`2026-10-22-build-a-band-main-mode-handoff.md`, which still holds the recon facts and the
gotchas list (read its "Constraints and gotchas" section before building).

Base spec for the mode itself: `2026-10-20-build-a-band-design.md` (and the plastic-controllers spec).

## Why

RockHeroSmith exists so that someone on a **real guitar** can play a song together with friends
who only know **Guitar Hero / Rock Band controllers** (plastic guitar, plastic or real drums, a pad).
That pairing is the point of the app's band mode. Today it hides as "Build-a-Band", one sidebar
entry under LIBRARY. It should be one of the two front doors of the app, next to solo play.

When a call is unclear, decide it in favour of: a GH/RB friend picks up a controller, presses Start,
and is playing alongside the real guitarist within seconds, with no setup knowledge.

## Goals

1. **Rebrand Build-a-Band to RockHeroSmith, fully** (Matt chose a full rename, not UI-only).
2. **Home hero splits in two**: solo/practice on the left, RockHeroSmith on the right.
3. **Press Start anywhere** (outside the player) on a plastic guitar, drum kit or pad opens
   RockHeroSmith setup with that controller already joined.
4. **Library cards for band-ready songs get a visible RockHeroSmith button** that opens Confirm
   with the song picked.
5. **Sidebar**: RockHeroSmith is the first item in the HOME group, directly under Home.
6. **First-run tour** gets one step pointing at the Play RockHeroSmith button.

## Non-goals

- Continue / Jump back in does **not** remember band mode. It always resumes solo, as today.
- No Home mode picker / "Bands & modes" row. Career, Virtuoso, FeedBarcade stay where they are.
- No rotating hero copy.
- No change to the solo flow: Start Playing, Lessons, card click-to-play, ⋮ menu Play all behave
  exactly as today.

## Anti-goals (a failure even if it "works")

- Solo play or any existing flow changes behaviour or gets slower.
- Saved band setups (`build_a_band.prefs.v1`) are lost by the rename.
- Press Start hijacks a controller during a song, inside another plugin that owns the pad
  (FeedBarcade, minigames, five-fret solo), or while a modal is open.
- Home looks broken or empty when the RockHeroSmith plugin isn't installed.
- Any test plays sound on Matt's speakers.

## Decisions (Matt's)

### 1. Full rename to RockHeroSmith

| Thing | From | To |
|---|---|---|
| Display name (plugin.json `name`, `nav.label`, screen titles, README, toasts) | Build-a-Band | RockHeroSmith |
| Plugin id | `build_a_band` | `rockherosmith` |
| Screen id | `plugin-build_a_band` | `plugin-rockherosmith` |
| Plugin folder | `feedBack-plugin-build-a-band` | `feedBack-plugin-rockherosmith` |
| GitHub repo | `mattromano/feedBack-plugin-build-a-band` | `mattromano/feedBack-plugin-rockherosmith` |
| dev-plugins symlink | `dev-plugins/build_a_band` | `dev-plugins/rockherosmith` |

Matt pre-approved the GitHub repo rename ("Yes, go ahead"). GitHub redirects the old URL; update
the local remote URL afterwards.

**Timing (Matt's call): rename first.** The rename is the plan's first task. Other worktrees
(`.worktrees/bab-controllers`, `build-a-band-5fret-plan`, core/five-fret/drums worktrees) were
active hours ago; after the rename, any of them pointing at the old folder, symlink or remote must be
repointed (`git worktree repair`, remote URL update) and the change noted in `MASTER.md`.

**Installed app (Matt's call):** move the installed bundle's `plugins/build_a_band` aside to a
backup folder outside the bundle (restorable, not deleted), then install `rockherosmith`, so two
copies never load. How it gets installed (dev-sync with the plugin added to `repos.txt`, or a manual
copy) is the builder's call. Matt's existing `build_a_band.prefs.v1` must migrate on first load.

**Saved data migration:** on first load, if `rockherosmith.prefs.v1` is absent and
`build_a_band.prefs.v1` exists, copy it across, then leave the old key alone (do not delete — cheap
rollback). Same pattern for any other storage key carrying the old id.

Everything outside the plugin that names the old id must move with it (recon list):
- core `static/v3/shell.js:55,69` (NAV entry, PROMOTED_PLUGINS entry, slot id);
- `feedBack-plugin-five-fret` (screen.js:21,61,69,933; README; tests; CHANGELOG — CHANGELOG
  gets a new entry, old entries are history and stay);
- `feedBack-plugin-drums/tests/screen.test.js:1584,1589` (`returnTo`);
- `feedBack-plugin-stems/tests/claims.test.mjs` (claim ids `build_a_band:*`, requester);
- comments in lyrics-karaoke, notedetect, scorecard, core `app.js`/`highway.js`/tests — update
  where they name the id or the product, so grep for the old name comes back clean except history.

### 2. Home hero: split hero

`static/v3/dashboard.js` hero (`#v3-hero`, ~185-231) splits into two halves:
- **Left:** today's hero, unchanged copy ("Turn any song into practice."), **Start Playing** and
  **Lessons**, same behaviour.
- **Right:** a bold **RockHeroSmith wordmark lockup** with a flame/lightning accent and a small
  instrument icon set (guitar, drums, mic, plastic guitar), and a **Play RockHeroSmith** button
  that opens RockHeroSmith setup.

Art is SVG/CSS (no new raster assets required, but the builder may add one). It must read in the
app's existing dark theme and palette. On narrow widths the halves stack (solo first).

### 3. Press Start anywhere (outside the player)

**Any gamepad's standard Start button** (Matt's call: any pad, Xbox pads included, not only
controllers set up in the five-fret/drums Controllers settings) pressed on any screen except while a
song is loaded opens RockHeroSmith setup with that pad joined, as if it had pressed Start on the
setup screen (today's `src/join.js` behaviour). Core owns detection on the standard mapping (Start =
button 9) and emits an event; RockHeroSmith handles it. A plastic controller whose Start is not on
the standard Start button won't trigger this; that's accepted (it can still join on the setup
screen as today).

Does **not** fire when:
- a song is loaded, playing or paused (solo or band) — the player owns Start;
- the controller is already claimed by someone (`feedBack.gamepadInput.claimCount`/claims) — e.g.
  FeedBarcade, minigames, five-fret solo;
- a visible modal is open (use the visibility-aware check, see gotchas: hidden `aria-modal`s);
- RockHeroSmith is already open (its own join handles it).

### 4. Library card button

Cards get a visible **RockHeroSmith** button (next to the play affordance, in the hover row or chips
row — builder's call; recon: hover row ~`songs.js:1000`, chips ~`:1019`). Clicking it opens
RockHeroSmith with that song picked (Matt's call):
- if a band is already set up (saved prefs with players), it opens **Confirm** with the song (the
  Plan 8 Confirm model, entered from a song instead of Setup → pick);
- otherwise (first run, nobody set up) it opens **Setup with the song preselected**; once players
  join, Continue goes straight to Confirm, skipping the song pick.

**Shown only on band-ready songs**, Matt's rule: a song is band-ready when it has

- a **real guitar arrangement** (Lead / Rhythm / Bass / Combo; not a five-fret-only pack), **and**
- at least one part a GH/RB friend can play:
  - a **charted** plastic guitar/bass part (`five_fret_parts` with kind `chart`), or
  - a **drum chart** (a drum arrangement or a drum tab — Rock Band-style or real drums; the library
    does not distinguish the two, and either counts).

Lyrics/vocals alone do **not** make a song band-ready. Which guitar arrangement variants exist is
already shown by the card's arrangement chips; the button doesn't need to say.

Reuse BaB's existing detection (`src/parts.js` `songFacts`, `PART_TYPES.chartFrom`,
`drumsControllerPartFor`) rather than re-deriving it in core.

### 5. Sidebar

RockHeroSmith moves from LIBRARY (`anchorAfter: 'songs'`) to the **first item of the HOME group,
directly under Home**, above Progress. Label "RockHeroSmith". Builder picks/draws a fitting icon
(the current one is the generic `user`).

### 6. First-run tour

One new step in `static/v3/onboarding-tour.js`, highlighting the Play RockHeroSmith half of the
hero: plug in your guitar, hand a friend a Guitar Hero/Rock Band controller, and press Start. Step is
skipped when the plugin isn't installed.

## My calls (Claude's — Matt can veto)

- **Generic core seam, not hardcoded RockHeroSmith in core.** Core adds a small "play mode"
  registration (e.g. `feedBack.ui.registerPlayMode({ id, label, renderHero(el), start(), cardAction:
  { label, isAvailable(item), run(item) } })`, exact shape left to the planner). Core owns the split
  hero layout and the card button slot; RockHeroSmith registers into them. With nothing registered,
  Home and the cards look exactly as they do today. This replaces re-injecting DOM on every
  `v3:dashboard-rendered`.
- **Core owns Press Start.** Core's gamepad layer already owns unclaimed pads outside the player, so
  it detects standard Start there and emits an event (e.g. `gamepad:start-pressed` with the pad
  index/id) that RockHeroSmith handles by opening setup and joining that pad. RockHeroSmith does not
  run its own hidden background listener. Avoids two owners for the Start button.
- A paused song counts as "loaded": Start does nothing new there.
- **Branch names stay** `feature/build-a-band-stage` in every repo, so other sessions' branch
  references keep working. (A later cleanup can rename.)
- **Internal CSS/JS names** (`.bab-*` classes, `--bab-*` vars, `window.__buildABandRuntime`,
  `[build-a-band]` log prefix, stem claim ids) are renamed to an `rhs` / `rockherosmith` form as part
  of the full rename, as a mechanical pass with tests green before and after.
- Old `build_a_band.prefs.v1` is kept, not deleted, after migration.
- "Charted" plastic parts means `kind: 'chart'` only; autocharted parts don't qualify for the
  card button (they still play in the mode as today).

## Constraints

See the handoff's "Constraints and gotchas". Highlights: no sound in tests (silent real-app checks
on CDP 9333 in the installed app, never the dev server or built-in browser); close the debug app
afterwards; CRLF in `static/v3/songs.js` and core `CHANGELOG.md`; gamepad B → home in
`gamepad-nav.js` (new overlays own Esc in capture phase); stem_mixer reassert must not regress;
commits as `mattromano <42412983+mattromano@users.noreply.github.com>` with `-s`; push branches
as work lands; no PRs unless asked.

## Left to the builder

- Exact registration API shape and event names.
- Wordmark/accent/icon art details within "bold logo lockup, flame or lightning accent".
- Card button placement (hover row vs chips row) and its compact look.
- Order after the rename (suggested: core seam; then Home, cards, Press Start, sidebar, tour).

## Done looks like

- Grep for `build_a_band` / `Build-a-Band` across the repos finds only history (CHANGELOGs, old
  plans/specs) and the migration code.
- Saved band setups survive the rename (verified on Matt's installed app data).
- Cold start: Home shows the split hero; Play RockHeroSmith opens setup; Start on a plastic
  controller from Home, Song Library and Settings opens setup with it joined; Start during a song
  does nothing new.
- A band-ready card shows the RockHeroSmith button and opens Confirm with the song; a guitar-only
  or lyrics-only song shows none.
- Sidebar: RockHeroSmith first under Home. Tour has the new step.
- Without the plugin installed, Home, cards, sidebar and tour look exactly as today.
- All test suites green (plugin, core JS, five-fret, drums, stems); silent real-app acceptance with
  screenshots of Home, a Start-join and Confirm-from-card; branches pushed; GitHub repo renamed.
