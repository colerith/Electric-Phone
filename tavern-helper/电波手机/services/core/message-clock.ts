import { resolveClock, type SystemClockSettings } from './system-clock';

let liveClock: (() => Date | null) | undefined;
export function registerMessageClock(reader: () => Date | null): () => void {
  liveClock = reader;
  return () => {
    if (liveClock === reader) liveClock = undefined;
  };
}
export function messageClockTime(settings: SystemClockSettings): number {
  const live = liveClock?.();
  if (live) return live.getTime();
  const civil = resolveClock(settings, Date.now(), '');
  if (civil === null) return Date.now();
  const date = new Date(civil);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ).getTime();
}
