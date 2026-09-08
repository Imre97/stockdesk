import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signAccessToken } from "../modules/auth/tokens.js";
import { errorHandler } from "./error-handler.js";
import { requireAuth } from "./require-auth.js";

function buildApp(): express.Express {
  const app = express();

  app.get("/protected", requireAuth, (req, res) => {
    res.json({ id: req.user?.id });
  });

  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe("requireAuth", () => {
  it("rejects a request without an Authorization header", async () => {
    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects a non-Bearer scheme", async () => {
    const response = await request(app).get("/protected").set("Authorization", "Basic abcdef");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("rejects an invalid token", async () => {
    const response = await request(app).get("/protected").set("Authorization", "Bearer not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("sets the user on the request for a valid token", async () => {
    const token = signAccessToken("user-42");

    const response = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "user-42" });
  });
});
