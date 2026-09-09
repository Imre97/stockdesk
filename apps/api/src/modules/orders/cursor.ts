import { AppError } from "../../lib/errors.js";

export interface KeysetCursor {
  at: Date;
  id: string;
}

interface EncodedCursor {
  at: string;
  id: string;
}

export function invalidCursor(): AppError {
  return new AppError(422, "VALIDATION_ERROR", "The cursor is invalid.");
}

export function encodeKeysetCursor(at: Date, id: string): string {
  const payload: EncodedCursor = { at: at.toISOString(), id };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeKeysetCursor(value: string): KeysetCursor | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;

  const candidate = parsed as { at?: unknown; id?: unknown };
  if (typeof candidate.at !== "string" || typeof candidate.id !== "string") return undefined;

  const at = new Date(candidate.at);
  if (Number.isNaN(at.getTime())) return undefined;

  return { at, id: candidate.id };
}

export function requireCursor(value: string | undefined): KeysetCursor | undefined {
  if (value === undefined) return undefined;

  const cursor = decodeKeysetCursor(value);
  if (cursor === undefined) throw invalidCursor();

  return cursor;
}
