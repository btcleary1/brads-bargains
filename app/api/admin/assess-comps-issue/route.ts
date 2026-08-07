import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { extractModelQuery } from '@/lib/extract-model';
import { searchSoldComps } from '@/lib/ebay-comps';
import { r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GITHUB_TOKEN = process.env.GITHUB_API_TOKEN ?? '';
const REPO = 'btcleary1/brads-bargains';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brads-bargains.vercel.app';

// Files the agent is allowed to inspect and patch
const PATCHABLE_FILES = [
  'lib/extract-model.ts',
  'lib/ebay-comps.ts',
  'lib/multi-source-comps.ts',
  'lib/flip-agent.ts',
];

async function getFileFromGitHub(path: string): Promise<{ content: string; sha: string } | null> {
  if (!GITHUB_TOKEN) return null;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
}

async function pushFileToGitHub(path: string, content: string, sha: string, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
      branch: 'main',
    }),
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  let body: { itemId: string; title: string; price: number; reportedNetProfit: number };
  try {
    body = await req.json();
    if (!body.itemId || !body.title || !body.price) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { itemId, title, price, reportedNetProfit } = body;
  const reportedAvgSold = Math.round((reportedNetProfit + price) / 0.85);

  // 1. Re-run comps with the current query
  const query = extractModelQuery(title);
  let compsResult;
  try {
    compsResult = await searchSoldComps(query, 15);
  } catch (err) {
    await saveIssue(itemId, title, query, { error: String(err), status: 'comps_fetch_failed' });
    return NextResponse.json({ ok: true, status: 'comps_fetch_failed' });
  }

  const compsTitles = compsResult.comps.map(c => `"${c.title}" — $${c.soldPrice}`).join('\n');

  // 2. Fetch the patchable source files for the agent to inspect
  const sources: Record<string, { content: string; sha: string }> = {};
  for (const f of PATCHABLE_FILES) {
    const file = await getFileFromGitHub(f);
    if (file) sources[f] = file;
  }

  const sourceBlock = Object.entries(sources)
    .map(([path, { content }]) => `### ${path}\n\`\`\`typescript\n${content}\n\`\`\``)
    .join('\n\n');

  // 3. Ask Claude to diagnose and produce a targeted patch
  const systemPrompt = `You are an autonomous code-quality agent for AI FLIP, an eBay flip advisory app.
A user flagged a deal as having inflated profit. Your job is to:
1. Diagnose why the comps are wrong for this specific item
2. Identify which source file and which lines are responsible
3. Produce a precise, minimal patch to fix the root cause
4. Only patch if you are confident the fix is correct and safe

You must respond with a JSON object:
{
  "diagnosis": "<one paragraph explaining root cause>",
  "rootCause": "token_limit" | "no_similarity_filter" | "no_outlier_removal" | "wrong_query_construction" | "other" | "no_issue",
  "confidence": "high" | "medium" | "low",
  "patch": {
    "file": "<path relative to repo root>",
    "oldContent": "<exact string to replace — must match the file exactly>",
    "newContent": "<replacement string>",
    "reason": "<one sentence>"
  } | null
}

Only emit a patch when confidence is "high". Set patch to null otherwise.
Only patch files in: ${PATCHABLE_FILES.join(', ')}.`;

  const userMessage = `## Flagged item
Title: "${title}"
Buy price: $${price}
Reported avg sold (from app): $${reportedAvgSold}
Reported net profit (from app): $${reportedNetProfit}

## Comps query used
\`\`\`
${query}
\`\`\`

## eBay sold comps returned (${compsResult.count} results)
Avg sold: $${compsResult.avgSoldPrice} | Median: $${compsResult.medianSoldPrice}
${compsTitles || '(none)'}

## Source files
${sourceBlock}

Diagnose why the avg sold price ($${compsResult.avgSoldPrice}) is ${compsResult.avgSoldPrice > price * 2 ? 'likely inflated' : 'possibly wrong'} for this item. The user says the real market value is roughly $${price} or less.`;

  let diagnosis: {
    diagnosis: string;
    rootCause: string;
    confidence: string;
    patch: { file: string; oldContent: string; newContent: string; reason: string } | null;
  };

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    diagnosis = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    await saveIssue(itemId, title, query, { error: String(err), status: 'claude_failed' });
    return NextResponse.json({ ok: true, status: 'claude_failed' });
  }

  // 4. Apply patch if confident and file content matches exactly
  let deployed = false;
  if (diagnosis.confidence === 'high' && diagnosis.patch && GITHUB_TOKEN) {
    const { file, oldContent, newContent, reason } = diagnosis.patch;
    if (PATCHABLE_FILES.includes(file) && sources[file]) {
      const { content, sha } = sources[file];
      if (content.includes(oldContent)) {
        const patched = content.replace(oldContent, newContent);
        const commitMsg = `Auto-fix inflated comps for "${title.slice(0, 60)}"\n\n${reason}\n\nRootCause: ${diagnosis.rootCause}`;
        deployed = await pushFileToGitHub(file, patched, sha, commitMsg);
      }
    }
  }

  const result = {
    itemId,
    title,
    query,
    compsAvgSold: compsResult.avgSoldPrice,
    compsCount: compsResult.count,
    diagnosis: diagnosis.diagnosis,
    rootCause: diagnosis.rootCause,
    confidence: diagnosis.confidence,
    patch: diagnosis.patch ? { file: diagnosis.patch.file, reason: diagnosis.patch.reason } : null,
    deployed,
    assessedAt: new Date().toISOString(),
  };

  await saveIssue(itemId, title, query, result);

  // Notify admin if deployed
  if (deployed) {
    fetch(`${APP_URL}/api/admin/send-admin-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: `AI FLIP: Auto-fixed comps issue for "${title.slice(0, 50)}"`,
        body: `Root cause: ${diagnosis.rootCause}\n\nDiagnosis: ${diagnosis.diagnosis}\n\nPatch applied to ${diagnosis.patch?.file}. Vercel is redeploying.`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, ...result });
}

async function saveIssue(itemId: string, title: string, query: string, data: object) {
  try {
    await r2Put(`deal-wiz/comps-issues/${itemId}.json`, JSON.stringify({ itemId, title, query, ...data }));
  } catch { /* non-fatal */ }
}
