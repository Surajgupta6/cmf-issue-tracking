import cron, { ScheduledTask } from "node-cron";
import { runSlaBreachDetection } from "./sla-breach.job.js";

/**
 * Job Registry
 *
 * Central place to register and manage all background cron jobs.
 * Called once from server.ts on startup.
 *
 * Each job returns a ScheduledTask that can be stopped during graceful shutdown.
 *
 * Cron Schedule Reference:
 *   ┌─────────── minute (0-59)
 *   │ ┌───────── hour (0-23)
 *   │ │ ┌─────── day of month (1-31)
 *   │ │ │ ┌───── month (1-12)
 *   │ │ │ │ ┌─── day of week (0-7, 0 and 7 = Sunday)
 *   │ │ │ │ │
 *   * * * * *
 */

const JOBS: Array<{ name: string; schedule: string; fn: () => Promise<void> }> = [
  {
    name: "SLA Breach Detection",
    // Every 5 minutes — balances freshness vs DB load.
    // Production: tune to "*/1" (every minute) with a Redis lock to prevent
    // concurrent runs across multiple server instances.
    schedule: "*/5 * * * *",
    fn: runSlaBreachDetection,
  },
];

let activeTasks: ScheduledTask[] = [];

/**
 * Start all registered background jobs.
 * Call this once from server.ts after the Express server starts.
 */
export function startJobs(): void {
  if (process.env.DISABLE_JOBS === "true") {
    console.log("[Jobs] Background jobs disabled (DISABLE_JOBS=true)");
    return;
  }

  activeTasks = JOBS.map(({ name, schedule, fn }) => {
    const task = cron.schedule(schedule, async () => {
      try {
        await fn();
      } catch (err) {
        // Catch-all so a job crash doesn't kill the process
        console.error(`[Jobs] Uncaught error in "${name}":`, err);
      }
    });

    console.log(`[Jobs] ✓ Registered "${name}" → cron: "${schedule}"`);
    return task;
  });

  console.log(`[Jobs] ${activeTasks.length} job(s) running`);
}

/**
 * Stop all jobs gracefully.
 * Called from the SIGTERM/SIGINT handler in server.ts.
 */
export function stopJobs(): void {
  activeTasks.forEach((task) => task.stop());
  activeTasks = [];
  console.log("[Jobs] All background jobs stopped");
}

/**
 * Trigger the SLA breach job on-demand (e.g., from an admin endpoint or test).
 */
export { runSlaBreachDetection };
