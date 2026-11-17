import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: { default: "Cleary eTrading", template: "%s | Cleary eTrading" },
  description: "Find the best eBay deals and track your flips.",
  applicationName: "Cleary eTrading",
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: "Cleary eTrading", statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
