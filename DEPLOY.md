# Web build and GitHub Pages deployment

The source is a browser game: Three.js rendering and a JavaScript
event/physics implementation. The VPX decoder/converter in
`@francisdb/vpin-wasm` **is compiled Rust WebAssembly**. This does not mean
the pinball collision physics itself has been compiled from Rust.

## Run and build

From `G:\AI\space-cadet-rust`:

```powershell
npm ci --ignore-scripts
npm run test:ci
npm run build           # public, no extracted third-party table assets
npm run build:local     # private local playable copy with your VPX-derived GLB
npm start
```

Open **http://127.0.0.1:8000/dist/** after building.

The static build uses only relative paths; it does not need a server,
database, login, build-time API key or internet connection once hosted.
Do **not** open `dist/index.html` with a `file://` URL:
ES modules/WebAssembly require an HTTP(S) origin.

## Public web mode and table uploads

The default public build deliberately **does not publish** JP's Space Cadet
VPX/VBS/GLB, original Windows 3D Pinball DAT, extracted artwork or sound files.
The first page therefore shows an **Open VPX / GLB** prompt. The visitor
chooses an authorized `.vpx` file from their device, and the Rust/WASM
converter reconstructs the GLB and physical collision metadata **in the
browser's Web Worker**. The file isn't transmitted to the web server.
Choose a VPX rather than a GLB if you need the extracted VPX physics metadata.

A private build with `npm run build:local` includes your local
`assets/vpx-local/space-cadet.glb` and physical metadata so it starts
directly. **Never push this private `dist/` to a public repository.**
`dist/` and `assets/vpx-local/` are ignored in `.gitignore`.

## GitHub Pages

The workflow `.github/workflows/pages.yml` runs on pushes to `main` and
manual dispatch. It installs Node, runs portable unit tests, creates the
public `dist/` and deploys the output via GitHub Pages. It also explicitly
fails if private VPX assets somehow enter the Pages artifact.

1. Create a repository in the GitHub account allowed by your connector.
2. Push project **source only** to `main`. After creating an empty repository, you can use `scripts/publish-github.ps1` (requires configured Git credentials):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1 -RepoUrl https://github.com/toyhank/space-cadet-rust.git
   ```

   The script stages only approved source paths and blocks likely third-party assets. Never publish `node_modules/`, `dist/`, private VPX assets, extracted images or `*.dat`.
3. In GitHub repository **Settings → Pages → Build and deployment**, select
   **GitHub Actions**.
4. Review the **Build and publish web edition** action run, then use the
   Pages URL shown in the workflow.

For a public repository, this results in a **user-import demo**, rather
than automatically shipping the licensed/original table artwork. Publishing
the derivative table assets would require separately confirmed redistribution
rights.

## Tests

```powershell
npm run test:ci
npm run test:game
npm run test:vpx
```

`test:ci` is self-contained and suitable for GitHub runners.
`test:game` includes Chrome + the **local** VPX data and is a separate
integration suite.

Locally, to test the **public** build end to end with an imported VPX:

```powershell
npm run build
$env:PINBALL_TEST_URL="http://127.0.0.1:8000/dist/index.html"
$env:PINBALL_UPLOAD_LOCAL_VPX="1"
node tests/vpx-play.cjs
```

To test the local bundled build:

```powershell
npm run build:local
$env:PINBALL_TEST_URL="http://127.0.0.1:8000/dist/index.html"
Remove-Item Env:PINBALL_UPLOAD_LOCAL_VPX -ErrorAction SilentlyContinue
node tests/vpx-play.cjs
```

## Engine scope

The game uses real VPX-derived contact outlines, flipper lengths/angles,
one-way gate state with cooldown, multi-stage mission logic and timed wormhole
ball capture/auto-serve/three-ball release. It is **not native VPX physics**:
the 3D high ramps, full VPX surface collision solver, moving mechanical
hardware and all script-driven effects are not yet complete. Some high-rank
missions remain state-machine verified without a guaranteed player-achievable
3D trajectory.
