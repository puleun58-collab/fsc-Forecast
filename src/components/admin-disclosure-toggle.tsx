/** 관리자 화면의 모든 접기 영역은 왼쪽에 영역명, 오른쪽에 보기/접기만 표시한다. */
export function AdminDisclosureToggle({ className }: { className?: string } = {}) {
  return (
    <span className={`admin-disclosure__toggle ${className ?? ''}`.trim()} aria-hidden="true">
      <span className="admin-disclosure__toggle-closed">보기 ▾</span>
      <span className="admin-disclosure__toggle-open">접기 ▴</span>
    </span>
  );
}
