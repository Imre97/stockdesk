import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function envelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  if (details === undefined) {
    return { error: { code, message } };
  }
  return { error: { code, message, details } };
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json(envelope(error.code, error.message, error.details));
    return;
  }

  if (error instanceof ZodError) {
    response.status(422).json(envelope("VALIDATION_ERROR", "Request validation failed.", error.issues));
    return;
  }

  response.status(500).json(envelope("INTERNAL_ERROR", "Internal server error."));
};
