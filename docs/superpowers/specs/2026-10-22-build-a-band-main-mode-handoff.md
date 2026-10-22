# Handoff: make Build-a-Band a main way to play feedBack

Status: handoff for a new session. Brainstorm the open questions with Matt first, then write the plan.
Date: 2026-10-22. Branch everywhere: `feature/build-a-band-stage` on Matt's `mattromano/*` forks. Push as you go; open no PRs unless asked.

## What Matt asked for

> "Can you make a handoff doc to make this build a band feature like a more main feature of how to play the game? Instead of just a side menu item?"

Today Build-a-Band (BaB) is one entry in the sidebar, under LIBRARY just below Song Library. Matt wants it to feel like one of the main ways to play: the thing you reach for from the home screen with a guitar, drums, a mic or plastic controllers, not a plugin you hunt for.

## Where things stand

BaB v1 is built (Plans 1–8 plus the plastic-controller work). It covers:
- band setup;
- a song pick from the Song Library;
- the Confirm screen;
- a split stage with guitar, drums and vocals;
- band score, overdrive and fail/rescue;
- drum sound modes;
- full screen, the sidebar and Settings over a paused song;
- results with Next song;
- Start-to-join for plastic guitar, drums and Xbox pads.

Spec: `docs/superpowers/specs/2026-10-20-build-a-band-design.md`. The "Song pick flow (v1.1)" section covers the newest flow. The plastic-controller spec sits beside it.

Facts from a recon of core on `feature/build-a-band-stage`:

| Area | Today | Where |
|---|---|---|
| Home screen | One hardcoded render with:<br>- the hero "Turn any song into practice." and the buttons **Start Playing** and **Lessons**<br>- a Continue Playing / Pick a song card<br>- a stats row<br>- "Jump back in!" recent songs<br><br>Start Playing resumes or plays solo. There's no tile registry and no `feedBack.ui` home slot. | `static/v3/dashboard.js:185-231` |
| Plugin seam on home | Plugins can only listen for `v3:dashboard-rendered` and inject DOM again after every render. Career does this through `#v3-dash-career-slot`. | `dashboard.js:218,252`; `plugins/career/screen.js:1060,1570` |
| Sidebar | `NAV` is a hardcoded array with groups `HOME`/`LIBRARY`. Promoted plugins get a slot after an anchor. BaB has `anchorAfter: 'songs'`, which puts it in LIBRARY. Virtuoso and Career anchor after `feedbarcade`, which puts them in HOME. | `static/v3/shell.js:31-72,174-185,297-323` |
| Modes | There's no "how do you want to play" concept. Every Play goes straight to solo `window.playSong`. Splitscreen and BaB hook in by wrapping it or listening for `song:loading`. | `static/js/session.js:638`, `static/v3/songs.js:526` |
| Onboarding | A profile modal is followed by the `home-onboarding` tour (hero, continue, instrument, tuner, audio routing, profile, nav). The tour has no step for modes or BaB. | `static/v3/profile.js:261-650`, `static/v3/onboarding-tour.js:22-114` |
| Controllers | Core `gamepad.js` turns pads into menu keys (A = Space, B = Esc). It stands down while a controller is claimed. `feedBack.gamepadInput` exposes `claim`, `watch` and `claimCount`. **Start-to-join exists only inside BaB** (`src/join.js`), so it only works while the BaB screen is open. | `static/v3/gamepad.js:23-49,132`, `static/capabilities/gamepad-input.js:323-429`, BaB `src/join.js` |
| BaB entry | `plugin.json` sets `nav: {label: "Build-a-Band", screen: "plugin-build_a_band"}` and `fullscreen: true`. The screen opens on Setup. | BaB `plugin.json:7-15`, `screen.html:1` |

## The goal, in experience terms

A player sits down with any mix of instruments and gets into a band song in a few seconds, without knowing BaB is a plugin.

These are proposals for the next session to brainstorm with Matt. None of them are decided yet:
1. **Home presents ways to play.** Next to (or in place of) the solo "Start Playing", the hero offers **Play solo** and **Play as a band**. It could also show a small "Bands & modes" row with Band, Career, Virtuoso and FeedBarcade.
2. **Press Start anywhere.** A plastic guitar, drum kit or pad pressing Start on Home, or anywhere outside the player, opens Band setup with that controller already joined. Today join only works on the BaB screen.
3. **Library cards offer "Play with band".** This goes in the card's menu, or as a secondary button, and opens Confirm with the song picked. It's the reverse of the current Setup → pick flow.
4. **The sidebar moves BaB to HOME,** near Career and Virtuoso. It may also need a clearer label or icon ("Band").
5. **Continue/Jump back in remembers mode.** A song last played as a band resumes as a band, with the same parts.
6. **First-run tour** gets one step pointing at band play.
7. **Branding and copy.** The hero text is about practice ("Turn any song into practice."). A band mode may want its own hero art or rotating copy.

