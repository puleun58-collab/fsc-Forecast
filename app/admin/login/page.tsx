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
    <main id="main-content" className="dashboard-shell admin-grid">
      <section className="dashboard-shell__masthead">
        <p className="dashboard-shell__kicker">Authenticated admin</p>
        <h1 className="dashboard-shell__title">FSC Admin Login</h1>
        <p className="dashboard-shell__lead">
          관리자 비밀번호를 검증한 뒤 서명된 httpOnly 세션 쿠키를 발급합니다.
        </p>
      </section>

      <SectionCard
        title="관리자 로그인"
        badge={isAdminAuthReady() ? '설정 확인됨' : '설정 필요'}
        description="관리자 세션을 발급하기 전에 비밀번호와 서버 설정을 확인합니다."
        highlight
      >
        <div className="admin-detail-stack">
          <AdminLoginForm />
          <ul className="section-card__list">
            <li>세션 쿠키는 httpOnly + sameSite=strict로 발급됩니다.</li>
            <li>ADMIN_SESSION_SECRET을 교체하면 기존 세션은 모두 무효화됩니다.</li>
            <li>세션 만료일은 ADMIN_SESSION_MAX_AGE_DAYS로 조정합니다.</li>
          </ul>
        </div>
      </SectionCard>
    </main>
  );
}
