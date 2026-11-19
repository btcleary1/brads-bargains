# Cleary eTrading: notes for Claude

Follow `.windsurfrules` (regression testing and coding standards).

## Guardrails on every typed field (always)

Any new chat, AI feature or field where a person can type and save text (notes, searches, feedback, names,
preferences) runs the text through `screenSaved()` or `checkSaved()` from `lib/guardrails.ts` in the same
change, with should-block and should-allow cases in `scripts/test-guardrails.mts` (`npm run test:guardrails`).
`lib/guardrails.ts` has the GLOBAL rules (the same in every Cleary app; Cleary Trading's
`lib/assistant/guardrails.ts` is the reference) and the ETRADING rules (counterfeits, stolen goods, fake
reviews, shill bidding). Resale words ("steal of a deal", "killer price") stay allowed. The suite rules live in
Cleary Trading's `docs/CLEARY_SUITE.md`.
