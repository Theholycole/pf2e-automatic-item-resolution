// A tea's Tea Ceremony (PF2e's teas: "Activate - Tea Ceremony 10 minutes … Effect The duration increases to 1 hour",
// Longnight Tea's "… to 8 hours, and the tea removes the Fatigued condition", Resurrection Tea's stronger effect): what the
// card's "Tea Ceremony" tick changes (the user's answer of 2026-10-15) — the Effect's time, the conditions it removes, and
// PF2e's own ceremony choice on the Effect where it has one (live play). Pure.

import { plainText } from "./rows.js";

const UNITS = { minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };

// The item's text → { duration: { value, unit } | null, removes: [slug], text } or null without a Tea Ceremony.
export function readTeaCeremony(html) {
    const text = plainText(html);
    const at = text.search(/\bTea Ceremony\b/);
    if (at < 0) return null;
    const ceremony = text.slice(at).replace(/^.*?\bEffect\b\s*/, "").split(/\bCraft Requirements\b/)[0].trim();
    // (Its longest time: Spiritsight Tea's "… increases to 30 minutes, and the duration of the item bonus increases to 8 hours".)
    const times = [...ceremony.matchAll(/\b(?:increases? to|last(?:s)? for) (\d+) (minutes?|hours?)\b/gi)].map((match) => ({ value: Number(match[1]), unit: UNITS[match[2].toLowerCase()] }));
    const seconds = (time) => time.value * (time.unit === "hours" ? 3600 : 60);
    const duration = times.sort((a, b) => seconds(b) - seconds(a))[0] ?? null;
    const removes = [...ceremony.matchAll(/\bremoves? the (\w+) condition\b/gi)].map((match) => match[1].toLowerCase());
    return { duration, removes, text: ceremony };
}
