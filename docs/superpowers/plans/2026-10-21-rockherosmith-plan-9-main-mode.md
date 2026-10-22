# RockHeroSmith Plan 9: rename Build-a-Band and make it a main way to play

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build-a-Band becomes **RockHeroSmith**, fully renamed, and one of the app's two front doors:
- a split Home hero with **Play RockHeroSmith**
- **Press Start** on any free pad outside a song opens setup with that pad joined
- a **RockHeroSmith** button on band-ready library cards opens Confirm with the song
- first in the sidebar's HOME group
- one first-run tour step

**Architecture:**
- **Core gets one generic seam, `feedBack.ui.registerPlayMode(spec)`** (new `static/v3/play-modes.js`). Core owns:
  - the split hero layout (`dashboard.js`)
  - the card button slot (`songs.js`)
  - the tour step (`onboarding-tour.js`)
  - Start detection (new `static/v3/press-start.js` on `feedBack.gamepadInput.watch`, emitting `gamepad:start-pressed`)

  With nothing registered, all of it renders exactly as today.
- **The plugin registers one mode** (new `src/main-mode.js`, `src/hero-art.js`) and adds entry points to its band screen (`openSetup`, `openWithSong`, `joinPad`) and join manager (`requestJoin`).
- **Band-readiness reuses `src/parts.js`.**

**Tech Stack:** Vanilla JS (classic IIFEs in core, ES modules in the plugin), node:test, CSS. No build step, no new dependencies, **no new Tailwind classes in core** (R17).

**Spec:** `docs/superpowers/specs/2026-10-21-rockherosmith-main-mode-design.md` (this repo). The recon facts and the "Constraints and gotchas" section live in `docs/superpowers/specs/2026-10-22-build-a-band-main-mode-handoff.md`. Where the spec leaves a choice, the **Rulings** below decide it. Where they differ, a ruling wins.

**Where files live.** Task 1 moves the plugin folder. From Task 1 Step 3 on:
- the plugin is `/Users/mattromano/Desktop/repos/feedback-upstream/feedBack-plugin-rockherosmith/`
- this plan is `feedBack-plugin-rockherosmith/docs/superpowers/plans/2026-10-21-rockherosmith-plan-9-main-mode.md`
- the SDD ledger is `feedBack-plugin-rockherosmith/.superpowers/sdd/` (git-ignored), including `MASTER.md`, `AGENT-RULES.md` and `rp.sh`

Every path below is written for after the move. `<plugin>` means that folder.

## Global Constraints

- **Overnight, unattended (spec "How this gets built"):**
  - no questions to Matt
  - every open choice is a ruling recorded in `.superpowers/sdd/plan-9-inputs.md` and `MASTER.md`
  - no PRs, no deletions, never touch `main` or upstream remotes
  - anything unsafe is skipped and noted for the morning report
- **NO SOUND:**
  - No implementer launches the app, a browser or a dev server.
  - Only the controller touches the app, in Tasks 12 and 14, silently: hold autoplay (`/private/tmp/claude-501/bab/guard.js`), mute `#audio`, the pause guard, synthetic events only.
  - No notifications or pings.
- **Repos and branches** (all under `/Users/mattromano/Desktop/repos/feedback-upstream/`):

  | Repo | Branch | Head at plan start | Tasks |
  |---|---|---|---|
  | `<plugin>` | `feature/build-a-band-stage` | `a15e778` | 1, 2, 3, 10, 11 |
  | core `feedBack` | `feature/build-a-band-stage` | `e41529c` | 4, 6, 7, 8, 9, 12 |
  | five-fret | `feature/band-api`, worked in `.worktrees/fivefret-p3` (R1) | `4575212` → ff `491959d` | 5 |
  | drums, stems, lyrics-karaoke, notedetect, scorecard | `feature/build-a-band-stage` | `cc63c15`, `df4f2fc`, `3e18904`, `86476b7`, `5fdfc07` | 5 |

  Branch names stay as they are.
- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
  - One commit per task per repo.
- **Line endings:** core `static/v3/songs.js` and core `CHANGELOG.md` are **CRLF**.
  - Edit them with a script that reads and writes bytes and keeps `\r\n` on every added line.
  - `file` must still say `with CRLF line terminators`.
  - `git diff --stat` must not show a whole-file rewrite.
  - Everything else is LF.
- **Test commands and baselines (all green at plan start):**

  | Repo | Command | Baseline |
  |---|---|---|
  | plugin | `npm test` | 852 pass |
  | core | `npm run test:js` | 1474 pass |
  | five-fret | `node --test tests/*.test.js` | all pass |
  | drums | `for f in tests/*.test.js; do node "$f" \|\| exit 1; done` | 8 files pass |
  | stems, lyrics-karaoke, notedetect, scorecard | `npm test` | 86 / 123 / 409 / 55 pass |

- **Names (spec Decision 1):**

  | Thing | Value |
  |---|---|
  | display name | `RockHeroSmith` |
  | plugin id | `rockherosmith` |
  | screen id | `plugin-rockherosmith` |
  | folder | `feedBack-plugin-rockherosmith` |
  | repo | `mattromano/feedBack-plugin-rockherosmith` |
  | dev symlink | `dev-plugins/rockherosmith` |
  | prefs key | `rockherosmith.prefs.v1` (legacy `build_a_band.prefs.v1` is kept) |
  | globals | `window.__rockherosmithRuntime`, `window.__rockherosmithScreen`, `window.__rockherosmithMainMode` |
  | deprecated aliases | `window.__buildABandRuntime`, `window.__buildABandScreen` (same objects) |
  | CSS prefix | `rhs-` (classes), `--rhs-` (custom properties) |
  | root id | `rockherosmith-root` |
  | stylesheet | `assets/rockherosmith.css` |
  | owner / requester | `rockherosmith` |
  | claim ids | `rockherosmith:fail:<part>`, `rockherosmith:sound:drums`, `rockherosmith:sound:stem:<stem>` |
  | log prefix | `[rockherosmith]` |

- **Copy:**
  - Hero start button: `Play RockHeroSmith`
  - Hero tagline: `Real guitar meets Guitar Hero.`
  - Hero line: `Plug in your guitar, hand a friend a controller, press Start.`
  - Card button: label `RockHeroSmith`, title and aria-label `Play with RockHeroSmith`
  - Tour step:
    - title `Play RockHeroSmith`
    - content `Plug in your guitar, hand a friend a Guitar Hero or Rock Band controller, and press Start. You play the song together on one stage.`
  - Sidebar label: `RockHeroSmith`
- **Events and ids:**
  - Bus events: `ui:play-modes-changed { ids }` and `gamepad:start-pressed { pad, id, controllerKey }`
  - DOM: `#v3-hero-split`, `#v3-hero-mode[data-play-mode]`, `[data-play-mode-art]`, `#v3-play-mode-start[data-play-mode-start]`, `button.v3-card-mode[data-play-mode-card]`, sidebar slot `#v3-nav-rockherosmith`
- **Every implementer reads** `<plugin>/.superpowers/sdd/AGENT-RULES.md` and the touched repo's `CLAUDE.md` first.

## Rulings (the controller copies these into `plan-9-inputs.md` in Task 1)

- **R1.** Installed five-fret is `main` (`491959d`, file hashes match). `feature/band-api` (`4575212`) is an ancestor of `main`.
  - In `.worktrees/fivefret-p3`, run `git merge --ff-only main` first, then commit there.
  - `main` itself is not touched.
- **R2.** No compatibility symlink at the old folder path. Other worktrees are repaired, not shimmed.
- **R3.** Backups go outside the bundle and outside every git repo:
  - `~/feedback-backups/plugins/build_a_band-2026-10-21/` (the moved bundle plugin)
  - `~/feedback-backups/local-storage-2026-10-21/` (a copy of `~/Library/Application Support/feedback-desktop/Local Storage`)
- **R4. Install route:**
  1. `mkdir <bundle>/plugins/rockherosmith`, then `dev-sync.sh --no-restart`. It matches by id through `dev-plugins/rockherosmith`.
  2. Five-fret is rsynced from `.worktrees/fivefret-p3` with dev-sync's excludes, because dev-sync reads the `main` checkout.
  3. `repos.txt` is unchanged; Build-a-Band was never listed.
- **R5. App instances:**
  - Only an instance started with `--remote-debugging-port=9333` (a debug copy) may be quit.
  - If any other `/Applications/feedback.app/Contents/MacOS/feedback` process runs, Tasks 12 and 14 are skipped and noted.
