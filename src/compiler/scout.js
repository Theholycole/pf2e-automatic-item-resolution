// An object that goes off on its own and comes back with what it saw (2026-10-27, docs/needs.md): Shortbread Spy's "The cookie then scrambles
// away at a Speed of 15 feet, returning to the same spot about 1 hour later … Upon its return, it falls to the ground, never to move again. As
// long as you decorated the shortbread spy with eyes, it gains normal vision, which it uses to see and magically record the sights along its path.
// Any creature that eats the cookie once it returns can then see what the spy saw." Its going and coming are an object's, out of the fight, and
// what it saw is information: the user's ruling for information (2026-10-25), the card whispered to the GM and its user with its words, the GM
// telling what it saw (plan.whisper, scripts/live.js). Its moving, its fall and its hour are the cookie's, not a creature's. Pure.

import { plainText } from "./rows.js";

const SCOUT = /\bThe cookie then scrambles away at a Speed of (\d+) feet, returning to the same spot about (\d+) hours? later\b[^]*?\bAny creature that eats the cookie once it returns can then see what the spy saw\./i;

// The item and its plan's base → the whispered card's plan, or null.
export function scoutPlan(item, base) {
    const text = plainText(item?.system?.description?.value);
    if (item?.type !== "consumable" || !SCOUT.test(text)) return null;
    const body = text.replace(/^\s*Activate\s+\d+ (?:minutes?|hours?)\s*(?:\([^)]*\))?\s*/i, "").trim();
    return { ...base, builtin: "whisper", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, whisper: { text: `${body} (The GM tells what it saw to whoever eats it on its return, an hour later.)` }, decided: "information" };
}
