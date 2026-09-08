import path from "node:path";
import express, { type Express } from "express";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isServerPath(requestPath: string): boolean {
  return requestPath.startsWith("/api") || requestPath.startsWith("/ws");
}

export function mountStaticWeb(app: Express, distDir: string): void {
  const indexFile = path.join(distDir, "index.html");

  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), { index: false, immutable: true, maxAge: ONE_YEAR_MS }),
  );

  app.use(express.static(distDir, { index: false, maxAge: 0 }));

  app.get(/.*/, (request, response, next) => {
    if (isServerPath(request.path)) {
      next();
      return;
    }

    response.setHeader("Cache-Control", "no-cache");
    response.sendFile(indexFile);
  });
}
