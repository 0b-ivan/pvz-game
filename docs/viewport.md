# Adaptive viewport and selector

The touch, installed-app and native-fullscreen layouts derive their uniform
scale from `visualViewport` and the display's safe-area insets. Resize and
orientation events recompute the layout. Desktop browser windows retain the
classic layout.

The live gameplay board fills the safe viewport. Its nine planting columns
(and the level's five or six rows) are projected across the available space,
so planting positions, plants, zombies, projectiles and shovel targets move
with the grid. Sprite dimensions retain one uniform scale.

`AdaptiveBoard.js` composes the actual scene inside `dAll` from the repository's
1400×600 level artwork. It preserves the left house/entry strip and extends the central
lawn/pool/roof area to the right viewport edge. The background source stops at
native x=855 (image x=970 after the camera settles); the sidewalk and street
are outside the gameplay crop. A separate top strip
lets taller views expand row spacing. Tutorial lawn-roll overlays use the same
projection and retain their animated reveal. There is no second gameplay
panorama beneath the board. Camera scrolling uses the same artwork offsets.

The simulation's rows, columns, timers and collision coordinates stay native;
`GetGamePointerPosition` inverts the view projection for planting, preview and
shovel input. Grid spacing expands; figures and UI groups keep their shapes.
This changes the view, not the number of playable columns or game difficulty.

The main selector uses an independent landscape and transparent gravestone.
The available width grows while the gravestone, signs, original click targets
and Almanac keep their proportions. Existing Adventure, Pavilion, Minigame,
Menu, Help and Quit actions are retained. The STAGING marker remains beneath
the tree; the upper blank sign remains blank. Gameplay instruction text spans
the available viewport.

The selector uses the native QotL widescreen tree, garden and gravestone layers
plus its original leaf sprites and menu-button artwork. A real in-game basic
zombie sprite peeks from behind the gravestone; two short CSS eyelid closures
add the requested blink because the native idle pose itself does not blink.
Reduced-motion mode disables peeking/blinking and hides falling leaves. These
animations remain independent of the gameplay scheduler.

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
They also verify a real projectile damaging a zombie, undistorted plant/zombie
sprites, planting in the expanded last column, and removing that plant with
the shovel, plus collecting a sun from an expanded column. They verify the
last planting column reaches the viewport edge and the background source
stops before the sidewalk/street. Chromium also starts with an active old
cache-first worker and stale unversioned layout assets, verifying the new
layout works on the first navigation.
They cover 844×390, 926×428, 844×280, 1536×709, 1366×1024,
2560×1080 and 390×844. Sun is supplied by the fixture and audio playback
is suppressed: audio permission behavior is outside this layout suite.

These tests do not replace a real iPhone home-screen-app check or a full
playthrough of every special level.

## Menu artwork

The generated selector replacements have been removed. The touch/fullscreen
selector now composes source artwork from
`nasiftanjim/PvZ-QotL-Widescreen-NT`:

- `SelectorScreen_BG.png`: native blue sky/sun base layer.
- `SelectorScreen_BG_Left.png`: tree and left foreground.
- `SelectorScreen_BG_Center.png`: house and central lawn.
- `SelectorScreen_BG_Right.png`: gravestone and right foreground.
- Native Adventure, Mini-Games, Puzzle, Almanac, Options, Help and Quit art.
- `SelectorScreen_Leaf1.png` through `SelectorScreen_Leaf5.png` for motion.

The source layers retain their aspect ratios. The tree remains left-anchored;
the 900px legacy control coordinate system is centered with
`--pvz-menu-shift`, so rendered labels and existing click/touch targets move
together. The STAGING marker remains under the tree and the upper sign is kept.

The selector zombie uses the repository's real
`game/images/Zombies/Zombie/0.gif` game sprite instead of a drawn SVG. The
sprite is placed below the gravestone layer so the stone occludes it naturally.
Only the eyelid closure is supplemental CSS animation.

## Scene painting and Safari

Menu scenery is attached to the document root, outside the zoomed body.
Gameplay artwork is composed inside the expanded live board. Controls remain
inside display safe areas. Safari browser chrome remains under browser
control; a real iPhone check is still needed for its landscape safe areas.

### Existing gameplay artwork

All files below are already in `game/images/interface/`; the renderer adapts
them at runtime instead of replacing their original files.

| Scenes                        | Artwork                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Day lawn                      | `background1.jpg`                                                                  |
| Tutorial dirt and lawn reveal | `background1unsodded.jpg`, `background1unsodded_1.jpg`, `background1unsodded2.jpg` |
| Night lawn                    | `background2.jpg`                                                                  |
| Pool                          | `background3.jpg` and variants                                                     |
| Night pool                    | `background4.jpg`                                                                  |
| Roof                          | `background5.jpg`                                                                  |
| Custom level landscapes       | `backgroundX*.jpg`, `backgroundwall*.jpg`, other existing 1400×600 backgrounds     |

Native board replacement between levels rebinds the renderer and clears the
previous transforms. UI menus retain their original proportional layout.


## PvZ-Portable comparison

Reference inspected: `wszqkzqk/PvZ-Portable` at commit
`848b1dddbe82a5976ee6005992b51bb8fa79b00c`.
`src/GameConstants.h` defines an 800×600 board and a 220px image offset.
`src/SexyAppFramework/graphics/GLInterface.cpp::UpdateViewport` preserves 4:3
with letterboxing. `src/Lawn/Board.cpp::DrawBackdrop` clips lawn-reveal source
rectangles independently from the background. The repository contains no game
artwork; it loads user-supplied `main.pak`/properties. Its coordinates and crop
approach are useful references, but it does not implement a wider lawn.
This browser engine uses its own 900×600 coordinates and existing artwork.

## Build updates

`scripts/stamp-build.cjs` assigns the build SHA to the game HTML, script/style
URLs and worker shell-cache version before minification. Dynamically loaded
Mobile.js/mobile.css use the same build ID. An old controlling worker cannot
substitute its unversioned cached layout files for these new URLs.
`AdaptiveBoard.js` is included in the precached shell. Layout still needs a
normal page reload after deployment; already running games keep their loaded
code until navigation.

To test the actual stamped/minified output, set `PVZ_TEST_ROOT` to its directory
when running `npm run test:viewport`.
