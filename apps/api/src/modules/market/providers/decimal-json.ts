import { Decimal } from "@stockdesk/shared";

interface JsonParseContext {
  source?: string;
}

type SourceAwareReviver = (key: string, value: unknown, context?: JsonParseContext) => unknown;

type StandardReviver = Parameters<typeof JSON.parse>[1];

export function parseJsonWithDecimals(text: string, decimalKeys: ReadonlySet<string>): unknown {
  const reviver: SourceAwareReviver = (key, value, context) => {
    if (typeof value !== "number" || !decimalKeys.has(key)) return value;

    const source = context?.source;

    if (typeof source !== "string") {
      throw new Error(`Unable to read the raw JSON text for the decimal field "${key}".`);
    }

    return new Decimal(source);
  };

  return JSON.parse(text, reviver as StandardReviver);
}
