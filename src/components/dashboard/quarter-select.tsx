'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { FscDashboardQuarterSummary } from '@/lib/dashboard/fsc-types';
import { formatQuarterLabel } from '@/lib/dashboard/display-format';

type QuarterSelectProps = {
  quarter?: FscDashboardQuarterSummary;
  availableQuarters?: readonly FscDashboardQuarterSummary[];
};

function toQuarterValue(targetYear: number, targetQuarter: number): string {
  return `${targetYear}-${targetQuarter}`;
}

export function QuarterSelect({ quarter, availableQuarters = [] }: QuarterSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const options =
    availableQuarters.length > 0
      ? availableQuarters
      : quarter
        ? [quarter]
        : [];
  const selectedValue = quarter ? toQuarterValue(quarter.targetYear, quarter.targetQuarter) : '';

  if (options.length === 0) {
    return (
      <label className="ops-header__select-label">
        <span>Active quarter</span>
        <select className="ops-header__select" defaultValue="" disabled>
          <option value="">Active quarter 없음</option>
        </select>
      </label>
    );
  }

  return (
    <label className="ops-header__select-label">
      <span>조회 분기</span>
      <select
        className="ops-header__select"
        value={selectedValue}
        disabled={isPending}
        onChange={(event) => {
          const [year, targetQuarter] = event.target.value.split('-');

          startTransition(() => {
            router.push(`/?year=${year}&quarter=${targetQuarter}`, { scroll: false });
          });
        }}
      >
        {options.map((option) => (
          <option
            key={toQuarterValue(option.targetYear, option.targetQuarter)}
            value={toQuarterValue(option.targetYear, option.targetQuarter)}
          >
            {formatQuarterLabel(option.targetYear, option.targetQuarter)}
            {option.isActive ? ' · 진행 중' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
