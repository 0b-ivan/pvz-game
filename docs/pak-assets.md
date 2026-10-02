# Assets from the supplied main.pak

The staging game now uses 575 mapped assets from the user-supplied package.
`scripts/pak-asset-map.json` is the reviewed compatibility map;
`docs/pak-import.json` records the source package fingerprint and every output
fingerprint. The original package is not stored in this repository.

## Import

Requires Python 3.12, Pillow 11.3.0 and ffmpeg with libmp3lame.

```sh
python scripts/import-pak-assets.py /path/to/main.pak
python scripts/test-pak-assets.py
npm ci
npm run test:viewport
```

The importer validates the PAK index and decodes the 32-bit compiled
reanimation format. Missing transform values inherit the previous frame.
JPEG pieces with separate alpha masks are combined before rendering.
Independent plant heads are composed with their stems; zombie accessories
are selected for each class and headless state. Output sprite canvas sizes
and animation bounds are pinned to the previous assets in the mapping,
so reimporting does not progressively shrink sprites or change DOM hitboxes.

Widescreen lawn backgrounds are center-cropped to the engine's existing
1400x600 source coordinates. This preserves the house, planting columns and
mobile board projection. Matching sounds retain their MP3 filenames.
Plant cards retain the two-state atlas layout, with a new portrait and a
grayscale disabled state. Transparent end frames in death/consumption
animations are intentional.

The package is not uniformly high resolution. This imports its actual art;
it does not claim that every sprite is newly drawn in HD.

## Remaining work

This is a broad asset migration, not a complete replacement of every file.
The game includes custom content for which the package has no direct counterpart:
LaserPea, IcyFumeShroom, Oxygen, Ling, LotusRoot, SeaAnemone, gun and several
custom zombie variants such as WarshipsZombie and LionDanceZombie. Their art,
custom maps, text-bearing notes, some state atlases and specialist effects
remain available. Replacing those requires separate art or an explicitly
reviewed adaptation rather than substituting an unrelated classic sprite.
Unused legacy/old folders and UI fonts also remain.

Zen Garden and Shop logic are separate work. Importing graphics does not
implement their currency, inventory, purchases or plant-care state.

## Validation

The asset test checks all output hashes, decodes all image frames and checks
pinned canvas geometry. It also covers transform inheritance, truncated
compiled data, JPEG alpha masks and negative transform coordinates.
Local Chromium viewport tests passed: menu animation and reduced motion,
viewport sizes, safe areas, rotation, exact-cell touch planting, pause,
scene changes and desktop fullscreen. Local WebKit validation was blocked
by unavailable system libraries; CI runs the existing full browser suite.

Binary layout reference: [PvZ-Portable](https://github.com/wszqkzqk/PvZ-Portable),
`src/PvzpLib/Definition.cpp` and `Reanimator.cpp`. The importer is an independent
Python adapter for the package format and this game's DOM/GIF engine.
