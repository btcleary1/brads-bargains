'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Ticket, Loader2, ExternalLink, Users, AlertCircle } from 'lucide-react';

interface TicketEvent {
  id: number;
  title: string;
  dateTimeLocal: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  url: string;
  lowestPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  listingCount: number | null;
}

interface SeatGroup {
  size: number;
  targetPricePerSeat: number | null;
  note: string;
}

interface TicketPlan {
  event: TicketEvent;
  totalRequested: number;
  hasPriceData: boolean;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  groups: SeatGroup[];
  reasoning: string;
  marketplaceLinks: { name: string; url: string }[];
}

export default function TicketsPage() {
  const router = useRouter();
  const [away, setAway] = useState('LSU');
  const [home, setHome] = useState('Auburn');
  const [qty, setQty] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TicketPlan | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (r.status === 401) router.replace('/login'); }).catch(() => { /* network error — don't log out */ });
  }, [router]);

  const search = async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const params = new URLSearchParams({ away, home, qty: String(qty) });
      const res = await fetch(`/api/tickets?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      setPlan(data);
    } catch (e: any) {
      setError(e.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#0B1120' }}>
      <Header />
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-24 sm:pb-10">
        <div className="flex items-center gap-2 mb-1">
          <Ticket className="w-5 h-5 text-blue-400" />
          <h1 className="text-white text-xl font-bold">Ticket Finder</h1>
        </div>
        <p className="text-gray-400 text-sm mb-5">
          Finds a real matchup on SeatGeek and recommends a reasonable middle-of-market price band and seating plan — not the cheapest, not the priciest. Links out to marketplaces; this doesn't buy anything for you.
        </p>

        <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Away team</label>
              <input
                value={away}
                onChange={e => setAway(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Home team</label>
              <input
                value={home}
                onChange={e => setHome(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Seats needed</label>
              <input
                type="number"
                min={1}
                max={40}
                value={qty}
                onChange={e => setQty(Math.max(1, Math.min(40, parseInt(e.target.value) || 1)))}
                className="w-24 rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <button
              onClick={search}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#1D4ED8' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
              Find seats
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg p-3 mb-5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="text-white font-semibold">{plan.event.title}</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {plan.event.venueName}, {plan.event.venueCity}, {plan.event.venueState} · {new Date(plan.event.dateTimeLocal).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              {plan.event.listingCount != null && plan.event.lowestPrice != null && plan.event.highestPrice != null && (
                <p className="text-gray-500 text-xs mt-1">{plan.event.listingCount} listings tracked · market range ${plan.event.lowestPrice}–${plan.event.highestPrice}</p>
              )}
            </div>

            <div className="rounded-xl p-4" style={{ background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.3)' }}>
              <p className="text-white font-semibold text-sm mb-1">
                {plan.hasPriceData ? `Target: $${plan.priceBandLow}–$${plan.priceBandHigh} per seat` : 'No price data yet'}
              </p>
              <p className="text-gray-300 text-sm">{plan.reasoning}</p>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <h3 className="text-white text-sm font-semibold">Seating plan ({plan.totalRequested} total)</h3>
              </div>
              <div className="space-y-2">
                {plan.groups.map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-gray-300">{g.note}</span>
                    <span className="text-white font-medium whitespace-nowrap ml-3">{g.size} seats{g.targetPricePerSeat != null ? ` · ~$${g.targetPricePerSeat}/ea` : ''}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="text-white text-sm font-semibold mb-2">Search these marketplaces</h3>
              <div className="flex flex-col gap-2">
                {plan.marketplaceLinks.map(link => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-sm rounded-lg px-3 py-2 text-blue-300 hover:text-blue-200"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    {link.name}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
