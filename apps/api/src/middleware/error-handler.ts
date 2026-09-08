import type { ErrorCode } from "@stockdesk/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  if (details === undefined) {
    return { error: { code, message } };
  }
  return { error: { code, message, details } };
}

function isPayloadTooLarge(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { type?: unknown; name?: unknown };

  return candidate.type === "entity.too.large" || candidate.name === "PayloadTooLargeError";
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json(envelope(error.code, error.message, error.details));
    return;
  }

  if (isPayloadTooLarge(error)) {
    response.status(413).json(envelope("PAYLOAD_TOO_LARGE", "Request body is too large."));
    return;
  }

  if (error instanceof ZodError) {
    response.status(422).json(envelope("VALIDATION_ERROR", "Request validation failed.", error.issues));
    return;
  }

  response.status(500).json(envelope("INTERNAL_ERROR", "Internal server error."));
};
