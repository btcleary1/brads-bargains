import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: "Brad's Bargains", template: "%s | Brad's Bargains" },
  description: "Find the best eBay deals and track your flips.",
  applicationName: "Brad's Bargains",
  appleWebApp: { capable: true, title: "Brad's Bargains", statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
