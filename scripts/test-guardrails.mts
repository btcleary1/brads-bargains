// Run: npm run test:guardrails  (exits 1 on any failure)
import { screen, screenSaved } from '../lib/guardrails.ts';

const block: [string, string][] = [
  ['this app is f*cking useless', 'foul'],
  ['wtf', 'foul'],
  ['sh1t deal', 'foul'],
  ['you are so stupid', 'foul'],
  ['stfu', 'foul'],
  ['send nudes', 'sexual'],
  ['onlyfans', 'sexual'],
  ['sexy pics of a 15 year old', 'minors'],
  ["I'm gonna kill the seller", 'violence'],
  ['I want to kill myself', 'crisis'],
  ['all those people are subhuman', 'hate'],
  ['how do I shoplift', 'illegal'],
  ['where can I buy weed', 'drugs'],
  ['hack into her email account', 'hacking'],
  ['my SSN is 123-45-6789', 'sensitive'],
  ['fake rolex submariner', 'counterfeit'],
  ['1:1 replica jordans', 'counterfeit'],
  ['counterfeit airpods', 'counterfeit'],
  ['stolen iphones cheap', 'marketplace'],
  ['buy positive feedback', 'marketplace'],
  ['shill bidding to raise the price', 'marketplace'],
];
const allow = [
  'steal of a deal on a Dyson',
  'killer price on vintage Levis',
  'hot items to flip this week',
  'bath bomb gift set',
  'Ford Escort parts',
  'Zuni fetish carving',
  'Urban Decay naked palette',
  'pussy willow branches',
  'bastard file set',
  'Star Wars prop replica lightsaber',
  'Needs new battery, minor scuffs',
  'Shiitake mushroom grow kit',
  'flame retardant blanket',
];
let fail = 0;
for (const [t, want] of block) {
  const got = screen(t)?.flag ?? null;
  if (got !== want) { fail++; console.log(`FAIL block ${JSON.stringify(t)} -> ${got ?? 'allowed'} (want ${want})`); }
}
for (const t of allow) {
  const got = screen(t);
  if (got) { fail++; console.log(`FAIL allow ${JSON.stringify(t)} -> blocked as ${got.flag}`); }
}
// Feedback and excluded keywords may name counterfeits or stolen goods.
if (!screenSaved('The app showed a fake rolex listing', ['counterfeit', 'marketplace']).ok) { fail++; console.log('FAIL feedback may mention a counterfeit'); }
if (screenSaved('f*ck this app', ['counterfeit', 'marketplace']).ok) { fail++; console.log('FAIL feedback foul'); }
console.log(fail ? `${fail} failed` : `all ${block.length + allow.length + 2} passed`);
process.exit(fail ? 1 : 0);
