import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { myRouter } from "./routes/my.js";
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
import { pumpStatusDeviceRouter } from "./routes/pump-status-device.js";
import { adminRouter } from "./routes/admin-tenants.js";
import { adminSupportTicketsRouter } from "./routes/admin-support-tickets.js";
import { adminServiceProvidersRouter } from "./routes/admin-service-providers.js";
import { adminDevicesRouter } from "./routes/admin-devices.js";
import { adminTamboRequestsRouter } from "./routes/admin-tambo-requests.js";
import { adminTambosRouter } from "./routes/admin-tambos.js";
import { tamboRequestsRouter } from "./routes/tambo-requests.js";
import { devicesRouter } from "./routes/devices.js";
import { weightEventsRouter } from "./routes/weight-events.js";
import { animalPhotosRouter } from "./routes/animal-photos.js";
import { siresRouter } from "./routes/sires.js";
import { uploadsRouter } from "./routes/uploads.js";
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
  app.use("/my", myRouter);
  app.use("/part-types", partTypesRouter);
  app.use("/tambos", tambosRouter);
  app.use("/tambo-requests", tamboRequestsRouter);
  app.use("/memberships", membershipsRouter);
  app.use("/part-instances", partInstancesRouter);
  app.use("/service-requests", serviceRequestsRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/support-tickets", supportTicketsRouter);
  app.use("/app-prototype-config", appPrototypeConfigRouter);
  app.use("/milking-sessions", milkingSessionsRouter);
  app.use("/animals", animalsRouter);
  app.use("/animals/:animalId/photos", animalPhotosRouter);
  app.use("/health-events", healthEventsRouter);
  app.use("/repro-events", reproEventsRouter);
  app.use("/milk-deliveries", milkDeliveriesRouter);
  app.use("/control-lecheros", controlLecherosRouter);
  app.use("/weight-events", weightEventsRouter);
  app.use("/sires", siresRouter);
  app.use("/devices", devicesRouter);
  app.use("/device", flowSessionsDeviceRouter);
  app.use("/device", pumpStatusDeviceRouter);
  app.use("/flow-sessions", flowSessionsRouter);
  app.use("/admin", adminRouter);
  app.use("/admin", adminSupportTicketsRouter);
  app.use("/admin", adminServiceProvidersRouter);
  app.use("/admin", adminDevicesRouter);
  app.use("/admin", adminTamboRequestsRouter);
  app.use("/admin", adminTambosRouter);
  app.use("/uploads", uploadsRouter);

  app.use(
    (
      err: Error & { status?: number; code?: string; extra?: Record<string, unknown> },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status ?? (err.name === "MulterError" ? 400 : 500);
      if (status >= 500) {
        console.error(err);
      }
      res.status(status).json({
        error: err.message || "Internal error",
        ...(err.code ? { code: err.code } : {}),
        ...(err.extra ?? {}),
      });
    },
  );

  return app;
}
