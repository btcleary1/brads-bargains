import Link from 'next/link';
import { COPYRIGHT_START, FOOTER_LINE, LEGAL_OWNER } from '@/lib/legal';

// On every page (root layout): copyright, the eBay/profit line, and links to Terms and Privacy.
export default function LegalFooter() {
  const year = new Date().getFullYear();
  const years = year > COPYRIGHT_START ? `${COPYRIGHT_START}–${year}` : `${COPYRIGHT_START}`;
  return (
    <footer className="px-4 pt-5 pb-28 sm:pb-6 text-center text-xs leading-relaxed" style={{ background: '#050814', color: '#9CA3AF' }}>
      <p>© {years} {LEGAL_OWNER}. All rights reserved.</p>
      <p>{FOOTER_LINE}</p>
      <p>
        <Link href="/terms" className="underline hover:text-white">Terms</Link>
        {' · '}
        <Link href="/privacy" className="underline hover:text-white">Privacy</Link>
      </p>
    </footer>
  );
}
