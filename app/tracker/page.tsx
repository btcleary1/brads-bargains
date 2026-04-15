'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import {
  BarChart2, Loader2, ShoppingCart, Tag, TrendingUp, DollarSign,
  ClipboardCopy, Check, ExternalLink, X, ChevronDown,
} from 'lucide-react';

type DealStatus = 'watching' | 'purchased' | 'listed' | 'sold';

interface TrackerDeal {
  id: string;
  ebayItemId: string;
  title: string;
  ebayPrice: number;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  additionalImages: string[];
  ebayUrl: string;
  category: string;
  status: DealStatus;
  purchasedAt: string | null;
  sellTargetPrice: number | null;
  sellActualPrice: number | null;
  soldAt: string | null;
  shippingCost: number | null;
  notes: string;
  listingDraft: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<DealStatus, string> = {
  watching: 'Watching',
  purchased: 'Purchased',
  listed: 'Listed',
  sold: 'Sold',
};

const STATUS_COLORS: Record<DealStatus, { bg: string; border: string; text: string }> = {
  watching:  { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  text: '#60A5FA' },
  purchased: { bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',  text: '#FB923C' },
  listed:    { bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  text: '#C084FC' },
  sold:      { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   text: '#4ADE80' },
};

function StatusBadge({ status }: { status: DealStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function DealCard({
  deal,
  onUpdate,
  onDelete,
}: {
  deal: TrackerDeal;
  onUpdate: (updated: TrackerDeal) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localDeal, setLocalDeal] = useState(deal);

  const profit = localDeal.sellActualPrice && localDeal.ebayPrice
    ? (localDeal.sellActualPrice * 0.85 - localDeal.ebayPrice - (localDeal.shippingCost ?? 0))
    : localDeal.sellTargetPrice && localDeal.ebayPrice
    ? (localDeal.sellTargetPrice * 0.85 - localDeal.ebayPrice - (localDeal.shippingCost ?? 0))
    : null;

  const updateField = async (patch: Partial<TrackerDeal>) => {
    const updated = { ...localDeal, ...patch };
    setLocalDeal(updated);
    setSaving(true);
    const res = await fetch('/api/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdate(updated);
    }
    setSaving(false);
  };

  const generateDraft = async () => {
    setGeneratingDraft(true);
    const res = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId: localDeal.id }),
    });
    const data = await res.json();
    if (res.ok && data.draft) {
      setLocalDeal(prev => ({ ...prev, listingDraft: data.draft }));
      onUpdate({ ...localDeal, listingDraft: data.draft });
    }
    setGeneratingDraft(false);
  };

