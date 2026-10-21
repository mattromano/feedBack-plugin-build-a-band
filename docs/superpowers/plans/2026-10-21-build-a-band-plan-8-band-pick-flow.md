# Build-a-Band Plan 8: the band song-pick flow (Setup → Song Library → Confirm → GO)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matt's v1.1 feedback: "I would like to add a browse screen to choose a song, not a search drop down … Even the current browse selections is confusing if I even selected a song or not."
- The band screen splits into **Band setup** (who plays on what) and **Confirm** (the chosen song, each part's arrangement, difficulty, device and drum sound, then GO).
- Between the two, the band picks from **core's own Song Library grid** in a pick mode:
  - band filter chips
  - a card click that selects instead of playing
  - a clear **Selected** badge
  - **Use this song**
- The search dropdown and Recent list go.

**Architecture:**
- **One small, generic, additive core hook:** `feedBack.library.pick({ title, filters, selected, returnTo, … }) → Promise<{ item, filters, reason }>`.
  - Its session lives in a new testable file, `static/v3/library-pick.js`.
  - `static/v3/songs.js` gains a pick mode modelled on its existing select mode: a capture-phase card guard, a body-mounted bar, and a window re-render on change. The chips' params go into its `queryParams`.
- **The plugin** replaces its picker with two views on the same plugin screen and calls the hook.
- **Next song** goes straight to the pick.

**Tech Stack:** Vanilla JS (classic scripts in core, ES modules in the plugin), node:test, CSS. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-build-a-band-design.md` (this repo), section **"Song pick flow (v1.1)"** at the end. It replaces "Song picker and filters" and User flow step 2 where they differ.

The binding rulings are in `.superpowers/sdd/plan-8-inputs.md` (R1–R19 and the verified facts). Where the spec and a ruling differ, the ruling wins.

**This is plan 8, the v1.1 follow-up.** Plans 1–7 have landed.

## Global Constraints

- **Repos and branches.** Repos are under `~/Desktop/repos/feedback-upstream/`, and every one is on `feature/build-a-band-stage`.

  | Repo | Head at plan start | Tasks |
  |---|---|---|
  | core `feedBack` | `da292cf` | 1, 2 |
  | `feedBack-plugin-build-a-band` | `075c63d` + this plan | 3, 4, 5 |
  | every other repo | read-only | — |

- **Commits:**
  - `git -c user.name=mattromano -c user.email=42412983+mattromano@users.noreply.github.com commit -s -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
  - One commit per task.
- **Line endings:**
  - **core `static/v3/songs.js` is CRLF.** Edit it with a script that reads and writes bytes and keeps `\r\n` on every line you add. Check with `file` before and after: it must still say `with CRLF line terminators`. `git diff --stat` must not show a whole-file rewrite.
  - Everything else touched is LF.
- **Test commands:**
  - core: `npm run test:js`
  - build-a-band: `npm test`
- **NO SOUND:**
  - Nothing here plays audio, and no task launches the app.
  - Task 6 is the controller's silent check. `playSong` is wrapped with a recording no-op before any card click, and no card is clicked outside pick mode.
- **No push**, no PRs, no new GitHub repos. The controller pushes the feature branches after Task 6.
- **Values (rulings):**
  - **Copy:**
    - Pick title: `Pick a song for the band`. Use: `Use this song`. Back: `Back to the band`. Core defaults: confirm `Use this song`, back `Back`.
    - Bar selection: `Nothing selected yet`, `Selected: <title> — <artist>` (`Selected: <title>` when there is no artist). Not local: `Only songs on this machine can be picked`.
    - Card badge: `Selected`.
    - Chips, in order: `Playable by band`, `Drum stem`, `Drum chart`, `Vocal pitch`, `Guitar part`, with ids `playable`, `drumStem`, `drums`, `vocals`, `guitar`.
    - **Setup:**
      - heading `Band setup`
      - buttons `Choose a song` and `Continue with <title>`
      - hints: `Turn on a part` (no part on), `Update feedBack to pick songs here` (no core hook), otherwise empty
    - **Confirm:**
      - buttons `Change song`, `Band setup`, `GO`
      - hints `Press Space or hit any pad to start` / `Turn on a part`
      - device line `<Input|Kit|Mic>: <device label>`, or `<Input|Kit|Mic>: none picked`
  - **Chip params:**
    - `playable`: the on parts' params (guitar `arrangements_has: 'Lead,Rhythm,Bass'`, drums `has_drums: '1'`, vocals `has_lyrics: 'pitch'`)
    - `drumStem`: `{ stems_has: 'drums' }`
    - `drums`: `{ has_drums: '1' }`
    - `vocals`: `{ has_lyrics: 'pitch' }`
    - `guitar`: `{ arrangements_has: 'Lead,Rhythm,Bass' }`
  - **Events:** `library:pick-changed` `{ active: boolean }`.
  - **Ids and attributes:**
    - `#v3-songs-pickbar`, `[data-pick-title]`, `[data-pick-filter]`, `[data-pick-selected]`, `[data-pick-back]`, `[data-pick-use]`, `[data-pick-badge]`
    - plugin: `#build-a-band-root[data-view="setup"|"confirm"]`

## Review Focus

1. **A card click in pick mode can never play.** That covers the body, the arrangement chips, ⋮, right-click, gamepad Enter, the tree view and the artist page. (Task 2 guard tests; Task 6 `playSong` wrapper count.)
2. **Library users who never pick see no change:** no bar, the same query, the same saved prefs, the same scroll restore. (Task 2 "no session" tests.)
3. **Every way out of a pick resolves exactly once** (Use, Back, Esc, the sidebar, a second pick), and none of them navigates twice. (Task 1 tests.)
4. **Go fires only on Confirm.** Space and pads on Setup or in the library don't start a song. (Task 4 tests.)
5. **The CRLF file stays CRLF**, with a minimal diff. (Task 2 Step 5.)

---

### Task 1: Core: `feedBack.library.pick` and its session

**Repo:** core `feedBack` (R2, R3, R8, R9, R18)

**Files:**
- Create: `static/v3/library-pick.js` (LF), `tests/js/library_pick.test.js`
- Modify:
  - `static/v3/index.html`: add `<script defer src="/static/v3/library-pick.js"></script>` on the line before the songs.js script (1352), with an HTML comment `<!-- Before songs.js: the library pick session (feedBack.library.pick). -->`
  - `docs/plugin-v3-ui.md`: a new section, R18

**Interfaces** (`library-pick.js`, an IIFE in the `tuner-core.js` pattern: `(function (root) { … })(typeof window !== 'undefined' ? window : null)`, CommonJS `module.exports = { createLibraryPick, mergeParams, isPickBackKey }`):
- **`mergeParams(filters) -> { [key]: string }`:**
  - Over the chips with `on === true`, in order, copies each `params` entry.
  - When a key is already set, the two comma lists are unioned in first-seen order, with duplicates dropped.
  - Non-string values are skipped.
- **`createLibraryPick({ emit, showScreen, songsScreen = 'v3-songs' }) -> api`:**
  - **`pick(opts) -> Promise<{ item, filters, reason }>`:**
    - An open session first ends with `'replaced'`.
    - `filters` is normalised: entries without a string `id` and `label` are dropped, `on` becomes `!!on`, and `params` becomes a plain object.
    - Defaults: `title = ''`, `confirmLabel = 'Use this song'`, `backLabel = 'Back'`, `returnTo = null`.
    - `selected`: when `opts.selected` has a string `filename`, it is `{ ...opts.selected }`, else `null`.
    - Emits `library:pick-changed { active: true }`, then calls `showScreen(songsScreen)` when it's a function. A throw is caught.
  - **`session() -> null | { title, confirmLabel, backLabel, filters: [{ id, label, on }], selected }`:** a snapshot copy.
  - **`params()`:** `mergeParams(session filters)`, or `{}`.
  - **`select(item) -> boolean`:** `false` with no session, or when `item.filename` isn't a non-empty string. Otherwise it sets `selected` and emits.
  - **`toggle(id) -> boolean`:** flips that chip's `on`; `false` for an unknown id. Emits.
  - **`confirm() -> boolean`:** `false` without a selection. Otherwise `end('picked')`, then `showScreen(returnTo)` when `returnTo` is set.
  - **`back() -> boolean`:** `false` with no session. Otherwise `end('back')`, then `showScreen(returnTo)` when set.
  - **`onScreenChanged(id)`:** with a session and `id !== songsScreen`, `end('left')` with no navigation.
  - **`end(reason)`** (private): clears the session *before* resolving and emitting. It resolves `{ item: reason === 'picked' ? selected : null, filters: { [id]: on }, reason }` and emits `library:pick-changed { active: false }`.
  - **`handleKey(e, doc) -> boolean`:** `isPickBackKey(e, doc, activeId)` with a session → `back()`, `e.preventDefault()`, and `true`.
- **`isPickBackKey(e, doc, activeId) -> boolean`** (R9). `true` only when all of these hold:
  - `e.key === 'Escape'`, with no `ctrlKey`, `metaKey`, `altKey` or `shiftKey`
  - `!e.defaultPrevented`
  - `activeId === 'v3-songs'`
  - the target isn't `INPUT`, `TEXTAREA` or `SELECT`, and isn't contentEditable
  - `doc.getElementById('v3-songs-overlay')` is absent or has the class `hidden`
  - `doc.querySelector('[role="dialog"][aria-modal="true"], .feedBack-modal')` is `null`
- **Browser bootstrap** (only when `root && root.feedBack`):
  - `const inst = createLibraryPick({ emit: (t, d) => root.feedBack.emit(t, d), showScreen: (id) => root.showScreen && root.showScreen(id) })`
  - `root.feedBack.library = Object.assign(root.feedBack.library || {}, { pick: inst.pick, pickState: inst })`
  - `root.feedBack.on('screen:changed', (e) => inst.onScreenChanged(e && e.detail && e.detail.id))`
  - `root.addEventListener('keydown', (e) => inst.handleKey(e, root.document), false)`. The active id is `document.querySelector('.screen.active')?.id`, passed by `handleKey` to `isPickBackKey`.
- **Docs** (`docs/plugin-v3-ui.md`), a section `## Picking a song from the library (feedBack.library.pick)`:
  - the call, its options and the resolution shape
  - that cards select instead of playing
  - that chip params replace the user's same-key drawer filter while picking
  - Esc = Back
  - leaving the screen resolves `'left'`
  - `pickState` is core-internal

- [ ] **Step 1: Write the failing tests** in `library_pick.test.js` (`require('../../static/v3/library-pick.js')`; a fake `emit` that records, a fake `showScreen` that records):
  - `mergeParams joins on chips and unions a repeated key`: chips `a` on `{x: 'Lead,Rhythm'}`, `b` off `{y: '1'}`, `c` on `{x: 'Rhythm,Bass', z: 'pitch'}` give `{x: 'Lead,Rhythm,Bass', z: 'pitch'}`.
  - `pick opens the songs screen and exposes a session`: after `pick({title: 'T', filters: [{id: 'p', label: 'P', params: {has_drums: '1'}, on: true}], returnTo: 'plugin-x'})`:
    - `showScreen` was called with `'v3-songs'`
    - `emit` got `library:pick-changed {active: true}`
    - `session().title === 'T'` and `confirmLabel === 'Use this song'`
    - `params()` is `{has_drums: '1'}`
  - `select then confirm resolves picked, ends first, then returns`:
    - `select({filename: 'a.sloppak', title: 'A'})` is `true`
    - `confirm()` resolves `{item: {filename: 'a.sloppak', title: 'A'}, filters: {p: true}, reason: 'picked'}`
    - at the time `showScreen('plugin-x')` is called, `session()` is already `null`
  - `confirm without a selection does nothing`: it returns `false`, and the promise is still pending (race it against a resolved sentinel).
  - `select needs a filename`: `select({})` and `select({filename: ''})` are `false`.
  - `back resolves back with null and returns`: `{item: null, reason: 'back'}`, and `showScreen` is called with the return screen.
  - `toggle flips a chip and the result carries it`: `toggle('p')` makes `params()` `{}`. `back()` resolves `filters: {p: false}`. `toggle('nope')` is `false`.
  - `leaving the songs screen resolves left without navigating`:
    - `onScreenChanged('v3-songs')` keeps the session
    - `onScreenChanged('v3-home')` resolves `reason: 'left'` with no extra `showScreen` call
  - `a second pick replaces the first`: the first resolves `reason: 'replaced'`, and the second is open.
  - `a preselected song is kept`: `pick({selected: {filename: 'b'}})` gives `session().selected.filename === 'b'`, and `confirm()` resolves it.
  - `isPickBackKey`. With a fake doc (`getElementById` and `querySelector` maps), true only for a plain Escape on `v3-songs`. False for each of:
    - Shift+Escape
    - `defaultPrevented`
    - an `INPUT` target
    - the overlay without `hidden`
    - an open `.feedBack-modal`
    - `activeId` `'v3-home'`
  - `handleKey goes back and prevents default`.
  - `index.html loads library-pick.js before songs.js`: in the source, the index of `/static/v3/library-pick.js` is lower than the index of `/static/v3/songs.js`.
- [ ] **Step 2: Run** `npm run test:js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block, plus the docs section.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite.
- [ ] **Step 5: Commit** `feat(library): feedBack.library.pick: pick a song from the library grid`.

### Task 2: Core: the Songs screen's pick mode

**Repo:** core `feedBack` (R4–R8; **songs.js is CRLF**)

**Files:**
- Modify: `static/v3/songs.js`
- Test: create `tests/js/v3_songs_pick_mode.test.js` (source checks plus mirrors, the `v3_songs_karaoke_filter` and `v3_songs_window_recycle` patterns)

**Interfaces** (all inside the songs.js IIFE):
- **Helpers** (after `groupingActive`, ~272):
  - `const pickApi = () => (sm && sm.library && sm.library.pickState) || null;`
  - `function pickOn() { const p = pickApi(); return !!(p && p.session()); }`
  - `function pickSelectedKey() { const p = pickApi(); const s = p && p.session(); return (s && s.selected && s.selected.filename) || ''; }`
- **`queryParams` (274-306):** right before `Object.entries(extra || {})…`, add
  `{ const pk = pickApi(); if (pk && pk.session()) Object.entries(pk.params()).forEach(([k, v]) => p.set(k, v)); }`
  (R4: a chip key replaces the drawer's value).
- **State:**
  - `state` gains `pickKey: ''` and `pickPrevView: null`.
  - `buildLibraryStateHash` adds `pick: st.pickKey || ''` to the hashed object.
  - `saveLibraryPrefs` writes `view: state.pickPrevView || state.view`.
- **`libHomeVisible` (649-652)** adds `&& !pickOn()`.
- **`songCard` (856-973):** when `pickOn()` and `pickSelectedKey() === localFilename(song)`:
  - the `[data-v3-play]` div gets ` ring-2 ring-fb-primary` (like `selRing`)
  - it holds `<span data-pick-badge class="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 bg-fb-primary text-white text-xs font-bold px-2 py-0.5 rounded-full pointer-events-none">Selected</span>`
- **`_cardSig` (1968-1970)** appends `(pickOn() ? (state.songs[i] && pickSelectedKey() === localFilename(state.songs[i]) ? 'P' : 'p') : '')`.
- **`pickCard(cardEl)`:**
  - `fn` = `data-fn`; `song = state.songsById[fn]`; `playTarget` = `song.display_chart ? Object.assign({}, song, song.display_chart) : song` (as in 1519); `lf = localFilename(song)`.
  - No `lf` → `renderPickBar('Only songs on this machine can be picked')` and return.
  - `pickSelectedKey() === lf` → `pickApi().confirm()` and return.
  - Else `pickApi().select(Object.assign({}, playTarget, { filename: lf }))`.
- **`bindPickGuard(hostEl)`**, next to `bindSelectGuard`, bound to the same three hosts (3922-3924):
  - capture `click`: when `pickOn()` and the target is inside a `[data-fn]` within the host → `preventDefault()`, `stopImmediatePropagation()`, `pickCard(card)`
  - capture `contextmenu`: the same test, then `preventDefault()` and `stopImmediatePropagation()` only
  - Registered **before** `bindSelectGuard` on each host.
- **`renderPickBar(note)`** (after `renderBatchBar`):
  - Removes `#v3-songs-pickbar` when `!pickOn()` or Songs isn't active.
  - Else builds it per R6:
    - classes `fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-3 bg-fb-card border border-fb-border/60 rounded-2xl shadow-xl px-4 py-2 max-w-[95vw]`, `role="region"`, `aria-label` = the title
    - `[data-pick-title]`
    - each chip as `button[data-pick-filter][aria-pressed]`; pressed uses `bg-fb-primary text-white`
    - `[data-pick-selected]` with `note`, else the R6 text (title and artist from `session().selected`)
    - `[data-pick-back]`
    - `[data-pick-use]`, `disabled` without a selection
  - Text goes through `esc()`.
  - Clicks: a chip → `pickApi().toggle(id)`; back → `back()`; use → `confirm()`.
- **`onPickChanged()`**, on `sm.on('library:pick-changed', …)`:
  1. Compute `const key = pickOn() ? JSON.stringify(pickApi().params()) : ''`.
  2. **Pick started** (`pickOn()` and `state.pickPrevView === null` and the view is `albums`, `table` or `folder`): `state.pickPrevView = state.view; state.view = 'grid'`.
  3. **Pick ended** (`!pickOn()` and `state.pickPrevView !== null`): `state.view = state.pickPrevView; state.pickPrevView = null`.
  4. When `pickOn()` and `state.selectMode`: `setSelectMode(false)`.
  5. **Reload or re-render:**
     - If `key !== state.pickKey` or the view changed: set `state.pickKey = key`, then `reload()` when `songsActive()`, else `_libraryDirty = true`.
     - Else, when `songsActive()`: `requestWindowRender()`.
  6. `syncChromeFromState()` when `songsActive()`, then `renderPickBar()`.
- **`syncChromeFromState` (388-422)**, while `pickOn()`:
  - disables `#v3-songs-select`, `#v3-songs-albums-btn`, `#v3-songs-table-btn` and `#v3-songs-folder-btn`
  - re-enables them otherwise
- **Screen hooks:**
  - The `screen:changed` handler (4519-4531): leaving Songs also removes `#v3-songs-pickbar`.
  - `onV3SongsScreenEnter` ends with `renderPickBar()`, so the bar is up on every entry path, including its early returns. Wrap the body, or call it in each return path.
- **`window.v3Songs`** gains `pickActive: pickOn` (read-only, for acceptance).

- [ ] **Step 1: Write the failing tests** in `v3_songs_pick_mode.test.js`:
  - Source checks on `static/v3/songs.js`:
    - `queryParams` applies `pk.params()` before `extra`: the regex `/pk\.params\(\)\)\.forEach\(\(\[k, v\]\) => p\.set\(k, v\)\)/`, at an index lower than `Object.entries(extra || {})` inside `function queryParams`
    - `libHomeVisible` contains `!pickOn()`
    - `bindPickGuard(byId('v3-songs-grid'))` comes before `bindSelectGuard(byId('v3-songs-grid'))` (and the same for tree and artistpage)
    - `bindPickGuard` handles both `'click'` and `'contextmenu'` with `stopImmediatePropagation`
    - `saveLibraryPrefs` writes `state.pickPrevView || state.view`
    - `buildLibraryStateHash` includes `pick:`
    - `sm.on('library:pick-changed'` exists
    - the badge text `>Selected</span>` with `data-pick-badge`
    - the copy `Only songs on this machine can be picked` and `Nothing selected yet`
  - A mirror of `pickCard` and the guard's decision, with fake `state`, `localFilename` and a recording `pickApi`:
    - an unselected local card → `select` with `filename` = the local file and `display_chart` merged
    - the selected card → `confirm`
    - a remote card with no local filename → neither, and the note is set
  - A mirror of `_cardSig`: a selection move changes the signature of the two cards involved and no other. No session → no pick marker, so the signature equals today's.
  - `CRLF kept`: every `\n` in songs.js is preceded by `\r` (count `\n` vs `\r\n`).
- [ ] **Step 2: Run** `npm run test:js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** to the Interfaces block, preserving CRLF.
- [ ] **Step 4: Run** `npm run test:js`. Expected: PASS, the whole suite (including every existing `v3_songs_*` test).
- [ ] **Step 5: Check** `file static/v3/songs.js` (still `CRLF`) and `git diff --stat static/v3/songs.js` (a few dozen lines, not ~4600). **Commit** `feat(songs): pick mode: cards select for feedBack.library.pick`.

### Task 3: Plugin: pick chips, the `pickFilters` pref and the Confirm model (pure)

**Repo:** `feedBack-plugin-build-a-band` (R12, R13, R10)

**Files:**
- Modify: `src/query.js`, `src/prefs.js`, `src/band-model.js`
- Delete: `src/song-picker.js`, `tests/song-picker.test.mjs`
- Test: `tests/query.test.mjs`, `tests/prefs.test.mjs`, `tests/band-model.test.mjs`

**Interfaces:**
- **`src/query.js`:**
  - Remove `DEFAULT_FILTERS`, `buildLibraryQuery` and `createSearchController`. Keep `songChips` and `resolveRecent`.
  - Add `export const PICK_FILTERS = Object.freeze([['playable', 'Playable by band'], ['drumStem', 'Drum stem'], ['drums', 'Drum chart'], ['vocals', 'Vocal pitch'], ['guitar', 'Guitar part']])`.
  - Add `export function pickFilters({ parts = {}, on = {} } = {}) -> [{ id, label, params, on }]`, with params per the Global Constraints. `playable` is built only from parts with `on === true`; the caller drops vocals when karaoke is missing. Each `on` is `!!on[id]`.
- **`src/prefs.js`:**
  - `PICK_FILTER_DEFAULTS = { playable: true, drumStem: false, drums: false, vocals: false, guitar: false }`.
  - `normalizePrefs` adds `pickFilters`: each key `bool(raw[k], default)`; unknown keys are dropped.
  - `savePrefs` merges `pickFilters` shallowly, like `zoom`.
- **`src/band-model.js`:** `bandScreenModel({ prefs, item, vocalsSupported, noteDetectLoaded, pickAvailable = true })`. The existing fields and notes are unchanged, plus:
  - **`pickEnabled`:** `pickAvailable` and some part is `on` (vocals counts only when `vocalsSupported`).
  - **`setupHint`:**
    - `''` when `pickEnabled`
    - `'Update feedBack to pick songs here'` when `!pickAvailable`
    - else `'Turn on a part'`
  - **`columns.guitar.arrangements`:** `{ Lead, Rhythm, Bass }` booleans, from `guitarArrIndex(songFacts(item).arrangements, name) !== undefined`. All `true` with no item.
  - **`columns.guitar.arrangement`:** the stored arrangement when available, else the first available of Lead, Rhythm, Bass (the `chartFrom` fallback order, parts.js 23-32), else the stored one.
  - **`goHint`:** unchanged values. Confirm shows it; Setup shows `setupHint`.

- [ ] **Step 1: Write the failing tests:**
  - `query.test.mjs`. Replace the `buildLibraryQuery` and `createSearchController` tests with:
    - `pickFilters lists the five chips in order`: the ids and labels exactly as `PICK_FILTERS`.
    - `playable follows the parts that are on`:
      - guitar and drums on, vocals off: params `{arrangements_has: 'Lead,Rhythm,Bass', has_drums: '1'}`
      - all off: `{}`
    - `each chip's own params`: `drumStem` `{stems_has: 'drums'}`, `drums` `{has_drums: '1'}`, `vocals` `{has_lyrics: 'pitch'}`, `guitar` `{arrangements_has: 'Lead,Rhythm,Bass'}`.
    - `on comes from the stored flags`: `on: {playable: true, drumStem: 1}` gives playable and drumStem `true`, the rest `false`.
    - `the removed exports are gone`: `buildLibraryQuery`, `createSearchController` and `DEFAULT_FILTERS` are `undefined` on the module namespace.
  - `prefs.test.mjs`:
    - `pickFilters defaults`: playable `true`, the rest `false`
    - `bad values fall back`: `{playable: 'x', drums: true, bogus: true}` gives playable `true`, drums `true`, and no `bogus`
    - `savePrefs merges pickFilters`: saving `{pickFilters: {drumStem: true}}` keeps `playable: true`
  - `band-model.test.mjs`:
    - `pickEnabled and setupHint`:
      - all parts off: `false`, `Turn on a part`
      - `pickAvailable: false`: `Update feedBack to pick songs here`
      - only vocals on without karaoke: `false`
    - `guitar arrangements grey what the song lacks`: a song with only `Rhythm` gives `{Lead: false, Rhythm: true, Bass: false}`; with the stored `Lead`, the effective arrangement is `Rhythm` and the stored pref is untouched.
    - `no song: every arrangement available`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Delete `src/song-picker.js` and its test. `band-screen.js` still imports `mountSongPicker` until Task 4. So within this task, delete the picker mount in `band-screen.js` (lines 7 and 203-210, plus `picker.refresh()` at 200 and 224). Remove the band-screen tests that drive the picker (164-183, and the recent-list test at 204-…), and remove the `.bab-picker` assertion (62). Task 4 rebuilds the screen.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band pick chips, the pickFilters pref and the Confirm model; drop the search picker`.

### Task 4: Plugin: Band setup and Confirm views, picking through the Song Library

**Repo:** `feedBack-plugin-build-a-band` (R10, R11, R14, R15, R17, R18)

**Files:**
- Modify: `screen.html`, `src/band-screen.js`, `assets/build-a-band.css` (remove the picker block 44-80; add the views), `README.md` (one bullet)
- Test: `tests/band-screen.test.mjs`

**Interfaces:**
- **`screen.html`.** The root is `<div id="build-a-band-root" class="bab-screen" data-view="setup">`, holding two sections.
  - **`<section class="bab-setup">`:**
    - `<h1 class="bab-step">Band setup</h1>`
    - `.bab-cols`: the three `.bab-col[data-part]`, with today's markup **minus** the arrangement and difficulty fields (guitar), the difficulty and drum sound fields (drums) and the difficulty field (vocals). The rest stays: top, input, signal, vocals hear myself, mic hit, note, and the add-a-part slot.
    - `.bab-setupbar`, holding:
      - the Failing seg and the Full screen stage box (moved from today's Go bar)
      - `<span class="bab-setup-hint"></span>`
      - `<button type="button" class="bab-continue" hidden></button>`
      - `<button type="button" class="bab-choose">Choose a song</button>`
  - **`<section class="bab-confirm">`:**
    - `.bab-songhead`: `.bab-art` holding `<img class="bab-art-img" alt="">`; `.bab-songtext` (`.bab-title`, `.bab-artist`); `.bab-chips`; `<button type="button" class="bab-change">Change song</button>`
    - `.bab-parts`: one `.bab-part[data-part]` per part. Each holds:
      - `.bab-top`: `.bab-ico`, `h2.bab-part-name`, `button.bab-toggle`
      - `<div class="bab-part-device"></div>`
      - the moved segs: guitar `arrangement` then `difficulty`; drums `difficulty` then `soundMode`; vocals `difficulty`
      - `.bab-note`
    - `.bab-gobar`: `<button type="button" class="bab-setup-btn">Band setup</button>`, `.bab-hint`, `button.bab-go` `GO`
- **`createBandScreen({ …, library })`.** `library` defaults to `win.feedBack && win.feedBack.library`. `pickAvailable = !!(library && typeof library.pick === 'function')`.
  - **Returns** `{ dispose, setSong, getSong, isVisible, view(), openLibrary(), nextSong() }`.
  - **`view`:** `'setup' | 'confirm'`, starting at `'setup'`. `render()` sets `root.setAttribute('data-view', view)`.
  - **Rendering by part:**
    - Every `[data-part="<id>"] .bab-seg[data-field]` and `.bab-toggle` across both sections renders and saves as today (one loop over `root.querySelectorAll('[data-part="<id>"]')`). Each `.bab-col` and `.bab-part` gets `--bab-c`, its icon and `bab-off` / `bab-unavailable`.
    - The guitar arrangement seg uses `columns.guitar.arrangement` for `aria-pressed` and disables the arrangements that are `false`.
    - The confirm `.bab-part-device`: `${INPUT_LABEL[id]}: ${label}`, where `label` comes from `lists[id]` for the stored key, `Saved device (not found)` when the key isn't listed, and `none picked` for no key.
  - **Setup bar:**
    - `.bab-choose.disabled = !model.pickEnabled`
    - `.bab-setup-hint` = `model.setupHint`
    - `.bab-continue` is shown with text `Continue with ${title || filename}` only while `lastSong` resolved to an item and `song` is set. It sets `view = 'confirm'`.
  - **Confirm:**
    - `.bab-art-img.src` = `/api/song/${encodeURIComponent(song.filename)}/art`, hidden on `error`
    - `.bab-change` → `openLibrary()`
    - `.bab-setup-btn` → `view = 'setup'`
    - `.bab-hint` / `.bab-go` as today
  - **`openLibrary()`:**
    - No-op unless `pickAvailable && model.pickEnabled && !disposed`.
    - `const gen = ++pickGen`. The parts are the same karaoke-filtered parts as today (band-screen.js 205-206).
    - The call: `library.pick({ title: 'Pick a song for the band', filters: pickFilters({ parts, on: prefs.pickFilters }), selected: song ? { filename: song.filename } : null, returnTo: SCREEN_ID, confirmLabel: 'Use this song', backLabel: 'Back to the band' })`.
    - On the result, when `gen === pickGen && !disposed`:
      1. `save({ pickFilters: result.filters })` when it is an object.
      2. With `result.item`: `setSong(result.item)`, `view = 'confirm'`, `render()`.
      3. Then `resolveRecent({ filename, title }, getJson)`. When it returns an item whose filename equals the current song's, `song = it` (no prefs write) and `render()` (R14).
    - A throw or rejection is caught and logged with `console.warn('[build-a-band] library pick failed', err)`.
  - **`nextSong()`:**
    - `view = 'confirm'`.
    - With `shown()` → `openLibrary()`. Else `pendingPick = true`.
    - `show()` ends with `if (pendingPick) { pendingPick = false; openLibrary(); }`.
  - **Go only on Confirm (R15):**
    - `go()` returns `false` unless `view === 'confirm'`.
    - `padHit` flashes as today and calls `go()` (which refuses on Setup).
    - The Space listener requires `view === 'confirm'`.
  - **Esc on Confirm (R11):** the same doc keydown listener. With `e.key === 'Escape'`, no modifiers, not `e.repeat`, `visible && isActive()`, `view === 'confirm'`, and the active element not a text entry → `openLibrary()` and `e.preventDefault()`.
  - **`lastSong` restore (517-522):** unchanged; it also renders the Continue button.
- **CSS:**
  - `.bab-screen[data-view="setup"] .bab-confirm, .bab-screen[data-view="confirm"] .bab-setup { display: none; }`
  - `.bab-art-img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }` and `.bab-songhead .bab-art { width: 120px; height: 120px; }` within `.bab-confirm`
  - `.bab-parts`: a row of three cards, styled like `.bab-col`
  - `.bab-choose` and `.bab-go`: the Go button's primary style
  - `.bab-change`, `.bab-setup-btn`, `.bab-continue`: secondary buttons like `.bab-findkit`
  - `.bab-guitar` arrangement buttons: `:disabled` dimmed, using the existing disabled seg style
  - Remove the picker block (44-80).
- **README:** one bullet under a new heading `## Picking a song`. Setup → **Choose a song** opens the Song Library in pick mode (band chips, click to select, **Use this song**) → Confirm (parts, difficulty, devices, drum sound) → GO. Next song goes back to the library.