- **R6. The play-mode spec:** `{ id, label, startLabel?, order?, renderHero?(el), start?(), startPress?, tour?: { title, content }, cardAction?: { label?, title?, isAvailable(item), run(item) } }`, as Task 6 defines it.
- **R7.** Press Start emits on the bus. Its cooldown is 1000 ms across all pads, which dedupes Steam Input mirror slots.
- **R8. Press Start fires only when all of these hold:**
  - the active screen is a core screen: not `player`, not `v3-feedbarcade`, not any `plugin-*` (plugins own Start on their screens, which also covers minigames, five-fret controls and RockHeroSmith itself)
  - no song is loaded
  - no modal is visible
  - `claimCount() === 0`
  - no library pick session is open
- **R9.** Start on a pad that neither 5-Fret nor Drums lists with a kind opens Setup without joining it. It shows in the existing "Set up" list (today's join rule).
- **R10. The card button:**
  - It goes first in the chips row (`.v3-card-chips`) and is always visible. Grid cards only, not tree, table or library-home rows.
  - It is hidden in pick mode and select mode. The ⋮ menu is unchanged.
  - The plugin CSS draws its bolt.
- **R11.** "Real guitar arrangement" means BaB's `hasChart(getPart('guitar'), item)`: Lead / Rhythm / Bass, and not a five-fret-only pack. Combo-only songs don't qualify, because the band mode can't play them.
- **R12. "A band is set up"** means either of these:
  - a joined controller with `on !== false`
  - a fixed part with `on` and a saved device (`deviceKey` for guitar and drums, `deviceId` for vocals)
- **R13. Where each entry point lands:**
  - Play RockHeroSmith and Press Start open the **Setup** view.
  - The card opens **Confirm** when R12 holds, else Setup with the song preselected (Continue with … shown).
- **R14.** Every entry point does nothing while the band runtime's `phase() !== 'idle'`.
- **R15.** Sidebar slot `anchorAfter: 'home'`, using a new `bolt` icon in shell.js `ICONS`: `'M13 2L4 14h7l-1 8 9-12h-7l1-8z'`.
- **R16.** The tour step comes from the hero mode's `tour` field, so core carries no RockHeroSmith copy. No hero mode means no step.
- **R17.** Core layout and the card button use new rules in `static/v3/v3.css`, never new Tailwind utilities. dev-sync keeps the installed `tailwind.min.css`, so new classes would not exist in the app.
- **R18. Plugin metadata:**
  - `plugin.json` and `package.json` version `0.2.0`
  - `plugin.json` description `RockHeroSmith: play a song together, real guitar alongside Guitar Hero / Rock Band controllers.`
  - a new `<plugin>/CHANGELOG.md` in Keep a Changelog form
- **R19.** Claim ids and the requester / owner get **no** old-name alias: the plugin issues and releases them itself, and no peer emits or reads them (re-grepped). The window globals get aliases (spec).
- **R20.** `feedBack-plugin-splitscreen`, `feedBack-desktop`, `multiplayer`, `autotune`, `nam-tone` and `feedpak-spec` have no references (re-grepped at plan time). They are unchanged.
- **R21.** No Continue / Jump back in band memory, no mode picker, no ⋮ menu row (spec Non-goals, YAGNI).

## Review Focus

1. **Press Start must never fire during a song.** That covers loading, playing and paused, a band stage, a plugin screen, FeedBarcade, a visible (not merely mounted) modal, a library pick, or any claimed pad. Task 9 `isStartEligible` table and `songLoaded` tests.
2. **With no mode registered, nothing changes:** Home, the cards and the tour are byte-for-byte today's. Tasks 6, 7, 8 and 10 no-mode tests.
3. **Saved band setups survive the rename.**
   - The legacy key is copied once, only when the new key is absent.
   - An existing new key is never overwritten.
   - The old key is never written or removed, even when it holds invalid JSON.

   Task 2 prefs tests.
4. **A card's mode button never plays the song.** It is absent in pick and select mode. Cards rendered before the plugin registered gain the button. Task 8 tests.
5. **One Start press gives one join.**
   - A held Start through the screen switch adds no second join or primary press.
   - A mirror twin slot does not join.
   - A pad that isn't set up joins nothing.

   Tasks 9 and 10 tests.

---

### Task 1: Move the plugin folder, its symlink, worktrees and GitHub repo (controller)

**Repo:** plugin (no tracked change). The controller runs it before any implementer starts. Spec Decision 1, R1–R3.

- [ ] **Step 1: Preflight.**
  1. Every repo in the table is clean (`git status --porcelain` empty) and on its branch.
  2. `npm test` in `feedBack-plugin-build-a-band` passes 852.
  3. Write `.superpowers/sdd/plan-9-inputs.md` with the Rulings section verbatim.
  4. Append `Plan 9 (RockHeroSmith main mode): STARTED` to `MASTER.md`.
- [ ] **Step 2: Move.** `mv feedBack-plugin-build-a-band feedBack-plugin-rockherosmith` (from the feedback-upstream root).
- [ ] **Step 3: Repair worktrees.** Run `git -C feedBack-plugin-rockherosmith worktree repair`. Check:
  - `git -C feedBack-plugin-rockherosmith worktree list` shows `.worktrees/bab-controllers` and `.worktrees/build-a-band-5fret-plan`, neither `prunable`
  - `git -C .worktrees/bab-controllers status` works
- [ ] **Step 4: Symlink.** `mv dev-plugins/build_a_band dev-plugins/rockherosmith && ln -sfn /Users/mattromano/Desktop/repos/feedback-upstream/feedBack-plugin-rockherosmith dev-plugins/rockherosmith`. Check: `readlink dev-plugins/rockherosmith` is the new folder.
- [ ] **Step 5: GitHub (pre-approved).**
  1. `gh repo rename feedBack-plugin-rockherosmith --repo mattromano/feedBack-plugin-build-a-band --yes`
  2. `git -C feedBack-plugin-rockherosmith remote set-url origin https://github.com/mattromano/feedBack-plugin-rockherosmith.git`
  3. Check: `gh repo view mattromano/feedBack-plugin-rockherosmith --json name` gives the new name, and `git -C feedBack-plugin-rockherosmith fetch origin` succeeds.
  4. If `gh` fails, keep the old remote and record "repo rename skipped: <error>".
- [ ] **Step 6: Ledger tooling.**
  - In `rp.sh` and `AGENT-RULES.md` (git-ignored), replace `feedBack-plugin-build-a-band` with `feedBack-plugin-rockherosmith`.
  - In `AGENT-RULES.md`, add: "five-fret work happens in `.worktrees/fivefret-p3` on `feature/band-api`".
- [ ] **Step 7: Verify.** `npm test` in the new folder still passes 852. Record the moves in `MASTER.md`, then re-open this plan from its new path.

### Task 2: Plugin: identity rename and prefs migration

**Repo:** plugin. Spec Decision 1, "Saved data migration", R18, R19.

**Files:**
- Modify:
  - `plugin.json` (id, name, version, description, nav)
  - `package.json` (name, version, description)
  - `README.md` (title and product name)
  - `screen.js` (globals and aliases)
  - `src/prefs.js:7` and `src/prefs.js:185-191` (loadPrefs)
  - `src/band-runtime.js:38,1258`
  - `src/band-screen.js:19`
  - `src/controller-model.js:57,91`
  - `src/join.js:19`, `src/devices.js:5`, `src/pad-light.js:5`
  - `src/stem-claims.js:7-11`
  - every `[build-a-band]` log and every comment naming Build-a-Band in `src/*.js`
- Create: `CHANGELOG.md`
- Test: `tests/prefs.test.mjs`, plus every test asserting an old id, string or claim id (`git grep -l -i -E "build.?a.?band" tests`)

**Interfaces:**
- **`src/prefs.js`:**
  - `const KEY = 'rockherosmith.prefs.v1'`
  - `export const LEGACY_KEY = 'build_a_band.prefs.v1'`
  - **`export function migrateLegacyPrefs(storage = defaultStorage()) -> 'migrated' | 'present' | 'none'`:**
    - `'present'` when `getItem(KEY) !== null`
    - else, when `getItem(LEGACY_KEY)` is a non-null string, `setItem(KEY, thatString)` (verbatim) and return `'migrated'`
    - else `'none'`
    - Never calls `removeItem`. A throw anywhere returns `'none'`.
  - `loadPrefs` calls `migrateLegacyPrefs(storage)` before reading `KEY`. `savePrefs` inherits this through `loadPrefs`.
- **`screen.js`:**
  - assigns `window.__rockherosmithRuntime` and `window.__rockherosmithScreen`
  - reads the previous instance from the new names (falling back to the old names) for disposal
  - after each assignment, sets the alias to the same object with the comment `// Deprecated alias (one release, remove after 0.2.x): stale peers may still read the old name.`
  - finds the root by its current id (Task 3 renames it)
- **Screen id and owner values:**
  - `BAND_SCREEN` and `SCREEN_ID` = `'plugin-rockherosmith'`; both `setupHref` → `returnTo: 'plugin-rockherosmith'`
  - `OWNER` and every `REQUESTER`, plus band-runtime's playback `requester` / `requesterId`, = `'rockherosmith'`
- **Claim ids:** `FAIL_CLAIM_PREFIX = 'rockherosmith:fail:'`, `SOUND_CLAIM_ID = 'rockherosmith:sound:drums'`, `STEM_SOUND_CLAIM_PREFIX = 'rockherosmith:sound:stem:'`
- **`CHANGELOG.md`:** `## [0.2.0] - Unreleased` with
  - **Changed:** "Renamed Build-a-Band to RockHeroSmith (id `rockherosmith`, screen `plugin-rockherosmith`); saved band setups move from `build_a_band.prefs.v1` on first load (the old key is kept)."
  - **Deprecated:** "`window.__buildABandRuntime` / `__buildABandScreen` (use `__rockherosmith*`)."

- [ ] **Step 1: Write the failing tests** in `tests/prefs.test.mjs` (the existing fake storage):
  - `legacy prefs move on first load`:
    - storage holds only `build_a_band.prefs.v1` = JSON of `{ parts: { guitar: { deviceKey: 'g1' } }, controllers: [{ key: 'pad#1', id: 'ctl1', playsAs: 'drums' }] }`
    - `loadPrefs(storage)` gives `parts.guitar.deviceKey === 'g1'` and one controller
    - `getItem('rockherosmith.prefs.v1')` equals the legacy string exactly
    - `getItem('build_a_band.prefs.v1')` is unchanged
  - `an existing new key is never overwritten`: both keys set with different `split`. `loadPrefs` gives the new key's `split`, and `migrateLegacyPrefs` returns `'present'`.
  - `savePrefs writes only the new key`: with only the legacy key set, `savePrefs({ split: 50 })` leaves the legacy string unchanged, and the new key holds `split: 50` and the legacy device.
  - `invalid legacy JSON is copied verbatim and loads defaults`: legacy `'{oops'` gives `migrateLegacyPrefs` `'migrated'` and `loadPrefs` defaults. The legacy key still reads `'{oops'`.
  - `no keys: none`.
  - `storage that throws: none`: `getItem` throws, the result is `'none'`, and `loadPrefs` returns defaults.
  - Update every other test to the new screen id, owner, requester and claim ids. Assertions of old values become assertions of new values.
- [ ] **Step 2: Run** `npm test`. Expected: the new prefs tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block, and rename every product mention and log prefix in `src/`, `screen.js`, `README.md`, `plugin.json` and `package.json`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, at least 858 tests.
- [ ] **Step 5: Check.** `git grep -n -i -E "build.?a.?band|buildaband" -- src screen.js plugin.json package.json README.md tests` lists only:
  - `LEGACY_KEY` in prefs.js and its tests
  - the two alias lines in `screen.js`, plus the fallback read
  - `screen.html`, `assets/build-a-band.css` and the `build-a-band-root` lookup (Task 3)
- [ ] **Step 6: Commit** `refactor!: rename Build-a-Band to RockHeroSmith (id rockherosmith); migrate saved prefs`.

### Task 3: Plugin: CSS and DOM prefix pass (`bab-` → `rhs-`)

**Repo:** plugin. Spec "My calls": internal names. A mechanical pass, with tests green before and after.

**Files:**
- Move: `git mv assets/build-a-band.css assets/rockherosmith.css`
- Modify: `plugin.json` (`styles: "assets/rockherosmith.css"`), `screen.html`, `screen.js`, `assets/rockherosmith.css`, `src/*.js`, `tests/*.mjs`

**Interfaces:**
- Every class token matching `\bbab-` becomes `rhs-`, and every `--bab-` custom property becomes `--rhs-`. This covers JS strings, `classList` calls, selectors, `icon()`'s `bab-icon` and the CSS.
- `#build-a-band-root` becomes `#rockherosmith-root` (screen.html, screen.js, CSS, tests).
- Use a word-boundary regex. Words such as `kebab-` must not match.

- [ ] **Step 1: Run** `npm test`. Record the count, which must equal the Task 2 count.
- [ ] **Step 2: Apply the rename** with one scripted pass over the listed files.
- [ ] **Step 3: Run** `npm test`. Expected: PASS, with the same count as Step 1.
- [ ] **Step 4: Check.**
  - `git grep -n -E "\bbab-|--bab-|build-a-band" -- src tests screen.html screen.js assets plugin.json` is empty.
  - `git grep -n -i -E "build.?a.?band" -- . ':!docs' ':!.superpowers' ':!CHANGELOG.md'` lists only the Task 2 allowances.
- [ ] **Step 5: Commit** `refactor: rhs- CSS prefix, #rockherosmith-root and assets/rockherosmith.css`.

### Task 4: Core: sidebar entry renamed and moved under Home; core mentions renamed

**Repo:** core `feedBack`. Spec Decision 5, R15.

**Files:**
- Modify:
  - `static/v3/shell.js:55` (NAV), `:69` (PROMOTED_PLUGINS), `:75-91` (ICONS: add `bolt`)
  - comments in `static/app.js:1604`, `static/highway.js:1954,2081`, `tests/js/highway_label_font.test.js:1`, `tests/js/highway_secondary_connect.test.js:1`, `tests/js/overlay_pause.test.js:1`, `tests/js/v3_songs_pick_first_visit.test.js:3`
  - `CHANGELOG.md` (CRLF)
- Test: create `tests/js/v3_shell_rockherosmith_nav.test.js` (source checks, the house style)

**Interfaces:**
- NAV: `{ key: 'rockherosmith', screen: 'plugin-rockherosmith', label: 'RockHeroSmith', group: null, icon: 'bolt' }`
- PROMOTED_PLUGINS: `{ navKey: 'rockherosmith', pluginId: 'rockherosmith', slotId: 'v3-nav-rockherosmith', anchorAfter: 'home' }`
- `ICONS.bolt = 'M13 2L4 14h7l-1 8 9-12h-7l1-8z'`
- CHANGELOG `[Unreleased]` → `### Changed`: "Sidebar: RockHeroSmith (formerly Build-a-Band, plugin id `rockherosmith`) is the first HOME item, right under Home."

- [ ] **Step 1: Write the failing tests:**
  - `PROMOTED rockherosmith anchors after home`: shell.js source matches `/navKey: 'rockherosmith', pluginId: 'rockherosmith', slotId: 'v3-nav-rockherosmith', anchorAfter: 'home'/`.
  - `NAV entry uses the bolt icon`, and `ICONS has bolt`.
  - `no build_a_band in shell.js`.
  - `only the rockherosmith promo anchors after home`: exactly one `anchorAfter: 'home'`. `promotedSlotHTML('home')` renders right after the Home item, so it sits above Progress.
- [ ] **Step 2: Run** `npm run test:js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, then rename the listed comments to RockHeroSmith.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite.
- [ ] **Step 5: Check.**
  - `git grep -n -i -E "build.?a.?band" -- . ':!CHANGELOG.md'` is empty.
  - `file CHANGELOG.md` still says CRLF.
- [ ] **Step 6: Commit** `feat(shell): RockHeroSmith first under Home in the sidebar (renamed from Build-a-Band)`.

### Task 5: Peer plugins follow the new names

**Repos:** five-fret (in `.worktrees/fivefret-p3`, R1), drums, stems, lyrics-karaoke, notedetect, scorecard. Spec "Every plugin upstream or downstream". One commit per repo.

**Files:**
- five-fret: `screen.js:21,61,69,933` (comments); `README.md:10,98,159,174,212`; `tests/screen.test.js:848,852` (`returnTo` → `'plugin-rockherosmith'`), `:1395` (comment); `CHANGELOG.md`
- drums: `README.md:352`; `tests/screen.test.js:1584,1589`; `CHANGELOG.md`
- stems: `tests/claims.test.mjs:378,385` (`'rockherosmith:sound:drums'`); `CHANGELOG.md`
- lyrics-karaoke: `README.md:16`; `src/main.js:64,835,948,2156`; `src/mic-hit.js:5`; `src/overrides.js:2`; `CHANGELOG.md`
- notedetect: `assets/plugin.css:1022`; `screen.js:12288,15074,15086,15112`; `test/onset_event.test.js:1`; `test/score_hud_hidden.test.js:1`; `test/set_device.test.js:1`; `CHANGELOG.md`
- scorecard: `src/visibility.js:2`; `CHANGELOG.md`

**Interfaces:**
- Only comments, docs and test values change. No peer runtime reads a RockHeroSmith id (re-grepped). The window globals' aliases live in the plugin (Task 2).
- **CHANGELOG:** each repo's newest unreleased section (create `## [Unreleased]` where none is open) gains `### Changed` "Docs and tests name RockHeroSmith (formerly Build-a-Band; screen `plugin-rockherosmith`)." Old entries stay as history.

- [ ] **Step 1: five-fret.**
  1. `git -C .worktrees/fivefret-p3 merge --ff-only main`. It must fast-forward to `491959d`; if not, skip five-fret and note it.
  2. Edit, then run `node --test tests/*.test.js`. Expected: PASS.
  3. Commit `docs: name RockHeroSmith (formerly Build-a-Band)`.
- [ ] **Step 2: drums.** Edit, then run the per-file loop. Expected: all files pass. Commit as above.
- [ ] **Step 3: stems, lyrics-karaoke, notedetect, scorecard.** In each repo: edit, run `npm test` (PASS), commit as above.
- [ ] **Step 4: Check** in every touched repo: `git grep -n -i -E "build.?a.?band|build_a_band" -- . ':!CHANGELOG.md' ':!docs'` is empty.

### Task 6: Core: the play-mode registry (`feedBack.ui.registerPlayMode`)

**Repo:** core `feedBack`. Spec "My calls" generic seam, R6.

**Files:**
- Create: `static/v3/play-modes.js` (LF), `tests/js/play_modes.test.js`
- Modify:
  - `static/v3/index.html`: before `card-actions-core.js` (line 1341), add `<!-- Before dashboard.js, songs.js, press-start.js, onboarding-tour.js: play modes (feedBack.ui.registerPlayMode). -->` then `<script defer src="/static/v3/play-modes.js"></script>`
  - `docs/plugin-v3-ui.md`: a new section
  - `CHANGELOG.md` (CRLF)

**Interfaces** (an IIFE in the `library-pick.js` pattern; `module.exports = { createPlayModes, normalizeMode, splitHeroHtml, cardButtonsHtml }`):
- **`normalizeMode(spec) -> mode | null`:**
  - `null` unless `id` and `label` are non-empty strings.
  - The result is `{ id, label, startLabel, order, renderHero, start, startPress, tour, cardAction }`.
  - Defaults:

    | Field | Value |
    |---|---|
    | `startLabel` | string or `'Play ' + label` |
    | `order` | finite number or `100` |
    | `renderHero`, `start` | function or `null` |
    | `startPress` | `spec.startPress === true` |
    | `tour` | `{ title, content }` when both are strings, else `null` |
    | `cardAction` | `null` unless `spec.cardAction.run` is a function; else `{ label: string or the mode label, title: string or 'Play with ' + label, isAvailable: function or () => false, run }` |

- **`createPlayModes({ emit }) -> api`:**
  - **`register(spec) -> unregister()`:**
    - An invalid spec gives a no-op unregister.
    - A duplicate id gives `console.warn('[play-modes] duplicate play mode ignored:', id)` and a no-op unregister.
    - On success it emits `ui:play-modes-changed { ids }`. Unregister removes the mode and emits again. A second unregister does nothing.
  - **`list()`:** modes sorted by `order`, then `id`.
  - **`heroMode()`:** the first listed mode with both `renderHero` and `start`, else `null`.
  - **`cardActions(song) -> [{ id, label, title }]`:** modes whose `cardAction.isAvailable(song)` returns `true`. A throw counts as not available.
  - **`runCardAction(id, song) -> boolean`:** `false` for an unknown id or no cardAction. Otherwise it calls `run(song)` inside try/catch (a throw is logged with `console.warn`) and returns `true`.
  - **`start(id) -> boolean`:** the same pattern with `start()`.
  - **`startPressWanted() -> boolean`:** some mode has `startPress`.
- **`splitHeroHtml(soloHtml, mode, esc) -> string`:**
  - No mode: `soloHtml` unchanged.
  - Else: `'<div id="v3-hero-split" class="lg:col-span-2 v3-hero-split">' + soloHtml + '<div id="v3-hero-mode" class="v3-hero-mode" data-play-mode="' + esc(mode.id) + '"><div class="v3-hero-mode-art" data-play-mode-art></div><button type="button" id="v3-play-mode-start" class="v3-hero-mode-start" data-play-mode-start="' + esc(mode.id) + '">' + esc(mode.startLabel) + '</button></div></div>'`. `lg:col-span-2` already exists in the compiled Tailwind.
- **`cardButtonsHtml(actions, esc) -> string`:** for each action, `'<button type="button" class="v3-card-mode" data-play-mode-card="' + esc(a.id) + '" title="' + esc(a.title) + '" aria-label="' + esc(a.title) + '">' + esc(a.label) + '</button>'`, joined. `''` for none.
- **Browser bootstrap** (when `root && root.feedBack`):
  - `const inst = createPlayModes({ emit: (t, d) => root.feedBack.emit(t, d) })`
  - `root.feedBack.ui = Object.assign(root.feedBack.ui || {}, { registerPlayMode: inst.register, playModes: inst.list, playModeState: inst })`. `playModeState` is core-internal.
  - `root.v3PlayModes = { splitHeroHtml, cardButtonsHtml }`
- **Docs:** `## Play modes (feedBack.ui.registerPlayMode)`. It covers:
  - the spec fields
  - what core renders: the split hero, the card button in the chips row, the tour step
  - `gamepad:start-pressed` (Task 9)
  - that nothing changes with no mode registered
- **CHANGELOG:** `### Added` "`feedBack.ui.registerPlayMode`: plugins add a way to play (Home hero half, library card button, Press Start, tour step)."

- [ ] **Step 1: Write the failing tests** (`require('../../static/v3/play-modes.js')`, with a recording `emit`):
  - `normalizeMode needs id and label`: `{}`, `{ id: 'a' }` and `{ label: 'A' }` give `null`. `{ id: 'a', label: 'A' }` has `startLabel` `'Play A'`, `order` `100`, `startPress` `false`, `tour` `null` and `cardAction` `null`.
  - `register emits and unregister emits once`.
  - `duplicate id is ignored`: the second spec's label never appears, and its unregister leaves the first in place.
  - `list sorts by order then id`.
  - `heroMode needs renderHero and start`: a mode with only `start` gives `null`.
  - `cardActions filters and survives a throw`:
    - `isAvailable: (s) => s.ok` gives one entry for `{ ok: true }` and none for `{ ok: false }`
    - a throwing `isAvailable` gives none
    - default title `'Play with A'`
  - `runCardAction passes the song`: it returns `true`, and run received the same object. An unknown id gives `false`. A throwing run gives `true` and no throw.
  - `splitHeroHtml without a mode returns the solo html unchanged` (strict equality).
  - `splitHeroHtml escapes`: label `'<b>'` renders as `&lt;b&gt;`, and the output contains `id="v3-hero-mode"` and `data-play-mode-start="a"`.
  - `cardButtonsHtml of [] is ''`.
  - `index.html loads play-modes.js before dashboard.js and songs.js`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block, with the docs and CHANGELOG (CRLF).
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite.
- [ ] **Step 5: Commit** `feat(ui): feedBack.ui.registerPlayMode, a play-mode registry`.

### Task 7: Core: Home split hero

**Repo:** core `feedBack`. Spec Decision 2, R17.

**Files:**
- Modify:
  - `static/v3/dashboard.js`: the hero block at 190-209, the wiring after 237, and the listeners at 275-277
  - `static/v3/v3.css`: append a block
  - `CHANGELOG.md` (CRLF)
- Test: create `tests/js/v3_dashboard_play_mode.test.js` (source checks)

**Interfaces:**
- **`function soloHeroHtml(spanTwo)`** in dashboard.js returns today's `#v3-hero` string from line 192 through the closing `'</div></div></div>'` of line 208. The single change: the class attribute starts `(spanTwo ? 'lg:col-span-2 ' : '') + 'relative rounded-xl …'`. With `spanTwo === true` the output is byte-identical to today's.
- **In `render()`:**
  - `const pms = sm && sm.ui && sm.ui.playModeState;`
  - `const heroMode = pms && window.v3PlayModes ? pms.heroMode() : null;`
  - the hero is `heroMode ? window.v3PlayModes.splitHeroHtml(soloHeroHtml(false), heroMode, esc) : soloHeroHtml(true)`
- **After `root.innerHTML`, when `heroMode`:**
  - `try { heroMode.renderHero(root.querySelector('[data-play-mode-art]')); } catch (e) { /* plugin art must not break Home */ }`
  - `#v3-play-mode-start` click → `pms.start(heroMode.id)`
  - Both run before `v3:dashboard-rendered` is dispatched.
- **Listener:** `sm.on('ui:play-modes-changed', () => { const a = document.querySelector('.screen.active'); if (a && a.id === 'v3-home') render(); })`.
- **`v3.css`** (dark palette, only plain CSS):
  - `.v3-hero-split`: `display: grid; grid-template-columns: 1fr; gap: 1.5rem;`, and `@media (min-width: 768px)`: `grid-template-columns: 1fr 1fr;`
  - `.v3-hero-mode`: `position: relative; min-height: 480px; border-radius: .75rem; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; padding: 2rem; background: #0f172a;`
  - `.v3-hero-mode-art`: `width: 100%; display: flex; justify-content: center;`
  - `.v3-hero-mode-start`: the primary look (`background: #0ea5e9; color: #fff; padding: .5rem 1.5rem; border-radius: .375rem; font-weight: 600;`), with `:hover` `#38bdf8` and `:focus-visible` an outline
  - Stacking: solo comes first in DOM order, so it is on top below 768 px.
- **CHANGELOG:** `### Added` "Home: a registered play mode gets the right half of the hero (solo practice stays on the left; they stack on narrow windows)."

- [ ] **Step 1: Write the failing tests** (source checks on dashboard.js and v3.css):
  - `soloHeroHtml keeps today's hero`: the source contains `function soloHeroHtml(spanTwo)`, `(spanTwo ? 'lg:col-span-2 ' : '') + 'relative rounded-xl overflow-hidden min-h-[480px] flex items-center bg-fb-bg">'`, `Turn any song into practice.`, `>Start Playing</button>` and `>Lessons</button>`.
  - `no mode renders soloHeroHtml(true)`: the source matches `/heroMode \? window\.v3PlayModes\.splitHeroHtml\(soloHeroHtml\(false\), heroMode, esc\) : soloHeroHtml\(true\)/`.
  - `renderHero is guarded and runs before dashboard-rendered`: the `renderHero(` call sits inside a `try`, at a lower index than `new CustomEvent('v3:dashboard-rendered')`.
  - `re-renders on ui:play-modes-changed`.
  - `v3.css stacks below 768px`: it has `.v3-hero-split` and a `min-width: 768px` media rule with `1fr 1fr`.
  - `no new Tailwind`: the added dashboard lines use no class except `lg:col-span-2`, `v3-hero-*` and classes present in today's dashboard.js.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS. Then run `git diff static/v3/dashboard.js` and check that the solo markup changed only on the class line.
- [ ] **Step 5: Commit** `feat(home): split hero for a registered play mode`.

### Task 8: Core: the library card's play-mode button

**Repo:** core `feedBack`. **songs.js is CRLF.** Spec Decision 4, R10, R17.

**Files:**
- Modify:
  - `static/v3/songs.js`: `songCard` 975-1019, `wireCards` 1559-1631, `_cardSig` 2145-2148, and the listener block near 4772
  - `static/v3/v3.css`
  - `CHANGELOG.md` (CRLF)
- Test: create `tests/js/v3_songs_play_mode_button.test.js` (source checks plus a mirror, the `v3_songs_pick_mode` pattern)

**Interfaces** (inside the songs.js IIFE):
- **Helpers** near `pickOn`:
  - `const playModeState = () => (sm && sm.ui && sm.ui.playModeState) || null;`
  - `let playModesEpoch = 0;`
- **`songCard`:**
  - `const pms = playModeState(); const modeActs = (pms && window.v3PlayModes && !pickOn() && !state.selectMode) ? pms.cardActions(shown) : []; const modeBtns = modeActs.length ? window.v3PlayModes.cardButtonsHtml(modeActs, esc) : '';`
  - The chips row becomes `'<div class="v3-card-chips flex gap-1 mt-1">' + modeBtns + chartsChip + arrChips + '</div>'`.
- **`wireCards`:** `el.querySelectorAll('[data-play-mode-card]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const p = playModeState(); if (p) p.runCardAction(b.getAttribute('data-play-mode-card'), playTarget); }))`. It passes `playTarget`, the displayed chart, not `song`.
- **`_cardSig`** appends `+ 'm' + playModesEpoch`.
- **Listener:** `sm.on('ui:play-modes-changed', () => { playModesEpoch++; if (songsActive()) { state.winRange = null; requestWindowRender(); } })`.
- **`v3.css` `.v3-card-mode`:**
  - `flex: none; height: 1.25rem; padding: 0 .45rem; border-radius: 9999px; font-size: .625rem; font-weight: 700; line-height: 1.25rem; white-space: nowrap; color: #fff; background: rgba(14,165,233,.85);`
  - `:hover` `background: #0ea5e9`
  - It fits the fixed `1.5rem` chips row.
- **CHANGELOG:** `### Added` "Library grid: a play mode's button on cards it can play (chips row; hidden while picking or selecting)."

- [ ] **Step 1: Write the failing tests:**
  - Source checks on songs.js:
    - `modeBtns + chartsChip + arrChips` in the chips row
    - `!pickOn() && !state.selectMode` guards `cardActions(shown)`
    - `runCardAction(b.getAttribute('data-play-mode-card'), playTarget)` with `stopPropagation`
    - `_cardSig` contains `'m' + playModesEpoch`
    - the `ui:play-modes-changed` handler sets `state.winRange = null`
  - A mirror of the button decision (fake `pms.cardActions` recording its argument, plus `pickOn` / `selectMode` flags):
    - no state → `''`
    - pick on → `''` and `cardActions` not called
    - select on → `''`
    - a mode available → contains `data-play-mode-card="rockherosmith"` and `>RockHeroSmith</button>`
    - `cardActions` received `shown` (the display_chart-merged row)
  - `the button sits outside [data-v3-play]`: in the songCard source, `modeBtns` comes after `'</div></div>'`, which closes the art hitbox.
  - `CRLF kept`: every `\n` in songs.js is preceded by `\r`.
  - `v3.css has .v3-card-mode with height 1.25rem`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL.
- [ ] **Step 3: Implement**, preserving CRLF.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, including every existing `v3_songs_*` test.
- [ ] **Step 5: Check** `file static/v3/songs.js` (CRLF) and `git diff --stat` (a few dozen lines). **Commit** `feat(songs): play-mode button on library cards`.

### Task 9: Core: Press Start (`gamepad:start-pressed`)

**Repo:** core `feedBack`. Spec Decision 3, R7, R8.

**Files:**
- Create: `static/v3/press-start.js` (LF), `tests/js/press_start.test.js`
- Modify:
  - `static/v3/index.html`: `<script defer src="/static/v3/press-start.js"></script>` right after the play-modes.js line
  - `docs/plugin-v3-ui.md`: the Play modes section gains Press Start
  - `CHANGELOG.md` (CRLF)

**Interfaces** (an IIFE; `module.exports = { START_BUTTON, COOLDOWN_MS, isStartEligible, songLoaded, anyVisibleModal, createPressStart }`):
- `START_BUTTON = 9` (standard mapping), `COOLDOWN_MS = 1000`.
- **`isStartEligible({ activeId, songLoaded, modalOpen, claimCount, picking }) -> boolean`.** `true` only when all of these hold:
  - `activeId` is a non-empty string, not `'player'`, not `'v3-feedbarcade'`, and not starting with `'plugin-'`
  - `!songLoaded`, `!modalOpen`, `!picking`
  - `!(claimCount > 0)`
- **`songLoaded(doc, win, activeId) -> boolean`:**
  - `activeId === 'player'`, or `win.feedBack.isPlaying === true`, or `!!(audio && audio.getAttribute('src'))` (`audio = doc.getElementById('audio')`), or `!!win._juceAudioUrl`
  - Use the attribute, not `.src`: an emptied `src` resolves to the page URL.
- **`anyVisibleModal(doc, win) -> boolean`:**
  - Some `[aria-modal="true"], .feedBack-modal` node is visible.
  - Visible means: not `hidden`, no `[hidden]` ancestor (`closest`), `getClientRects().length > 0`, and computed `display` / `visibility` not `none` / `hidden`. These are the plugin `modal-open.js` rules.
  - A throw gives `false`.
- **`createPressStart({ gamepadInput, emit, env, now }) -> { sync(wanted), onWatch(ev), watching() }`:**
  - **`sync(wanted)`:**
    - `wanted && !watching` and `gamepadInput.watch` is a function → `unwatch = gamepadInput.watch(onWatch)`
    - `!wanted && watching` → `unwatch()`
  - **`onWatch(ev)`:**
    1. Handles only `ev.type === 'button' && ev.index === START_BUTTON && ev.pressed`.
    2. `const p = gamepadInput.list().find((x) => x.index === ev.pad)`. Requires `p && p.connected && p.mapping === 'standard' && !p.claimedBy`.
    3. Then `now() - last >= COOLDOWN_MS` (`last` starts at `-Infinity`) and `isStartEligible(env())`.
    4. Then `last = now()` and `emit('gamepad:start-pressed', { pad: ev.pad, id: p.id, controllerKey: p.controllerKey })`.
- **Browser bootstrap** (with `root.feedBack.gamepadInput` and `root.feedBack.ui.playModeState`):
  - `env()` builds the context from the DOM: `activeId` = `.screen.active` id; `picking` = `!!(feedBack.library && feedBack.library.pickState && feedBack.library.pickState.session())`; `claimCount` = `gamepadInput.claimCount()`.
  - `now = () => performance.now()`.
  - `resync = () => inst.sync(pms.startPressWanted() && !songLoaded(document, window, activeId()))`, run on `ui:play-modes-changed`, `screen:changed`, `song:stop` and `song:ended`.
  - `song:loading` → `inst.sync(false)`. Nothing is watched during a song, so solo play gets no extra per-frame work.
- **CHANGELOG:** `### Added` "Press Start: the standard Start button on a free controller, outside a song, emits `gamepad:start-pressed` for a play mode that asked for it."

- [ ] **Step 1: Write the failing tests:**
  - `isStartEligible table`:
    - `true` for `v3-home`, `v3-songs` and `settings`
    - `false` for each of: `songLoaded`, `modalOpen`, `picking`, `claimCount: 1`, `player`, `v3-feedbarcade`, `plugin-minigames`, `plugin-rockherosmith`, `''`
  - `songLoaded`:
    - `true` for `activeId: 'player'`, for `isPlaying`, for an `<audio>` with `src` attribute `'/a.ogg'`, and for `_juceAudioUrl`
    - `false` when the attribute is `''` or missing, the player isn't active and nothing plays
  - `anyVisibleModal`: a hidden dialog, one inside `[hidden]`, one with `display: none` and one with no client rects are all `false`; a visible `.feedBack-modal` is `true`.
  - `sync watches once and unwatches`.
  - `Start on a free standard pad emits once with the pad`: detail `{ pad: 0, id: 'X', controllerKey: 'X#1' }`.
  - `ignored`: a release, button 0, mapping `''`, `claimedBy: 'five_fret'`, and an ineligible `env` all emit nothing.
  - `cooldown dedupes a mirror slot`: pad 0 then pad 1 at `+10 ms` emit once; pad 1 again at `+1001 ms` emits.
  - `index.html loads press-start.js after play-modes.js and after gamepad-input.js`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the docs and CHANGELOG.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite, including `gamepad*.test.js`.
- [ ] **Step 5: Commit** `feat(gamepad): Press Start on a free controller emits gamepad:start-pressed`.

### Task 10: Plugin: band-ready songs and the band screen's entry points

**Repo:** plugin. Spec Decisions 3 and 4, R9, R11–R13.

**Files:**
- Create: `src/main-mode.js` (this task: the pure helpers only), `tests/main-mode.test.mjs`
- Modify:
  - `src/join.js`: `requestJoin`, with a shared `joinEntry` extracted from `watched` (322-343)
  - `src/band-screen.js`: the returned API (827-845), `show()` (671-690) and the `openLibrary` re-resolve
- Test: `tests/join.test.mjs`, `tests/band-screen.test.mjs`

**Interfaces:**
- **`src/main-mode.js`:**
  - `export const MODE_ID = 'rockherosmith'`
  - **`export function isBandReady(item) -> boolean`:**
    - `!!item && hasChart(getPart('guitar'), item)`
    - `&& (songFacts(item).fiveFret.some((p) => p.kind === 'chart') || drumsControllerPartFor(item) !== null)`
    - everything comes from `./parts.js`
  - **`export function bandIsSetUp(prefs) -> boolean`:** R12.
- **`src/join.js`:**
  - **`requestJoin(pad: number)`:**
    - A no-op unless `running`. Otherwise it sets `wantPad = pad` and calls `tryWanted()`.
    - `refresh()` calls `tryWanted(true)` after `syncClaims()`. `stop` clears `wantPad`.
  - **`tryWanted(final)`:**
    - `e = byPad.get(wantPad)`, with `e.connected`.
    - When found: `wantPad = null`, then `joinEntry(e)` if `kindsOf(key).length > 0` (R9: else nothing).
    - When not found and `final`: `wantPad = null`.
  - **`joinEntry(e)`:**
    - joined → `claimKey`
    - else `joined.set(key, null)`, `emit.join({ controllerKey, name, kinds })`, `claimKey`, `ensureMapper`
    - `watched` uses it too.
- **`src/band-screen.js`.** The returned object gains:
  - **`openSetup()`:** `pendingPick = false; setView('setup')`.
  - **`openWithSong(item) -> 'confirm' | 'setup' | null`:**
    - `null` when disposed or `item.filename` isn't a non-empty string.
    - Otherwise: `pendingPick = false; ++pickGen; setSong(item); lastResolved = true;` then `setView(bandIsSetUp(prefs) ? 'confirm' : 'setup')`.
    - Then the same flat-row re-resolve as `openLibrary`. Extract it as `reResolve(gen)` and use it in both places.
    - Returns the view.
  - **`joinPad(pad)`:** a non-integer is ignored. When `shown() && joinManager` → `joinManager.requestJoin(pad)`. Else `pendingJoinPad = pad`.
  - **`show()`:** after `startJoin()`, `if (pendingJoinPad !== null) { joinManager.requestJoin(pendingJoinPad); pendingJoinPad = null; }`. `hide()` while inactive clears `pendingJoinPad`.

- [ ] **Step 1: Write the failing tests:**
  - `main-mode.test.mjs`, `isBandReady`:
    - **true:**
      - `{ arrangements: [{ name: 'Lead' }], has_drum_tab: 1 }`
      - `{ arrangements: [{ name: 'Rhythm' }, { name: 'Drums', type: 'drums' }] }`
      - `{ arrangements: [{ name: 'Bass' }], five_fret_parts: ['bass:chart'] }`
    - **false:**
      - guitar only `{ arrangements: [{ name: 'Lead' }] }`
      - lyrics only `{ arrangements: [{ name: 'Lead' }], has_vocal_pitch: true }`
      - auto chart only `five_fret_parts: ['guitar:auto']`
      - five-fret-only pack `{ five_fret_only: true, arrangements: [{ name: 'Lead' }], five_fret_parts: ['guitar:chart'] }`
      - Combo-only `{ arrangements: [{ name: 'Combo' }], has_drum_tab: 1 }`
      - `null`
  - `main-mode.test.mjs`, `bandIsSetUp`:
    - defaults (all parts on, no devices) → `false`
    - guitar with `deviceKey: 'g'` → `true`
    - guitar off with a device → `false`
    - one controller with `on: true` → `true`
    - one controller with `on: false` → `false`
  - `join.test.mjs`:
    - `requestJoin before the first listing joins once it lands`: `onJoin` once, and `claim(0, 'rockherosmith')`.
    - `requestJoin on a pad no kind lists joins nothing, and a later listing does not join it`.
    - `requestJoin on a joined pad claims without a second onJoin`.
    - `requestJoin while stopped does nothing`.
    - `a Start still held at claim time is not a primary press`: the pad is claimed with button 9 down; the claimed listener gets the release → `onPrimary` 0 times.
  - `band-screen.test.mjs`:
    - `openWithSong goes to Confirm when a band is set up`: stored prefs with a guitar device → view `confirm`, `.rhs-title` is the song, `prefs().lastSong.filename` set, and a `/api/library?q=` re-resolve request was made.
    - `openWithSong goes to Setup on first run, with Continue`: view `setup`; `.rhs-continue` is not hidden, its text is `Continue with <title>`, and a click gives `confirm`.
    - `openWithSong drops a pending Next song pick`.
    - `openSetup returns to Setup from Confirm`.
    - `joinPad while hidden joins on the next show`: the fake `gamepadInput` lists pad 0 as a five-fret guitar; `joinPad(0)`, then a `screen:changed` to `plugin-rockherosmith` → one controller in prefs, claimed.
    - `joinPad while shown joins now`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band-ready songs, openWithSong/openSetup/joinPad and join.requestJoin`.

### Task 11: Plugin: register RockHeroSmith as a play mode (hero art, card, Press Start, tour)

**Repo:** plugin. Spec Decisions 2, 3, 4 and 6, R13, R14, R16.

**Files:**
- Create: `src/hero-art.js`, `tests/hero-art.test.mjs`
- Modify:
  - `src/main-mode.js` (`registerMainMode`)
  - `screen.js` (wiring)
  - `assets/rockherosmith.css` (lockup, hero background, card bolt)
  - `README.md` (a `## Ways in` section)
  - `CHANGELOG.md` (Added)
- Test: `tests/main-mode.test.mjs`

**Interfaces:**
- **`src/hero-art.js`:** `export function heroArtHtml() -> string` and `export function renderHeroArt(el)` (`if (el) el.innerHTML = heroArtHtml()`). The markup:
  - `<div class="rhs-hero">`
  - an inline `<svg class="rhs-wordmark" role="img" aria-label="RockHeroSmith" viewBox="0 0 640 160">` holding:
    - a lightning bolt path (`.rhs-bolt`)
    - `<text>` `Rock` / `Hero` / `Smith`, with Hero in a flame `linearGradient` (`#ffd23f` → `#ff6b1a` → `#e0343d`) and the rest in white, heavy italic
  - `<p class="rhs-hero-tag">Real guitar meets Guitar Hero.</p>`
  - `<div class="rhs-hero-icons">` with `icon('guitar')`, `icon('drum')`, `icon('mic')` and `icon('gamepad-2')` at size 28
  - `<p class="rhs-hero-line">Plug in your guitar, hand a friend a controller, press Start.</p>`
- **`registerMainMode({ win, getScreen, getRuntime, showScreen }) -> dispose()`:**
  - Without a `win.feedBack.ui.registerPlayMode` function, it returns a no-op.
  - It registers:
    ```
    { id: 'rockherosmith', label: 'RockHeroSmith', startLabel: 'Play RockHeroSmith', order: 10,
      startPress: true, renderHero: renderHeroArt, start: openSetupEntry,
      tour: { title: 'Play RockHeroSmith', content: '<the Global Constraints tour copy>' },
      cardAction: { label: 'RockHeroSmith', title: 'Play with RockHeroSmith', isAvailable: isBandReady, run: openSongEntry } }
    ```
  - `idle()` is `!rt || typeof rt.phase !== 'function' || rt.phase() === 'idle'`, with `rt = getRuntime()`. Each entry returns `false` unless `idle()`.
  - **`openSetupEntry()`:** `getScreen()?.openSetup()`, then `showScreen('plugin-rockherosmith')`.
  - **`openSongEntry(item)`:** `getScreen()?.openWithSong(item)`, then `showScreen(...)`.
  - **`onStart(e)`:**
    - `pad = e && e.detail && e.detail.pad`; it must be an integer.
    - It does nothing while the RockHeroSmith screen is already active. Core never emits then; this is a backstop.
    - Otherwise: `openSetup()`, `joinPad(pad)`, `showScreen(...)`.
    - It is subscribed with `win.feedBack.on('gamepad:start-pressed', onStart)`.
  - **`dispose()`:** unregisters and `off`s. It is idempotent.
- **`screen.js`:** in `init()`, after the band screen is created:
  - dispose `window.__rockherosmithMainMode` if it is a function
  - then `window.__rockherosmithMainMode = registerMainMode({ win: window, getScreen: () => window.__rockherosmithScreen, getRuntime: () => window.__rockherosmithRuntime, showScreen: (id) => window.showScreen && window.showScreen(id) })`
- **CSS:**
  - `.rhs-hero` (centered column), `.rhs-wordmark` (`width: min(100%, 520px)`), `.rhs-bolt` (`fill: #ffd23f`), `.rhs-hero-icons` (row, `gap: 1rem`, `color: #cbd5e1`)
  - `.v3-hero-mode[data-play-mode="rockherosmith"]`: `background: radial-gradient(120% 90% at 50% 110%, rgba(255,107,26,.35), transparent 60%), linear-gradient(160deg, #1e1b4b, #0f172a 70%)`
  - `.v3-hero-mode[data-play-mode="rockherosmith"] .v3-hero-mode-start`: `background: linear-gradient(90deg, #ff6b1a, #e0343d)`
  - `.v3-card-mode[data-play-mode-card="rockherosmith"]::before`: a 0.7 rem bolt, from `mask: url("data:image/svg+xml,…bolt…")` with `background: currentColor`, `margin-right: .2rem`, `display: inline-block`
- **README `## Ways in`:** Home's **Play RockHeroSmith**; **Start** on any free controller from Home, the Song Library or Settings; the **RockHeroSmith** button on band-ready cards (a real guitar part plus a charted 5-fret part or a drum chart).

- [ ] **Step 1: Write the failing tests:**
  - `hero-art.test.mjs`:
    - the html contains `aria-label="RockHeroSmith"`, `class="rhs-bolt"`, the tag and line copy exactly, and four `rhs-icon` SVGs
    - `renderHeroArt(null)` doesn't throw
  - `main-mode.test.mjs` (a fake `win`: `feedBack.ui.registerPlayMode` records the spec and returns an unregister spy; `feedBack.on` / `off` record; fake screen and runtime record calls):
    - `registers one mode with the spec values`: id, labels, `order: 10`, `startPress: true`, tour title, `cardAction.isAvailable === isBandReady`.
    - `start opens Setup then shows the screen`: the calls are `openSetup` then `showScreen('plugin-rockherosmith')`, in that order.
    - `the card opens the song`: `openWithSong(item)` with the same object, then `showScreen`.
    - `gamepad:start-pressed joins the pad`: detail `{ pad: 2 }` gives `openSetup`, `joinPad(2)` and `showScreen`.
    - `ignored`: a non-integer pad does nothing.
    - `not idle`: with `phase()` returning `'playing'`, start, card and Start all do nothing.
    - `already on the screen`: `win.document` has `#plugin-rockherosmith.active`, so Start doesn't call `openSetup`.
    - `no registerPlayMode (older core) is a no-op`: no throw, no `on` call.
    - `dispose unregisters and offs once; a second dispose does nothing`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the CSS, README and CHANGELOG.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: RockHeroSmith on Home, library cards and Press Start`.

### Task 12: Core: the tour step, then install into the app

This task has two parts.
- **Part A (implementer).** Repo: core `feedBack`. Spec Decision 6, R16.
- **Part B (controller).** Install. Spec Decision 1 "Installed app", R3–R5.

**Part A Files:**
- Modify: `static/v3/onboarding-tour.js:26-74` (`buildSteps`), the header anchor comment, `CHANGELOG.md` (CRLF)
- Test: create `tests/js/onboarding_tour_play_mode.test.js` (vm-load the IIFE with a fake `window.feedBackTour` that records `register(id, opts)`, and a fake `document`)

**Part A Interfaces:**
- `buildSteps()` reads `const pms = window.feedBack && window.feedBack.ui && window.feedBack.ui.playModeState; const m = pms ? pms.heroMode() : null;`.
- When `m && m.tour`, it inserts right after the `hero` step:
  ```
  { id: 'play-mode', shape: 'spotlight', position: 'bottom', selector: '#v3-hero-mode',
    waitFor: '#v3-hero-mode', title: m.tour.title, content: m.tour.content }
  ```
- Otherwise the list is today's seven steps, unchanged.
- CHANGELOG `### Added`: "First-run tour: a step for the registered play mode's hero half."

- [ ] **Step 1: Write the failing tests:**
  - `no play mode: today's steps`: the ids are exactly `['hero', 'continue', 'instrument', 'tuner', 'audio', 'profile', 'nav']`.
  - `a hero mode with a tour adds play-mode second`: its selector, title and content are the mode's.
  - `a hero mode without tour adds nothing`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tour): first-run step for a play mode's hero`.

