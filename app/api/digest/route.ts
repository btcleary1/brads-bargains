import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { searchDeals, EbayItem, filterLiveItems } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals, sellabilityScore } from '@/lib/deal-score';
import { sendDailyDigest, FlipData } from '@/lib/notify';
import { sendSMSDigest } from '@/lib/sms';
import { r2Get, r2Put } from '@/lib/r2';
import { getAllUsers } from '@/lib/users';
import { getUserPrefs, getDeals } from '@/lib/tracker-data';
import { inferCategoriesFromDeals } from '@/lib/infer-categories';
import { searchSoldComps } from '@/lib/ebay-comps';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const runtime = 'nodejs';

const DIGEST_STATE_PATH = 'deal-wiz/digest-state.json';
const DIGEST_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

// Categories to search when live eBay API is available
const SEARCH_QUERIES = DIGEST_CATEGORIES.map(c => c.query);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const force  = req.nextUrl.searchParams.get('force') === '1';

  if (secret !== DIGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?sms= sends a one-off test text without running the full digest
  const smsTest = req.nextUrl.searchParams.get('sms') || null;
  if (smsTest) {
    try {
      const { sendSMSDigest: sendSMS } = await import('@/lib/sms');
      const { MOCK_DEALS: mockDeals } = await import('@/lib/mock-deals');
      await sendSMS(mockDeals.slice(0, 5), smsTest);
      return NextResponse.json({ sent: true, sms: smsTest });
    } catch (err) {
      return NextResponse.json({ sent: false, sms: smsTest, error: String(err) }, { status: 500 });
    }
  }

  // Prevent double-sending on the same day unless forced
  if (!force) {
    const state = await r2Get<{ lastSentDate: string }>(DIGEST_STATE_PATH);
    if (state?.lastSentDate === todayKey()) {
      return NextResponse.json({ skipped: true, reason: 'Already sent today', date: todayKey() });
    }
  }

  const forceMock = req.nextUrl.searchParams.get('mock') === '1';
  // ?to= overrides for manual testing; otherwise sends to all registered users
  const toOverride = req.nextUrl.searchParams.get('to') || null;

  try {
    let allItems;

    if (forceMock || process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID) {
      allItems = MOCK_DEALS;
    } else {
      // Run searches in batches of 5 with a small delay to avoid rate limiting
      const allResults: EbayItem[] = [];
      const batchSize = 5;
      for (let i = 0; i < SEARCH_QUERIES.length; i += batchSize) {
        const batch = SEARCH_QUERIES.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(q => searchDeals(q, 30)));
        batchResults.forEach(r => { if (r.status === 'fulfilled') allResults.push(...r.value); });
        if (i + batchSize < SEARCH_QUERIES.length) await new Promise(r => setTimeout(r, 500));
      }
      const seen = new Set<string>();
      allItems = allResults.filter(item => {
        if (seen.has(item.itemId)) return false;
        seen.add(item.itemId);
        return true;
      });
      console.log(`[digest] eBay searches: ${SEARCH_QUERIES.length} total, ${allItems.length} raw items`);
    }

    // Hard-remove refurbished items before scoring
    const nonRefurb = allItems.filter(i => !/refurb/i.test(i.condition) && !/refurb/i.test(i.title));
    const itemPool = nonRefurb.length >= 10 ? nonRefurb : allItems;
    console.log(`[digest] non-refurb items: ${nonRefurb.length} of ${allItems.length}`);

    // Pull a larger candidate pool so Skip filtering still leaves 5 good deals
    let candidates = topDeals(itemPool, 15, 60);
    if (candidates.length < 5) {
      for (let pct = 59; pct >= 50 && candidates.length < 5; pct--) {
        candidates = topDeals(itemPool, 15, pct);
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No qualifying deals found' });
    }

    // Remove sold/expired listings before sending — verify each item is still live
    if (!forceMock && process.env.EBAY_CLIENT_ID) {
      candidates = await filterLiveItems(candidates);
    }

    if (candidates.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No live deals found after verification' });
    }

    // Sort by sellabilityScore
    candidates = [...candidates].sort((a, b) => sellabilityScore(b, candidates) - sellabilityScore(a, candidates));

    // Run sold comps on all candidates in parallel — filter out Skips, keep top 5
    const flipResults = await Promise.allSettled(
      candidates.map(item => searchSoldComps(item.title.split(' ').slice(0, 6).join(' '), 12))
    );
    const flipMap = new Map<string, FlipData>();
    candidates.forEach((item, i) => {
      const r = flipResults[i];
      if (r.status !== 'fulfilled' || r.value.count < 3) return;
      const netProfit = Math.round(r.value.avgSoldPrice * 0.85 - item.price - (item.shippingCost ?? 0));
      const marginPct = Math.round((netProfit / item.price) * 100);
      let verdict: 'buy' | 'maybe' | 'skip';
      if (netProfit > 50 || (netProfit > 30 && marginPct > 20)) verdict = 'buy';
      else if (netProfit < 10 || (netProfit < 20 && marginPct < 10)) verdict = 'skip';
      else verdict = 'maybe';
      if (netProfit >= 40 && verdict === 'skip') verdict = 'maybe';
      flipMap.set(item.itemId, { verdict, netProfit, avgSoldPrice: r.value.avgSoldPrice, soldCount: r.value.count, marginPct });
    });
    // Sort: BUY first, then MAYBE, then SKIP — within each tier, highest net profit first
    candidates.sort((a, b) => {
      const order = { buy: 0, maybe: 1, skip: 2 };
      const aFlip = flipMap.get(a.itemId);
      const bFlip = flipMap.get(b.itemId);
      const aV = aFlip?.verdict ?? 'maybe';
      const bV = bFlip?.verdict ?? 'maybe';
      if (aV !== bV) return (order[aV] ?? 1) - (order[bV] ?? 1);
      const aProfit = aFlip?.netProfit ?? (a.marketPrice ? Math.round(a.marketPrice * 0.85 - a.price - (a.shippingCost ?? 0)) : 0);
      const bProfit = bFlip?.netProfit ?? (b.marketPrice ? Math.round(b.marketPrice * 0.85 - b.price - (b.shippingCost ?? 0)) : 0);
      return bProfit - aProfit;
    });
    let best5 = candidates.slice(0, 5);

    // Build recipient list with personalized deals per user
    type UserDigest = { email: string; deals: typeof best5 };
    let userDigests: UserDigest[] = [];

    if (toOverride) {
      userDigests = [{ email: toOverride, deals: best5 }];
    } else {
      const users = await getAllUsers();
      const [prefsResults, dealsResults] = await Promise.all([
        Promise.allSettled(users.map(u => getUserPrefs(u.userId))),
        Promise.allSettled(users.map(u => getDeals(u.userId))),
      ]);

      for (let i = 0; i < users.length; i++) {
        const r = prefsResults[i];
        if (r.status !== 'fulfilled' || !r.value.notificationEmail) continue;
        const prefs = r.value;

        const count = prefs.digestCount ?? 5;

        // Use explicit categories; if none set, infer from tracker history
        let activeCategories = prefs.digestCategories ?? [];
        if (activeCategories.length === 0) {
          const dr = dealsResults[i];
          const userDeals = dr.status === 'fulfilled' ? dr.value : [];
          activeCategories = inferCategoriesFromDeals(userDeals);
        }

        // Filter allItems by preferred categories if we have any
        let pool = allItems;
        if (activeCategories.length > 0) {
          const allowedQueries = DIGEST_CATEGORIES
            .filter(c => activeCategories.includes(c.key))
            .map(c => c.query.toLowerCase());
          pool = allItems.filter(item =>
            allowedQueries.some(q => item.title.toLowerCase().includes(q.split(' ')[0]))
          );
          if (pool.length === 0) pool = allItems; // fallback to all if filter yields nothing
        }

        // If user has a personal watchlist, search those terms for their digest
        let userDeals: typeof best5 = [];
        let baseDeals = topDeals(pool, count, 60);
        for (let pct = 59; pct >= 50 && baseDeals.length < count; pct--) {
          baseDeals = topDeals(pool, count, pct);
        }
        userDeals = baseDeals;

        if (prefs.watchlistQueries && prefs.watchlistQueries.length > 0) {
          const personalResults = await Promise.allSettled(prefs.watchlistQueries.map(q => searchDeals(q, 20)));
          const seen = new Set<string>();
          const personalItems = personalResults
            .flatMap(res => res.status === 'fulfilled' ? res.value : [])
            .filter(item => { if (seen.has(item.itemId)) return false; seen.add(item.itemId); return true; });
          if (personalItems.length > 0) {
            let personalDeals = topDeals(personalItems, count, 60);
            for (let pct = 59; pct >= 50 && personalDeals.length < count; pct--) {
              personalDeals = topDeals(personalItems, count, pct);
            }
            userDeals = personalDeals.length > 0 ? personalDeals : userDeals;
          }
        }

        const sortedDeals = [...userDeals].sort((a, b) => sellabilityScore(b, userDeals) - sellabilityScore(a, userDeals));
        userDigests.push({ email: prefs.notificationEmail as string, deals: sortedDeals });
      }

      if (userDigests.length === 0 && process.env.NOTIFICATION_EMAIL) {
        userDigests = [{ email: process.env.NOTIFICATION_EMAIL, deals: best5 }];
      }
    }

    if (userDigests.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No recipients configured' });
    }

    // Generate AI Pick of the Day — only from BUY/MAYBE items (never Skip)
    let aiPick: string | undefined;
    const buyMaybeItems = best5.filter(i => {
      const flip = flipMap.get(i.itemId);
      return !flip || flip.verdict !== 'skip';
    });
    const top = buyMaybeItems.slice(0, 5).map((i, idx) => {
      const flip = flipMap.get(i.itemId);
      const netProfit = flip ? flip.netProfit : (i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : null);
      const verdictNote = flip ? ` [${flip.verdict.toUpperCase()} — ${flip.soldCount} comps @ avg $${flip.avgSoldPrice}]` : '';
      return `#${idx + 1} ${i.title} — buy $${i.price}, net profit ~$${netProfit ?? '?'}${verdictNote}. Condition: ${i.condition}.`;
    }).join('\n');
    const aiPickPrompt = `You are a sharp eBay flip advisor. Net profit figures already account for eBay fees. All items below are pre-verified as BUY or MAYBE flips. Recommend the single best one. Reference the net profit and sold comps data. Be direct, specific, and under 50 words. No disclaimers. No markdown formatting.\n\n${top}`;
    for (let attempt = 0; attempt < 2 && !aiPick; attempt++) {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: aiPickPrompt }],
        });
        const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
        if (text) aiPick = text;
        else console.warn(`[digest] AI pick attempt ${attempt + 1}: empty response`);
      } catch (e) { console.error(`[digest] AI pick attempt ${attempt + 1} failed:`, e); }
    }
    if (!aiPick) console.warn('[digest] AI pick unavailable after 2 attempts — sending without it');

    // Ensure flip data covers all user-personalized deals too
    const allDigestItems = userDigests.flatMap(d => d.deals).filter(i => !flipMap.has(i.itemId));
    const extraFlips = await Promise.allSettled(allDigestItems.map(item => searchSoldComps(item.title.split(' ').slice(0, 6).join(' '), 12)));
    allDigestItems.forEach((item, i) => {
      const r = extraFlips[i];
      if (r.status !== 'fulfilled' || r.value.count < 3) return;
      const netProfit = Math.round(r.value.avgSoldPrice * 0.85 - item.price - (item.shippingCost ?? 0));
      const marginPct = Math.round((netProfit / item.price) * 100);
      let verdict: 'buy' | 'maybe' | 'skip' = netProfit > 50 || (netProfit > 30 && marginPct > 20) ? 'buy' : netProfit < 10 || (netProfit < 20 && marginPct < 10) ? 'skip' : 'maybe';
      if (netProfit >= 40 && verdict === 'skip') verdict = 'maybe';
      flipMap.set(item.itemId, { verdict, netProfit, avgSoldPrice: r.value.avgSoldPrice, soldCount: r.value.count, marginPct });
    });

    // Send emails
    const sendResults = await Promise.allSettled(userDigests.map(({ email, deals }) => sendDailyDigest(deals, email, aiPick, flipMap)));

    // Send SMS to all users with a phone number configured
    const smsUsers = toOverride ? [] : await getAllUsers();
    await Promise.allSettled(smsUsers.map(async u => {
      try {
        const prefs = await getUserPrefs(u.userId);
        if (prefs.notificationPhone) await sendSMSDigest(best5, prefs.notificationPhone, flipMap);
      } catch { /* silent — SMS failure never blocks email */ }
    }));
    const errors = sendResults
      .map((r, i) => r.status === 'rejected' ? `${userDigests[i].email}: ${r.reason}` : null)
      .filter(Boolean);
    const successCount = sendResults.filter(r => r.status === 'fulfilled').length;

    if (successCount === 0) {
      return NextResponse.json({ sent: false, reason: 'All emails failed', errors }, { status: 500 });
    }

    // Record send date to prevent duplicates
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey() }));

    return NextResponse.json({
      sent: true,
      date: todayKey(),
      recipients: successCount,
      rawItemCount: allItems.length,
      nonRefurbCount: nonRefurb.length,
      aiPick: aiPick ?? null,
      errors: errors.length > 0 ? errors : undefined,
      deals: best5.map(d => ({
        title: d.title,
        price: d.price,
        marketPrice: d.marketPrice,
        discountPct: d.discountPct,
        condition: d.condition,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
