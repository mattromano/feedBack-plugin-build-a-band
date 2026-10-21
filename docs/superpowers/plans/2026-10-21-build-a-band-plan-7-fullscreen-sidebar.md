# Build-a-Band Plan 7: full screen, the sidebar and Settings over a paused song

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A band song can run as a full-screen stage that shows only the highways.
- Moving the mouse brings back the transport, the time and A/V readouts, Up Next, the section map, and a Menu / loop / full screen / end row.
- The app's sidebar slides in over the stage. Settings opens over the paused song and comes back to it ("We can pause, but I don't want to leave the song").
- The deferred items are closed.

**Architecture:**
- **Plugin-side wherever possible.**
  - Full screen is a CSS full mode on `#player` plus the HTML Fullscreen API on the document, asked for inside the Go click.
  - The sidebar and Settings are plugin overlays over `#player`, so the active screen never changes and nothing tears the song down.
- **One additive core change:** `feedBack.pauseForOverlay()` / `feedBack.resumeAfterOverlay(token)`, so the band can pause through a count-in and resume with core's song count-in.
- **Small fixes in drums, note_detect and stems** close the deferred items.

**Tech Stack:** Vanilla ES modules and plain scripts, node:test, CSS. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo). Implementers read:
- "Full screen" and "Sidebar mid-song" (138-145)
- the HUD paragraph (151)
- "Changes needed" (235-238)
- acceptance check 8 (304)

The binding rulings are in `.superpowers/sdd/plan-7-inputs.md` (R1–R24 and the verified facts). Where the spec and a ruling differ, the ruling wins.

**This is plan 7 of 7, the last.** Plans 1–6 have landed.

## Global Constraints

- **Repos and branches.** Repos are under `~/Desktop/repos/feedback-upstream/`, and every one is on `feature/build-a-band-stage`.

  | Repo | Head at plan start | Tasks |
  |---|---|---|
  | core `feedBack` | `6fb4e17` | 1 |
  | `feedBack-plugin-drums` | `d7780c3` | 2 |
  | `feedBack-plugin-notedetect` | `0bc574c` | 3 |
  | `feedBack-plugin-stems` | `d199a9e` | 4 |
  | `feedBack-plugin-build-a-band` | `240bda0` + this plan | 5–8 |
  | `feedBack-desktop`, karaoke, scorecard, splitscreen | read-only (R3) | — |

- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
  - One commit per task.
- **Line endings:** every file touched is LF. Check with `file` before editing anyway.
- **Test commands:**
  - core: `npm run test:js`
  - drums: `node tests/screen.test.js`
  - note_detect: `npm test`
  - stems: `npm test`
  - build-a-band: `npm test`
- **NO SOUND:**
  - Nothing here plays audio. No task launches the app.
  - Task 9 is the controller's silent check: the song stays paused, so a resume never counts in (a count-in click is a sound), and no MIDI or drum letter key is ever sent.
- **No push**, no PRs and no new GitHub repos.
- **Values (rulings):**
  - **Classes and z-order:**
    - full mode `#player.bab-full`
    - `body.bab-sidebar-open` (sidebar z `150`)
    - `body.bab-settings-over` (`#settings` z `160`)
    - chrome row `.bab-chrome` z `22`, `40px` high; section map `20px`
    - `.bab-edge` `10px` wide, z `31`
    - CSS var `--bab-transport-h` (fallback `72px`)
  - **Sidebar key:** `e.code === 'KeyM'` (or `e.key` `m`/`M`), no modifiers, not while typing.
  - **Copy:**
    - Leave prompt: title `Leave the song?`, body `This ends the band song.`, confirm `Leave`, cancel `Stay`.
    - Settings button: `Back to the song`.
    - Toast: `Guitar input couldn't start`.
    - Chrome titles:
      - `Menu (M)`
      - `Full screen` / `Exit full screen`
      - `End song`
      - loop: `Loop A` / `Loop B` / `Clear loop`, with the titles `Set loop start`, `Set loop end`, `Clear loop`
  - **Media actions held:** `play`, `pause`, `stop`, `seekbackward`, `seekforward`, `seekto`.
  - **Modal selector (drums):** `[aria-modal="true"], .feedBack-modal`.

## Review Focus

1. **The session ending while Settings or the leave prompt is open** (`song:stop`, a screen change, splitscreen). Nothing resumes, every class and attribute is undone, and full screen is left. (Task 8 exit test; Task 7 silent close.)
2. **Player keys behind Settings or the sidebar.** Space must not resume the song, Esc must not leave it, and drum keys must not hit pads. (Task 7 key tests; Task 2; Task 8 sidebar Esc test.)
3. **Full screen refused or already on:** a Go from a drum pad has no user activation, or the window is already full screen. The stage still runs in full mode inside the window, nothing throws, and a full screen we didn't make is never exited. (Task 6 tests.)
4. **The band guitar mastery after Settings.** `loadSettings` re-applies the solo master difficulty, so the band value must come back before resuming. (Task 8 Settings test.)
5. **A count-in running, or the song already paused, when Settings opens.** Nothing plays behind Settings, and only what was playing resumes. (Task 1 tests.)

---

### Task 1: Core: pause for an overlay and resume with the song count-in

**Repo:** core `feedBack` (R10)

**Files:**
- Modify: `static/app.js`:
  - the player-controls import 57-71 (add `_wantSongCountIn`)
  - two functions after `requestExitSong` 1595-1601, published like it (`window.feedBack.<name> = <fn>`)
- Test: create `tests/js/overlay_pause.test.js`

**Interfaces:**
- **`pauseForOverlay(): { wasPlaying: boolean, gen: number }`:**
  - `wasPlaying = S.isPlaying || isCountingIn()`.
  - Always `_cancelCountIn()`. Then, if `S.isPlaying`, `Promise.resolve(togglePlay()).catch(() => {})`.
  - `gen = audioSeekGen()`.