**Part B Steps:**
- [ ] **Step 6: Instances (R5).** `pgrep -fl "/Applications/feedback.app/Contents/MacOS/feedback"`:
  - Any instance without `--remote-debugging-port=9333` → record "install skipped: Matt's copy is running", skip Part B and Task 14 Steps 1–8, and go on.
  - A debug instance → `kill -TERM` it and wait up to 30 s for it to exit.
- [ ] **Step 7: Back up (R3).**
  1. `mkdir -p ~/feedback-backups/plugins`
  2. `cp -R "$HOME/Library/Application Support/feedback-desktop/Local Storage" ~/feedback-backups/local-storage-2026-10-21`
  3. `mv /Applications/feedback.app/Contents/Resources/slopsmith/plugins/build_a_band ~/feedback-backups/plugins/build_a_band-2026-10-21`
- [ ] **Step 8: Install (R4).**
  1. `mkdir /Applications/feedback.app/Contents/Resources/slopsmith/plugins/rockherosmith`
  2. `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart`. Check that the output lists `plugin rockherosmith feature/build-a-band-stage@<sha>`.
  3. `rsync -a --checksum --delete --exclude .git --exclude __pycache__ --exclude .pytest_cache --exclude node_modules .worktrees/fivefret-p3/ /Applications/feedback.app/Contents/Resources/slopsmith/plugins/five_fret/`
  4. Check: the bundle has no `plugins/build_a_band`, and `plugins/rockherosmith/plugin.json` has `"id": "rockherosmith"`.
