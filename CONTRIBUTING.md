# Contributing

Thank you for helping improve the HiCellTek NR PRB Interference Visualizer.

## Before opening an issue

- Confirm that the behavior is reproducible with synthetic or anonymized data.
- Do not attach customer, network, gNB, OSS, or vendor-confidential exports.
- Search existing issues for the same format or behavior.
- Describe the counter semantics without copying proprietary documentation.

## Local setup

```bash
npm ci
npm run generate:samples
npm run test:all
```

## Pull requests

1. Create a focused branch from `main`.
2. Keep parsing and analysis generic and vendor-neutral.
3. Add or update tests for behavior changes.
4. Use `textContent`, DOM constructors, or typed values for imported content. Never insert imported text with `innerHTML`.
5. Preserve browser-only processing. A change that transmits imported content or file metadata is out of scope.
6. Update the changelog when user-visible behavior changes.
7. Confirm that generated samples remain entirely synthetic.

Pull requests must pass formatting, lint, strict typecheck, unit tests, build, end-to-end tests, and the dependency audit.

## Commit style

Use short imperative commit subjects, for example:

```text
fix: detect numeric PRB headers in snapshots
test: cover inverted threshold direction
docs: clarify decimal comma handling
```

By contributing, you agree that your contribution is licensed under the MIT License.
