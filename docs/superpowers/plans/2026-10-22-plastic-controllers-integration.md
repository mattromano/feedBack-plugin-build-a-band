# Plastic controllers: integration and combined app check (2026-10-22)

## Branches after integration (all pushed to the mattromano forks; no PRs; nothing merged into `custom`/`main` integration branches of other repos)

| Repo | Branch | Head | Contains |
|---|---|---|---|
| core feedBack | `feature/five-fret-charts` | f34dfd3 | Plans 1–2, plus merged `feature/five-fret-band` (Plan 3), `feature/five-fret-library` (Plan 4) and `feature/five-fret-autochart` (Plan 5), and a follow-up `drums_library.py --auto` (Plan 5 ruling 16). Includes `feature/build-a-band-stage` up to c6d3223. |
| feedBack-plugin-five-fret | `main` | c6f1bef | Plan 2, plus merged `feature/band-api` (Plan 3) and `feature/auto-chart-gate` (Plan 5). |
| feedBack-plugin-build-a-band | `feature/band-controller-drums` | 5ed786d | `feature/band-controllers` (Plan 3) with Plan 6 Part B on top, cut from `feature/build-a-band-stage` c476654. |
| feedBack-plugin-drums | `feature/drums-gamepad` | faea382 | Plan 6 Part A, cut from `feature/build-a-band-stage` b685572. |
| feedpak-spec (fork) | `fep/five-fret-charts` | 008566e | Plan 1's format (1.21.0); not merged into `custom`. |

**Merge conflict resolved:** the five-fret plugin's `pickPart` / pick cache / tests.
- `pickPart(parts, arrangementName, setting, { exact, showAuto })`.
- The pick cache keys on `exact` and `showAuto`.
- The screen test for auto-part star power enables `showAutoCharts`.

**Tests after merging:**
- core: Python 3271 passed (8 skipped), JS 1365, spec gate OK;
- five-fret: 168;
- Build-a-Band: 852;
- drums: 266.

## Combined app check (silent, 2026-10-22, with Matt's OK to restart the app)

- **Install:**
  - core f34dfd3 synced with `dev-sync.sh` (`FB_ROOT` with only `build_a_band` → `.worktrees/bab-controllers` and `drums` → `.worktrees/drums-gamepad`; other plugins untouched);
  - five-fret `main` copied into `plugins/five_fret`.
- **Plugins:** `build_a_band`, `drums` and `five_fret` all registered.
  - `window.feedBackFiveFret` is present; `showAutoCharts()` gives `false`.
  - `window.feedBackDrums` has `setController`, `clearController`, `listControllers`, `createMapper` and `openControls`.
  - `gamepadInput` has `watch`.
- **Library:**
  - `five_fret=any`, `any:chart` and `bass:chart,guitar:chart` return the 5-fret test song;
  - `bass:auto` returns nothing;
  - `five_fret_only` is false for it.
- **Band setup screen** shows the "Press Start on a controller to join" slot (screenshot `img/2026-10-22-band-setup-controller-slot.png`).
  - Hear myself was off and the player stayed paused.
  - On leaving the screen, no input device is in use (`audio-in-use`).
- **Other screens:** the five-fret settings page has the auto-charts toggle (default off), and the drums screen has its Controllers card.
- **Nothing else moved:** a normal song still loads Lead/Rhythm/Bass/Drums, and the test song streams drums plus both 5-fret parts.
- **Pre-existing, not from this work:** "Uncaught SyntaxError: Illegal return statement" right after the metronome plugin's `screen.js` loads (that file is untouched since 2026-10-15).

## Left for Matt (needs sound, hardware or his library)

- an audible play-through with a controller (normal player and a band song with GO);
- drum pad hits from a controller;
- the five-fret calibration clicks;
- real plastic guitars and kits, whose profiles are unverified;
- running `drums_library.py --parts guitar,bass,rhythm [--auto] --write` on `~/Desktop/rocksmith/dlc`. The tool has only been run on copies.
- **Deciding whether to switch on auto charts.** The holdout benchmark passes, but Easy density is marginal (0.805 against a 0.80 minimum); see Plan 5's Review.
- **Merging:**
  - the feedpak-spec branch into `custom`;
  - Build-a-Band `feature/band-controller-drums` and drums `feature/drums-gamepad` with the Build-a-Band session's `feature/build-a-band-stage`.
