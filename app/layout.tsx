import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FSC Forecast Dashboard',
  description: 'FSC calculation MVP 대시보드로 현재 유가, FSC 기준 시나리오, 해설을 보여줍니다.',
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
