/**
 * CSV writing.
 *
 * These files go to a CPA and get opened in Excel, so two things matter beyond
 * commas: a value that looks like a formula must not execute when the file is
 * opened, and a leading zero in an account reference must not be eaten.
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

/** Characters Excel and Sheets treat as the start of a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * A plain decimal number, optionally negative. Nothing else.
 *
 * Deliberately strict - no thousands separators, no currency symbol, no
 * exponent - so the exemption below cannot be talked into covering a value
 * that merely looks numeric.
 */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Escapes one field per RFC 4180, then defuses anything Excel would execute.
 *
 * A vendor legitimately named "-Superior Plumbing" or a note pasted from a
 * spreadsheet starting with "=" would otherwise run as a formula on open. The
 * leading apostrophe keeps the text readable while making it inert.
 *
 * A NEGATIVE NUMBER IS NOT A FORMULA, and this used to treat it as one. Every
 * net loss, every suspended loss carried forward, every held deposit went out
 * as '-11435.09 - which Excel reads as text, so the column would not sum. On a
 * file whose whole purpose is to be added up by an accountant that is the worst
 * possible place to be wrong, and it type-checked perfectly.
 */
export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  let text = typeof value === 'string' ? value : String(value);

  const isFormulaRisk =
    FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix)) && !PLAIN_NUMBER.test(text);

  if (isFormulaRisk) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvRow(values: readonly CsvValue[]): string {
  return values.map(escapeCsvField).join(',');
}

/** Builds a complete CSV document from typed column definitions. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [csvRow(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(csvRow(columns.map((c) => c.value(row))));
  }
  // CRLF is what RFC 4180 specifies and what Excel on Windows expects.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Prepends a UTF-8 byte order mark.
 *
 * Without it, Excel on Windows opens a UTF-8 CSV as the system codepage and a
 * property nicknamed "Peña St" arrives mangled.
 */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}

/** A filename that sorts usefully in a folder and says what it is. */
export function reportFilename(report: string, taxYear: number, extension = 'csv'): string {
  return `${taxYear}-${report}.${extension}`;
}
