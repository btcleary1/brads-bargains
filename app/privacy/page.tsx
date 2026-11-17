import { CONTACT_EMAIL, LEGAL_NAME, PRIVACY_UPDATED } from '@/lib/legal';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="max-w-2xl mx-auto px-4 py-12 pb-24">
        <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-xs mb-8" style={{ color: '#6B7280' }}>Last updated: {PRIVACY_UPDATED} · Operated by {LEGAL_NAME}</p>

        {[
          ['1. What We Collect', "Your name, email address and password (stored only as a scrambled hash), passkeys if you set them up, your tracked deals, watchlist keywords, saved searches, preferences and any feedback you send. If you turn them on: a phone number for text alerts and a browser push subscription. If you connect eBay: a sign-in token, your eBay purchase history and saved searches. For security we log sign-ins, including IP address and time. We do not collect payment card details or your location."],
          ['2. How We Use Your Data', "To run your account and keep it secure, find and score deals for you, send the alerts you ask for, and fix problems. We do not use your data, or eBay data, to train AI models."],
          ['3. Data Storage', "The app runs on Vercel. Your account data, tracked deals, watchlist and preferences are stored in Cloudflare R2 (object storage) in the United States."],
          ['4. Who Processes It', "We share only what each service needs to do its job: Vercel (hosting), Cloudflare (storage and the Turnstile bot check), Resend or SendGrid (email), Twilio (text alerts), your browser's push service (push alerts), Google (only if you sign in with Google), eBay (searches and, if you connect it, your eBay account), and Anthropic (AI features: listing details, search terms and the items you ask about; not your password). Each handles data under its own privacy policy."],
          ['5. eBay Search Data', "Search queries you enter are passed to eBay's Browse API to retrieve listings. Cleary eTrading does not keep a history of your searches. eBay's own privacy policy governs any data eBay collects on their end. \"eBay\" is a trademark of eBay Inc.; we are not affiliated with or endorsed by eBay."],
          ['6. Email and Text Alerts', "If you save a Deal Alert Email or phone number in Settings, we send you deal alerts. Remove it in Settings at any time to stop them."],
          ['7. We Never Sell Your Data', "We do not sell, rent, or share your personal data with advertisers or for anyone else's marketing."],
          ['8. Cookies & Sessions', "We use a single session cookie to keep you logged in for up to 7 days. No advertising or third-party tracking cookies are used."],
          ['9. How Long We Keep It, and Deletion', "We keep your data while your account is open. You can delete your account in Settings (Delete My Account) or by emailing us; we remove your data within 30 days, except short-lived security logs and backups that expire on their own, or anything the law requires us to keep. If eBay notifies us of a Marketplace Account Deletion request, we honor it."],
          ['10. Security', "We use encrypted connections (HTTPS), hashed passwords, secure session cookies, rate limits and bot checks. No system is perfectly secure, so use a strong, unique password or a passkey."],
          ['11. Adults Only', "Cleary eTrading is for people 18 and older. We do not knowingly collect personal information from anyone younger, and we delete it if we learn we have."],
          ['12. Your Privacy Rights', "Depending on your state, you may have the right to know what we hold about you, get a copy, correct it, delete it, and opt out of sale or targeted advertising (we do neither). Email us to make a request; we will not treat you differently for asking. If we say no, you can ask us to reconsider."],
          ['13. Changes', "We may update this Privacy Policy. The date at the top shows the latest version, and we will tell you in the app or by email about material changes."],
          ['14. Contact', `For privacy questions or requests, email ${CONTACT_EMAIL}.`],
        ].map(([title, body]) => (
          <div key={title} className="mb-6">
            <h2 className="font-semibold text-white mb-1">{title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#9CA3AF' }}>{body}</p>
          </div>
        ))}

        <a href="/" className="text-sm" style={{ color: '#60A5FA' }}>← Back to app</a>
      </div>
    </div>
  );
}
