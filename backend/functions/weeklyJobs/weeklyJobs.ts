import { leagueWeekOf, type LeagueWeek } from '../../lib/leagueWeek';
import { runPayroll } from '../../lib/economy/payroll';

/**
 * Shared weekly jobs (ECO-06), run every hour. The league week starts Sunday
 * 00:00 league time; each job keeps its own once-per-week marker in site
 * config, so the first tick of a new week does the work and later ticks find
 * it done. A job that fails part-way leaves its marker unset and is retried on
 * the next tick. A missed Sunday (the function was down) runs on the first tick
 * back and logs a warning; never more than once per week.
 *
 * INJ-05's stamina recovery joins this list instead of adding its own schedule.
 */
interface WeeklyJob {
  name: string;
  run(now: Date, week: LeagueWeek): Promise<{ status: string }>;
}

const WEEKLY_JOBS: WeeklyJob[] = [
  { name: 'payroll', run: runPayroll },
];

export interface WeeklyJobsResult {
  weekKey: string;
  jobs: Record<string, string>;
}

export const handler = async (): Promise<WeeklyJobsResult> => {
  const now = new Date();
  const week = leagueWeekOf(now);
  const result: WeeklyJobsResult = { weekKey: week.weekKey, jobs: {} };

  for (const job of WEEKLY_JOBS) {
    try {
      const outcome = await job.run(now, week);
      result.jobs[job.name] = outcome.status;
      if (outcome.status !== 'alreadyRun' && !week.isSunday) {
        console.warn(`Weekly job ${job.name} ran late for week ${week.weekKey} (Sunday was missed)`);
      }
      console.log(`Weekly job ${job.name}:`, JSON.stringify(outcome));
    } catch (err) {
      result.jobs[job.name] = 'error';
      console.error(`Weekly job ${job.name} failed for week ${week.weekKey}:`, err);
    }
  }

  return result;
};
