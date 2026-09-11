# Error handling

The visualizer converts local parser and rendering failures into fixed error codes. Each visible error contains a concise explanation, corrective steps, and only the recovery controls relevant to that case.

## Input and parser cases

- File required, unsupported type, file above 25 MB
- Empty CSV, missing separator, unmatched quote, missing data rows, row limit
- Unreadable XLSX workbook, missing worksheet, expired local session
- Wide layout without detected PRB columns
- Long layout without both PRB index and value columns
- No valid measurements after timestamp, PRB, value, and decimal validation
- More than 2,000,000 normalized measurements

## Visualization and output cases

- From date is later than the To date
- Period filter excludes all valid measurements
- Manual color scale minimum is missing or not lower than its maximum
- Canvas rendering is unavailable
- Browser worker stops before local processing completes
- PNG image creation fails

The summary CSV export is formula-protected. Template downloads contain headers only and no network data.

If the browser worker fails, the interface discards it before the next retry. Selecting a new file or a synthetic demo also releases the previous workbook and normalized data from the active tool session.

## Privacy boundary

The Web Worker returns only a fixed code to the interface. It does not return a raw library error message, data excerpt, filename, worksheet name, header, cell identifier, counter value, or timestamp. The visible copy is selected locally from that fixed code.

The optional `nr-prb-usage` browser event also contains fixed allowlisted values only. A host may forward those categories after analytics consent, but it must not add imported data or free-form error text.