- [ ] **Step 1: Write the failing tests** (`band-screen.test.mjs`). `setup()` gains `library`: a fake `{ pick(opts) { calls.push(opts); return new Promise((r) => { resolveLast = r; }); } }`, passed as `library`. The fake `fetchJson` returns `{ songs: library }`.
  - `opens on Band setup with no song controls`: `root.getAttribute('data-view') === 'setup'`; no `.bab-search` and no `.bab-picker`; setup columns have no `difficulty` seg; `.bab-part[data-part="guitar"]` has `arrangement` and `difficulty` segs; `.bab-choose` is enabled; `.bab-setup-hint` is empty.
  - `Choose a song asks core with the band chips`: click `.bab-choose`, then the single pick call has:
    - `title: 'Pick a song for the band'`, `returnTo: 'plugin-build_a_band'`, `confirmLabel: 'Use this song'`, `backLabel: 'Back to the band'`, `selected: null`
    - filter ids `['playable', 'drumStem', 'drums', 'vocals', 'guitar']`; `playable` on, with params including `has_drums: '1'` and `arrangements_has: 'Lead,Rhythm,Bass'` (karaoke absent, so no `has_lyrics`)
  - `a picked song lands on Confirm, re-resolved`: resolve `{ item: holidayGrouped, filters: { playable: true, drumStem: true }, reason: 'picked' }`, then:
    - view `confirm`; `.bab-title` `Holiday`
    - `.bab-art-img.src` ends with `/api/song/sloppak%2Fgreeholi.sloppak/art`
    - `prefs().lastSong.filename` set; `prefs().pickFilters.drumStem === true`
    - after a flush, `urls` includes a `/api/library?q=Holiday` request, and the song is the full row (`holiday`)
  - `Back from the library keeps the view and song`: with a song on Confirm, `.bab-change` → resolve `{ item: null, filters: {…}, reason: 'back' }`. The view stays `confirm`, the song is unchanged, and the pick was called with `selected: { filename: holiday.filename }`.
  - `Esc on Confirm opens the library; Esc on Setup does nothing`.
  - `Go only on Confirm`:
    - on Setup, a Space keydown and a pad hit call `onGo` 0 times
    - on Confirm, Space calls it once
    - the existing burst test still gives one call
  - `Band setup returns to Setup and Continue with goes to Confirm`: with a stored `lastSong` that resolves, `.bab-continue` is not hidden and its text is `Continue with Holiday`; a click gives view `confirm`. `.bab-setup-btn` gives `setup`.
  - `Confirm greys what the song lacks`: a song with only `Rhythm`:
    - the `Lead` and `Bass` buttons are disabled and `Rhythm` is pressed
    - a song without a drum stem disables `rockband` and `kit` (the existing test, now on `.bab-part`)
    - a song without vocal pitch gives `.bab-part[data-part="vocals"]` the class `bab-unavailable`
  - `the device line names each part's device`: after device lists load (the existing device-list fixture), the guitar line reads `Input: <label>`; with no key, `Input: none picked`.
  - `without the core hook, picking is off`: `library: null` gives `.bab-choose.disabled` and the hint `Update feedBack to pick songs here`.
  - `nextSong opens the library now when visible, else on the next show`.
  - `a stale pick result is ignored`: two `openLibrary()` calls, the first resolved last with an item → no song change.
  - Update every existing test that read `.bab-col … difficulty`, `soundMode` or `arrangement` to read `.bab-part`. The column, device, light and mic-hit tests stay on `.bab-col`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces block (screen.html, band-screen.js, CSS, README).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: band setup, the Song Library pick and Confirm before GO`.

### Task 5: Plugin: Next song goes to the library pick

**Repo:** `feedBack-plugin-build-a-band` (R16)

**Files:**
- Modify: `src/band-runtime.js` (signature 108-111, doc comment 97-107, `showBandScreen` 1204-1208), `screen.js` (23, 34-41)
- Test: `tests/band-runtime.test.mjs`

**Interfaces:**
- `createBandRuntime({ …, onShowBandScreen })`: an optional function.
- `EFFECTS.showBandScreen`:
  - runs its current body
  - then, in both the already-active path and after `showScreen`, calls `safe(() => onShowBandScreen && onShowBandScreen())`
  - It runs only for the `next` event (session.js 34), never for Play again or leaving.
- `screen.js`: `createBandRuntime({ …, onShowBandScreen: () => { const bs = window.__buildABandScreen; if (bs && typeof bs.nextSong === 'function') bs.nextSong(); } })`.

- [ ] **Step 1: Write the failing tests** (`band-runtime.test.mjs`, the existing `setup()` with a results session):
  - `Next song calls onShowBandScreen once`: drive a session to `ending`, then `rt.next()` → called once, after the `showScreen('plugin-build_a_band')` record.
  - `the band screen already active still calls it`.
  - `Play again and leaving never call it`.
  - `a throwing onShowBandScreen doesn't break Next song`: the phase is `idle`, and `releaseExit` still ran.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Next song goes straight to the band's song pick`.

### Task 6: Silent real-app acceptance (controller only)

No code and no questions to Matt. The controller runs this alone, silently, at the end of plan 8, and records results and commit SHAs in the plan 8 ledger. The tooling is in `slopsmith-custom/feedback-fork/debug/README.md`.
- **Nothing may play:**
  - Autoplay is held (`/private/tmp/claude-501/bab/guard.js`), and `#audio` is muted.
  - `window.playSong` is wrapped with a recording no-op from Step 2 until Step 7's Go, and again from Step 8.
  - No card is ever clicked outside pick mode.
