# Adaptive viewport and selector

The touch, installed-app and native-fullscreen layouts derive their uniform
scale from `visualViewport` and the display's safe-area insets. Resize and
orientation events recompute the layout. Desktop browser windows retain the
classic layout.

The engine's playable board remains 900×600 with the original rows, columns,
timers, projectile distances and sprite proportions. Wide screens reveal more
of the existing 1400×600 background around that board. This extra scenery is
decorative: it does not add planting cells. The foreground and panorama share
the same scale and background offset. Extremely wide/tall screens also use a
uniformly scaled scenery background to fill the remaining area.

The main selector uses an independent landscape and transparent gravestone.
The available width grows while the gravestone, signs, original click targets
and Almanac keep their proportions. Existing Adventure, Pavilion, Minigame,
Menu, Help and Quit actions are retained. The STAGING marker remains beneath
the tree; the upper blank sign remains blank. Gameplay instruction text spans
the available viewport.

The selector includes falling SVG leaves and an SVG zombie head and shoulders
peeking from behind the gravestone. The eyes close briefly twice per animation
cycle; no walking sprite or legacy hand is shown. Reduced-motion mode disables
the peeking and eyelid animations and hides falling leaves. These animations
do not use the gameplay scheduler. This recreates the
motion with this game's artwork, rather than importing the native app's menu.

`UpdateGameStageOffset` normalizes the board origin to native engine units.
Chromium includes body CSS zoom in `getBoundingClientRect`; WebKit reports
pre-zoom bounds. Measuring `rect.width / offsetWidth` handles both without
user-agent detection. Pointer coordinates still use the engine's body zoom.

## Validation

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run test:viewport
```

The browser tests exercise the real Adventure button, exact-cell touch
planting before and after resizing, unequal safe-area insets, portrait rotation
help, scene changes, pause, desktop fullscreen entry and fullscreen exit.
They cover 844×390, 926×428, 844×280, 1536×709, 1366×1024,
2560×1080 and 390×844. Sun is supplied by the fixture and audio playback
is suppressed: audio permission behavior is outside this layout suite.

These tests do not replace a real iPhone home-screen-app check or a full
playthrough of every special level.

## Menu artwork

The built-in Imagegen tool produced the new scenery and a transparent menu
foreground using `game/images/interface/Surface.jpg` as the visual reference.
The original asset is preserved.

- `game/images/interface/SelectorLandscape-v1.png`: 2048×768 scenery.
- `game/images/interface/SelectorStone-v1.png`: 1536×1024 RGBA foreground.

Background prompt: create a wide hand-painted Plants vs Zombies garden
landscape with the large tree on the left, suburban houses, rolling green
hills, a winding street, blue sky and clouds, and grass/dirt foreground.
Keep the middle/right open for separate interactive menu elements. Exclude
gravestones, labels, pots, signs, text, logos and interface elements.

Foreground prompt: extract the gravestone, base and Menu/Help/Quit pots from
the original menu onto a transparent canvas. Preserve its 3:2 proportions,
positions and inscriptions so the original click targets can be retained.
Complete the cropped right contour while preserving text panels and pots.

Both images are scaled uniformly by CSS. The landscape may crop decorative
edges to cover the screen; interactive menu elements use their own layout.

## Scene painting and Safari

Scenery is attached to the document root, outside the zoomed body. Controls
remain inside display safe areas while one sharp menu landscape paints the
entire viewport, including the space below the home indicator. The intro
appears once and is centered. Gameplay panorama offsets are converted to
physical screen units and follow the moving board background. Remaining
space beyond the source panorama uses landscape colors instead of a second,
misaligned copy of the house. Safari browser chrome remains under browser
control; a real iPhone check is still needed for its landscape safe areas.

`SelectorZombie.svg` is a vector interpretation of the reference pose; it is
not an extracted animation from the native game.