- **`resumeAfterOverlay(token): boolean`:** returns `false` and does nothing unless all of these hold:
  - `token && token.wasPlaying`
  - `!S.isPlaying && !isCountingIn()`
  - `audioSeekGen() === token.gen`
  - `document.querySelector('.screen.active')?.id === 'player'`

  Otherwise it starts `startSongCountIn()` when `_wantSongCountIn()`, else `togglePlay()` (each `Promise.resolve(...).catch(...)`), and returns `true`.
- Published as `window.feedBack.pauseForOverlay` and `window.feedBack.resumeAfterOverlay`. A comment says Build-a-Band's Settings overlay uses them and they mirror the exit-confirm Stay (1617-1620, 1666-1675).

- [ ] **Step 1: Write the failing tests** in `overlay_pause.test.js`, using `extractFunction` from `tests/js/test_utils.js` on `static/app.js` and a vm sandbox (the `song_close.test.js` pattern). The sandbox has:
  - `S`
  - `togglePlay` (records the call, flips `S.isPlaying`)
  - `_cancelCountIn` (records)
  - `isCountingIn` (a flag)
  - `audioSeekGen` (a value)
  - `_wantSongCountIn` (a flag)
  - `startSongCountIn` (records)
  - `document.querySelector` returning `{ id }`

  The tests:
  - `pausing a playing song cancels the count-in and pauses once`: `S.isPlaying = true`, gen 7 gives `{ wasPlaying: true, gen: 7 }`, one cancel, one `togglePlay`.
  - `pausing during a count-in stops it without starting playback`: `isCountingIn` true and `S.isPlaying` false give `wasPlaying: true`, one cancel, no `togglePlay`.
  - `an already paused song stays paused`: `wasPlaying: false`. `resumeAfterOverlay` of that token returns `false` and calls nothing.
  - `resume counts in when the song wants it`: `_wantSongCountIn` true gives one `startSongCountIn`, no `togglePlay`, returns `true`.
  - `resume without a count-in plays`: `_wantSongCountIn` false gives one `togglePlay`.
  - `resume is refused after a song change, while playing, while counting in, off the player, or with no token`: each returns `false` with no calls.
  - `both are published on window.feedBack`: the app.js source contains `window.feedBack.pauseForOverlay = pauseForOverlay` and `window.feedBack.resumeAfterOverlay = resumeAfterOverlay`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite.
- [ ] **Step 5: Commit** `feat(player): pause for an overlay and resume with the song count-in`.

### Task 2: Drums: keys are ignored while a modal dialog is open

**Repo:** `feedBack-plugin-drums` (R14, plan 4 M4)

**Files:**
- Modify: `screen.js`:
  - a pure helper near `_routeTarget` (2089)
  - `_onKeyDown` 2596-2611, `_onSpKey` 3131-3145, `_onDiffKey` 3151-3162
  - `module.exports` 5394-5410
- Modify: `README.md` (the keyboard section: one sentence)
- Test: `tests/screen.test.js`

**Interfaces:**
- `_modalOpen(doc): boolean`:
  - `true` when `doc.querySelector('[aria-modal="true"], .feedBack-modal')` returns an element
  - `false` for a missing doc, no `querySelector`, or a throw
- Each of the three handlers returns before any `preventDefault` when `_modalOpen(document)`.

- [ ] **Step 1: Write the failing tests:**
  - `_modalOpen finds an open modal dialog`:
    - a doc whose `querySelector` records its selector and returns `{}`: `true`, and the selector equals `'[aria-modal="true"], .feedBack-modal'`
    - returning `null`: `false`
    - `_modalOpen(null)`, `_modalOpen({})`, and a throwing `querySelector`: `false`
  - `drum, star power and difficulty keys stand down under a modal`: in the screen.js source, the bodies after `_onKeyDown = (e) =>`, `_onSpKey = (e) =>` and `_onDiffKey = (e) =>` each contain `_modalOpen(document)` before their first `e.preventDefault()`.