- **Keys go on `window`** (`window.dispatchEvent(new KeyboardEvent('keydown', {..., cancelable: true}))`).
- **Screenshots:** `node /private/tmp/claude-501/bab/shot.mjs /private/tmp/claude-501/bab/p8-<name>.png`.
- **Go with user activation:** `/private/tmp/claude-501/bab/gesture.mjs`, evaluating `document.querySelector('.bab-go').click()`.

- [ ] **Step 1: Install.**
  1. Run `slopsmith-custom/feedback-fork/dev-sync.sh --no-restart` with core and build-a-band on `feature/build-a-band-stage` (the other repos unchanged since plan 7).
  2. Attach `cdp.mjs` to the debug instance on port 9333 if one is up, else start `launch-debug.sh`. Never quit a running copy: if one blocks, record "acceptance blocked" and stop.
  3. Reload with `debug/cdp-reload.mjs`.
- [ ] **Step 2: Snapshot and guard.**
  1. Record `build_a_band.prefs.v1` and `v3:songs-prefs`.
  2. Set guitar, drums and vocals on, `fullScreenStage: false`, `parts.vocals.hearMyself: false`.
  3. Arm `guard.js`.
  4. Wrap `window.playSong` as `window.__p8play = []; const orig = window.playSong; window.playSong = (...a) => { window.__p8play.push(a); }`, keeping `orig` on `window.__p8orig`.
  5. Confirm `typeof feedBack.library.pick === 'function'`.
  6. Pick the plan 5–7 acceptance song (drums chart, vocal pitch, stems with `drums`) and one song **without** a drum stem. Record both filenames.
