# Synthetic samples

These files provide synthetic test data and empty CSV starting templates. They do not reproduce any customer, OSS, gNB, or vendor export.

| File                                | Purpose                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `persistent-273-prb.csv`            | Wide CSV with 273 PRBs and several persistent interference features                                         |
| `temporary-broadband-273-prb.csv`   | Semicolon-delimited wide CSV with decimal commas and a temporary wideband feature                           |
| `multi-cell-long.csv`               | Long CSV with three synthetic cells                                                                         |
| `controlled-missing-and-errors.csv` | Small wide CSV with non-contiguous PRBs, missing values, an invalid timestamp, and an invalid numeric value |
| `synthetic-prb-examples.xlsx`       | XLSX workbook with wide and long worksheets                                                                 |
| `nr-prb-wide-template.csv`          | Empty wide-layout template with three example PRB columns to extend or reduce                               |
| `nr-prb-long-template.csv`          | Empty long-layout template whose rows scale to any detected PRB range                                       |

Run `npm run generate:samples` to regenerate the synthetic datasets and XLSX workbook. The two empty templates are kept as stable header-only files.
