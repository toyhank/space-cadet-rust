# Contributing

Thanks for helping improve the browser pinball project. Small, focused changes with reproducible evidence are easiest to review.

## Before opening a change

- Search existing issues and describe the behavior you intend to change.
- Keep pull requests scoped. Separate documentation, gameplay, physics, and asset work when practical.
- Do not add VPX table files, extracted table models, copyrighted images, sounds, credentials, or personal data. Use only fixtures with documented redistribution rights.
- Identify copied or adapted code and add its upstream source, license, and attribution to the appropriate notice before proposing it.

## Development checks

Install Node.js and npm, then run npm ci, npm run test:ci, and npm run build. See docs/testing.md for the optional Chrome, VPX-file, and Rust checks. If a check cannot run because a local asset or tool is unavailable, state that clearly in the pull request.

For physics changes, add a deterministic regression case for the observed failure. Describe expected behavior and tolerances, and distinguish a local browser smoke test from a direct upstream VPX comparison. Do not claim full VPX parity unless that has been measured and documented.

## Pull request notes

Include:

1. The user-visible or technical problem and the resulting behavior.
2. The relevant test commands and their actual results.
3. Required browser, toolchain, or local table assets.
4. Any license, attribution, accessibility, or mobile behavior implications.

Keep screenshots free of copyrighted table art unless its public use is documented. For UI changes, explain how to reproduce the view and verify keyboard and narrow-screen behavior.

## Review standard

Changes should preserve the boundary between public-safe builds and private local assets, keep test requirements explicit, and update the relevant docs when architecture or supported behavior changes. Maintainers may ask for a narrower change or more evidence before merging.
