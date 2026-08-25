export interface FscForecastSourceIdentity {
  recomputeSnapshotId: string;
  forecastRunId: string;
}

export interface FscResultSourceIdentity {
  sourceRecomputeSnapshotId: string;
  forecastRunId: string | null;
}

export function isFscResultStaleForForecast(
  result: FscResultSourceIdentity | null,
  source: FscForecastSourceIdentity,
): boolean {
  return (
    result === null ||
    result.sourceRecomputeSnapshotId !== source.recomputeSnapshotId ||
    result.forecastRunId !== source.forecastRunId
  );
}
