const SUB_MILLISECOND_DIGITS = /(\.\d{3})\d+/;

export function alpacaTimestampToDate(timestamp: string): Date {
  return new Date(timestamp.replace(SUB_MILLISECOND_DIGITS, "$1"));
}
