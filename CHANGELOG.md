# Changelog

All notable changes to this project are documented here.

## [1.3.0] - 2026-09-11

### Added

- Immediate demo and file-import actions in the standalone introduction.
- Privacy-safe workspace-view and file-picker funnel events for consenting host integrations.
- A specific recovery message when the From and To date range is reversed.
- Public `startDemo()` and `focusFileImport()` methods for native host-page calls to action.

### Changed

- A failed browser worker is discarded so the next file selection starts with a clean parser.
- Previous workbook matrices are released when a new file or demo is selected.
- File and analysis controls expose a visible busy state during local processing.
- Error panels now confirm that the rejected file was not uploaded.

## [1.2.0] - 2026-09-04

### Added

- Stable, privacy-safe error codes for file, CSV, XLSX, mapping, filter, scale, rendering, worker, and export failures.
- Actionable inline recovery guidance with direct controls for reopening a file, reviewing a mapping or setting, and downloading an empty CSV template.
- Browser tests for malformed CSV input, incomplete mappings, mobile error responsiveness, and explicit-only failure telemetry.

### Changed

- Worker failures now cross the browser boundary as fixed codes without raw parser messages.
- Automatic visualization refreshes no longer emit repeated failure events.
- A corrected setting immediately clears its previous error state.

## [1.1.1] - 2026-09-02

### Added

- Browser-only usage events with fixed action and context codes for consent-aware host integrations.
- End-to-end coverage proving that usage event payloads exclude imported file details and counter values.

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
