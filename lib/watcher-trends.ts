import { r2Get, r2Put } from './r2';

const WATCHER_SNAPSHOT_KEY = 'deal-wiz/watcher-snapshots.json';

interface WatcherSnapshot {
  itemId: string;
  watchCount: number;
  timestamp: number;
}

interface WatcherHistory {
  [itemId: string]: WatcherSnapshot[];
}

export interface WatcherVelocity {
  itemId: string;
  currentCount: number;
  delta24h: number | null;    // change in last 24 hours
  velocityLabel: 'hot' | 'rising' | 'steady' | 'cooling';
}

// Keep last 48h of snapshots per item
const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_SNAPSHOTS_PER_ITEM = 20;

export async function recordWatcherSnapshots(
  items: { itemId: string; watchCount?: number | null }[]
): Promise<void> {
  const now = Date.now();
  const history = (await r2Get<WatcherHistory>(WATCHER_SNAPSHOT_KEY)) ?? {};

  for (const item of items) {
    if (!item.watchCount || item.watchCount <= 0) continue;
    const existing = history[item.itemId] ?? [];
    // Add new snapshot
    const updated = [
      ...existing.filter(s => now - s.timestamp < MAX_SNAPSHOT_AGE_MS),
      { itemId: item.itemId, watchCount: item.watchCount, timestamp: now },
    ].slice(-MAX_SNAPSHOTS_PER_ITEM);
    history[item.itemId] = updated;
  }

  // Prune items not in current set that are older than 48h
  const activeIds = new Set(items.map(i => i.itemId));
  for (const id of Object.keys(history)) {
    if (!activeIds.has(id)) {
      history[id] = history[id].filter(s => now - s.timestamp < MAX_SNAPSHOT_AGE_MS);
      if (history[id].length === 0) delete history[id];
    }
  }

  await r2Put(WATCHER_SNAPSHOT_KEY, JSON.stringify(history));
}

export async function getWatcherVelocities(itemIds: string[]): Promise<Record<string, WatcherVelocity>> {
  const history = (await r2Get<WatcherHistory>(WATCHER_SNAPSHOT_KEY)) ?? {};
  const now = Date.now();
  const result: Record<string, WatcherVelocity> = {};

  for (const itemId of itemIds) {
    const snapshots = history[itemId] ?? [];
    if (snapshots.length === 0) continue;

    const latest = snapshots[snapshots.length - 1];
    const currentCount = latest.watchCount;

    // Find snapshot closest to 24h ago
    const target24h = now - 24 * 60 * 60 * 1000;
    const older = snapshots.filter(s => s.timestamp <= target24h);
    const snapshot24hAgo = older.length > 0 ? older[older.length - 1] : snapshots[0];

    const delta24h = snapshots.length > 1
      ? currentCount - snapshot24hAgo.watchCount
      : null;

    let velocityLabel: WatcherVelocity['velocityLabel'] = 'steady';
    if (delta24h !== null) {
      const pctChange = snapshot24hAgo.watchCount > 0
        ? delta24h / snapshot24hAgo.watchCount
        : 0;
      if (delta24h >= 20 || pctChange >= 0.5) velocityLabel = 'hot';
      else if (delta24h >= 5 || pctChange >= 0.2) velocityLabel = 'rising';
      else if (delta24h < -5) velocityLabel = 'cooling';
    }

    result[itemId] = { itemId, currentCount, delta24h, velocityLabel };
  }

  return result;
}
