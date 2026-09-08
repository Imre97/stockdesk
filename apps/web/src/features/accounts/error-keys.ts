import { getErrorCode } from "../../lib/http";

const KNOWN_CODES = ["ACCOUNT_NAME_TAKEN", "ACCOUNT_LIMIT_REACHED"];
const GENERIC_KEY = "errors.generic";

export function toAccountErrorKey(error: unknown): string {
  const code = getErrorCode(error);

  return code !== null && KNOWN_CODES.includes(code) ? `errors.${code}` : GENERIC_KEY;
}
