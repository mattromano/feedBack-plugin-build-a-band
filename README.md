# Build-a-Band

A Rock Band-style band mode plugin for [feedBack](https://github.com/got-feedback/feedBack).
Early skeleton: the band screen is a placeholder until plan 2.

## Picking a song

- **Picking a song.** Band setup → **Choose a song** opens the Song Library in pick mode
  (band chips, click to select, **Use this song**) → Confirm (parts, difficulty, devices,
  drum sound) → GO. Next song goes back to the library.

## Playing on a controller

- **Joining.** With the 5-Fret plugin installed, press **Start** on an Xbox controller or a
  plastic guitar on the band screen. It gets a column on Band setup and a row on Confirm,
  next to the guitar, drums and vocals. Its frets light up as you press them.
- **Set up first.** A controller the 5-Fret plugin doesn't know yet (no standard mapping,
  no saved binding) can't join. The join slot lists it with a **Set up** link to the 5-Fret
  controls screen, and Back there returns to the band screen. **Controls** on a column
  opens the same screen.
- **On Confirm** pick the part (Lead, Rhythm or Bass; parts the song lacks are greyed, each
  is tagged *real* or *auto*, and "also:" names the other controllers on it), the
  difficulty, Lefty, and Part audio: **Rock Band** drops your part's stem on a miss,
  **Always play** keeps it. Part audio is greyed when the song has no stem for the part.
- **Start on a joined controller** is the screen's main button: Choose a song on Band
  setup, GO on Confirm. Frets never press GO. **Leave** on the column, or holding Back for
  1 s, takes the controller out. Joined controllers stay joined across songs; one that is
  unplugged shows "Not connected" and sits out.
- **In the song.** Start on a controller pauses and resumes the band song. Holding Back for
  1 s pauses and asks "Leave the song?": then Start answers Stay and holding Back again
  answers Leave, from any band controller. Under Settings the controller does nothing.
- **Missing pieces.** Without the 5-Fret plugin the join slot says to install it; on an
  older feedBack it says to update.

## On the stage: full screen, the hover chrome, the sidebar and Settings

- **Full screen.** With "Full screen stage" on (the band screen), Go and Play again take the
  window full screen and the lanes run to the bottom. Every other way out of the song leaves
  it. Leaving full screen yourself (Esc, the OS) turns full mode off for the rest of the song.
  A Go from a drum pad, or a window that already fills the screen, keeps full mode inside
  the window.
- **The hover chrome.** Moving the mouse shows core's transport, the section map and a band
  row with Menu, the A-B loop (Loop A, Loop B, Clear loop), Full screen and End song.
- **`M` and the sidebar.** `M`, the Menu button or (in full mode) the left edge open the app
  sidebar over the song, which keeps playing. Esc, a click outside it or leaving it (when
  the edge opened it) closes it. With the sidebar shut, Esc leaves the song as usual.
- **Settings mid-song.** The sidebar's Settings pauses the song and shows Settings over it.
  Esc or "Back to the song" closes it, puts the band guitar difficulty back and resumes only
  what was playing. Any other sidebar item pauses and asks "Leave the song?": Stay resumes,
  Leave goes there.
- **Guitar input errors.** In a band song note_detect doesn't block with an alert. The band
  shows "Guitar input couldn't start" instead.

## Development

```
npm test
```

Licensed MIT. Contains no third-party game artwork, logos or sounds.

Licences: MIT, except `src/yarg-rules.js` and its test (LGPL-3.0, YARG star rules); see
[NOTICE.md](NOTICE.md) for those, the Lucide icons (ISC) and the fonts (OFL).
