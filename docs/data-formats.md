# Data formats

The visualizer accepts `.csv` and `.xlsx` files up to 25 MB. The parser limits CSV input to 250,000 rows and normalized data to 2,000,000 measurements to protect browser memory.

## Wide layout

Each row represents a timestamp, interval, or snapshot. Each PRB has its own column.

```csv
timestamp,cell_id,PRB_0,PRB_1,PRB_2
2026-01-01T10:00:00Z,CELL_A,-111.2,-103.8,-109.4
2026-01-01T10:05:00Z,CELL_A,-110.8,-102.5,-109.1
```

Supported PRB header families include:

- `PRB_0` and `PRB0`
- `RB_0` and `RB0`
- numeric headers such as `0`, `1`, and `2`

The numeric suffix is the PRB index. Indices may be sparse and the total count is dynamic.

## Long layout

Each row represents one PRB measurement.

```csv
timestamp,cell_id,prb,interference
2026-01-01T10:00:00Z,CELL_A,0,-111.2
2026-01-01T10:00:00Z,CELL_A,1,-103.8
2026-01-01T10:00:00Z,CELL_B,0,-108.6
```

The mapper requires a PRB index column and a value column. Timestamp and cell columns are optional.

## Snapshot

A wide file can omit its timestamp column:

```csv
cell_id,RB0,RB1,RB2
CELL_A,-111.2,-103.8,-109.4
```

The visualizer labels these rows as snapshots and preserves their input order.

## CSV details

- Delimiters: comma, semicolon, or tab
- Quoting: standard double-quoted fields and doubled quote escaping
- Decimals: point, decimal comma in unambiguous contexts, or an explicit convention in the mapper
- Missing markers: empty string, `NA`, `N/A`, `null`, `none`, or `-`

A semicolon-delimited decimal comma example:

```csv
timestamp;cell_id;PRB_0;PRB_1
2026-01-01T10:00:00Z;CELL_A;-111,2;-103,8
```

## XLSX details

The mapper lists every readable worksheet. Select a sheet before confirming the columns. Formula cells are read as the values exposed by the workbook parser. The tool does not execute spreadsheet formulas.

## Timestamps

Accepted values include ISO 8601 strings, browser-parseable date strings, JavaScript `Date` values supplied by the XLSX parser, and Excel serial dates. Invalid timestamps are counted and excluded from time filtering.

## Measurement semantics

Choose one of:

- dBm
- dB
- raw or vendor counter
- custom unit

Choose whether a higher or lower value represents more interference. The tool does not infer a quality verdict from an unknown counter.

For dBm, the mean is calculated as:

```text
mean_dBm = 10 * log10(mean(10^(value_dBm / 10)))
```

Other modes use an arithmetic mean.
