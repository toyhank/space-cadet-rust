# Experimental VPX Native Collision Module

**License:** GPL-3.0-or-later. This directory contains portions **adapted
from** Visual Pinball X (`vpinball/vpinball`) C++ source, specifically
`src/physics/collide.cpp` (`LineSeg::HitTestBasic`) and
`src/physics/hitball.cpp` (`HitBall::Collide3DWall`),
`src/physics/hitflipper.cpp` (`FlipperMoverObject` and `HitFlipper::Collide`), plus constants
from `src/physics/physconst.h` (all marked `// license:GPLv3+` upstream).

- Upstream repository: https://github.com/vpinball/vpinball
- Upstream revision inspected: `90d94e9f16d40f593c1d78e0549e6a1148078e81`
- Copyright: Visual Pinball development team and contributors (2000–2026)
- Local adaptation: remove Visual Pinball Windows/COM dependencies, export a
  fixed-size C ABI, convert VPX spatial/temporal units to GLB meters/seconds,
  make line face orientation optional while JSON wall winding is incomplete,
  support friction and ball angular velocity with deterministic scatter=0.
  Version 2 also adapts VPX flipper torque ramp, end stops, return coil,
  tapered-hull shape inertia and collision recoil/friction. The flipper
  face/contact lookup in version 3 can optionally use a second C++ WASM
  swept-contact module adapted from `HitTestFlipperFace` and
  `HitTestFlipperEnd`, with tapered sides, rotating tip and base circle.
  It uses 20 time subdivisions and root bisection instead of VPX's exact
  modified false-position search, and interpolates flipper angle linearly
  during each step. It remains a VPX-derived approximation, not an exact
  VPX continuous-contact implementation. If the module fails to load,
  the JS capsule search remains available. Masses other than 1 are not yet
  modeled exactly.
- Full GPL terms: [LICENSE-GPL-3.0.txt](LICENSE-GPL-3.0.txt)
- Historical Visual Pinball license information: https://github.com/vpinball/vpinball/blob/master/LICENSE

**Important licensing distinction:** The pre-existing JavaScript/HTML and
Rust portions of this repository remain MIT as specified in its root
`LICENSE`. This adapted C++ module is GPL-3.0-or-later. Integrating and
distributing it as part of a combined application may trigger GPL
obligations for the combined distribution; anyone reusing or publishing
this experiment should assess those obligations and provide complete
corresponding source. This project ships this source file and full GPL
terms alongside the WASM binary. No VPX game art, table script or ROM
asset is included in this directory.

## Rebuild the precompiled WASM

The checked-in `vpx_ccd.wasm.base64` is a base64 representation of a
binary built from `vpx_ccd.cpp` with Clang 17 (version 2 ABI, 3,203 bytes). Source/compiled parity is
checked by `tests/vpx-native-ccd.mjs`, including fixtures generated from a
native C++ shared library.

```bash
clang++ --target=wasm32 -std=c++17 -O3 -fno-exceptions -fno-rtti \
  -nostdlib -Wl,--no-entry -Wl,--export=vpx_line_toi \
  -Wl,--export=vpx_wall_bounce -Wl,--export=vpx_out \
  -Wl,--export=vpx_version -Wl,--export=vpx_flipper_step \
  -Wl,--export=vpx_flipper_collide -Wl,--export-memory \
  -Wl,--initial-memory=131072 \
  vpx/native/vpx_ccd.cpp -o vpx/native/vpx_ccd.wasm
```

The companion `vpx_flipper_ccd.cpp` is built with the same Clang 17
toolchain and the following command:

```bash
clang++ --target=wasm32 -O3 -std=c++17 -fno-exceptions -fno-rtti   -nostdlib -Wl,--no-entry -Wl,--export=vpx_flipper_toi   -Wl,--export=vpx_flipper_toi_out   -Wl,--export=vpx_flipper_toi_version -Wl,--export-memory   -Wl,--initial-memory=131072   vpx/native/vpx_flipper_ccd.cpp -o vpx/native/vpx_flipper_ccd.wasm
```

The compiled flipper module is 4,193 bytes. Its committed
`vpx_flipper_ccd.wasm.deflate.base64` representation is a zlib-deflated,
base64-encoded WASM binary. `npm run build` decodes the first WASM and
inflates the second into the deployed web directory. The source and the
full GPL terms are bundled with the public build.

`npm run build` decodes the tested precompiled base64 to
`dist/vpx/native/vpx_ccd.wasm`. Run `node tests/vpx-native-ccd.mjs` to
validate its exported ABI and known C++ native output fixtures.

## Scope

This is **NOT** the native VPX physics engine. It contains rigid static
line wall time-of-impact, normal restitution with falloff, Coulomb
friction/spin, plus experimental flipper motor dynamics and ball impulse
response. It explicitly **does not include** VPX dynamic
broadphase/kd-tree, the exact original false-position hit-time search,
full moving ball/flipper multi-contact scheduling, triangle/ramp collision,
ball-ball CCD, bumper/gate/slingshot mechanics, or the original VBScript
runtime. The web game currently runs the module only in optional hybrid
`?vpxccd=1`/in-game opt-in mode and preserves its existing JS solver for
everything else.