- [ ] **Step 9: Migration on Matt's data.**
  1. Start `debug/launch-debug.sh &`, then attach `cdp.mjs`.
  2. Arm `guard.js` before anything else.
  3. Check:
     - `localStorage.getItem('rockherosmith.prefs.v1') !== null`
     - `JSON.parse` of the new key has the same `controllers.length`, `parts.*.deviceKey` / `deviceId` and `lastSong.filename` as the old key's parse
     - `localStorage.getItem('build_a_band.prefs.v1')` is still present
     - `window.__buildABandRuntime === window.__rockherosmithRuntime`
     - `/api/plugins` lists `rockherosmith` and not `build_a_band`
  4. Save both raw strings to `.superpowers/sdd/<plan dir>/prefs-snapshot.json`. Task 14 restores from it.
  5. Record the results in the ledger.

### Task 13: Final whole-branch review and one fix wave (controller)

- [ ] **Step 1: Review packages.** Use `rp.sh` per repo against its plan-start head (Global Constraints table): core, plugin, five-fret, drums, stems, lyrics-karaoke, notedetect, scorecard.
- [ ] **Step 2: Dispatch one final reviewer** (most capable model) with the spec, this plan, the Rulings and every diff. The reviewer checks:
  - the Review Focus list
  - "Done looks like"
  - the "Anti-goals"
  - the grep in the spec's Done section
