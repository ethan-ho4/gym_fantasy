import { endOfWeek, format, startOfWeek } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const EASTERN_TZ = 'America/New_York';

export function nowInEastern(): Date {
  return toZonedTime(new Date(), EASTERN_TZ);
}

export function getCurrentWeekBoundsEastern(reference = new Date()) {
  const easternNow = toZonedTime(reference, EASTERN_TZ);
  const weekStartLocal = startOfWeek(easternNow, { weekStartsOn: 1 });
  const weekEndLocal = endOfWeek(easternNow, { weekStartsOn: 1 });

  const weekStart = fromZonedTime(
    new Date(
      weekStartLocal.getFullYear(),
      weekStartLocal.getMonth(),
      weekStartLocal.getDate(),
      0,
      0,
      0,
      0,
    ),
    EASTERN_TZ,
  );

  const weekEnd = fromZonedTime(
    new Date(
      weekEndLocal.getFullYear(),
      weekEndLocal.getMonth(),
      weekEndLocal.getDate(),
      23,
      59,
      59,
      999,
    ),
    EASTERN_TZ,
  );

  return { weekStart, weekEnd };
}

export function isPastWeeklyCutoff(weekEndIso: string, reference = new Date()): boolean {
  return reference.getTime() > new Date(weekEndIso).getTime();
}

export function formatEastern(date: Date | string, pattern = 'EEE MMM d, h:mm a'): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return format(toZonedTime(value, EASTERN_TZ), pattern);
}

export function formatCountdownToCutoff(weekEndIso: string): string {
  const remaining = new Date(weekEndIso).getTime() - Date.now();
  if (remaining <= 0) return 'Week closed';

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function currentSeasonBounds(reference = nowInEastern()): { startDate: string; endDate: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();

  if (month < 4) {
    return { startDate: `${year}-01-01`, endDate: `${year}-04-30` };
  }
  if (month < 8) {
    return { startDate: `${year}-05-01`, endDate: `${year}-08-31` };
  }
  return { startDate: `${year}-09-01`, endDate: `${year}-12-31` };
}
