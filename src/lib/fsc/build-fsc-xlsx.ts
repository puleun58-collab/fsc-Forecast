import * as XLSX from 'xlsx';

import type { FscExportDataset } from './build-fsc-export-dataset';
import { sanitizeXlsxCell } from './sanitize-xlsx-cell';

type SheetRowValue = string | number | boolean | null;

function sanitizeRow(row: object): Record<string, SheetRowValue> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeXlsxCell(value as SheetRowValue)]),
  );
}

function appendJsonSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: readonly object[],
): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => sanitizeRow(row)));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
  return worksheet;
}

function applyFormatByHeader(
  worksheet: XLSX.WorkSheet,
  headerNames: readonly string[],
  format: string,
): void {
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1');
  const headerMap = new Map<string, number>();

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const headerCell = worksheet[XLSX.utils.encode_cell({ c: column, r: range.s.r })];
    if (headerCell && typeof headerCell.v === 'string') {
      headerMap.set(headerCell.v, column);
    }
  }

  for (const headerName of headerNames) {
    const column = headerMap.get(headerName);
    if (column === undefined) {
      continue;
    }

    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const cellRef = XLSX.utils.encode_cell({ c: column, r: row });
      const cell = worksheet[cellRef];
      if (!cell || cell.v === null || cell.v === undefined || typeof cell.v !== 'number') {
        continue;
      }
      cell.z = format;
    }
  }
}

function applyCommonFormats(workbook: XLSX.WorkBook): void {
  const priceColumns = [
    'base_price',
    'applied_price',
    'quarter_average_price',
    'price_diff',
    'fsc_30',
    'fsc_70',
    'price_krw_per_l',
    'actual_price_krw_per_l',
    'forecast_price_krw_per_l',
    'recent_13w_weekly_price_mae',
    'recent_13w_quarter_average_price_mae',
    'recent_4w_weekly_price_mae',
    'recent_26w_weekly_price_mae',
    'forecast_bias_4w',
    'forecast_bias_13w',
  ];
  const ratioColumns = [
    'diff_ratio',
    'fsc_low_rate',
    'fsc_high_rate',
    'recent_13w_weekly_price_mape',
    'recent_13w_direction_accuracy',
  ];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    applyFormatByHeader(worksheet, priceColumns, '0.000');
    applyFormatByHeader(worksheet, ratioColumns, '0.000000%');
  }
}

export function buildFscXlsx(dataset: FscExportDataset): Uint8Array {
  const workbook = XLSX.utils.book_new();

  appendJsonSheet(workbook, 'FSC_Summary', dataset.summary);
  appendJsonSheet(workbook, 'Quarter_Weeks', dataset.quarterWeeks);
  appendJsonSheet(workbook, 'Reliability', dataset.reliability);
  appendJsonSheet(workbook, 'Calculation_Basis', dataset.calculationBasis);
  appendJsonSheet(workbook, 'Approval_Audit', dataset.approvalAudit);

  applyCommonFormats(workbook);

  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
}
