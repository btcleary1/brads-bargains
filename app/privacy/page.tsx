export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="max-w-2xl mx-auto px-4 py-12 pb-24">
        <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-xs mb-8" style={{ color: '#6B7280' }}>Last updated: April 2026</p>

        {[
          ['1. What We Collect', "We collect your email address (used for account login and optional deal alerts), your tracked deals, and your watchlist keywords. We do not collect payment information, location data, or browsing history outside of this app."],
          ['2. How We Use Your Data', "Your email is used to authenticate your account and, if you opt in, to send daily deal digest emails. Your tracked deals and watchlist are used solely to personalize your experience within Brad's Bargains."],
          ['3. Data Storage', "All user data — including tracked deals, watchlist keywords, and notification preferences — is stored in Cloudflare R2 (object storage). Data is stored in the United States."],
          ['4. eBay Search Data', "Search queries you enter are passed to eBay's Browse API to retrieve listings. Brad's Bargains does not log your search history. eBay's own privacy policy governs any data eBay collects on their end."],
          ['5. Email Notifications', "If you save a Deal Alert Email in Settings, we will send you a daily digest of hot deals. You can remove your email at any time in Settings to stop receiving emails. We use Resend to deliver email — your address is passed to Resend solely for delivery purposes."],
          ['6. We Do Not Sell Your Data', "We do not sell, rent, or share your personal data with advertisers or third parties for marketing purposes."],
          ['7. Cookies & Sessions', "We use a single session cookie to keep you logged in for up to 7 days. No third-party tracking cookies are used."],
          ['8. Data Deletion', "You may request deletion of your account and all associated data by emailing us. We will fulfill deletion requests within 30 days. If eBay notifies us of a deletion request for a user who purchased through eBay, we honor that request per eBay's Marketplace Account Deletion policy."],
          ['9. Children', "Brad's Bargains is not directed at children under 13. We do not knowingly collect personal information from children."],
          ['10. Changes', "We may update this Privacy Policy at any time. Continued use of the service constitutes acceptance of the updated policy. Material changes will be noted on this page."],
          ['11. Contact', "For privacy questions or data deletion requests, contact us at brads.bargains.app@gmail.com."],
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
