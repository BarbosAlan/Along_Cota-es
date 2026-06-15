import { getDay, subDays } from 'date-fns';

export function isWeekend(date: Date): boolean {
  const d = getDay(date);
  return d === 0 || d === 6;
}

/**
 * Walks backwards from `date` to find the nearest non-weekend day,
 * up to `maxDays` attempts. Returns the adjusted date, or the original
 * if it's already a weekday.
 */
export function prevBusinessDay(date: Date, maxDays = 10): Date {
  let d = date;
  for (let i = 0; i < maxDays; i++) {
    if (!isWeekend(d)) return d;
    d = subDays(d, 1);
  }
  return d;
}
