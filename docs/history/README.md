# Development history

This folder keeps concise context for earlier implementation stages. Old experiments may remain in the repository, but they do not define the current public demo or prove feature parity.

## DAT viewer and 3D prototypes

The project began with DAT parsing and rendering experiments, followed by a 2D resource viewer and programmatic Three.js scenes. Those prototypes helped explore coordinate projection, sprites, table geometry, and input handling. Their accuracy claims and machine-specific measurements were tied to local table data and are not current acceptance criteria.

## Browser game and conversion flow

Later work added a browser game prototype, table conversion with a Rust/WASM dependency, and a JavaScript gameplay state machine. A user's VPX file is selected and processed locally; proprietary source tables and extracted assets are intentionally not tracked.

## VPX-derived physics experiments

Selected collision routines were adapted from Visual Pinball X and compiled to WebAssembly. Subsequent work added flipper contact experiments, a JavaScript chronological contact scheduler, and swept ramp geometry. The implementation remains hybrid and incomplete; see [architecture](../architecture.md) and [VPX-WEB.md](../../VPX-WEB.md) for current scope.

## Archived README notes

The [README at commit f49e9a8](../../blob/f49e9a8a6b7a56f8861ef73798e6fe057f2f2206/README.md) preserves the earlier long-form development log that was removed from the root README. Its screenshots, measurements, license assertions, and feature claims describe that historical state. Verify them against current code and documented asset rights before relying on or repeating them.

For exact historical changes, use the repository's Git commit history. Treat archived screenshots, measurements, and claims as historical unless reproduced against current code and a redistributable fixture.
