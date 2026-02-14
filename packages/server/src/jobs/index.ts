import type { XFeedJob } from './x-feed.job.js';

export type { XFeedJob } from './x-feed.job.js';
export { createXFeedJob } from './x-feed.job.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export interface JobDeps {
  xFeed: XFeedJob;
}

/**
 * Starts all scheduled jobs. Runs immediately on start, then every hour.
 */
export function startJobs(deps: JobDeps): void {
  // Run immediately
  deps.xFeed.run().catch((err: unknown) => {
    console.error('[x-feed-job] initial run failed:', err);
  });

  intervalId = setInterval(() => {
    deps.xFeed.run().catch((err: unknown) => {
      console.error('[x-feed-job] scheduled run failed:', err);
    });
  }, ONE_HOUR_MS);
}

/**
 * Stops all scheduled jobs.
 */
export function stopJobs(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
