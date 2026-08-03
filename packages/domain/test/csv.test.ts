import { describe, expect, it } from 'vitest';
import { csvRow, escapeCsvField, reportFilename, toCsv, withBom } from '../src/csv';

describe('CSV escaping', () => {
  it('leaves ordinary values alone', () => {
    expect(escapeCsvField('Maple St')).toBe('Maple St');
    expect(escapeCsvField(1234)).toBe('1234');
    expect(escapeCsvField(true)).toBe('true');
  });

  it('renders null and undefined as empty rather than the words', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('quotes fields containing a comma, quote, or newline', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"');
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses values Excel would run as a formula', () => {
    // A real vendor name or a pasted note must not execute on open.
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('-Superior Plumbing')).toBe("'-Superior Plumbing");
    expect(escapeCsvField('+44 7700 900000')).toBe("'+44 7700 900000");
    expect(escapeCsvField('@vendor')).toBe("'@vendor");
  });

  it('defuses and quotes when a value is both dangerous and comma-bearing', () => {
    expect(escapeCsvField('=SUM(A1,A2)')).toBe('"\'=SUM(A1,A2)"');
  });

  it('joins a row with commas', () => {
    expect(csvRow(['a', 'b,c', 1])).toBe('a,"b,c",1');
  });
});

describe('CSV documents', () => {
  const rows = [
    { name: 'Maple St', amount: 1200 },
    { name: 'Oak, Ave', amount: 950 },
  ];
  const columns = [
    { header: 'Property', value: (r: (typeof rows)[number]) => r.name },
    { header: 'Amount', value: (r: (typeof rows)[number]) => r.amount },
  ];

  it('writes a header row followed by the data', () => {
    expect(toCsv(rows, columns)).toBe(
      'Property,Amount\r\nMaple St,1200\r\n"Oak, Ave",950\r\n',
    );
  });

  it('writes just the header when there is nothing to report', () => {
    // An empty export must still open and show its columns, not be a blank file.
    expect(toCsv([], columns)).toBe('Property,Amount\r\n');
  });

  it('prefixes a byte order mark so Excel reads it as UTF-8', () => {
    const output = withBom(toCsv([{ name: 'Peña St', amount: 1 }], columns));
    expect(output.charCodeAt(0)).toBe(0xfeff);
    expect(output).toContain('Peña St');
  });

  it('names files so they sort by year and say what they are', () => {
    expect(reportFilename('schedule-e', 2026)).toBe('2026-schedule-e.csv');
    expect(reportFilename('time-log', 2026, 'txt')).toBe('2026-time-log.txt');
  });
});

describe('a negative number is not a formula', () => {
  it('leaves a net loss as a number Excel will sum', () => {
    // This shipped wrong once: every loss went out as '-11435.09, which Excel
    // reads as text. A CPA cannot total a column of text.
    expect(escapeCsvField('-11435.09')).toBe('-11435.09');
    expect(escapeCsvField(-11435.09)).toBe('-11435.09');
  });

  it('leaves negative integers and zero alone', () => {
    expect(escapeCsvField('-5')).toBe('-5');
    expect(escapeCsvField(-5)).toBe('-5');
    expect(escapeCsvField('0.00')).toBe('0.00');
    expect(escapeCsvField('-0.01')).toBe('-0.01');
  });

  it('still defuses a vendor whose name starts with a hyphen', () => {
    expect(escapeCsvField('-Superior Plumbing')).toBe("'-Superior Plumbing");
  });

  it('still defuses anything that is actually a formula', () => {
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('+A1')).toBe("'+A1");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvField('-1+1')).toBe("'-1+1");
    expect(escapeCsvField('=cmd|/c calc')).toBe("'=cmd|/c calc");
  });

  it('does not exempt things that only look like numbers', () => {
    // A thousands separator or a currency symbol means it came from somewhere
    // other than formatCentsPlain, so it is treated as text.
    // Defused and then quoted: the comma triggers RFC 4180 quoting on top.
    expect(escapeCsvField('-1,234.00')).toBe('"\'-1,234.00"');
    expect(escapeCsvField('-$5')).toBe("'-$5");
    expect(escapeCsvField('-1e9')).toBe("'-1e9");
    expect(escapeCsvField('-')).toBe("'-");
  });
});
