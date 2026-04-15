export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="max-w-2xl mx-auto px-4 py-12 pb-24">
        <h1 className="text-2xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-xs mb-8" style={{ color: '#6B7280' }}>Last updated: April 2026</p>

        {[
          ['1. Acceptance', "By creating an account and using Brad's Bargains, you agree to these terms. If you do not agree, do not use the service."],
          ['2. Description of Service', "Brad's Bargains is a deal discovery tool that uses eBay's official API to surface potentially profitable resale opportunities. We do not buy, sell, or broker any transactions. All purchases are made directly through eBay."],
          ['3. Not Financial Advice', 'Nothing on this site constitutes financial, investment, or professional advice. Deal scores and profit estimates are algorithmic approximations only. You are solely responsible for all purchasing decisions and outcomes.'],
          ['4. eBay Attribution', "Search results are powered by eBay's Browse API. Product listings, prices, and availability are owned by their respective eBay sellers. Brad's Bargains is not affiliated with or endorsed by eBay Inc."],
          ['5. User Accounts', "You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account or use the service to scrape, abuse, or circumvent eBay's terms of service."],
          ['6. Rate Limits', "To protect service availability, we enforce request limits. Automated or excessive use that violates eBay's API terms of service is prohibited and may result in account termination."],
          ['7. Data', "We store your tracked deals, preferences, and notification email in Cloudflare R2. We do not sell your data. See our Privacy Policy for details."],
          ['8. Termination', 'We reserve the right to suspend or terminate accounts that violate these terms at our discretion.'],
          ['9. Limitation of Liability', "Brad's Bargains is provided \"as is\" without warranties of any kind. We are not liable for any losses arising from use of this service, including but not limited to purchasing decisions made based on our deal scores or recommendations."],
          ['10. Changes', 'We may update these terms at any time. Continued use of the service constitutes acceptance of the updated terms.'],
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
