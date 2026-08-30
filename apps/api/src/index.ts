import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { startPlanPriceScheduler } from "./lib/plan-price-scheduler.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`GTLT API listening on http://localhost:${env.port}`);
});

startPlanPriceScheduler();
