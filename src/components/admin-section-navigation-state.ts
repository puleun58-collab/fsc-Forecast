export type HashReleaseTimers = {
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (timer: number) => void;
};

export function scheduleHashTargetRelease(
  previousTimer: number | null,
  onRelease: () => void,
  timers?: HashReleaseTimers,
): number {
  const cancel = timers?.cancel ?? ((timer: number) => window.clearTimeout(timer));
  const schedule =
    timers?.schedule ??
    ((callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs));

  if (previousTimer !== null) {
    cancel(previousTimer);
  }

  return schedule(onRelease, 1_600);
}
