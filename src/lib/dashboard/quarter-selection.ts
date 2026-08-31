export interface QuarterSelection {
  targetYear: number;
  targetQuarter: number;
}

export interface QuarterCandidate {
  targetYear: number;
  targetQuarter: number;
}

export function parseQuarterSelection(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): QuarterSelection | null {
  const readInteger = (value: string | string[] | undefined): number | null => {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number.parseInt(raw ?? '', 10);

    return Number.isInteger(parsed) ? parsed : null;
  };
  const targetYear = readInteger(searchParams?.year);
  const targetQuarter = readInteger(searchParams?.quarter);

  if (targetYear === null || targetQuarter === null) {
    return null;
  }

  if (targetQuarter < 1 || targetQuarter > 4) {
    return null;
  }

  return { targetYear, targetQuarter };
}

export function resolveSelectedQuarter<T extends QuarterCandidate>(
  quarters: readonly T[],
  selection: QuarterSelection | null,
  activeQuarter: T,
): T {
  if (selection === null) {
    return activeQuarter;
  }

  return (
    quarters.find(
      (candidate) =>
        candidate.targetYear === selection.targetYear &&
        candidate.targetQuarter === selection.targetQuarter,
    ) ?? activeQuarter
  );
}
