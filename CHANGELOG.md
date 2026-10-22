# Changelog

## [0.2.0] - Unreleased

### Added
- RockHeroSmith is a core play mode: a hero on Home (wordmark art and **Play RockHeroSmith**), a **RockHeroSmith** button on band-ready library cards, Press Start on a free controller, and a tour step. Needs a core with `feedBack.ui.registerPlayMode`; older cores are unaffected.

### Changed
- Renamed Build-a-Band to RockHeroSmith (id `rockherosmith`, screen `plugin-rockherosmith`); saved band setups move from `build_a_band.prefs.v1` on first load (the old key is kept).

### Deprecated
- `window.__buildABandRuntime` / `__buildABandScreen` (use `__rockherosmith*`).
