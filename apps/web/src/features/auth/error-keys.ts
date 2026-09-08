const NAMESPACE = "auth";

export type FieldErrorKeys = Record<string, string>;

export interface IssueLike {
  path: readonly PropertyKey[];
  code: string;
}

function key(name: string): string {
  return `${NAMESPACE}:errors.${name}`;
}

export const GENERIC_ERROR_KEY = key("generic");

const TOO_BIG = "too_big";

export const LOGIN_FIELD_ERROR_KEYS: FieldErrorKeys = {
  email: key("emailInvalid"),
  password: key("passwordRequired"),
};

export const REGISTER_FIELD_ERROR_KEYS: FieldErrorKeys = {
  email: key("emailInvalid"),
  password: key("passwordTooShort"),
  [`password.${TOO_BIG}`]: key("passwordTooLong"),
  displayName: key("displayNameRequired"),
  [`displayName.${TOO_BIG}`]: key("displayNameTooLong"),
};

const SERVER_ERROR_KEYS: Record<string, string> = {
  VALIDATION_ERROR: key("VALIDATION_ERROR"),
  EMAIL_TAKEN: key("EMAIL_TAKEN"),
  INVALID_CREDENTIALS: key("INVALID_CREDENTIALS"),
  UNAUTHORIZED: key("UNAUTHORIZED"),
  REFRESH_REUSED: key("UNAUTHORIZED"),
  RATE_LIMITED: key("RATE_LIMITED"),
};

export function toServerErrorKey(code: string | null): string {
  if (code === null) {
    return GENERIC_ERROR_KEY;
  }

  return SERVER_ERROR_KEYS[code] ?? GENERIC_ERROR_KEY;
}

export function toFieldErrorKeys(issues: readonly IssueLike[], keys: FieldErrorKeys): FieldErrorKeys {
  const result: FieldErrorKeys = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field !== "string" || result[field] !== undefined) {
      continue;
    }

    result[field] = keys[`${field}.${issue.code}`] ?? keys[field] ?? GENERIC_ERROR_KEY;
  }

  return result;
}