- [ ] **Step 3: Band setup.**
  1. `showScreen('plugin-build_a_band')`. Check:
     - `#build-a-band-root[data-view="setup"]`
     - no `.bab-search`; no difficulty seg in `.bab-setup`
     - `.bab-choose` enabled

     Screenshot `p8-setup`.
  2. Space on `window`: `__buildABandRuntime.phase() === 'idle'`.
- [ ] **Step 4: The library pick.**
  1. Click `.bab-choose`. Check:
     - the active screen is `v3-songs`
     - `#v3-songs-pickbar` shows `Pick a song for the band` and five chips, with `[data-pick-filter="playable"][aria-pressed="true"]`
     - `[data-pick-selected]` is `Nothing selected yet`; `[data-pick-use]` is disabled
     - `#v3-lib-home` is hidden
     - the last `/api/library?` resource URL (`performance.getEntriesByType('resource')`) contains `has_drums=1` and `arrangements_has=`

     Screenshot `p8-library`.
  2. `v3Songs.search('<acceptance song title>')`, then click that card's `[data-v3-play]`. Check:
     - `__p8play.length === 0`; the guard log has no `song:loading`
     - the card has `[data-pick-badge]` with text `Selected`
     - `[data-pick-selected]` starts with `Selected: `; `[data-pick-use]` is enabled

     Screenshot `p8-selected`.
  3. Right-click (`contextmenu`) and an arrangement chip click on another card: no menu opens, `__p8play.length === 0`, and the selection moves to that card. Re-select the acceptance song.
  4. Click `[data-pick-filter="drumStem"]`: it is pressed, and the next `/api/library?` URL contains `stems_has=drums`.
