export interface Warning {
  code: string;
  message: string;
  count: number;
  example?: string;
}

/** Deduplicates by `code`; keeps the first message and example, counts the rest. */
export class WarningCollector {
  private readonly byCode = new Map<string, Warning>();

  add(code: string, message: string, example?: string): void {
    const existing = this.byCode.get(code);
    if (existing) {
      existing.count += 1;
      return;
    }
    this.byCode.set(code, { code, message, count: 1, ...(example !== undefined ? { example } : {}) });
  }

  list(): Warning[] {
    return [...this.byCode.values()];
  }
}