- [ ] **Step 3: Fix wave.** One implementer fixes every Critical and Important finding (TDD, one commit per repo, subject `fix: final review findings`). A re-review gives each finding ADDRESSED or NOT ADDRESSED. Anything still open goes to the morning report.
- [ ] **Step 4: Full suites.** Run every repo's command from the Global Constraints. All must pass. Record the counts.
- [ ] **Step 5: Re-sync.** When Part B ran and the fixes changed installed files, re-run Task 12 Step 8's sync with the debug app quit first (R5).

### Task 14: Silent real-app acceptance, push, morning report (controller)

No sound, no questions. Tooling: `slopsmith-custom/feedback-fork/debug/README.md`, `/private/tmp/claude-501/bab/guard.js` and `gesture.mjs`.
- Recreate `/private/tmp/claude-501/bab/shot.mjs` if it is gone: CDP `Page.captureScreenshot` to the given path.
- Screenshots go to `/private/tmp/claude-501/bab/p9-<name>.png`.
- `window.playSong` is wrapped with a recording no-op (`window.__p9play`) for the whole run, except Step 6.

**Fake pad:** before Step 3, install:
```
const pad = { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', mapping: 'standard', connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
window.__p9pad = pad;
Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad }));
```
`press(i)` sets `buttons[i]` pressed with value 1, waits 3 frames, then releases.

