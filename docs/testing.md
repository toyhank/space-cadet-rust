# Testing and verification

The project separates deterministic checks from browser and private-asset integration checks. A passing unit suite does not establish full VPX parity.

## Commands

| Command | Scope | Environment |
| --- | --- | --- |
| npm run test:ci | Deterministic gameplay and physics regressions; this is the clean-checkout CI suite | Node.js; no personal VPX file |
| npm run test:game | Gameplay, physics and browser-oriented scenarios | Node.js, Chrome and local HTTP serving; asset-specific scenarios need a local permitted table |
| npm run test:vpx | VPX conversion, materials, lamps, browser and orbit checks | A local VPX file, Chrome and local HTTP serving |
| npm run build | Public-safe deployment bundle | Node.js and npm |
| npm run build:local | Build including locally extracted table assets | Local assets; never publish this output |
| cargo test | Rust crate tests when changing Rust source | Rust toolchain |

Use the exact scripts declared in package.json; their test lists may change as the project evolves.

## Clean checkout

1. Install the supported Node.js LTS release and npm.
2. Run npm ci.
3. Run npm run test:ci and npm run build.

The GitHub Actions workflow runs the clean-checkout checks. Follow the workflow result linked from the repository Actions page; do not infer success from a local-only test.

## Browser and table integration

The test:game and test:vpx suites include browser automation and test cases that load table-specific geometry. They may require Chrome, a local HTTP server, and a VPX file you are authorized to use. Those files are deliberately ignored and are not downloaded by CI. If an asset-dependent case is skipped, record the missing prerequisite instead of reporting the entire suite as passed.

Run the browser edition locally with a localhost server. For manual checks, verify the initial screen, keyboard controls shown by the UI, ball launch, flipper response, score/state changes, and the optional ?vpxccd=1 experiment. Treat visual play as a smoke check; it does not replace targeted assertions.

## Physics regression guidance

A physics change should add a deterministic test for its failure mode, including input state, expected contact/time/state, and any numeric tolerance. Prefer test cases for high-speed contacts, ramp height/edge transitions, repeated contacts within one step, flipper motion, and multi-ball scheduling where relevant. State which behavior remains approximated.

## Rust checks

Rust checks are optional for JavaScript-only changes. When changing the Rust crate, install Rust and run cargo test. Build the wasm32-unknown-unknown target only when the change affects that target; the conversion dependency already ships a compiled WASM module. Record the toolchain and target if a check cannot run.

## CI limitations

Public CI must use only repository-safe fixtures. Never add an unlicensed VPX table, extracted model, image, or sound just to make an integration test pass. Keep private asset tests opt-in and document their requirements.
