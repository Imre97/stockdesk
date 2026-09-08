import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { alwaysReady, type Readiness } from "../../readiness.js";

export type DatabaseCheck = () => Promise<unknown>;

export function defaultDatabaseCheck(): Promise<unknown> {
  return prisma.$queryRaw`SELECT 1`;
}

export function createHealthRouter(
  checkDatabase: DatabaseCheck = defaultDatabaseCheck,
  readiness: Readiness = alwaysReady,
): Router {
  const router = Router();

  router.get("/", async (_request, response) => {
    const ready = readiness.isReady();

    try {
      await checkDatabase();
      response.status(200).json({ status: "ok", database: "ok", ready });
    } catch {
      response.status(503).json({ status: "degraded", database: "unreachable", ready });
    }
  });

  return router;
}