- [ ] **Step 1: Home.**
  - `showScreen('v3-home')`.
  - Check: `#v3-hero-split`, `#v3-hero` (solo copy intact), `#v3-hero-mode[data-play-mode="rockherosmith"]` with `.rhs-wordmark`, and `#v3-play-mode-start` text `Play RockHeroSmith`.
  - Check: the sidebar's first two `a[data-v3-nav]` are `home`, then `rockherosmith` (label `RockHeroSmith`).
  - Screenshot `p9-home`.
  - Set the CDP device metrics to 600 px wide: `#v3-hero-mode`'s top is greater than `#v3-hero`'s bottom (stacked). Screenshot `p9-home-narrow`. Restore the size.
- [ ] **Step 2: Tour step.** Call `feedBackTour.start('home-onboarding')` and advance once. Check: the step title is `Play RockHeroSmith`, spotlighting `#v3-hero-mode`. Before starting, snapshot every localStorage key containing `tour`. Cancel the tour, then restore those keys exactly, so the first-run state is unchanged.
- [ ] **Step 3: Play button.** Click `#v3-play-mode-start`. Check: the active screen is `plugin-rockherosmith` and `#rockherosmith-root[data-view="setup"]`. `showScreen('v3-home')`.
- [ ] **Step 4: Press Start from Home, Song Library and Settings.** For each screen:
  1. Show it and `press(9)`.
  2. Check: the active screen is `plugin-rockherosmith`, `data-view="setup"`, and either `rockherosmith.prefs.v1` controllers include the fake pad's key or (R9: pad not listed by any kind) the Set up list names it. Record which.
  3. Leave with `showScreen('v3-home')`.

  Screenshot `p9-start-join` on the first one. Then a press on `v3-feedbarcade` and one with a visible core confirm dialog both keep the screen unchanged.
