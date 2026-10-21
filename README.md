# Build-a-Band

A Rock Band-style band mode plugin for [feedBack](https://github.com/got-feedback/feedBack).
Early skeleton: the band screen is a placeholder until plan 2.

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
