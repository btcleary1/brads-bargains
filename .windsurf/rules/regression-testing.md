---
trigger: always_on
---

# Regression Testing — Required After Every Change

After completing any code change, you MUST run the following checks before declaring the task done. Do not skip steps even for "small" changes.

## Step 1 — TypeScript type check (always)

```bash
npx tsc --noEmit
```

Only the pre-existing deprecation warning about `target=ES5` in tsconfig.json is acceptable. Any other error must be fixed before proceeding.

## Step 2 — Build verification (for any change to API routes, lib files, or page components)

```bash
npm run build
```

The build must complete with zero errors. Warnings are acceptable but should be noted.

## Step 3 — Code review checklist (read every file you touched)

Before finishing, re-read each modified file and verify:

- [ ] No unused imports
- [ ] No duplicate variable declarations (e.g. `const x` declared twice in same scope)
- [ ] No duplicate async calls (e.g. fetching the same data twice when once is enough)
- [ ] All new functions that are exported are actually imported and used where needed
- [ ] All new API routes return consistent JSON shapes on both success and error paths
- [ ] No hardcoded values that should come from environment variables or user prefs
- [ ] Error paths are handled (try/catch, null checks, optional chaining)

## Step 4 — Affected feature paths (manual checklist)

After any change, identify which user-facing flows are affected and list them. For this project the key paths are:

| Flow | Trigger |
|---|---|
| Search & deal display | Any change to `app/api/deals/`, `lib/deal-score.ts`, `lib/ebay.ts`, `app/deals/page.tsx` |
| Filter preferences | Any change to `lib/deal-score.ts`, `lib/tracker-data.ts`, `app/api/prefs/`, `app/settings/page.tsx` |
| eBay OAuth & recommendations | Any change to `lib/ebay-user.ts`, `app/api/auth/ebay/`, `app/api/recommendations/`, `app/deals/page.tsx` |
| Deal tracker | Any change to `app/api/tracker/`, `lib/tracker-data.ts`, `app/tracker/` |
| Email digest | Any change to `app/api/digest/`, `lib/notify.ts`, `lib/digest-categories.ts` |
| Authentication | Any change to `app/api/auth/`, `lib/session.ts`, `lib/users.ts` |

For each affected path, describe what a human tester would need to verify. If you cannot run the app in this session, explicitly say so rather than claiming the feature works.

## Step 5 — Report findings

End every task with a short honest summary:

- What was verified (TypeScript clean, build passed, logic reviewed)
- What was NOT verified (live browser testing, external API calls, OAuth flows)
- Any known risks or edge cases that weren't exercised
