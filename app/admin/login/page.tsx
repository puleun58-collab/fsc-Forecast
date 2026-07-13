import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin-login-form';
import { SectionCard } from '@/components/section-card';
import { getAdminSession, isAdminAuthReady } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (getAdminSession() !== null) {
    redirect('/admin');
  }

  return (
    <main className="dashboard-shell" style={{ display: 'grid', gap: 24 }}>
      <section className="dashboard-shell__hero" style={{ display: 'grid', gap: 16 }}>
        <p className="dashboard-shell__eyebrow">Authenticated admin</p>
        <h1 className="dashboard-shell__title">FSC Admin Login</h1>
        <p className="dashboard-shell__lead">
          관리자 비밀번호를 검증한 뒤 서명된 httpOnly 세션 쿠키를 발급합니다.
        </p>
      </section>

      <SectionCard
        title="관리자 로그인"
        badge={isAdminAuthReady() ? '설정 확인됨' : '설정 필요'}
        description="ADMIN_PASSWORD_HASH와 ADMIN_SESSION_SECRET이 유효해야 로그인할 수 있습니다."
        highlight
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <AdminLoginForm />
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <li>세션 쿠키는 httpOnly + sameSite=strict로 발급됩니다.</li>
            <li>ADMIN_SESSION_SECRET을 교체하면 기존 세션은 모두 무효화됩니다.</li>
            <li>세션 만료일은 ADMIN_SESSION_MAX_AGE_DAYS로 조정합니다.</li>
          </ul>
        </div>
      </SectionCard>
    </main>
  );
}
