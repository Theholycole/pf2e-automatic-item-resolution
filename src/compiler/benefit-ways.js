// A Strike with one of several benefits its user picks (2026-10-27, docs/needs.md "Changes to a Strike"): Morphing Weapon's Reshape, "Strike
// with the morphing weapon, choosing one of the following benefits to apply to the Strike. Reach Increase the reach by 5 feet. Shift The
// weapon's damage becomes your choice of bludgeoning, piercing, or slashing instead of its normal type. Take If the Strike hits, you can attempt
// to Disarm or Steal from your target immediately after as a reaction. Weigh Gain a status bonus to the damage roll equal to the weapon's number
// of damage dice." The ways card, each way its next Strike this turn (the Strike card, scripts/strikes.js): Reach, strike.reach (the card's
// line); Shift, one way per type, PF2e's DamageAlteration of the damage type; Take, PF2e's Disarm card after the hit (strike.follow), Steal its
// line (its user's own reaction, PF2e's action); Weigh, PF2e's FlatModifier of the weapon's damage dice, a status bonus (strike.flat). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { itemActionPlan } from "./item-actions.js";

const HEAD = /<p>\s*<strong>\s*Effect\s*<\/strong>\s*Strike with the [\w' -]+?, choosing one of the following benefits to apply to the Strike\.\s*<\/p>/i;
const BENEFIT = /<p>\s*<strong>\s*([A-Z][a-z]+)\s*<\/strong>\s*([\s\S]*?)<\/p>/g;
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

const REACH = /^Increase the reach by (\d+) feet\.$/i;
const SHIFT = /^The weapon's damage becomes your choice of ((?:\w+, )*\w+,? or \w+) instead of its normal type\.$/i;
const TAKE = /^If the Strike hits, you can attempt to (Disarm|Trip|Shove|Grapple|Reposition) or (\w+) from your target immediately after as a reaction\.$/i;
const WEIGH = /^Gain a status bonus to the damage roll equal to the weapon's number of damage dice\.$/i;

// A way's plan: its user's next Strike this turn, with what the way gives it (strike: extra) — the Strike card's (scripts/strikes.js).
// (2026-10-28: shared with Ice Zuggle Orb's spell-charged throws, src/compiler/readings-areas.js.)
export const benefitStrike = (base, extra = {}, rows = {}) => ({
    ...base,
    modelVersion: MODEL_VERSION,
    automation: { level: "automatic" },
    targeting: { target: "the creature the Strike hits", range: null, area: null },
    trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
    resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none(), ...rows } },
    strike: { range: null, save: null, damage: [], attack: null, alteration: null, own: false, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], ...extra }
});

// The activation's html, its base, options → the ways card, or null.
export function benefitWaysPlan(html, base, options = {}) {
    const text = String(html ?? "");
    const head = HEAD.exec(text);
    if (!head) return null;
    const strikeOf = (extra = {}, rows = {}) => benefitStrike(base, extra, rows);
    const ways = [];
    for (const [, name, words] of text.slice(head.index + head[0].length).matchAll(BENEFIT)) {
        const said = plain(words);
        const reach = REACH.exec(said);
        const shift = SHIFT.exec(said);
        const take = TAKE.exec(said);
        if (reach) ways.push({ name, plan: strikeOf({ reach: { more: Number(reach[1]) } }) });
        else if (shift) for (const type of shift[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean)) ways.push({ name: `${name}: ${type}`, plan: strikeOf({ alteration: type }) });
        else if (take) {
            const action = take[1].charAt(0).toUpperCase() + take[1].slice(1).toLowerCase();
            const follow = itemActionPlan(`<p>You attempt to ${action} the creature.</p>`, base, options);
            if (!follow?.action) return null;
            ways.push({ name, plan: strikeOf({ follow, lines: [`On a hit: ${action} it, or ${take[2]} from it instead (PF2e's ${take[2]}, by hand), as a reaction right after`] }) });
        } else if (WEIGH.test(said)) ways.push({ name, plan: strikeOf({ flat: [{ value: 1, perDie: true, type: "status" }] }) });
        else return null;
    }
    if (ways.length < 2) return null;
    return { ...base, modelVersion: MODEL_VERSION, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways };
}
