import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.status(200).json({ status: "ok", database: "ok" });
    } catch {
      response.status(503).json({ status: "degraded", database: "unreachable" });
    }
  });

  return router;
}
