// A critical hit's hold that lasts as long as the ammunition's persistent damage (2026-10-27, docs/needs.md "Changes to a Strike"): Garrote
// Shot's "When the activated ammunition hits a target, it transforms into a silvery garrote that wraps around one of the target's appendages,
// dealing 2d12 persistent slashing. On a critical hit, it wraps around the target's throat if it has one, and the target can't breathe until
// the persistent damage ends. If the persistent damage kills the target, the garrote severs the appendage it's wrapped around." Its damage is
// PF2e's own rule on the ammunition (src/compiler/pf2e-rules.js); the critical hit needs the Strike card (scripts/strikes.js), so the plan is
// the ammunition's next ranged Strike, its critical hit a note Effect on the creature for as long as that persistent damage lasts (whilePersistent,
// the ability module's: gone with the last of it) — PF2e has no rule for a creature that can't breathe, only the GM's suffocation rules. What a
// death does to the body, a line of the card. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { ownStrikeRules } from "./pf2e-rules.js";

const HOLD = /^On a critical hit, it wraps around the target's (\w+) if it has one, and the target (can't [^.]+?) until the persistent damage ends\.$/i;
const SEVERS = /^If the persistent damage kills the target, the [\w' -]+? severs the appendage it's wrapped around\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The pf2e-rules plan, the ammunition and its activation's plain text → its Strike plan, or the same plan.
export function withPersistentHold(plan, item, text) {
    if (plan?.builtin !== "pf2e-rules" || item?.type !== "ammo") return plan;
    const held = (plan.notes ?? []).map((note) => [note, HOLD.exec(String(note).trim())]).find(([, match]) => match);
    if (!held) return plan;
    // (The persistent damage its own rule deals, the one the hold lasts with.)
    const persistent = ownStrikeRules(item).filter((rule) => rule.key === "DamageDice" && rule.category === "persistent" && rule.damageType);
    if (persistent.length !== 1) return plan;
    const [rule] = persistent;
    const type = rule.damageType;
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim());
    const severs = sentences.filter((sentence) => SEVERS.test(sentence));
    const left = (plan.notes ?? []).filter((note) => note !== held[0] && !/^PF2e's own rules on\b/.test(String(note)));
    const note = { label: `${item.name} (around its ${held[1][1]})`, text: `The garrote is around its ${held[1][1]}: it ${held[1][2]} until its persistent ${type} damage ends.`, whilePersistent: type };
    return {
        ...plan,
        builtin: undefined,
        rules: undefined,
        modelVersion: MODEL_VERSION,
        automation: { level: left.length ? "guided" : "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: { ...none(), noteEffects: [note] }, success: none(), failure: none(), criticalFailure: none() }
        },
        strike: { range: "ranged", save: null, ammo: true, uses: 1, until: "turn-end", missKeeps: false, hit: false, ownRules: [`${rule.diceNumber ?? 1}${rule.dieSize} persistent ${type} damage`], ...(severs.length ? { lines: severs } : {}), notes: left },
        notes: undefined,
        partial: left.length ? true : undefined
    };
}
