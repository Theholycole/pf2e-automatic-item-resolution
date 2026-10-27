// An activation its user may make only after a hit with the weapon (2026-10-20): Alghollthu Whip's "Requirements Your last action was a
// successful Strike, Grapple, or Trip with the alghollthu whip", Apotheosis Knife's "Your previous action was a successful Strike with the
// apotheosis knife", Obsidian Edge's "Your most recent action this turn was a successful ranged Strike with obsidian edge", Bow of Sun
// Slaying's, Bloodgorger Scythe's; Rending Gauntlets' "You hit the same creature with two unarmed Strikes in the same round". plan.gate
// { strike: { ranged, maneuvers } } or { twoUnarmed: true }: live play (scripts/live.js) looks at its user's latest roll in the chat before
// the card is posted — a refusal with no card, and no use counted, when it isn't one — and its card is at the creature it struck when its
// presser targets none. What else the requirement says stays the GM's (Bloodgorger's target taking no bleed). Pure.

const LAST_STRIKE = /\bRequirements? Your (?:last|most recent|previous) action(?: this turn)? was a successful (?:(ranged|melee) )?(Strike(?:, Grapple, or Trip)?)(?: against your foe)? with (?:this weapon|the [\w' -]+?|(?:greater |major |true )?[\w' -]+?)(?=\.|,| and\b| Effect\b|$)/i;
const TWO_UNARMED = /\bRequirements? You hit the same creature with two unarmed Strikes in the same round\b/i;
// (A kill with any of its user's melee Strikes, Shadowed Scale, the Jungle Secret's "Your last action was a melee Strike that killed a living creature
// or destroyed an undead creature": { strike: { range, any, killed } } — live play also wants that Strike's creature dead now, 2026-10-27.)
const KILLED = /\bRequirements? Your (?:last|most recent|previous) action was an? (melee|ranged) Strike that killed a living creature or destroyed an undead creature\b/i;
// (One with another way in, Scizore of the Crab's "…, or you have a creature Grabbed with this weapon": not refused, the GM's.)
const OR_ELSE = /\bRequirements? [^.]*\bor you have\b/i;

// The activation's plain text → its gate, or null.
export function readStrikeGate(text) {
    const plain = String(text ?? "");
    if (OR_ELSE.test(plain)) return null;
    if (TWO_UNARMED.test(plain)) return { twoUnarmed: true };
    const killed = KILLED.exec(plain);
    if (killed) return { strike: { range: killed[1].toLowerCase(), maneuvers: [], any: true, killed: true } };
    const match = LAST_STRIKE.exec(plain);
    if (!match) return null;
    return { strike: { ...(match[1] ? { range: match[1].toLowerCase() } : {}), maneuvers: /Grapple/.test(match[2]) ? ["grapple", "trip"] : [] } };
}

// The plan with its gate (one the card plays at its targets: a save, or damage outright — Rending Gauntlets' 2d6).
export function withStrikeGate(plan, text) {
    const gate = plan?.resolution && !plan.builtin ? readStrikeGate(text) : null;
    return gate ? { ...plan, gate: { ...(plan.gate ?? {}), ...gate } } : plan;
}

// Whether the user's latest rolls meet it — messages: the chat's recent ones, newest last, as { actorUuid, type, outcome, itemUuid, slug,
// targetUuid, ranged, unarmed, round } — and the creature struck: { ok, struck, why }.
export function gateMet(gate, messages, { actorUuid, itemUuid, round = null } = {}) {
    const mine = (messages ?? []).filter((entry) => entry.actorUuid === actorUuid && entry.outcome);
    const hit = (entry) => entry.outcome === "success" || entry.outcome === "criticalSuccess";
    if (gate?.twoUnarmed) {
        const hits = mine.filter((entry) => entry.type === "attack-roll" && entry.unarmed && hit(entry) && (round === null || entry.round === round));
        const counts = {};
        for (const entry of hits) counts[entry.targetUuid] = (counts[entry.targetUuid] ?? 0) + 1;
        const struck = Object.keys(counts).find((uuid) => uuid && uuid !== "undefined" && counts[uuid] >= 2) ?? null;
        return struck ? { ok: true, struck } : { ok: false, why: "two unarmed hits on the same creature this round" };
    }
    if (!gate?.strike) return { ok: true, struck: null };
    const latest = mine.at(-1);
    const strike = latest && latest.type === "attack-roll" && (gate.strike.any || latest.itemUuid === itemUuid) && (!gate.strike.range || (gate.strike.range === "ranged") === Boolean(latest.ranged));
    const maneuver = latest && gate.strike.maneuvers.includes(latest.slug);
    if (!latest || !(strike || maneuver) || !hit(latest)) return { ok: false, why: `a successful ${gate.strike.range ? `${gate.strike.range} ` : ""}Strike${gate.strike.maneuvers.length ? ", Grapple or Trip" : ""}${gate.strike.any ? "" : " with it"} as its last roll${gate.strike.killed ? ", that killed its creature" : ""}` };
    return { ok: true, struck: latest.targetUuid ?? null };
}
