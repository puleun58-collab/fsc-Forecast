const FORMULA_PREFIXES = ['=', '+', '-', '@'] as const;

export type XlsxCellValue = string | number | boolean | null | undefined;

export function sanitizeXlsxCell(value: XlsxCellValue): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (value.length > 0 && FORMULA_PREFIXES.includes(value[0] as (typeof FORMULA_PREFIXES)[number])) {
    return `'${value}`;
  }

  return value;
}
