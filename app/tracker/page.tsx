'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import {
  BarChart2, Loader2, ShoppingCart, Tag, TrendingUp, DollarSign,
  ClipboardCopy, Check, ExternalLink, X, ChevronDown, AlertCircle, Lightbulb, FlaskConical,
} from 'lucide-react';

interface CoachResult {
  diagnosis: string;
  actions: string[];
  priceDropSuggestion: number | null;
  switchPlatform: boolean;
  switchPlatformReason: string | null;
}

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
  priceHistory?: { date: string; price: number }[];
  ebayEnded?: boolean;
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

function StatusBadge({ status, ebayEnded }: { status: DealStatus; ebayEnded?: boolean }) {
  if (ebayEnded && status === 'watching') {
    return (
      <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}>
        Sold on eBay
      </span>
    );
  }
  const c = STATUS_COLORS[status];
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function PriceSparkline({ history }: { history: { date: string; price: number }[] }) {
  if (history.length < 2) return null;
  const W = 120, H = 36, pad = 4;
  const prices = history.map(e => e.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = history.map((e, i) => {
    const x = pad + (i / (history.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (e.price - min) / range) * (H - pad * 2);
    return { x, y };
  });
  const pts = points.map(p => `${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];
  const first = prices[0];
  const lastPrice = prices[prices.length - 1];
  const trending = lastPrice < first ? '#4ADE80' : lastPrice > first ? '#F87171' : '#6B7280';
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: '#6B7280' }}>Price history ({history.length}d)</span>
        <span className="text-[10px] font-semibold" style={{ color: trending }}>
          {lastPrice < first ? `↓ $${(first - lastPrice).toFixed(0)} drop` : lastPrice > first ? `↑ $${(lastPrice - first).toFixed(0)} up` : 'Stable'}
        </span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <polyline points={pts} fill="none" stroke={trending} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r="2.5" fill={trending} />
      </svg>
      <div className="flex justify-between text-[10px]" style={{ color: '#4B5563' }}>
        <span>{history[0].date.slice(5)}</span>
        <span>${lastPrice.toFixed(0)}</span>
        <span>{history[history.length - 1].date.slice(5)}</span>
      </div>
    </div>
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
  const [coachLoading, setCoachLoading] = useState(false);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coachError, setCoachError] = useState('');
  const [flipLoading, setFlipLoading] = useState(false);
  const [flip, setFlip] = useState<{ noData?: boolean; verdict?: 'buy'|'skip'|'maybe'; netProfit?: number; avgSoldPrice?: number; soldCount?: number; reasoning?: string; daysToSell?: number | null; sourcesCount?: number | null; capitalEfficiency?: number | null } | null>(null);

  const checkFlip = async () => {
    setFlipLoading(true);
    setFlip(null);
    try {
      const res = await fetch('/api/sold-comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: localDeal.title, price: localDeal.ebayPrice, shippingCost: localDeal.shippingCost, marketPrice: localDeal.marketPrice, condition: localDeal.condition }),
      });
      const data = await res.json();
      setFlip(data.noData ? { noData: true } : data);
    } catch {
      setFlip({ noData: true });
    } finally {
      setFlipLoading(false);
    }
  };

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

  const listedDaysAgo = localDeal.purchasedAt
    ? Math.floor((Date.now() - new Date(localDeal.purchasedAt).getTime()) / 86_400_000)
    : null;
  const isStale = localDeal.status === 'listed' && listedDaysAgo != null && listedDaysAgo >= 14;

  const runCoach = async () => {
    setCoachLoading(true);
    setCoachError('');
    setCoach(null);
    try {
      const res = await fetch('/api/stale-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: localDeal.title,
          ebayPrice: localDeal.sellTargetPrice ?? localDeal.ebayPrice,
          listedDaysAgo,
          condition: localDeal.condition,
          category: localDeal.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Coach failed');
      setCoach(data);
    } catch (e: any) {
      setCoachError(e.message);
    } finally {
      setCoachLoading(false);
    }
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
            <StatusBadge status={localDeal.status} ebayEnded={localDeal.ebayEnded} />
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
          {localDeal.priceHistory && localDeal.priceHistory.length >= 2 && (
            <PriceSparkline history={localDeal.priceHistory} />
          )}
          {/* Check Flip result */}
          {flip && (
            <div className="mt-2 mb-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {flip.noData ? (
                <p className="text-xs" style={{ color: '#6B7280' }}>No sold comps available — N/A</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-1 rounded-lg" style={flip.verdict === 'buy' ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' } : flip.verdict === 'skip' ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171' } : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }}>
                      {flip.verdict === 'buy' ? '✓ BUY' : flip.verdict === 'skip' ? '✗ SKIP' : '~ MAYBE'}
                    </span>
                  </div>
                  <div className="mb-2 space-y-0.5">
                    <div className="text-xs" style={{ color: '#9CA3AF' }}>
                      Avg sold <strong style={{ color: '#34D399' }}>${flip.avgSoldPrice?.toFixed(0)}</strong>
                      {' '}&middot; {flip.soldCount} comps{flip.sourcesCount != null ? ` · ${flip.sourcesCount} ${flip.sourcesCount === 1 ? 'site' : 'sites'}` : ''}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      {flip.netProfit != null && flip.netProfit > 0 && <span style={{ color: '#4ADE80', fontWeight: 600 }}>+${flip.netProfit} Net Profit</span>}
                      {flip.daysToSell != null && flip.daysToSell >= 1 && <span style={{ color: '#6B7280' }}>Est. {flip.daysToSell}d to sell</span>}
                      {flip.capitalEfficiency != null && flip.capitalEfficiency > 0 && flip.capitalEfficiency <= 2000 && (
                        <span style={{ color: flip.capitalEfficiency >= 200 ? '#4ADE80' : flip.capitalEfficiency >= 100 ? '#FCD34D' : '#9CA3AF' }}>
                          {Math.round(flip.capitalEfficiency)}% ann. ROI
                        </span>
                      )}
                    </div>
                  </div>
                  {flip.reasoning && <p className="text-xs leading-relaxed" style={{ color: '#9CA3AF' }}>{flip.reasoning}</p>}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            <a
              href={`/deals?q=${encodeURIComponent(localDeal.title.split(' ').slice(0, 5).join(' '))}`}
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#A5B4FC' }}
            >
              <Tag className="w-3 h-3" /> Find Deal
            </a>
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
              onClick={checkFlip}
              disabled={flipLoading}
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-60"
              style={flip
                ? flip.noData ? { border: '1px solid rgba(255,255,255,0.12)', color: '#6B7280' }
                : flip.verdict === 'buy' ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }
                : flip.verdict === 'skip' ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }
                : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }
                : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#C4B5FD' }}
            >
              {flipLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              {flipLoading ? 'Checking…' : flip ? (flip.noData ? 'N/A' : flip.verdict === 'buy' ? 'BUY' : flip.verdict === 'skip' ? 'SKIP' : 'MAYBE') : 'Check Flip'}
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              style={{ border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Less' : 'Manage'}
            </button>
            {isStale && (
              <button
                onClick={runCoach}
                disabled={coachLoading}
                className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-60"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}
              >
                {coachLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
                Why isn&apos;t this selling?
              </button>
            )}
          </div>

          {/* Stale coach result */}
          {coachLoading && (
            <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#FCD34D' }}>
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              Agent analyzing competition and pricing…
            </div>
          )}
          {coachError && (
            <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              {coachError}
            </div>
          )}
          {coach && (
            <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#FCD34D' }} />
                <p className="text-xs font-medium" style={{ color: '#FCD34D' }}>{coach.diagnosis}</p>
              </div>
              <ul className="space-y-1">
                {coach.actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: '#D1D5DB' }}>
                    <span style={{ color: '#6B7280' }}>→</span> {action}
                  </li>
                ))}
              </ul>
              {coach.priceDropSuggestion != null && (
                <div className="text-xs font-semibold" style={{ color: '#4ADE80' }}>
                  Suggested price: ${coach.priceDropSuggestion.toFixed(2)}
                </div>
              )}
              {coach.switchPlatform && coach.switchPlatformReason && (
                <div className="text-xs" style={{ color: '#A78BFA' }}>
                  💡 Try Facebook Marketplace: {coach.switchPlatformReason}
                </div>
              )}
            </div>
          )}
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

function TrackerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deals, setDeals] = useState<TrackerDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');
  const [addedBanner, setAddedBanner] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (r.status === 401) router.replace('/login'); }).catch(() => { /* network error — don't log out */ });
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

        {/* P&L Dashboard */}
        {deals.length > 0 && (() => {
          const soldDeals = deals.filter(d => d.status === 'sold' && d.sellActualPrice);
          const activeDeals = deals.filter(d => d.status === 'purchased' || d.status === 'listed');
          const activeCap = activeDeals.reduce((s, d) => s + d.ebayPrice, 0);
          const winCount = soldDeals.filter(d => d.sellActualPrice! * 0.85 - d.ebayPrice - (d.shippingCost ?? 0) > 0).length;
          const winRate = soldDeals.length > 0 ? Math.round((winCount / soldDeals.length) * 100) : null;

          const holdTimes = soldDeals
            .filter(d => d.purchasedAt && d.soldAt)
            .map(d => Math.max(1, Math.round((new Date(d.soldAt!).getTime() - new Date(d.purchasedAt!).getTime()) / 86400000)));
          const avgHold = holdTimes.length > 0 ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length) : null;

          const profits = soldDeals.map(d => ({ title: d.title, profit: d.sellActualPrice! * 0.85 - d.ebayPrice - (d.shippingCost ?? 0) }));
          const bestFlip = profits.length > 0 ? profits.reduce((a, b) => b.profit > a.profit ? b : a) : null;

          const roi = totalSpent > 0 && totalProfit !== 0 ? Math.round((totalProfit / totalSpent) * 100) : null;

          return (
            <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4" style={{ color: totalProfit >= 0 ? '#4ADE80' : '#F87171' }} />
                <span className="text-sm font-semibold text-white">P&amp;L Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="text-[10px] mb-0.5" style={{ color: '#6B7280' }}>Spent</div>
                  <div className="font-bold text-white text-sm">${totalSpent.toFixed(0)}</div>
                </div>
                <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="text-[10px] mb-0.5" style={{ color: '#6B7280' }}>Revenue</div>
                  <div className="font-bold text-sm" style={{ color: '#34D399' }}>${totalSold.toFixed(0)}</div>
                </div>
                <div className="rounded-xl p-2.5 text-center" style={{ background: totalProfit > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  <div className="text-[10px] mb-0.5" style={{ color: '#6B7280' }}>Net Profit</div>
                  <div className="font-bold text-sm" style={{ color: totalProfit > 0 ? '#4ADE80' : totalProfit < 0 ? '#F87171' : 'white' }}>
                    {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {activeCap > 0 && (
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>Active Capital</div>
                    <div className="font-bold text-sm" style={{ color: '#FB923C' }}>${activeCap.toFixed(0)}</div>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>{activeDeals.length} item{activeDeals.length !== 1 ? 's' : ''} at risk</div>
                  </div>
                )}
                {winRate !== null && (
                  <div className="rounded-xl p-2.5" style={{ background: winRate >= 70 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${winRate >= 70 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)'}` }}>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>Win Rate</div>
                    <div className="font-bold text-sm" style={{ color: winRate >= 70 ? '#4ADE80' : winRate >= 50 ? '#FCD34D' : '#F87171' }}>{winRate}%</div>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>{winCount}/{soldDeals.length} profitable</div>
                  </div>
                )}
                {roi !== null && (
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>ROI</div>
                    <div className="font-bold text-sm" style={{ color: roi > 0 ? '#4ADE80' : '#F87171' }}>{roi > 0 ? '+' : ''}{roi}%</div>
                  </div>
                )}
                {avgHold !== null && (
                  <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>Avg Hold</div>
                    <div className="font-bold text-sm text-white">{avgHold}d</div>
                  </div>
                )}
              </div>
              {bestFlip && bestFlip.profit > 0 && (
                <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <div className="text-[10px] mb-0.5" style={{ color: '#818CF8' }}>🏆 Best Flip</div>
                  <div className="text-xs font-medium text-white line-clamp-1">{bestFlip.title}</div>
                  <div className="text-xs font-bold" style={{ color: '#4ADE80' }}>+${bestFlip.profit.toFixed(0)} net profit</div>
                </div>
              )}
            </div>
          );
        })()}

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

export default function TrackerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }} />}>
      <TrackerInner />
    </Suspense>
  );
}
