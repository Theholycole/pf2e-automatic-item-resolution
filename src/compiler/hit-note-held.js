// A hit's note Effect that holds the Strike card's notes (2026-10-27, docs/needs.md "Changes to a Strike"): what a hit does that can't be
// played, its words on the creature hit for their time (src/compiler/hit-notes.js) — the user's rule for what PF2e can't play —, so those
// sentences aren't the Strike card's notes too. Magekiller Bullet's "Each time within the next week an affected target Casts a Spell, it must
// attempt a @Check[flat|dc:11]. On a failure, it takes 2d12 force damage. This curse can be counteracted …": its note for the week, nothing
// left. And its user's later use of what stays there, Wormhole Shot's "Once during the wormhole shot's duration, if you're within 60 feet of
// it, you can use it as the point of origin for a spell or ranged attack, calculating range and cover from whatever space the wormhole shot
// is in. After being used this way, it quickly dissolves into black dust.": the note's too, a reminder on the creature or square hit for its
// minute (the map's, its user's own action). Last in the chain, after the readers of those notes (Beacon Shot's, the Awakened shots'
// counteract). Pure.

const LATER_USE = /^Once during the [\w' -]+? duration, if you're within \d+ feet of it, you can use it as the point of origin for a spell or ranged attack\b[^.]*\.$/i;
const USED_UP = /^After being used this way, it (?:quickly )?(?:dissolves|crumbles|vanishes)\b[^.]*\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withHitNoteHeld(plan) {
    const strike = plan?.strike;
    const outcomes = plan?.resolution?.outcomes;
    if (!strike?.fromNotes || !(strike.notes ?? []).length || !outcomes) return plan;
    // (The hit's own note, as hit-notes.js makes it: unlabelled, from the hit's words.)
    const note = (outcomes.success?.noteEffects ?? []).find((entry) => !entry.label && /^On a hit\b/.test(said(entry)));
    if (!note || !(outcomes.criticalSuccess?.noteEffects ?? []).includes(note)) return plan;
    const later = strike.notes.filter((line) => LATER_USE.test(said(line)));
    const used = later.length ? strike.notes.filter((line) => USED_UP.test(said(line))) : [];
    const held = strike.notes.filter((line) => note.text.includes(said(line)));
    if (!held.length && !later.length) return plan;
    const text = [note.text, ...[...later, ...used].map((line) => said(line).replace(/ 's\b/g, "'s"))].join(" ");
    const next = { ...note, text };
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, (row?.noteEffects ?? []).includes(note) ? { ...row, noteEffects: row.noteEffects.map((entry) => (entry === note ? next : entry)) } : row]));
    const notes = strike.notes.filter((line) => !held.includes(line) && !later.includes(line) && !used.includes(line));
    const left = [...notes, ...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(rows).flatMap((row) => row?.manualInstructions ?? [])];
    return { ...plan, resolution: { ...plan.resolution, outcomes: rows }, strike: { ...strike, notes }, ...(plan.partial && !left.length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