- [ ] **Step 2: Run** `node tests/screen.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** README: drum keys, Enter (star power) and D are ignored while a modal dialog is open (the band results, a confirm dialog).
- [ ] **Step 4: Run** every drums test file, one at a time (`node tests/<file>.test.js`). Expected: PASS.
- [ ] **Step 5: Commit** `fix: drum keys stand down while a modal dialog is open`.

### Task 3: note_detect: quiet input errors and a public input-error event

**Repo:** `feedBack-plugin-notedetect` (R16)

**Files:**
- Modify: `screen.js`:
  - a per-instance flag and two functions next to `setScoreHudHidden` (15066-15075)
  - the `startAudio` catch (4734-4755)
  - the returned API object (near 18539)
- Modify: `README.md` (next to the band-mode switch at 70; event table at 109), `CLAUDE.md` (event table at 74)
- Test: create `test/input_errors_quiet.test.js`

**Interfaces:**
- `setInputErrorsQuiet(on): boolean`: only a boolean is accepted (otherwise `false` and no change). Not persisted.
- `isInputErrorsQuiet(): boolean`, default `false`.
- In the catch, under the existing `enabled && !autoEnableTrial` condition:
  - always `dispatchInstanceEvent('notedetect:input-error', { message, isDefault })`, with `message` = `e && e.message ? e.message : String(e)`
  - then `alert(...)`, unchanged, only when `!quietInputErrors`

- [ ] **Step 1: Write the failing tests:**
  - `setInputErrorsQuiet toggles and refuses non-booleans`: `loadDetectionCore().createNoteDetector({ isDefault: true })` starts `false`; `true` gives `true`; `'on'` returns `false` and keeps `true`; `false` gives `false`.
  - `an input failure is announced and alerts only when not quiet`: `extractBlock(SRC, 'async function startAudio(')` contains `dispatchInstanceEvent('notedetect:input-error'`, and the `alert(` call sits under a condition that includes `!quietInputErrors`.
  - `the switch is on the public API`: the returned API object lists `setInputErrorsQuiet` and `isInputErrorsQuiet`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Docs:
  - README: the switch ("band mode: no blocking alert; listen for `notedetect:input-error`").
  - Both event tables: the event row, `{ message, isDefault }`, dispatched twice like every notedetect event.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: quiet input errors and a notedetect:input-error event`.

### Task 4: Stems: an automation change refreshes the stem button's a11y state

**Repo:** `feedBack-plugin-stems` (R19)

**Files:**
- Modify: `src/main.js`, `applyStemState` 1297-1305: the `stem.btn.className` line becomes `updateStemButton(stem)`.
- Test: `tests/claims.test.mjs`

- [ ] **Step 1: Write the failing test** `a claim mute, restore or reassert refreshes aria-pressed and the label`: `fnBody(MAIN, 'function applyStemState(')` contains `updateStemButton(stem)` and no `stem.btn.className`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `fix: an automation stem change keeps the button's aria state current`.

### Task 5: Media keys held over the results; no awards for parts that scored nothing

**Repo:** `feedBack-plugin-build-a-band` (R15, R17)

**Files:**
- Create: `src/media-keys.js`, `tests/media-keys.test.mjs`
- Modify:
  - `src/results-screen.js`: export `PLAYER_KEYS` (13); hold in `showResultsScreen`, release in `hide` 148-153
  - `src/results.js`: `pickAwards` 69-81
- Test: `tests/results-screen.test.mjs`, `tests/results.test.mjs`

**Interfaces:**
- `MEDIA_ACTIONS = ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']`.
- `holdMediaKeys(nav): () => void`:
  - With `nav.mediaSession.setActionHandler`, the first hold on that session sets a no-op handler per action. An action that throws is skipped.
  - Holds are counted per session (a `WeakMap`). The last release sets `null` for each action it set.
  - Each release function works once. With no session, it returns a no-op.
- `showResultsScreen` holds `holdMediaKeys(win.navigator)` and releases it in `hide()`.
- `pickAwards`:
  - the fallback award needs `num(c.score) > 0`
  - "Most accurate" candidates need `c.accuracy > 0`
  - Flawless and the streak award are unchanged

- [ ] **Step 1: Write the failing tests:**
  - `media-keys.test.mjs`. A fake session records `setActionHandler(action, fn)` calls.
    - `a hold silences each media action and the release restores them`: 6 calls with functions, in `MEDIA_ACTIONS` order. Calling the `play` handler returns `undefined`. The release gives 6 calls with `null`.
    - `holds nest`: two holds, then the first release adds no calls; the second adds the 6 `null`s.
    - `a release works once`.
    - `no media session, or an unsupported action`: `holdMediaKeys(undefined)()` doesn't throw. When `seekto` throws, the other 5 are set, and the release sends no `null` for `seekto`.
  - `results-screen.test.mjs`, `the results hold the media keys while shown`: with `win.navigator = { mediaSession: fake }`, `play` is a function after show and `null` after `hide()`.
  - `results.test.mjs`:
    - `a part that scored nothing gets no award`: guitar `{ score: 500, accuracy: 0.8, judged: 30, bestStreak: 12 }` and drums `{ score: 0, accuracy: 0, judged: 14, bestStreak: 0 }` give drums `''`.
    - `0% is never Most accurate`: guitar `{ score: 0, accuracy: 0, judged: 25 }` and vocals `{ score: 0, accuracy: null, judged: 0 }` both give `''`.
  - Existing award fixtures that expect a fallback award with `score: 0` get a positive score. Their expectations stay the same.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `fix: media keys can't replay the song behind the results; no award for a part that scored nothing`.

### Task 6: Full mode, window full screen, and the stage's hover chrome

**Repo:** `feedBack-plugin-build-a-band` (R2, R5, R6, R20, R23)

**Files:**
- Create: `src/full-screen.js`, `src/stage-chrome.js`, `tests/full-screen.test.mjs`, `tests/stage-chrome.test.mjs`
- Modify:
  - `src/stage.js`: `fitFooter` 229-232, API 400-409, unmount 440-441
  - `src/icons.js`: 5 icons, R23
  - `assets/build-a-band.css`: replace 214 and 217; one new block
- Test: also `tests/stage-mount.test.mjs`, `tests/icons.test.mjs` (if it pins the names)

**Interfaces:**
- **`src/full-screen.js`:**
  - `alreadyFullScreen(win): boolean`: `true` when `win.screen.width` and `win.screen.height` are finite and > 0, and `win.outerWidth >= width && win.outerHeight >= height`.
  - `createFullScreen({ doc, win }) -> { request(): boolean, exit(): void, isOn(): boolean, onChange(fn): () => void }`:
    - `request()` returns `false` and calls nothing when any of these hold:
      - `isOn()`
      - `alreadyFullScreen(win)`
      - `win.navigator.userActivation` exists with `isActive === false`
      - `doc.documentElement.requestFullscreen` isn't a function

      Otherwise it calls it, marks the full screen as ours and returns `true`. A rejection clears "ours" and logs `console.warn('[build-a-band] full screen refused', err)` once per runtime.
    - `exit()`: only when ours and `doc.fullscreenElement`, `doc.exitFullscreen()` (rejection caught). Then not ours.
    - `isOn()`: `!!doc.fullscreenElement`.
    - `onChange(fn)`: a `fullscreenchange` listener on `doc`; returns its remover.
- **`src/stage-chrome.js`:** `createStageChrome({ doc, player, full, onMenu, onLoop, onFullScreen, onEnd, onEdge }) -> { setFull(on), setLoop(state), destroy() }`:
  - Appends `div.bab-chrome` to `player`, holding `button` (`type="button"`) elements in this order:
    - `.bab-chrome-menu` (icon `menu`, title `Menu (M)`)
    - `.bab-chrome-loop` (icon `repeat`)
    - `.bab-chrome-full` (icon `maximize`, or `minimize` when full)
    - `.bab-chrome-end` (icon `log-out`, title `End song`)
  - Then appends `div.bab-edge`.
  - Every title is also the `aria-label`. A click stops propagation and calls its callback. The edge's `pointerenter` calls `onEdge()`.
  - `setFull(on)`: toggles `bab-full` on `player`; the full button gets `aria-pressed` and the title `Exit full screen` or `Full screen`.
  - `setLoop(state)`: `'none' | 'a' | 'ab'` → text `Loop A` / `Loop B` / `Clear loop`, title `Set loop start` / `Set loop end` / `Clear loop`.
  - Starts with `setFull(full)` and `setLoop('none')`.
  - `destroy()`: idempotent; removes both elements and `bab-full`.
- **`mountStage` (stage.js):**
  - `fitFooter` also sets `--bab-transport-h` on `player` to the footer's `offsetHeight + 'px'`.
  - The API adds `refit()`: `fitFooter()` then `resizeAll()`; a no-op after unmount.
  - Unmount removes `--bab-transport-h`.
- **CSS** (the rules R5 and R6 describe). Replace the two hides at 214 and 217 with:
  - **`#player.bab-stage #player-hud`:**
    - `display: flex; justify-content: flex-end; top: auto`
    - `bottom: calc(var(--bab-transport-h, 72px) + 60px)`
    - `opacity: 0; transition: opacity .25s ease`
    - With `#player.bab-stage.chrome-active` or `.pop-open`: `opacity: 1`.
  - **`#player.bab-stage #player-hud > :first-child, #player.bab-stage #v3-live-performance-hud`:** `display: none !important`.
  - **`#player.bab-stage #section-map`:**
    - `position: absolute !important; top: auto !important; bottom: var(--bab-transport-h, 72px) !important`
    - `left: 0; right: 0; z-index: 21 !important`
    - `opacity: 0; pointer-events: none`
    - Shown, with pointer events, under `chrome-active` / `pop-open`.
  - **`#player .bab-chrome`:**
    - `position: absolute; left: 0; right: 0; bottom: calc(var(--bab-transport-h, 72px) + 20px)`
    - `height: 40px; z-index: 22; display: flex; align-items: center; gap: .5rem; padding: 0 1rem`
    - Hidden and click-through until `chrome-active` / `pop-open`. `.bab-chrome-end` has `margin-left: auto`.
  - **Full mode:**
    - `#player.bab-full #v3-railzone { display: none; }`
    - `#player.bab-full .bab-lanes { bottom: 0 !important; }`
    - `#player.bab-full .v3-transport` gets a dark bottom gradient
  - **`.bab-edge`:** `position: absolute; left: 0; top: 0; bottom: 0; width: 10px; z-index: 31; display: none`; `display: block` under `#player.bab-full`.
  - **Lane chrome lift:**
    - `#player.bab-stage .bab-lane-chrome { bottom: calc(60px + 0.75rem); }`
    - with `.bab-full`: `calc(var(--bab-transport-h, 72px) + 60px + 0.75rem)`

- [ ] **Step 1: Write the failing tests:**
  - `full-screen.test.mjs`, with a fake doc: `documentElement.requestFullscreen` records and resolves; `fullscreenElement`; `exitFullscreen` records; `fullscreenchange` listeners.
    - `request asks once and owns the full screen`: `true`, one call. Then `fullscreenElement` is set: `request()` is `false` and `exit()` calls `exitFullscreen` once.
    - `no user activation, or the window already fills the screen: no request`:
      - `navigator.userActivation = { isActive: false }` gives `false`, no call
      - `outerWidth: 1440, outerHeight: 900, screen: { width: 1440, height: 900 }` gives `false`
    - `never exits a full screen it didn't request`: `fullscreenElement` set without a `request()`, then `exit()`: no call.
    - `a refused request is not ours`: a rejecting `requestFullscreen`, then after a flush `exit()` makes no call, and exactly one `console.warn` across two refused requests.
    - `onChange adds and removes the listener`.
    - `alreadyFullScreen`: missing or zero `screen` gives `false`.
  - `stage-chrome.test.mjs` (fake-dom):
    - `the chrome row holds Menu, loop, full screen and End`: the four classes in order, and titles `Menu (M)`, `Set loop start`, `Full screen`, `End song`.
    - `clicks call back`: each button's click calls its callback once. `pointerenter` on `.bab-edge` calls `onEdge`.
    - `setFull`:
      - `full: true` gives `player` the class `bab-full`, the full button `aria-pressed="true"` and title `Exit full screen`
      - `setFull(false)` reverses all three
    - `setLoop`: `'a'` → `Loop B`; `'ab'` → `Clear loop`.
    - `destroy`: both elements are gone and `bab-full` is removed; a second `destroy()` doesn't throw.
  - `stage-mount.test.mjs`, `refit sets the transport height and resizes`:
    - a `#player-controls` with `offsetHeight: 64` → after mount the player's `--bab-transport-h` is `'64px'`
    - `stage.refit()` calls the main highway's `resize()` again
    - after unmount the property is removed and `refit()` is a no-op
  - `icons.test.mjs` (or a new assertion): `menu`, `maximize`, `minimize`, `repeat` and `log-out` are in `ICON_NAMES`.
  - CSS source checks (in `stage-chrome.test.mjs`): `assets/build-a-band.css`
    - no longer contains `#player.bab-stage #player-hud { display: none; }`
    - contains `#player.bab-full #v3-railzone { display: none; }`
    - contains `#player.bab-full .bab-lanes { bottom: 0 !important; }`
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: full mode, window full screen and the stage's hover chrome`.

### Task 7: The sidebar over the stage and Settings over the paused song (DOM modules)

**Repo:** `feedBack-plugin-build-a-band` (R7, R9, R12)

**Files:**
- Create: `src/sidebar-overlay.js`, `src/settings-overlay.js`, `tests/sidebar-overlay.test.mjs`, `tests/settings-overlay.test.mjs`
- Modify: `assets/build-a-band.css` (a new block)

**Interfaces:**
- Consumes: `holdMediaKeys` (Task 5); `PLAYER_KEYS` (Task 5 export).
- **`createSidebarOverlay({ doc, onNavigate }) -> { open(via), close(), toggle(via), isOpen(), follow(link), destroy() }`:**
  - The sidebar is `doc.getElementById('v3-sidebar')`. Without it, `open()` returns `false` and nothing else happens.
  - `open(via = 'menu')` adds `bab-sidebar-open` to `doc.body` and returns `true`. With `via === 'edge'`, the sidebar's `pointerleave` closes it.
  - A `pointerdown` on `doc` (capture) whose target is outside the sidebar closes it.
  - A `click` capture listener on the sidebar takes `e.target.closest('a[data-v3-nav]')`: it calls `e.preventDefault()` and `e.stopPropagation()`, then `onNavigate(link, link.getAttribute('data-v3-nav'))`. It is skipped while following.
  - `follow(link)`: marks following, calls `link.click()`, unmarks, then `close()`.
  - `close()` and `destroy()` are idempotent. `destroy()` also removes every listener.
- **`openSettingsOverlay({ doc, win, onClose }) -> { kind: 'settings', close({ silent } = {}) } | null`:**
  - Returns `null` when `doc.getElementById('settings')` is missing.
  - Sets `role="dialog"`, `aria-modal="true"` and `aria-label="Settings"` on `#settings`, remembering earlier values. Adds `bab-settings-over` to `doc.body`.
  - Inserts `button.bab-settings-back` (`type="button"`, text `Back to the song`) as `#settings`' first child and focuses it. Its click calls `close()`.
  - Calls `win.loadSettings()` when it's a function. A throw or rejection is caught and warned.
  - `holdMediaKeys(win.navigator)`.
  - A window capture `keydown` listener:
    - `Escape` with no modifiers → `preventDefault()`, `stopPropagation()`, `close()`
    - otherwise, a key in `PLAYER_KEYS` (or `e.code === 'Space'`) whose target isn't inside `#settings` → `preventDefault()` + `stopPropagation()`
  - `close()` is idempotent. It undoes everything above, restoring or removing each attribute, then calls `onClose()` unless `silent`.
- **CSS:**
  - `body.bab-sidebar-open #v3-sidebar { display: flex !important; position: fixed; top: 0; bottom: 0; left: 0; width: 16rem; z-index: 150; box-shadow: 8px 0 32px rgba(0,0,0,.6); animation: bab-sidebar-in .18s ease-out; }`, plus the keyframes (`translateX(-100%)` → none).
  - `body.bab-settings-over #settings { display: block !important; position: fixed; inset: 0; z-index: 160; overflow-y: auto; background: #0f172a; }`
  - `body.bab-settings-over #settings .fb-settings-back { display: none; }`
  - A style for `#settings .bab-settings-back`, in the style of the band's buttons.

- [ ] **Step 1: Write the failing tests** (fake-dom; the tests call each listener with `fire(type, { target })`):
  - `sidebar-overlay.test.mjs`. A `#v3-sidebar` holds `a[data-v3-nav="settings"]` and `a[data-v3-nav="songs"]`, each with its own click listener (shell's stand-in).
    - `open and close toggle the body class`.
    - `a nav click is taken over`: firing `click` on the sidebar with `target: settingsLink` calls `onNavigate(settingsLink, 'settings')`. The event is `defaultPrevented`, and the link's own listener didn't run.
    - `follow runs the link's own handler and closes`: one call to the songs link's listener; the class is removed; `onNavigate` isn't called again.
    - `opened from the edge it closes when the pointer leaves; from the menu it stays`.
    - `a pointerdown outside closes it, inside keeps it`.
    - `no sidebar in the page`: `open()` is `false` and the body has no class.
    - `destroy removes its listeners`: the sidebar's and the doc's `listenerCount()` go back to what they were before create.
  - `settings-overlay.test.mjs`. A `#settings` holds a `.fb-settings-back` and a checkbox. `win` has listener maps, a recording `loadSettings`, and `navigator.mediaSession` (fake).
    - `opening shows Settings as a modal over the stage`:
      - role, `aria-modal` and label are set
      - body has `bab-settings-over`
      - `#settings` first child is `button.bab-settings-back` with text `Back to the song`, and it's `doc.activeElement`
      - `loadSettings` was called once
      - media `play` is a function
    - `Escape closes it and calls back once`: the keydown is `defaultPrevented`. `onClose` is called once; the attributes are removed (they were absent before); the class and button are gone; media `play` is `null`. A second `close()` does nothing.
    - `the back button closes it`.
    - `Space on the page behind is swallowed, Space in Settings is not`:
      - `keydown {key: ' ', target: doc.body}` is `defaultPrevented`
      - with `target: checkbox` (inside `#settings`) it is not
    - `a silent close never calls back`.
    - `an existing role is put back`: `#settings` with `role="region"` before open has `role="region"` after close.
    - `no #settings`: `null`, and nothing changed.
    - `loadSettings rejecting is caught`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: the sidebar over the stage and Settings over a paused song`.

### Task 8: Band sessions use full screen, the chrome, the sidebar and Settings

**Repo:** `feedBack-plugin-build-a-band` (R2, R4, R7–R12, R16, R20–R22)

**Files:**
- Modify: `src/band-runtime.js`:
  - imports 8-27; `newSession` 132-209
  - `EFFECTS.mount` 731-770; teardown 885-942; `replay` 960-973; `begin` 996-1013
  - `winHandlers` 1161-1164; listener wiring 1166-1168; API 1170-1187
- Modify: `README.md` (one section: full screen, the hover chrome, `M` and the sidebar, Settings mid-song)
- Test: `tests/band-runtime.test.mjs`

**Interfaces:**
- Consumes:
  - `createFullScreen` and `createStageChrome` (Task 6), and `stage.refit()`
  - `createSidebarOverlay` and `openSettingsOverlay` (Task 7)
  - core `fb.pauseForOverlay` / `fb.resumeAfterOverlay` (Task 1)
  - note_detect `setInputErrorsQuiet` / `isInputErrorsQuiet` and `notedetect:input-error` (Task 3)
- **Runtime state:**
  - `fullScreen = createFullScreen({ doc, win })`, with `onChange(onFullScreenChange)` wired at creation and removed in `dispose()`.
  - A window capture `keydown` listener `onStageKey`, added at creation and removed in `dispose()`.
- **`newSession` adds:**
  - `full: !!prefs.fullScreenStage`
  - `chrome: null`, `sidebar: null`, `overlay: null`, `pauseToken: null`
  - `ndQuiet: null` (the user's previous quiet value; `null` = untouched)
- **`begin`:** once the `go` dispatch has left `idle`, `if (s.full) fullScreen.request()`.
- **`EFFECTS.mount`:** after `enableGuitarDetect(s)`, `mountChrome(s)`:
  - destroys a previous `s.chrome`
  - creates the chrome with:
    - `full: s.full`
    - `onMenu: () => s.sidebar && s.sidebar.toggle('menu')`
    - `onEdge: () => s.sidebar && s.sidebar.open('edge')`
    - `onLoop: () => cycleLoop(s)`
    - `onFullScreen: () => setFull(s, !s.full)`
    - `onEnd: () => win.requestExitSong()`
  - creates `s.sidebar` once per session: `onNavigate: (link, key) => onSidebarNav(s, link, key)`
  - calls `stage.refit()` when present
  - calls `quietGuitarErrors(s)`
- **`setFull(s, on)`:** `s.full = on`; `on ? fullScreen.request() : fullScreen.exit()`; `s.chrome.setFull(on)`; `stage.refit()`.
- **`onFullScreenChange`:** for `scoring()`'s session with `s.full` while `!fullScreen.isOn()`, run `setFull(s, false)`.
- **`cycleLoop(s)`:** reads `fb.getLoop()`, then:
  - no A → `win.setLoopStart()`
  - A without B → `win.setLoopEnd()`
  - both → `win.clearLoop()`

  It then re-reads the loop and calls `s.chrome.setLoop('none' | 'a' | 'ab')`.
- **`onStageKey(e)`:** acts only for `scoring()`'s session, with no Ctrl/Meta/Alt, a target that isn't a typing target, and no `s.overlay`:
  - `KeyM` → `preventDefault()`, `s.sidebar.toggle('key')`
  - `Escape` with the sidebar open → `preventDefault()`, `stopPropagation()`, `s.sidebar.close()`
- **`onSidebarNav(s, link, key)`:** closes the sidebar; does nothing unless `scoring() === s`. `key === 'settings'` → `openSettings(s)`; otherwise `confirmLeave(s, link)`.
- **`openSettings(s)`:**
  - does nothing if `s.overlay`
  - `s.pauseToken = pausePlayback()`
  - `s.overlay = openSettingsOverlay({ doc, win, onClose: () => { s.overlay = null; afterOverlay(s); } })`; a `null` overlay runs `afterOverlay(s)` at once
- **`confirmLeave(s, link)`:**
  - `s.pauseToken = pausePlayback()`
  - Without `win._confirmDialog`, `s.sidebar.follow(link)`.
  - Otherwise `s.overlay = { kind: 'confirm' }` and the prompt (Global Constraints copy) runs. When it settles, it does nothing unless `session === s && state.phase === 'playing'`. Then `s.overlay = null`, and:
    - `true` → `s.sidebar.follow(link)`
    - `false` or a rejection → `afterOverlay(s)`
- **`afterOverlay(s)`:** only while `session === s` and `playing`:
  1. `reapplyMastery(s)`: when guitar is on and `s.readyDetail.hasPhraseData`, `win.highway.setMastery(masteryFor(s.prefs.parts.guitar.difficulty))`.
  2. `resumePlayback(s.pauseToken)`, then `s.pauseToken = null`.
- **`pausePlayback()` / `resumePlayback(token)`:** core's `fb.pauseForOverlay` / `fb.resumeAfterOverlay` when they are functions. The fallback:
  - pause: `{ wasPlaying: fb.isPlaying === true }`, plus `win.togglePlay()` when playing
  - resume: `win.togglePlay()` only when `token.wasPlaying && fb.isPlaying === false`
- **`quietGuitarErrors(s)`:** when `s.scoreParts` includes `guitar`, `win.noteDetect.setInputErrorsQuiet` is a function and `s.ndQuiet === null`:
  - `s.ndQuiet = !!(isInputErrorsQuiet && isInputErrorsQuiet())`
  - `setInputErrorsQuiet(true)`
- **Window handler `notedetect:input-error`:**
  - each detail counts once (a WeakSet)
  - `detail.isDefault === false` is ignored
  - for `scoring()`'s session with `guitar` in `scoreParts`: `showToast(s, "Guitar input couldn't start")`
- **Teardown,** before step 0:
  1. Close the overlay silently, if it has `close`. `s.overlay = null; s.pauseToken = null`.
  2. `s.sidebar.destroy()`, `s.chrome.destroy()` (both then `null`).
  3. `if (!s.keepHides) fullScreen.exit()`.
  4. When `s.ndQuiet !== null`: `setInputErrorsQuiet(s.ndQuiet)`, then `s.ndQuiet = null`.
- **`replay`:** a refused replay (`!started`) also calls `fullScreen.exit()`.
- **API:** `stageUi()` → `{ full: s.full, fullScreen: fullScreen.isOn(), sidebar: !!(s.sidebar && s.sidebar.isOpen()), overlay: s.overlay ? s.overlay.kind : null }` for the current session, else `null` (R22).

- [ ] **Step 1: Write the failing tests** (`band-runtime.test.mjs`). Extend `setup()` with these options and recorders:
  - `doc.documentElement.requestFullscreen` (records, sets `doc.fullscreenElement`), `doc.exitFullscreen` (records, clears it), `fullscreenchange` via the doc's listeners
  - `#v3-sidebar` with `a[data-v3-nav="settings"]`, `a[data-v3-nav="songs"]`, `a[data-v3-nav="build_a_band"]`, each with a recording click listener
  - `#settings`
  - `fb.pauseForOverlay` (returns `{ wasPlaying: true, gen: 1 }`) and `fb.resumeAfterOverlay` (records)
  - `win._confirmDialog` (returns a controllable promise)
  - `win.setLoopStart` / `setLoopEnd` / `clearLoop` and `fb.getLoop`
  - `win.requestExitSong`; `win.noteDetect.setInputErrorsQuiet` / `isInputErrorsQuiet`

  The tests:
  - `full screen on: Go asks once, Play again keeps it, Next song leaves it`:
    - after `loadSong`: one request, and `player` has `bab-full`
    - `song:ended`, `rt.again()`, `loadSong`: still one request, no exit
    - `song:ended`, `rt.next()`: one exit, and `player` lacks `bab-full`
  - `full screen off: no request until the chrome's Full screen button`:
    - `fullScreenStage: false` gives 0 requests
    - clicking `.bab-chrome-full` gives one request and `bab-full`
    - clicking again gives one exit and no `bab-full`
  - `leaving browser full screen turns full mode off`: after a full Go, clear `fullscreenElement` and fire `fullscreenchange`: `rt.stageUi().full === false`, and `player` lacks `bab-full`.
  - `M opens the sidebar; Escape closes it and stays in the song` (Review Focus 2):
    - a `KeyM` keydown on `win` adds `bab-sidebar-open`
    - an Escape keydown is `defaultPrevented`, closes it, `rt.phase() === 'playing'`, and `calls.showScreen` is empty
  - `Settings from the sidebar pauses, shows over the stage and resumes with the same token` (Review Focus 4):
    - a sidebar `click` with `target` the settings link → `pauseForOverlay` once, body `bab-settings-over`, `rt.stageUi().overlay === 'settings'`, phase `playing`
    - call `win.highway.setMastery(0.9)` (standing in for core's settings load), then an Escape keydown on `win`
    - the last `setMastery` is `0.5` (medium), and `resumeAfterOverlay` was called once with `{ wasPlaying: true, gen: 1 }`, after that `setMastery`
  - `another item asks first: Stay resumes, Leave follows the link`:
    - songs link, prompt resolves `false` → `resumeAfterOverlay` once, and the link's listener didn't run
    - songs link again, prompt resolves `true` → the link's listener ran once, and no second resume
    - `build_a_band` link → the prompt is called too
  - `no confirm dialog in core: the item is followed directly`.
  - `every exit closes the sidebar, Settings and full screen` (Review Focus 1): open Settings, then `fb.emit('song:stop')`:
    - the body has neither class, and `#settings` has no `role`
    - `resumeAfterOverlay` is not called, and one exit
    - `rt.stageUi() === null`
    - the same with the leave prompt open: resolving `false` after `song:stop` resumes nothing
  - `note_detect stays quiet in a band song and the band says why`:
    - after a guitar Go, `setInputErrorsQuiet(true)` (previous value `false`)
    - `fireWin('notedetect:input-error', d)` twice with one detail → one toast `Guitar input couldn't start`
    - `{ isDefault: false }` → none
    - teardown → `setInputErrorsQuiet(false)`
  - `the loop button cycles start, end and clear`: three clicks call `setLoopStart`, `setLoopEnd`, `clearLoop` in order, and the button text follows `Loop B`, `Clear loop`, `Loop A`.
  - `End asks core to leave the song`: `.bab-chrome-end` click → `requestExitSong` once.
  - `without core's overlay API the band pauses and resumes with togglePlay`: no `fb.pauseForOverlay`, `fb.isPlaying = true` → `togglePlay` once at open. Set `fb.isPlaying = false`, close → `togglePlay` once more.
  - `the sidebar, M and the chrome exist only while the song plays`: after `song:ended` (results), `KeyM` adds no class, and `.bab-chrome` is gone after `next()`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block. Add the README section.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, every earlier runtime test included.
- [ ] **Step 5: Commit** `feat: band songs get full screen, the hover chrome, the sidebar and Settings over the paused song`.

### Task 9: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 7, and records results and commit SHAs in the plan 7 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`.
- **Nothing may play.** Autoplay is held, `#audio` is muted, and the song stays paused, so `resumeAfterOverlay` never counts in.
- **Judgments are synthetic bus emits only.** Never MIDI, never a drum letter key.
- **Keys go on `window`** (`window.dispatchEvent(new KeyboardEvent('keydown', {..., cancelable: true}))`) unless a step says otherwise, so core's document listeners never see them.
- **Screenshots:** `node /private/tmp/claude-501/bab/shot.mjs /private/tmp/claude-501/bab/p7-<name>.png`.
- **Go with user activation:** `/private/tmp/claude-501/bab/gesture.mjs`, a copy of `cdp.mjs` with `userGesture: true` in the `Runtime.evaluate` params, evaluating `document.querySelector('.bab-go').click()`.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with every repo on `feature/build-a-band-stage`: core, build-a-band, drums, note_detect, lyrics_karaoke, stems, scorecard.
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, else start `launch-debug.sh`. Never quit a running copy: if one blocks, record "acceptance blocked" and stop.
  3. Reload with `debug/cdp-reload.mjs`.
- [ ] **Step 2: Snapshot and guard.**
  1. Record `build_a_band.prefs.v1`, `confirmExitSong`, `countdownBeforeSong` and `drums_kbd`.
  2. Set `fullScreenStage: true`, `failMode: 'nofail'`, `parts.drums.soundMode: 'rockband'`, `parts.vocals.hearMyself: false`, and guitar, drums and vocals on.
  3. Arm `guard.js`.
  4. Wrap `navigator.mediaSession.setActionHandler` to log `[action, typeof handler]` into `window.__p7media` and still call through.
  5. Confirm these are functions: `feedBack.pauseForOverlay`, `feedBack.resumeAfterOverlay`, `noteDetect.setInputErrorsQuiet`.
- [ ] **Step 3: Full screen and hover chrome.** Pick the plan 5/6 acceptance song (drums chart, vocal pitch, stems with `drums`). Go through `gesture.mjs`.
  1. Check:
     - `document.fullscreenElement === document.documentElement`
     - `#player.bab-full`
     - `getComputedStyle(#v3-railzone).display === 'none'`
     - `.bab-lanes` computed `bottom` is `0px`
     - `__buildABandRuntime.stageUi()` is `{full: true, fullScreen: true, sidebar: false, overlay: null}`

     Record `outerWidth/outerHeight` against `screen` (native full screen engaged, or not: R2).
  2. Dispatch `mousemove` on `#player`. `#player.chrome-active` is set, and these are displayed:
     - `.bab-chrome`
     - `#hud-time` (with text)
     - `#player-hud`, with its first child and `#v3-live-performance-hud` computed `display: none`
     - `#section-map`, when the section map plugin is loaded

     Screenshot `p7-chrome`.
  3. Click `.bab-chrome-full` through `gesture.mjs`: `fullscreenElement === null`, no `bab-full`, the rail zone is displayed. Click again: back in full screen.
- [ ] **Step 4: Sidebar.**
  1. `KeyM` on `window`: `body.bab-sidebar-open`; `#v3-sidebar` computed `position: fixed`, `z-index: 150`. Screenshot `p7-sidebar`.
  2. Escape on `window`: closed, and `rt.phase() === 'playing'`, active screen `player`.
  3. `pointerenter` on `.bab-edge` opens it; `pointerleave` on `#v3-sidebar` closes it.
- [ ] **Step 5: Settings over the paused song.**
  1. Open the sidebar and `.click()` `a[data-v3-nav="settings"]`. Check:
     - `body.bab-settings-over`; `#settings` has `role="dialog"` and `aria-modal="true"`
     - active screen `player`; `rt.phase() === 'playing'`; `#audio.paused`
     - the drum lane is still mounted
     - `__p7media` logged `play` with `function`

     Screenshot `p7-settings`.
  2. A Space keydown on `window` is `defaultPrevented`, and the guard log has no `song:play`.
  3. Escape on `window`:
     - the overlay is gone, `#settings` has no `role`, `stageUi().overlay === null`
     - `highway.getMastery() === 0.5`
     - no `count-in:tick` fired (count them with a bus listener armed before the Escape), and `#audio.paused`
     - `__p7media` logged `play` with `object` (null)
- [ ] **Step 6: Leave prompt.**
  1. Sidebar → `a[data-v3-nav="songs"]`: a `.feedBack-modal[role="alertdialog"]` titled `Leave the song?` shows, still on the player. Click `[data-cancel]`: the modal is gone, and phase is `playing`.
  2. Repeat, clicking `[data-confirm]`:
     - the active screen is `v3-songs` and `rt.phase() === 'idle'`
     - `document.fullscreenElement === null`
     - `body` has no `bab-sidebar-open` or `bab-settings-over`
     - `#player` lacks `bab-stage` and `bab-full`
- [ ] **Step 7: Results, M4, M5, awards, note_detect, stems a11y.** Back on the band screen, Go through `gesture.mjs`.
  1. `noteDetect.isInputErrorsQuiet() === true`. Fire `window` `notedetect:input-error {message: 'acceptance', isDefault: true}`: one toast `Guitar input couldn't start`.
  2. Emit `drums:miss` on the band drum canvas: the stems drums button (`[aria-label^="drums stem"]`) has `aria-pressed="false"` and its label says `muted`. Emit `drums:hit`: `aria-pressed="true"`.
  3. Emit 14 `drums:miss`, then `song:ended`:
     - the results show
     - `.bab-card[data-part="drums"] .bab-award` is absent
     - `__p7media` logged `play` with `function`
  4. With `drums_kbd` not `'false'`, dispatch Enter on `window`: the band screen is active (Next song). Record whether the drum lane was the focused drums instance, which decides whether this check discriminates.
  5. `__p7media` logged `play` with `object`. `noteDetect.isInputErrorsQuiet()` is back to its Step 2 value.
- [ ] **Step 8: No activation, and gamepad Escape.**
  1. Go with plain `cdp.mjs` (no gesture): `document.fullscreenElement === null`, but `#player.bab-full` is set (R2 fallback).
  2. Set `confirmExitSong = '0'`. Dispatch `new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true})` on `document.activeElement || document`, as gamepad.js does:
     - the active screen is `plugin-build_a_band`, not `v3-home`
     - `rt.phase() === 'idle'`

     A `v3-home` result records the R13 core follow-up in the ledger.
- [ ] **Step 9: Clean up.**
  1. Restore the Step 2 values and the `setActionHandler` wrapper.
  2. Leave full screen if it's still on, and leave the band screen.
  3. Confirm nothing plays, `feedBack.isPlaying === false`, the mic is off (`lyricsKaraokeDiag().micState === 'off'`), and no Build-a-Band claim remains.
  4. Record results, screenshots and SHAs in the ledger. Message session `local_a47cfbea-3694-4e5f-a466-ad524d2216a8` per MASTER.md.

---

## Deviations from the spec in this plan

- **No feedBack-desktop change** (R3). HTML full screen on the document replaces the new renderer call, and it never touches the start-full-screen preference.
- **The sidebar and Settings are plugin overlays** over `#player` (R7, R9). Core gains only `pauseForOverlay` / `resumeAfterOverlay` (R10).
- **The Build-a-Band sidebar entry asks to leave** like every non-Settings item (R8). The band's mid-song settings already live on the stage.
- **The left edge opens the sidebar only in full mode** (R7). Windowed, it stays core's tool rail; `M` and Menu work in both.
- **Esc on the stage still leaves the song** (R4). Inside the sidebar or Settings it closes them.
- **Gamepad Escape needs no change** (R13). It is rechecked live.

## Later

Beyond Build-a-Band, the known follow-ups are separate projects with their own designs, both out of scope here:
- **Plastic-controller "Clone Hero mode":** 5-fret guitar and bass, then controller drums.
- **Cross-machine play.**