- [ ] **Step 5: Back, Use and Confirm.**
  1. Escape on `window`: the band screen is active, `data-view="setup"`, `feedBack.library.pickState.session() === null`, and `#v3-songs-pickbar` is gone.
  2. `.bab-choose` again (`prefs.pickFilters.drumStem === true` is kept, and the chip shows pressed). Select the acceptance song and click `[data-pick-use]`. Check:
     - `data-view="confirm"`; `.bab-title` is the song
     - `.bab-art-img` has a `src`
     - three `.bab-part` rows with device lines; Go enabled

     Screenshot `p8-confirm`.
  3. `.bab-change`: the library opens with that card already `[data-pick-badge]` and Use enabled. `[data-pick-back]`: back on Confirm with the same song.
  4. Escape on `window` while on Confirm: the library opens. Escape again: Confirm.
  5. Pick the **no-drum-stem** song: on Confirm, the drums `rockband` and `kit` buttons are disabled. Toggle drums off on Confirm: `.bab-part[data-part="drums"].bab-off`, and `prefs.parts.drums.on === false`. Toggle it back. Re-pick the acceptance song.
- [ ] **Step 6: Leaving a pick through the sidebar.** `.bab-change`, then `.click()` `a[data-v3-nav="home"]`. Check that `pickState.session() === null`, no `#v3-songs-pickbar` exists, and `__p8play.length === 0`. Return with `showScreen('plugin-build_a_band')`: the view is still `confirm`.
- [ ] **Step 7: Go, results, Next song.**
  1. Restore `playSong = __p8orig`. Go through `gesture.mjs`. `rt.phase()` reaches `playing` (the guard holds autoplay).
  2. Emit `song:ended`: the results show.
  3. Wrap `playSong` again. Dispatch Enter on `window` (Next song). Check:
     - the active screen is `v3-songs` with `#v3-songs-pickbar` up
     - the acceptance song card is badged `Selected`
     - `__p8play.length === 0`
  4. `[data-pick-back]`: the band screen is on `confirm` with the song just played.
