# Architecture and implementation scope

This project combines a browser game, VPX table conversion, and experiments that adapt selected VPX collision behavior for the web. The pieces have different runtimes and license boundaries; this page describes the current public implementation, not full VPX compatibility.

## Data and runtime flow

1. A player selects a VPX file in the browser.
2. The converter package @francisdb/vpin-wasm parses the table in WebAssembly. Conversion is performed client-side; the selected file is not uploaded by this application.
3. Three.js displays the generated table geometry. The browser game state machine and most gameplay rules run in JavaScript.
4. Optional physics paths in vpx/ process selected contacts. C++-to-WASM routines cover specific wall and flipper calculations; the chronological scheduler and swept ramp surface logic are JavaScript adaptations.

## Responsibilities

- src/: browser application, rendering setup, input, state and gameplay.
- vpx/: conversion integration and VPX-oriented geometry/contact modules. vpx/native/NOTICE.md describes separately licensed native-derived components.
- tests/: deterministic regression tests and opt-in browser/table integration checks.
- scripts/: build and conversion utilities.
- .github/workflows/: CI and GitHub Pages workflow definitions.

The exact modules and test entry points evolve. Use the source and package.json scripts as the authority when documenting behavior.

## Physics boundary

The implementation is a hybrid. It does not reproduce VPX's complete collision tree, all dynamic mechanisms, the full native constraint/contact solver, every table material, VBS execution, or all event and randomization timing. Ramps and some scheduling behavior use JavaScript adaptations. Selected native-derived calculations use C++/WASM. Results can differ from VPX, particularly around sustained contact, complex mechanisms, friction and spin, and timing.

The ?vpxccd=1 query enables the public collision experiment where supported. Treat it as a test mode, not as a guarantee that all simulation paths use native VPX code.

## Private input data

The converter accepts files selected by the player. The repository does not include a copyrighted VPX table. Local extracted models may be used only in a private local build and must not be included in commits, release assets, Pages uploads, screenshots, or test fixtures without documented redistribution rights. See licensing.md and deployment.md.

## Change guidance

Keep rendering, table conversion, gameplay rules, and contact algorithms separable. A physics change should include a focused regression case for the behavior that changed and state whether it covers a deterministic unit case, a browser scenario, or comparison against an upstream implementation. Do not infer full parity from a successful smoke test.
