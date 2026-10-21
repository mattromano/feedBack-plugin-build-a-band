# Licensing notice for the Build-a-Band plugin

Most of this plugin is original code under the **MIT** license (see `README.md`). That includes
`screen.js`, everything in `src/` other than `src/yarg-rules.js`, `screen.html`, `plugin.json`, the assets,
`scripts/` and the tests other than `tests/yarg-rules.test.mjs`.

Two files carry rules from [YARG.Core](https://github.com/YARC-Official/YARG.Core) and
[YARG](https://github.com/YARC-Official/YARG) and are licensed under the
**GNU Lesser General Public License v3.0** (full text in [`LICENSE.LGPL-3.0`](LICENSE.LGPL-3.0); the LGPL
builds on the GNU GPL v3.0, whose text is in [`LICENSE.GPL-3.0`](LICENSE.GPL-3.0)):

| File | Status |
|------|--------|
| `src/yarg-rules.js` | LGPL-3.0. JavaScript re-implementation, with modifications, of YARG's star rules: the guitar star score multipliers from YARG's `Assets/Script/Gameplay/Player/FiveFretGuitarPlayer.cs`, thresholds as multiples of the full-combo score (`BasePlayer.cs`), and star progress from YARG.Core's `YARG.Core/Engine/BaseEngine.Generic.cs` (`UpdateStars`). Copyright (c) YARC (YARG) contributors. |
| `tests/yarg-rules.test.mjs` | LGPL-3.0. Tests for `src/yarg-rules.js`. |

`src/yarg-rules.js` is a standalone, unminified ES module with no dependencies, shipped as its own file.
The rest of the plugin (for example `src/stars.js` and `src/band-score.js`) only uses it through its
exports, so it remains a separate MIT work that uses the Library as described in LGPL-3.0 section 4
("Combined Works"). You may replace `src/yarg-rules.js` with a modified version. If you distribute changes
to `src/yarg-rules.js`, they must stay under LGPL-3.0 and their source must stay available. Combining an
LGPL-3.0 file with MIT code this way is permitted by both licenses, and both are compatible with
feedBack's AGPL-3.0.

The header of `src/yarg-rules.js` names its sources and modifications. The plugin uses no artwork, fonts,
logos or sounds from YARG or any other rhythm game.

## Icons

The part and interface icons in `src/icons.js` are inline SVG data from [Lucide](https://lucide.dev)
(`lucide-static` 0.468.0), used under the **ISC** license:

> ISC License
>
> Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
> All other copyright (c) for Lucide are held by Lucide Contributors 2022.
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is
> hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
> INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
> ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF
> USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
> OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The Feather portions (copyright Cole Bemis) are under the MIT license.

## Fonts

The plugin's stylesheet loads Unbounded and Barlow from [Google Fonts](https://fonts.google.com) with an
`@import`. Both are licensed under the SIL Open Font License 1.1 (OFL). The fonts are not bundled with the
plugin.
