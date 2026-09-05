import { Formatter, FormatterOptions } from './types.js';

export class CSVFormatter implements Formatter {
  constructor(private options: FormatterOptions) {}

  format(data: unknown): string {
    // Handle structured responses (comments, links, etc.)
    let items: unknown[];
    if (Array.isArray(data)) {
      items = data;
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'links' in data &&
      Array.isArray((data as Record<string, unknown>).links)
    ) {
      // Extract links array from structured response
      items = (data as Record<string, unknown>).links as unknown[];
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'comments' in data &&
      Array.isArray((data as Record<string, unknown>).comments)
    ) {
      // Extract comments array from structured response
      items = (data as Record<string, unknown>).comments as unknown[];
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'queues' in data &&
      Array.isArray((data as Record<string, unknown>).queues)
    ) {
      // Extract queue names array from list_queues response
      items = (data as Record<string, unknown>).queues as unknown[];
    } else if (
      typeof data === 'object' &&
      data !== null &&
      'agent' in data &&
      'tasks' in data &&
      Array.isArray((data as Record<string, unknown>).tasks)
    ) {
      // Extract tasks array from queue view response
      items = (data as Record<string, unknown>).tasks as unknown[];
    } else {
      items = [data];
    }

    if (items.length === 0) {
      return '';
    }

    // Single-column output for lists of primitives (e.g. queue names)
    if (typeof items[0] !== 'object' || items[0] === null) {
      return ['name', ...items.map((item) => this.formatValue(item))].join('\n');
    }

    // Get headers from first object
    const firstItem = items[0] as Record<string, unknown>;
    const headers = Object.keys(firstItem);

    // Format header row
    const lines = [this.formatRow(headers)];

    // Format data rows
    items.forEach((item) => {
      const values = headers.map((h) => this.formatValue((item as Record<string, unknown>)[h]));
      lines.push(this.formatRow(values));
    });

    return lines.join('\n');
  }

  private formatRow(values: string[]): string {
    return values.map((v) => this.escapeCSV(v)).join(',');
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.join(';');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private escapeCSV(value: string): string {
    // Prevent CSV injection by prefixing formula characters with single quote
    // This forces spreadsheet applications to treat the value as literal text
    const formulaChars = ['=', '+', '-', '@'];
    if (formulaChars.some(char => value.startsWith(char))) {
      value = `'${value}`;
    }
    
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
