# Local processing and privacy boundary

## What the engine does

1. The file input returns a browser `File` object.
2. The main thread passes that object to a local Web Worker.
3. CSV text is read with `File.text()`. XLSX bytes are read by the bundled `read-excel-file` browser parser.
4. The worker returns a limited preview, mapping metadata, and normalized measurements to the main thread.
5. Aggregation, canvas drawing, filtering, and exports run in the browser.

The file name is used transiently only to distinguish `.csv` from `.xlsx`. It is not displayed, logged, stored, exported, or added to an event.

## What the engine does not do

- It does not upload the file.
- It does not call an analysis API.
- It does not send file names, headers, cell identifiers, or values to analytics.
- It does not send parsing errors or data excerpts to an error-reporting service.
- It does not load a parser or chart library from a third-party CDN during analysis.

## Verification

The end-to-end privacy test imports a CSV containing unique sentinel strings, records browser network requests, and fails if a request URL or body contains the file name, cell identifier, or counter value. Static tests also reject `XMLHttpRequest`, `navigator.sendBeacon`, remote URLs, analytics code, and error-reporting code in the engine bundle.

Normal requests for the HTML, local JavaScript, local stylesheet, and local worker are expected when the page loads. A consented live page visit may be counted by the host site's standard analytics, but the visualizer does not add imported data or file metadata to those events.

## User responsibility

Local processing reduces exposure created by uploading an export. It does not anonymize the source file, secure the user's device, control browser extensions, or guarantee how an external operating system handles files. Remove or anonymize sensitive identifiers before opening the file.