- [ ] **Step 8: The library without a pick.** `showScreen('v3-songs')`. Check:
  - no `#v3-songs-pickbar`; `v3Songs.pickActive() === false`
  - the last `/api/library?` URL has no `has_drums` unless the user's drawer set it
  - `v3:songs-prefs` equals the Step 2 snapshot (view included)

  Click no cards.
- [ ] **Step 9: Clean up.**
  1. Restore the Step 2 values and `playSong`.
  2. Leave the band screen.
  3. Confirm nothing plays, `feedBack.isPlaying === false`, and the mic is off (`lyricsKaraokeDiag().micState === 'off'`).
  4. Record results, screenshots and SHAs in the ledger, and update MASTER.md (Plan 8 DONE with heads). The controller then pushes `feature/build-a-band-stage` in core and build-a-band.

---

## Deviations from the spec in this plan

- **The song picker on the band screen is gone** (R13). The band picks from core's Song Library in a pick mode (R2). The v1.1 section of the spec records this.
- **Difficulty, arrangement and drum sound move from the band screen's columns to Confirm** (R10). Devices, signal checks, hear-myself and mic-hit stay on Setup.
- **Space and pads start the song only on Confirm** (R15). The spec's "Space or any drum pad also starts" now applies to that view.
- **Next song goes to the library pick, not the band screen** (R16).
- **`pick` resolves `{ item, filters, reason }`** rather than `item | null` (R3).
- **No Recent row** (R13). `recentSongs` is still recorded.

## Later

- A "Recent" shelf on Confirm or in the pick bar, if Matt asks for one.
- The pick hook is generic: playlists or a set-list builder could use it later.
