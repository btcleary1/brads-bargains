'use client';

import './globals.css';
import LegalFooter from '@/components/LegalFooter';

// Shown only if the root layout itself crashes; it replaces the layout, so it renders its own
// footer (copyright, disclaimer, Terms and Privacy) to keep the legal line on every page.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#050814', color: '#E5E7EB', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#9CA3AF', margin: '0 0 20px' }}>Please try again.</p>
          <button
            onClick={() => reset()}
            style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#3B82F6', color: 'white', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
        <LegalFooter />
      </body>
    </html>
  );
}