## Likely changes (for the planner to confirm)

- **Core (`feedBack`)**
  - Add a small, generic **home "ways to play" slot or registry**, so plugins declare an entry (id, label, icon, `start()`), instead of injecting DOM again after every render. Possible form: a `homeEntry` field in `plugin.json`, or `feedBack.ui.registerPlayMode(...)`. This is better than hardcoding BaB into `dashboard.js`.
  - Sidebar: set BaB's `anchorAfter` to `'feedbarcade'` or `'home'` (`shell.js:69`). That's a one-line move to HOME. A real "Play modes" section is a bigger change.
  - Optional: a **mode memory** on the continue-session record, so `/api/session/continue` can carry `mode: 'band'` plus parts.
  - Optional: a **global controller join owner**. Either core listens for Start on unclaimed pads outside the player and emits an event, or BaB's `join.js` runs a background listener that `showScreen`s the band setup. Watch `gamepad.js` standing down while claims exist.
  - Tour: add one step (`onboarding-tour.js`).
- **Build-a-Band**
  - Add an entry point that takes a song (`openConfirm(item)`) for library "Play with band" and home Continue. It reuses the Confirm model from Plan 8.
  - Add a background join listener, if that route is chosen.
  - Add the `homeEntry` / registry wiring, art and copy.
- **Library** (`static/v3/songs.js`, CRLF): add a "Play with band" action in the card menu and the context menu. Keep solo Play the default.

## Constraints and gotchas (learned the hard way)

- **No sound in tests.** Never start playback on Matt's speakers without asking. Real-app checks are silent:
  - hold autoplay, mute `#audio`, and use the pause guard;
  - send synthetic events only;
  - test in the installed app on CDP port 9333, never the browser dev server.
  Tools: `slopsmith-custom/feedback-fork/debug/` and `/private/tmp/claude-501/bab/{guard.js,shot.mjs,gesture.mjs}` (recreate them if they're gone).
- **Close the debug app when you finish debugging** (Matt asked).
- **Hidden dialogs:** plugins (editor, slopscale, virtuoso, minigames) keep hidden `aria-modal` dialogs mounted. Any "is a modal open?" check must look at visibility (see core `library-pick.js isPickBackKey` and BaB `src/modal-open.js`).
- **Gamepad Escape:** core `gamepad-nav.js` turns gamepad B into "go home" on any screen without a back button. A new screen or overlay that owns Esc must handle it in the capture phase or `preventDefault` early. Pattern: BaB Confirm, and core `gamepad-nav` skipping an open library pick.
- **Line endings:** `static/v3/songs.js` and core `CHANGELOG.md` are CRLF. Edit in binary mode.
- **stem_mixer:** Matt has the third-party stem_mixer plugin installed. It turns every stem on after load. Stems' claim reassert handles this; don't regress it.
- **Commits** go out as `mattromano <42412983+mattromano@users.noreply.github.com>` with `-s` and the `Co-Authored-By: Claude …` trailer.
- **Process that worked:** spec, then plan (writing-plans), then subagent-driven build with a review per task, a final whole-branch review, one fix wave, and a silent real-app acceptance.
  - Ledgers live under `feedBack-plugin-build-a-band/.superpowers/sdd/` and are git-ignored.
  - `MASTER.md` there has the history.

## Open questions for Matt (ask before planning)

1. On Home, should band play sit **beside** solo (two buttons), or should Home become a **mode picker** (Solo / Band / Career / Virtuoso / FeedBarcade)?
2. Should **pressing Start on a controller anywhere** jump into band setup, or only on Home?
3. Should library cards get **"Play with band"**, or should band songs always go through Band setup first?
4. Should **Continue / Jump back in** remember band mode and parts?
5. Is a new **name or label** wanted? ("Band", "Band Mode", "Play as a band", or keep "Build-a-Band".)
6. Any **art or branding** for a band hero?

## Done looks like

- From a cold start, Home offers band play prominently, and one click (or Start on a controller) reaches Band setup or Confirm.
- BaB sits in the sidebar's HOME group.
- Silent real-app acceptance passes, with screenshots of Home, the join and Confirm.
- Branches are pushed. Solo play and every existing flow are unchanged.