- [ ] **Step 5: The card.**
  1. Find a band-ready song: `/api/library?has_drums=1&arrangements_has=Lead,Rhythm,Bass&size=20`, the first row where the plugin's rule holds. Evaluate `isBandReady` in-page by importing `src/main-mode.js` from the base URL the plugin's `screen.js` module loaded from (find it in `performance.getEntriesByType('resource')`). Run `v3Songs.search(title)`.
  2. Check: its card has `[data-play-mode-card="rockherosmith"]`, and a guitar-only song's card (search one with `has_drums=0`) has none.
  3. Click the button. Check: `__p9play.length === 0`, the screen is `plugin-rockherosmith`, `.rhs-title` is the song, and `data-view` is `confirm` (R12 holds with the fake pad joined). Screenshot `p9-confirm-from-card`.
  4. In pick mode (`.rhs-change`), no card shows the button. `[data-pick-back]`.
- [ ] **Step 6: Start during a song does nothing.**
  1. Restore `playSong`, then Go through `gesture.mjs` (the guard holds autoplay and mutes).
  2. Once `rt.phase() === 'playing'` and the song is paused by the guard, `press(9)` on an **unclaimed** second fake pad (index 1, pushed into the array). Check: the active screen stays `player`, and no `gamepad:start-pressed` was seen (`feedBack.on` spy).
  3. Leave the song and re-wrap `playSong`.
