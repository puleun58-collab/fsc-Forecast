import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '오피넷 전국 평균 경유가 대시보드',
  description:
    '전국 평균 자동차용 경유가 데이터의 수집 현황, 추이, 예측, 해설, 내보내기 준비 상태를 보여주는 MVP 대시보드입니다.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
