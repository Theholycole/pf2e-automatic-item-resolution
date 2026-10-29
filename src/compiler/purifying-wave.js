// A healing wave that also counteracts sickness on those it heals (2026-10-28, docs/needs.md "afflictions", "counteract"): Magic+'s Scepter of
// Purifying's Purifying Wave, paid with a spell slot of 4th rank or higher (the ways card's pick of the slot, src/compiler/slot-cost.js):
// 1d8 Hit Points a rank to every creature in a 30-foot cone (read before), and a counteract, at the slot's rank, of either the Sickened
// condition of every creature there or one disease or poison on one of them. Before, that counteract was left unread. Now each slot's way
// has plan.heldCounteract (scripts/hit-counteract.js): once the ability module's card has healed them, a counteract card at each creature
// healed — its Sickened, diseases and poisons listed, one ticked —, at the slot's rank; the text gives no modifier, so it's the scepter's
// level's DC − 10 (the user's ruling of 2026-10-26), the GM's to change. The either-or is the card's line. Pure.

import { LEVEL_DCS } from "./counteract.js";

const COUNTERS = /^You can attempt to counteract\s+the (sickened) condition of all creatures\s+in the area or\s+a (disease)\s+or (poison)\s+affecting a single target in the area\s+with a counteract rank of (\d+)\.$/i;

// One slot's way (its heal at the creatures in the area, the counteract unread) → the way with its counteract, or null.
function waveOf(way, level) {
    const plan = way?.plan;
    const heal = (plan?.resolution?.outcomes?.success?.effects ?? []).find((effect) => effect.kind === "heal");
    const unread = (plan?.unread ?? []).map((line) => String(line).trim());
    const found = unread.map((line) => COUNTERS.exec(line)).find(Boolean);
    const rank = Number(plan?.spend?.spellSlot?.rank);
    if (!heal || !found || Number(found[4]) !== rank || unread.length !== 1) return null;
    const modifier = LEVEL_DCS[Math.max(0, Math.min(25, Number(level) || 0))] - 10;
    const counteract = {
        modifier,
        rank,
        conditions: [found[1].toLowerCase()],
        traits: [],
        afflictions: [found[2].toLowerCase(), found[3].toLowerCase()],
        pick: "one",
        notes: [
            "Its user's choice for the whole wave: the Sickened of each creature it healed, or one disease or poison on just one of them (tick only that).",
            `Its counteract modifier +${modifier} is the scepter's level's (the text gives none): the GM may change it.`
        ]
    };
    const { unread: _unread, partial, ...rest } = plan;
    return { ...way, plan: { ...rest, automation: { ...(plan.automation ?? {}), level: "automatic" }, heldCounteract: { degrees: ["success"], counteract } } };
}

// The ways card of a slot's ranks → each way with its counteract, the card no longer partial; or the same plan.
export function withPurifyingWave(plan, level) {
    if (plan?.builtin !== "ways" || !(plan.ways ?? []).length || !plan.ways.every((way) => way?.plan?.spend?.spellSlot)) return plan;
    const ways = plan.ways.map((way) => waveOf(way, level));
    if (ways.some((way) => !way)) return plan;
    const { partial, ...rest } = plan;
    return { ...rest, ways, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}