- [ ] **Step 7: Clean up.**
  1. Restore `rockherosmith.prefs.v1` from `prefs-snapshot.json`. Never write the legacy key.
  2. `delete navigator.getGamepads`; dispatch `gamepaddisconnected`.
  3. Restore `playSong`.
  4. Confirm `feedBack.isPlaying === false` and the mic is off.
  5. Quit the debug app (R5, spec "close the debug app afterwards").
- [ ] **Step 8: Push**, plain `git push origin <branch>`, never `--force`:
  - core, plugin, drums, stems, lyrics-karaoke, notedetect and scorecard on `feature/build-a-band-stage`
  - five-fret on `feature/band-api`
  - If one fails, note it and carry on.
- [ ] **Step 9: Morning report.**
  1. In `MASTER.md`, write `Plan 9 (RockHeroSmith main mode): DONE` with every repo's head SHA, test counts, screenshot paths and every ruling (R1–R21, plus any made during the run).
  2. List anything skipped or still open, the backup paths (R3), and how to roll back: move the backup folder back into `plugins/` and remove `plugins/rockherosmith`, which only Matt does.
  3. The same summary is the session's final message.

---

## Deviations from the spec in this plan

- **The card button's slot.** It is a play-mode field rendered by `songs.js` in the chips row, not the existing `libraryCardActions` 'inline' placement. That placement lives in the hover-only top-right row and renders escaped text only (R10).
- **Press Start screens.** It fires only on core screens (R8). The spec's "any screen except while a song is loaded" is narrowed by its own exclusions: minigames and five-fret are plugin screens, and FeedBarcade is excluded by name.
- **Band-ready guitar.** It means Lead, Rhythm or Bass, not Combo (R11).

## Later

- Continue / Jump back in remembering band mode (spec Non-goal).
- A ⋮ menu row and tree / table / library-home buttons for play modes.
- Renaming the `feature/build-a-band-stage` branches.
