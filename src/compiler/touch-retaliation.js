// Damage to whoever touches its user or hits it in melee while an activation lasts, said apart from that activation's time (2026-10-27,
// docs/needs.md "Retaliation"): Armorskin Robes of Fire's Elemental Sheath, "For 10 minutes, you gain resistance 5 to slashing and piercing
// damage but take a –5-foot status penalty to all Speeds …" — and while it's active, 1d6 fire to a creature touching its user or damaging it
// unarmed or with a melee weapon lacking reach. Its time the activation's own "For 10 minutes"; a weapon without reach
// hits from an adjacent square, as Thunder Mail's non-reach melee weapon does — so the same plan.alsoRetaliation (src/compiler/direct-damage.js
// retaliationBeside), the later card kept open beside the activation's own (scripts/live.js). Pure.

import { retaliationBeside } from "./direct-damage.js";

const WHILE_ACTIVE = /^While activated, any creature that touches you or damages you with an unarmed\s+attack or (?:a )?(?:non-reach )?melee weapon(?: without the reach trait)? takes (\d+d\d+(?:\s*\+\s*\d+)?) (acid|cold|electricity|fire|poison|sonic|force|mental|spirit|vitality|void) damage\.$/i;
const FOR_TIME = /\bFor (\d+|one|an?) (rounds?|minutes?)\b/gi;
const COUNT = { one: 1, a: 1, an: 1 };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The plan and its activation's html → the plan with its alsoRetaliation, the sentence gone; the same plan when it isn't one.
export function withTouchRetaliation(plan, html) {
    if (!plan || plan.builtin || plan.retaliation || plan.alsoRetaliation) return plan;
    const lists = ["notes", "unread"];
    const sentence = lists.flatMap((key) => plan[key] ?? []).find((entry) => WHILE_ACTIVE.test(said(entry)));
    if (!sentence) return plan;
    // (One time in the activation's words, its own: two would leave the retaliation's unsure.)
    const times = [...plain(html).replace(/^.*?\bEffect\b/s, "").matchAll(FOR_TIME)];
    if (times.length !== 1) return plan;
    const [, count, unit] = times[0];
    const value = COUNT[count.toLowerCase()] ?? Number(count);
    const [, dice, type] = WHILE_ACTIVE.exec(said(sentence));
    const span = /^minute/i.test(unit) && value === 1 ? "minute" : `${value} ${/^round/i.test(unit) ? "rounds" : "minutes"}`;
    // (Its sentence as the retaliation reader reads it, its two kinds of attack joined.)
    const attacks = ["a melee unarmed attack", "a non-reach melee weapon attack"].join(" or ");
    const also = retaliationBeside(`Additionally, for the next ${span}, whenever a creature touches you or hits you with ${attacks}, it takes ${dice} ${type} damage.`, { source: plan.source, rank: plan.rank, traits: plan.traits, activation: plan.activation, item: plan.item });
    if (!also) return plan;
    const next = { ...plan, alsoRetaliation: also };
    for (const key of lists) {
        if (!Array.isArray(plan[key])) continue;
        const kept = plan[key].filter((entry) => entry !== sentence);
        if (kept.length) next[key] = kept;
        else delete next[key];
    }
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
