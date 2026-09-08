import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getConfig } from "./lib/config.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(): express.Express {
  const config = getConfig();
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const apiRouter = express.Router();
  app.use("/api/v1", apiRouter);

  app.use(errorHandler);

  return app;
}
