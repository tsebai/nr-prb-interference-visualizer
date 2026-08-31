# Synthetic samples

These files are generated for testing and demonstration. They do not reproduce any customer, OSS, gNB, or vendor export.

| File                                | Purpose                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `persistent-273-prb.csv`            | Wide CSV with 273 PRBs and several persistent interference features                                         |
| `temporary-broadband-273-prb.csv`   | Semicolon-delimited wide CSV with decimal commas and a temporary wideband feature                           |
| `multi-cell-long.csv`               | Long CSV with three synthetic cells                                                                         |
| `controlled-missing-and-errors.csv` | Small wide CSV with non-contiguous PRBs, missing values, an invalid timestamp, and an invalid numeric value |
| `synthetic-prb-examples.xlsx`       | XLSX workbook with wide and long worksheets                                                                 |

Run `npm run generate:samples` to regenerate the files.
