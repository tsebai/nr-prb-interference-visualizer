# Changelog

All notable changes to this project are documented here.

## [1.1.0] - 2026-09-01

### Added

- Separate Date and Time column mapping for common OSS exports.
- Prefixed and suffixed PRB counter header detection.
- Switchable statistical profiles by PRB and by period.
- Synthetic regression coverage for OSS-style wide CSV input.

### Changed

- Exact cell identifier mapping avoids descriptive cell-related fields.
- `NIL` values remain missing instead of becoming artificial measurements.
- Aggregated measurements are indexed by cell for rapid switching on large files.
- The compact overview limits simultaneous canvases while preserving every cell in the selector.

## [1.0.1] - 2026-09-01

### Added

- Header-only wide and long CSV templates available from the import panel and repository samples.

## [1.0.0] - 2026-08-31

### Added

- Browser-only CSV and XLSX parsing in a Web Worker.
- Automatic and editable wide, long, and snapshot column mapping.
- Dynamic PRB discovery and full-bandwidth canvas rendering.
- Exact hover values, zoom, pan, and full-bandwidth reset.
- Persistent cell selector and compact multi-cell overview.
- Correct linear-power mean for dBm measurements.
- Mean, median, maximum, P95, and threshold summaries.
- PNG, safe CSV, and print exports.
- Synthetic demo datasets, sample generator, tests, and documentation.
