# Changelog

## [0.2.0] - Unreleased

### Added
- RockHeroSmith is a core play mode: a hero on Home (wordmark art and **Play RockHeroSmith**), a **RockHeroSmith** button on band-ready library cards, Press Start on a free controller, and a tour step. Needs a core with `feedBack.ui.registerPlayMode`; older cores are unaffected.
- **Play as** entry for core's library menus (`libraryCardActions`, placement `play-as`): RockHeroSmith opens the band screen with the song, on band-ready songs (greyed out while a session runs).
- Rock Band miss sound: a controller player in Rock Band part audio hears a short, quiet synthesized "clunk" on a miss, overstrum or overhit (WebAudio, no samples, at most one per 90 ms). **Miss sound** On | Off on the band screen (`prefs.missSound`, default on); solo Play as keeps the saved value.
- Rock Band audio drop on unsplit songs (no stems, or only the `full` stem): a Rock Band controller with no stem of its own muffles the whole song on a miss and brings it back on a hit, a seek or the session's end, by the same rules as a stem drop-out (a real part or Always play controller on the mix keeps it). With the Stems plugin it is a low-pass filter after the stems master; on core's `<audio>` and the desktop JUCE engine the Song volume dips to 40% and is re-applied from the Song fader. The band screen no longer greys 5-Fret Part audio or Drums Rock Band on unsplit songs.

### Changed
- Renamed Build-a-Band to RockHeroSmith (id `rockherosmith`, screen `plugin-rockherosmith`); saved band setups move from `build_a_band.prefs.v1` on first load (the old key is kept).

### Deprecated
- `window.__buildABandRuntime` / `__buildABandScreen` (use `__rockherosmith*`).
