import { GOVERNING_STATE, LEGAL_NAME, LEGAL_OWNER, TERMS_UPDATED } from '@/lib/legal';

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <div className="max-w-2xl mx-auto px-4 py-12 pb-24">
        <h1 className="text-2xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-xs mb-8" style={{ color: '#6B7280' }}>Last updated: {TERMS_UPDATED} · Operated by {LEGAL_NAME}</p>

        {[
          ['1. Acceptance', "By creating an account and using Cleary eTrading, you agree to these terms. If you do not agree, do not use the service."],
          ['2. Description of Service', "Cleary eTrading is a deal discovery tool that uses eBay's official API to surface potentially profitable resale opportunities. We do not buy, sell, or broker any transactions. All purchases are made directly through eBay."],
          ['3. Not Financial Advice', 'Nothing on this site constitutes financial, investment, or professional advice. Deal scores and profit estimates are algorithmic approximations only. You are solely responsible for all purchasing decisions and outcomes.'],
          ['4. eBay Attribution', "Search results are powered by eBay's Browse API. Product listings, prices, and availability are owned by their respective eBay sellers. Cleary eTrading is not affiliated with or endorsed by eBay Inc."],
          ['5. User Accounts', "You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account or use the service to scrape, abuse, or circumvent eBay's terms of service."],
          ['6. Rate Limits', "To protect service availability, we enforce request limits. Automated or excessive use that violates eBay's API terms of service is prohibited and may result in account termination."],
          ['7. Data', "We store your tracked deals, preferences, and notification email in Cloudflare R2. We do not sell your data. See our Privacy Policy for details."],
          ['8. Termination', 'We reserve the right to suspend or terminate accounts that violate these terms at our discretion.'],
          ['9. Limitation of Liability', "Cleary eTrading is provided \"as is\" without warranties of any kind. We are not liable for any losses arising from use of this service, including but not limited to purchasing decisions made based on our deal scores or recommendations."],
          ['10. Changes', 'We may update these terms at any time. We will post the new version with a new date. Continued use of the service constitutes acceptance of the updated terms.'],
          ['11. Who We Are and Eligibility', `These terms are a contract between you and ${LEGAL_NAME}. You must be at least 18 and a resident of the United States to use the service.`],
          ['12. No Guarantee of Profit', 'Deal scores, profit estimates, sold comps and trends are estimates and can be wrong or out of date. Prices, fees, shipping costs and demand change. Reselling can lose money, and you are solely responsible for what you buy and sell, and for following eBay\'s rules, consumer protection laws and tax laws (including reporting income and collecting sales tax where required).'],
          ['13. eBay Trademarks', '"eBay" is a trademark of eBay Inc. Cleary eTrading is not affiliated with, endorsed by or sponsored by eBay Inc. Listing content and images belong to their sellers.'],
          ['14. Our Intellectual Property', `The service, its software, design, names and logos (including the CT monogram) belong to ${LEGAL_OWNER} and are protected by copyright and other laws. © ${LEGAL_OWNER}. All rights reserved.`],
          ['15. Limit on Damages', `To the fullest extent the law allows, ${LEGAL_OWNER} won't be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits or inventory, and total liability for any claim is limited to the greater of $100 or what you paid for the service in the 12 months before the claim.`],
          ['16. Indemnity', `You agree to cover ${LEGAL_OWNER}'s losses and reasonable legal costs from claims by others that arise from your use of the service, your buying or selling, or your breaking these terms.`],
          ['17. Governing Law', `These terms are governed by the laws of the State of ${GOVERNING_STATE}. Any dispute will be handled only in the state or federal courts located in ${GOVERNING_STATE}.`],
          ['18. Severability and Entire Agreement', "If any part of these terms can't be enforced, the rest still applies. These terms and the Privacy Policy are the whole agreement between you and us about the service."],
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
