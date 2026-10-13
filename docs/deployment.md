# Public deployment

GitHub Pages serves the public-safe build produced by npm run build. The workflow is in [.github/workflows/pages.yml](../.github/workflows/pages.yml); use the repository Actions page to confirm the result for a commit.

## Local public build

1. Run npm ci.
2. Run npm run build.
3. Inspect dist/ before publishing. It must contain only public application code and dependencies; no local VPX file, extracted model, licensed table image, sound, cache, or test output.
4. Serve the build locally and test the import flow with a table you are authorized to use.

Do not use npm run build:local for Pages. That path may include local extracted table assets. Keep it out of public artifacts, releases, and screenshots unless every included item is cleared for redistribution.

## GitHub Pages

The workflow runs npm run test:ci, builds the public bundle, audits dist/ with scripts/verify-public-build.mjs, verifies the converter WASM file, and then uploads the Pages artifact. The audit recursively scans the full build tree. It rejects any vpx-local directory, .vpx, .glb, or .vbs file, plus the known private table filenames PINBALL.DAT, CADET.DAT, and the extracted physics/script files. If the project later adds an approved public model, review its provenance and explicitly update the policy and checks.

After publishing, check the Actions run, the Pages deployment environment, the English and Chinese README renderings, documentation links, and the demo URL. A green workflow confirms only the jobs it actually runs; it does not prove every optional browser or private-asset test ran.

## Local preview

After npm run build, run:


```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8000/. On Windows, py -m http.server 8000 --bind 127.0.0.1 --directory dist is an alternative when the Python launcher is installed.

See [the architecture guide](architecture.md), [testing guide](testing.md), and [licensing guide](licensing.md) for related boundaries.
