import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin-login-form';
import { getAdminSession, isAdminAuthReady } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (getAdminSession() !== null) {
    redirect('/admin');
  }

  const authReady = isAdminAuthReady();

  return (
    <main id="main-content" className="admin-login">
      <section className="admin-login__card" aria-labelledby="admin-login-title">
        <div className="admin-login__header">
          <div>
            <h1 id="admin-login-title" className="admin-login__title">
              FSC Admin
            </h1>
            <p className="admin-login__subtitle">관리자 전용 로그인</p>
          </div>
          <span className={`status-tag ${authReady ? 'status-tag--ok' : 'status-tag--warning'}`}>
            {authReady ? '설정 확인됨' : '설정 필요'}
          </span>
        </div>
        <AdminLoginForm />
        <p className="admin-login__note">관리자 기능은 로그인 후 사용할 수 있습니다.</p>
      </section>
    </main>
  );
}
