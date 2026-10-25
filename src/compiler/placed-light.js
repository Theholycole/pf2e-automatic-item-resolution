// A light an item puts in a square, not on its user (2026-10-25, docs/needs.md): Flare Beacon's "you can either place it on the ground in a space
// within your reach or toss it up to 60 feet straight up. The beacon then sparks into being, casting bright light in a 20-foot radius and dim
// light in the next 20 feet for 1 minute" → plan.item.placedLight { bright, dim, duration }: a Foundry light at its user's square for that time
// (scripts/placed-light.js), its sentence read. Its user moves it by hand when they put it farther (its reach, or up in the air). Pure.

import { durationIn } from "./rows.js";

const BEACON = /\bThe [\w' -]+? then sparks into being, casting bright light in an? (\d+)-foot radius and dim light in the next (\d+) feet(?: for ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)))?\./i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withPlacedLight(plan, text) {
    const match = BEACON.exec(String(text ?? ""));
    if (!match || !plan?.resolution || plan.builtin) return plan;
    const placedLight = { bright: Number(match[1]), dim: Number(match[1]) + Number(match[2]), duration: match[3] ? durationIn(`for ${match[3]}`, null) : null };
    const notes = (plan.notes ?? []).filter((note) => !said(note).includes(match[0].slice(0, 60)));
    const result = { ...plan, item: { ...(plan.item ?? {}), placedLight }, ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}) };
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(plan.resolution.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
