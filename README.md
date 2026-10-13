# Space Cadet Pinball for the Web

[简体中文](README.zh-CN.md) · English

A browser-based Three.js pinball project exploring VPX table conversion and physics. The public demo asks you to import a VPX table you are entitled to use; table files stay in your browser and are not included in this repository.

**[Play the web demo](https://toyhank.github.io/space-cadet-rust/?vpxccd=1)** · [Source and scope](VPX-WEB.md) · [Docs index](docs/README.md) · [Architecture](docs/architecture.md) · [Testing](docs/testing.md) · [Licensing](docs/licensing.md)

## What it does

- Loads VPX tables in the browser using the Rust/WASM-based converter package @francisdb/vpin-wasm. The file is processed locally; the app does not send it to a server.
- Renders the table and gameplay in Three.js with a JavaScript game state machine and physics adapted for the web.
- Offers optional C++/WASM collision experiments for selected wall and flipper calculations, plus a JavaScript chronological contact scheduler and swept ramp tests.

This is an independent web implementation with VPX-derived components. It is **not** the complete VPX engine and does not claim frame-by-frame or 1:1 gameplay parity. See [VPX-WEB.md](VPX-WEB.md) for current boundaries and validation notes.

## Try it

Open the [public demo](https://toyhank.github.io/space-cadet-rust/?vpxccd=1), choose a VPX file you are allowed to use or a GLB produced from one, and follow the on-screen controls. The game UI shows the keyboard controls (arrow keys, Space, and Q/E). A desktop browser with a keyboard is recommended; mobile touch play is not covered by the current automated checks. A VPX table is not bundled with the public site. The demo requires a modern browser with WebAssembly and WebGL support.

## Run locally

Requirements: Node.js 22 or newer and npm. Python 3 is used only to serve the built files locally.

```sh
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Then open <http://127.0.0.1:8000/>. On Windows, use `py -m http.server 8000 --bind 127.0.0.1 --directory dist` if the Python launcher is installed.

`npm run build` creates the public-safe web build. `npm run build:local` is for owners of the local source table assets and must not be published; see [deployment guidance](docs/deployment.md).

## Tests

| Command | Purpose | Requirements |
| --- | --- | --- |
| `npm run test:ci` | Deterministic physics and gameplay regression checks used by CI | Node.js; no private table file |
| `npm run test:game` | Broader gameplay, physics and browser-driven scenarios | Some checks need local VPX assets and Chrome |
| `npm run test:vpx` | VPX conversion, materials, lamps and browser integration checks | A legally obtained local VPX file and browser test setup |
| `npm run build` | Build the public demo | Node.js and npm |
| `cargo test` | Rust crate tests, when changing Rust code | Rust toolchain |

Asset-dependent suites are not part of a clean public checkout unless you provide your own permitted table file. Exact setup and limitations are in [docs/testing.md](docs/testing.md).

## Project map

- `src/`: browser application and game logic
- `vpx/`: VPX conversion and physics integration, including the native-code notice
- `tests/`: focused regression and browser tests
- `.github/workflows/`: GitHub Actions, including Pages deployment
- `docs/`: architecture, testing, licensing, and historical notes

The converter is Rust/WASM; gameplay and several experimental physics paths are JavaScript. Selected collision routines are compiled from C++ to WebAssembly. See [architecture](docs/architecture.md) for the data flow and boundaries.

## Privacy and table files

Table conversion runs in your browser. The repository and public build intentionally exclude personal VPX files and extracted table models. Import only files you have the right to use. Do not commit, upload to public artifacts, or publish a local-asset build containing copyrighted table data.

## License and attribution

This repository contains components under different licenses. The root [LICENSE](LICENSE) covers project portions identified as MIT; VPX-derived code is separately identified as GPL-3.0-or-later in [the native notice](vpx/native/NOTICE.md). Consult [docs/licensing.md](docs/licensing.md) before reusing or redistributing components or assets. Third-party table artwork, sounds, and VPX files are not relicensed by this project.

## Contributing

Issues and pull requests are welcome. Please keep claims tied to reproducible tests, describe any required local assets, and never add proprietary VPX files or extracted assets. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then run checks relevant to your change.

## Next steps

Improve parity with VPX through focused, testable work on contact solving, table geometry, materials, and event timing. Current gaps are tracked in [VPX-WEB.md](VPX-WEB.md).

---

This project is an independent compatibility and learning effort; it is not affiliated with Microsoft or the Visual Pinball project.
