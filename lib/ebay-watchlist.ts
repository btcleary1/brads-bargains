import { getUserPrefs, saveUserPrefs } from './tracker-data';

const EBAY_TRADING_API = 'https://api.ebay.com/ws/api.dll';

async function refreshAccessToken(userId: string, prefs: any): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  if (!clientId || !clientSecret || !prefs.ebayRefreshToken) return null;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: prefs.ebayRefreshToken,
        scope: 'https://api.ebay.com/oauth/api_scope',
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await saveUserPrefs(userId, { ...prefs, ebayAccessToken: data.access_token, ebayTokenExpiresAt: Date.now() + data.expires_in * 1000 });
    return data.access_token;
  } catch { return null; }
}

// eBay Trading API response structure: <WatchList><ItemArray><Item><Title>...</Title></Item></ItemArray></WatchList>
function extractTitlesFromSection(xml: string, section: string): string[] {
  const sectionMatch = new RegExp(`<${section}[^>]*>([\\s\\S]*?)<\\/${section}>`, 'i').exec(xml);
  if (!sectionMatch) return [];
  const sectionXml = sectionMatch[1];
  const titles: string[] = [];
  const itemRegex = /<Item[^>]*>([\s\S]*?)<\/Item>/g;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(sectionXml)) !== null) {
    const titleMatch = /<Title>([\s\S]*?)<\/Title>/i.exec(itemMatch[1]);
    if (titleMatch) titles.push(titleMatch[1].trim());
  }
  return titles;
}

async function callTradingApi(token: string, xmlBody: string): Promise<string | null> {
  try {
    const res = await fetch(EBAY_TRADING_API, {
      method: 'POST',
      headers: {
        // Trading API requires IAF token header for OAuth 2.0
        'X-EBAY-API-IAF-TOKEN': token,
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
        'X-EBAY-API-SITEID': '0',
        'Content-Type': 'text/xml',
      },
      body: xmlBody,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    console.log('[ebay-watchlist] Trading API status:', res.status, text.slice(0, 300));
    if (!res.ok) return null;
    return text;
  } catch (e) { console.error('[ebay-watchlist] Trading API error:', e); return null; }
}

export interface EbayBuyingActivity {
  watchedTitles: string[];
  wonTitles: string[];
  rawXml?: string;
}

export async function fetchEbayBuyingActivity(userId: string): Promise<EbayBuyingActivity> {
  const empty: EbayBuyingActivity = { watchedTitles: [], wonTitles: [] };
  const prefs = await getUserPrefs(userId) as any;
  if (!prefs.ebayAccessToken) return empty;

  let token = prefs.ebayAccessToken;
  if (!prefs.ebayTokenExpiresAt || prefs.ebayTokenExpiresAt < Date.now() + 5 * 60 * 1000) {
    token = await refreshAccessToken(userId, prefs) ?? '';
    if (!token) return empty;
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <WatchList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </WatchList>
  <WonList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </WonList>
</GetMyeBayBuyingRequest>`;

  const responseXml = await callTradingApi(token, xml);
  if (!responseXml) return empty;

  return {
    watchedTitles: extractTitlesFromSection(responseXml, 'WatchList'),
    wonTitles: extractTitlesFromSection(responseXml, 'WonList'),
    rawXml: responseXml.slice(0, 1000),
  };
}
