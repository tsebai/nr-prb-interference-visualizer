# Security policy

## Supported version

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Use the repository's private security advisory flow instead of a public issue. Include the affected version, impact, reproduction steps, and a minimal synthetic test file if one is required.

Never include real network data, credentials, private URLs, customer identifiers, or vendor-confidential documentation in a report.

## Security boundaries

- Imported files are expected to remain in the browser.
- File names and imported values must not enter analytics, logs, or remote error reports.
- CSV exports neutralize cells that could be interpreted as spreadsheet formulas.
- Imported headers, identifiers, and values must not be inserted with `innerHTML`.
- Production libraries must be served locally, without analysis-time CDN dependencies.

A report that shows any imported content or file metadata leaving the browser is treated as high priority.
