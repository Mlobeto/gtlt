import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { partTypesRouter } from "./routes/part-types.js";
import { tambosRouter } from "./routes/tambos.js";
import { milkingSessionsRouter } from "./routes/milking-sessions.js";
import { animalsRouter } from "./routes/animals.js";
import { healthEventsRouter } from "./routes/health-events.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "gtlt-api" });
  });

  app.use("/auth", authRouter);
  app.use("/part-types", partTypesRouter);
  app.use("/tambos", tambosRouter);
  app.use("/milking-sessions", milkingSessionsRouter);
  app.use("/animals", animalsRouter);
  app.use("/health-events", healthEventsRouter);

  app.use(
    (
      err: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status ?? 500;
      if (status >= 500) {
        console.error(err);
      }
      res.status(status).json({ error: err.message || "Internal error" });
    },
  );

  return app;
}
