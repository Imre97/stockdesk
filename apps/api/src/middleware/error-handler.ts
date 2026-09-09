import type { ErrorCode } from "@stockdesk/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

const ISSUE_ERROR_CODES: readonly ErrorCode[] = ["INVALID_STOP_LIMIT_PRICES"];

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

/**
 * A cross-field refinement carries its API error code in the issue params, so the envelope reports
 * the dedicated code instead of the generic validation failure without matching on message text.
 */
function issueErrorCode(error: ZodError): ErrorCode {
  for (const issue of error.issues) {
    const params = "params" in issue ? (issue.params as { code?: unknown } | undefined) : undefined;
    const code = params?.code;

    if (typeof code === "string" && ISSUE_ERROR_CODES.includes(code as ErrorCode)) {
      return code as ErrorCode;
    }
  }

  return "VALIDATION_ERROR";
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
    response
      .status(422)
      .json(envelope(issueErrorCode(error), "Request validation failed.", error.issues));
    return;
  }

  response.status(500).json(envelope("INTERNAL_ERROR", "Internal server error."));
};
