import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

const PRODUCT_NAME = 'FSC Forecast';
const PRODUCT_MESSAGE = '경유가 전망·FSC 의사결정 지원';
const PRODUCT_DESCRIPTION =
  '오피넷 경유가를 기반으로 주간 전망과 분기별 FSC 산정을 지원하는 운영 대시보드입니다.';

function resolveMetadataBase(): URL {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    'fsc-forecast.vercel.app';
  const candidate = /^https?:\/\//u.test(configuredOrigin)
    ? configuredOrigin
    : `https://${configuredOrigin}`;

  return URL.canParse(candidate)
    ? new URL(candidate)
    : new URL('https://fsc-forecast.vercel.app');
}

const METADATA_BASE = resolveMetadataBase();
const SOCIAL_IMAGE_URL = `${METADATA_BASE.origin}/opengraph-image.png`;

export const metadata: Metadata = {
  metadataBase: METADATA_BASE,
  title: `${PRODUCT_NAME} | ${PRODUCT_MESSAGE}`,
  description: PRODUCT_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: '/',
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} | ${PRODUCT_MESSAGE}`,
    description: PRODUCT_DESCRIPTION,
    images: [
      {
        url: SOCIAL_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: `${PRODUCT_NAME} — ${PRODUCT_MESSAGE}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PRODUCT_NAME} | ${PRODUCT_MESSAGE}`,
    description: PRODUCT_DESCRIPTION,
    images: [SOCIAL_IMAGE_URL],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: PRODUCT_NAME,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#185a52',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {process.env.NODE_ENV === 'development' && (
          <Script
            src="https://unpkg.com/react-scan/dist/auto.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}

        {process.env.NODE_ENV === 'development' && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
