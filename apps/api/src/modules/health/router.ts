import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export type DatabaseCheck = () => Promise<unknown>;

export function defaultDatabaseCheck(): Promise<unknown> {
  return prisma.$queryRaw`SELECT 1`;
}

export function createHealthRouter(checkDatabase: DatabaseCheck = defaultDatabaseCheck): Router {
  const router = Router();

  router.get("/", async (_request, response) => {
    try {
      await checkDatabase();
      response.status(200).json({ status: "ok", database: "ok" });
    } catch {
      response.status(503).json({ status: "degraded", database: "unreachable" });
    }
  });

  return router;
}
