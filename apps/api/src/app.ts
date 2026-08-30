import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { partTypesRouter } from "./routes/part-types.js";
import { tambosRouter } from "./routes/tambos.js";
import { milkingSessionsRouter } from "./routes/milking-sessions.js";
import { animalsRouter } from "./routes/animals.js";
import { healthEventsRouter } from "./routes/health-events.js";
import { reproEventsRouter } from "./routes/repro-events.js";
import { milkDeliveriesRouter } from "./routes/milk-deliveries.js";
import { controlLecherosRouter } from "./routes/control-lecheros.js";
import { membershipsRouter } from "./routes/memberships.js";
import { partInstancesRouter } from "./routes/part-instances.js";
import { serviceRequestsRouter } from "./routes/service-requests.js";
import { notificationsRouter } from "./routes/notifications.js";
import { supportTicketsRouter } from "./routes/support-tickets.js";
import { appPrototypeConfigRouter } from "./routes/app-prototype-config.js";
import { flowSessionsRouter } from "./routes/flow-sessions.js";
import { flowSessionsDeviceRouter } from "./routes/flow-sessions-device.js";
import { softAuthenticate } from "./middleware/soft-authenticate.js";
import { technicianResourceGuard } from "./middleware/technician-guard.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "gtlt-api" });
  });

  // Whitelist TECNICO: bloquea animales/producción aunque se agregue un route nuevo.
  app.use(softAuthenticate);
  app.use(technicianResourceGuard);

  app.use("/auth", authRouter);
  app.use("/part-types", partTypesRouter);
  app.use("/tambos", tambosRouter);
  app.use("/memberships", membershipsRouter);
  app.use("/part-instances", partInstancesRouter);
  app.use("/service-requests", serviceRequestsRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/support-tickets", supportTicketsRouter);
  app.use("/app-prototype-config", appPrototypeConfigRouter);
  app.use("/milking-sessions", milkingSessionsRouter);
  app.use("/animals", animalsRouter);
  app.use("/health-events", healthEventsRouter);
  app.use("/repro-events", reproEventsRouter);
  app.use("/milk-deliveries", milkDeliveriesRouter);
  app.use("/control-lecheros", controlLecherosRouter);
  app.use("/device", flowSessionsDeviceRouter);
  app.use("/flow-sessions", flowSessionsRouter);

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