  const copyDraft = () => {
    if (!localDeal.listingDraft) return;
    navigator.clipboard.writeText(localDeal.listingDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteDeal = async () => {
    if (!confirm('Remove this deal from tracking?')) return;
    await fetch('/api/tracker', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: localDeal.id }),
    });
    onDelete(localDeal.id);
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        {localDeal.imageUrl && (
          <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={localDeal.imageUrl} alt={localDeal.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-medium text-white text-sm leading-snug line-clamp-2">{localDeal.title}</p>
            <button onClick={deleteDeal} className="shrink-0 transition-colors hover:text-red-400" style={{ color: '#374151', minHeight: 'unset' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge status={localDeal.status} />
            <span className="font-semibold text-sm" style={{ color: '#34D399' }}>${localDeal.ebayPrice.toFixed(2)}</span>
            {localDeal.discountPct !== null && (
              <span className="text-xs" style={{ color: '#6B7280' }}>{localDeal.discountPct}% off</span>
            )}
            {profit !== null && (
              <span className="text-xs font-semibold" style={{ color: profit > 0 ? '#4ADE80' : '#F87171' }}>
                {profit > 0 ? '+' : ''}${profit.toFixed(0)} est.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={localDeal.ebayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}
            >
              <ExternalLink className="w-3 h-3" /> eBay
            </a>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              style={{ border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Less' : 'Manage'}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded management section */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="pt-4">
            {/* Status */}
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Status</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABELS) as DealStatus[]).map(s => {
                  const c = STATUS_COLORS[s];
                  const isActive = localDeal.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateField({ status: s, purchasedAt: s === 'purchased' && !localDeal.purchasedAt ? new Date().toISOString() : localDeal.purchasedAt })}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                      style={{
                        background: isActive ? c.bg : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isActive ? c.border : 'rgba(255,255,255,0.08)'}`,
                        color: isActive ? c.text : '#6B7280',
                      }}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Sell Target ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localDeal.sellTargetPrice ?? ''}
                  onChange={e => setLocalDeal(prev => ({ ...prev, sellTargetPrice: parseFloat(e.target.value) || null }))}
                  onBlur={() => updateField({ sellTargetPrice: localDeal.sellTargetPrice })}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Sold For ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localDeal.sellActualPrice ?? ''}
                  onChange={e => setLocalDeal(prev => ({ ...prev, sellActualPrice: parseFloat(e.target.value) || null }))}
                  onBlur={() => updateField({ sellActualPrice: localDeal.sellActualPrice, soldAt: localDeal.sellActualPrice ? new Date().toISOString() : localDeal.soldAt })}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Notes</label>
              <input
                type="text"
                value={localDeal.notes}
                onChange={e => setLocalDeal(prev => ({ ...prev, notes: e.target.value }))}
                onBlur={() => updateField({ notes: localDeal.notes })}
                placeholder="e.g. Needs new battery, minor scuffs"
                className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            {/* Listing draft */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium" style={{ color: '#9CA3AF' }}>Facebook Marketplace Draft</label>
                <button
                  onClick={generateDraft}
                  disabled={generatingDraft}
                  className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-60"
                  style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#C084FC' }}
                >
                  {generatingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
                  {localDeal.listingDraft ? 'Regenerate' : 'Generate'}
                </button>
              </div>
              {localDeal.listingDraft && (
                <div className="rounded-xl p-3 relative" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#D1D5DB' }}>{localDeal.listingDraft}</pre>
                  <button
                    onClick={copyDraft}
                    className="absolute top-2 right-2 flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
                    style={{ background: 'rgba(255,255,255,0.08)', color: copied ? '#4ADE80' : '#9CA3AF' }}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deals, setDeals] = useState<TrackerDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');
  const [addedBanner, setAddedBanner] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (!r.ok) router.replace('/login'); }).catch(() => router.replace('/login'));
    fetch('/api/tracker')
      .then(r => r.json())
      .then(async d => {
        setDeals(d.deals ?? []);
        // Handle ?add= param from email Track Deal button
        const addParam = searchParams.get('add');
        if (addParam) {
          try {
            const item = JSON.parse(atob(addParam.replace(/-/g, '+').replace(/_/g, '/')));
            const res = await fetch('/api/tracker', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item),
            });
            if (res.ok) {
              const fresh = await fetch('/api/tracker').then(r => r.json());
              setDeals(fresh.deals ?? []);
              setAddedBanner(`"${item.title?.slice(0, 50)}…" added to tracker!`);
              setTimeout(() => setAddedBanner(''), 5000);
              router.replace('/tracker');
            }
          } catch { /* invalid param — ignore */ }
        }
      })
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  const filtered = filter === 'all' ? deals : deals.filter(d => d.status === filter);

  // Summary stats
  const totalSpent = deals.filter(d => d.status !== 'watching').reduce((s, d) => s + d.ebayPrice, 0);
  const totalSold = deals.filter(d => d.status === 'sold').reduce((s, d) => s + (d.sellActualPrice ?? 0), 0);
  const totalProfit = deals
    .filter(d => d.status === 'sold' && d.sellActualPrice)
    .reduce((s, d) => s + (d.sellActualPrice! * 0.85 - d.ebayPrice - (d.shippingCost ?? 0)), 0);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 sm:pb-10">

        {/* Added from email banner */}
        {addedBanner && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-2 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }}>
            <Check className="w-4 h-4 shrink-0" /> {addedBanner}
          </div>
        )}

        {/* Page header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}>
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Deal Tracker</h1>
            <p className="text-xs" style={{ color: '#6B7280' }}>Track purchases, profits & listings</p>
          </div>
        </div>

        {/* Stats */}
        {deals.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs mb-1" style={{ color: '#6B7280' }}>Spent</div>
              <div className="font-bold text-white text-sm">${totalSpent.toFixed(0)}</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs mb-1" style={{ color: '#6B7280' }}>Revenue</div>
              <div className="font-bold text-sm" style={{ color: '#34D399' }}>${totalSold.toFixed(0)}</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{ background: totalProfit > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)', border: totalProfit > 0 ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs mb-1" style={{ color: '#6B7280' }}>Profit</div>
              <div className="font-bold text-sm" style={{ color: totalProfit > 0 ? '#4ADE80' : totalProfit < 0 ? '#F87171' : 'white' }}>
                {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {deals.length > 0 && (
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {(['all', 'watching', 'purchased', 'listed', 'sold'] as const).map(s => {
              const count = s === 'all' ? deals.length : deals.filter(d => d.status === s).length;
              const isActive = filter === s;
              const c = s !== 'all' ? STATUS_COLORS[s] : null;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                  style={{
                    background: isActive ? (c?.bg ?? 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isActive ? (c?.border ?? 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.08)'}`,
                    color: isActive ? (c?.text ?? 'white') : '#6B7280',
                  }}
                >
                  {s === 'all' ? 'All' : STATUS_LABELS[s]} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Deal list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: '#6B7280' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading your tracker…</span>
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                onUpdate={updated => setDeals(prev => prev.map(d => d.id === updated.id ? updated : d))}
                onDelete={id => setDeals(prev => prev.filter(d => d.id !== id))}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16" style={{ color: '#4B5563' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ShoppingCart className="w-8 h-8" style={{ color: '#374151' }} />
            </div>
            <div className="font-medium" style={{ color: '#6B7280' }}>
              {deals.length === 0 ? 'No deals tracked yet' : `No ${filter} deals`}
            </div>
            <div className="text-sm mt-1" style={{ color: '#4B5563' }}>
              {deals.length === 0 ? 'Find deals and click "Track Deal" to add them here' : 'Change the filter above'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
