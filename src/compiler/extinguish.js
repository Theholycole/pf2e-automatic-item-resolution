// Ammunition that douses persistent damage by its attack roll's degree (2026-10-27, docs/needs.md "Changes to a Strike"): Extinguishing Ball's
// "An activated extinguishing ball does no damage. Instead, it bathes the target in a splash of magical water with the following effects,
// depending on the result of your attack roll. Critical Success As success, but the water removes all instances of persistent acid or fire
// damage affecting the target. In addition, it reduces the DC of any future flat checks to end persistent acid or fire damage to 10 for 1
// minute … Success The water removes one instance of persistent acid or fire damage affecting the target … If the target is taking persistent
// damage from multiple sources, you select which one is removed. The water aids in ending any remaining sources …, reducing the DC of the
// target's next flat check to 10 … Failure The extinguishing ball misses the target but impacts nearby, splashing the target with enough water
// to reduce the DC of their next flat check to end one instance of persistent acid or fire damage to 10 … Critical Failure No effect."
// The ammunition's next ranged Strike (the Strike card, scripts/strikes.js): no damage (strike.noDamage, the card's line); its critical hit and
// hit end the creature's persistent damage of those types — all of it, or one (strike.recover, PF2e's conditions deleted, src/live's recover) —
// and every degree but a critical failure puts a note Effect on it with PF2e's own rule for the lower DC (ItemAlteration "pd-recovery-dc" on
// its persistent damage of those types, as PF2e's Toothy Knife raises it): for 1 minute, or until the end of its next turn, when its next
// flat check comes (strike.failRow: the failure's row played too). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const NO_DAMAGE = /\bAn activated [\w' -]+? does no damage\. Instead, it bathes the target in a splash of magical water with the following effects, depending on the result of your attack roll\./i;
const TYPES = /\bpersistent (\w+) or (\w+) damage\b/i;
const ALL = /\bCritical Success As success, but the water removes all instances of persistent \w+ or \w+ damage affecting the target\. In addition, it reduces the DC of any future flat checks to end persistent \w+ or \w+ damage to (\d+) for (\d+) (minutes?|rounds?)\b/i;
const ONE = /\bSuccess The water removes one instance of persistent \w+ or \w+ damage affecting the target\b[^.]*\.(?: If the target is taking persistent damage from multiple sources, you select which one is removed\.)? The water aids in ending any remaining sources of persistent \w+ or \w+ damage, reducing the DC of the target's next flat check to (\d+)\b/i;
const NEAR = /\bFailure The [\w' -]+? misses the target but impacts nearby, splashing the target with enough water to reduce the DC of their next flat check to end one instance of persistent \w+ or \w+ damage to (\d+)\b/i;
const NONE = /\bCritical Failure No effect\./i;
const NEXT_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

export function extinguishPlan(html, base) {
    const text = plain(html);
    const types = TYPES.exec(text);
    const all = ALL.exec(text);
    const one = ONE.exec(text);
    const near = NEAR.exec(text);
    if (!NO_DAMAGE.test(text) || !types || !all || !one || !near || !NONE.test(text)) return null;
    const kinds = [types[1].toLowerCase(), types[2].toLowerCase()];
    const lower = (dc) => [{ key: "ItemAlteration", itemType: "condition", mode: "downgrade", property: "pd-recovery-dc", value: Number(dc), predicate: [{ or: kinds.map((kind) => `item:damage:type:${kind}`) }] }];
    const words = kinds.join(" or ");
    const unit = /^min/i.test(all[3]) ? "minutes" : "rounds";
    const minute = { label: "Doused", text: `Flat checks to end its persistent ${words} damage are DC ${all[1]} for ${all[2]} ${Number(all[2]) === 1 ? unit.replace(/s$/, "") : unit}.`, duration: { mode: "fixed", value: Number(all[2]), unit, expiry: "turn-start", anchor: "effect-start" }, rules: lower(all[1]) };
    const next = (dc, words2) => ({ label: "Doused", text: words2, duration: NEXT_TURN, rules: lower(dc) });
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess", "failure"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: {
                criticalSuccess: { ...none(), noteEffects: [minute] },
                success: { ...none(), noteEffects: [next(one[1], `Its next flat check to end its remaining persistent ${words} damage is DC ${one[1]}.`)] },
                failure: { ...none(), noteEffects: [next(near[1], `Its next flat check to end one persistent ${words} damage is DC ${near[1]}.`)] },
                criticalFailure: none()
            }
        },
        strike: {
            range: "ranged", save: null, ammo: true, noDamage: true, uses: 1, until: "turn-end", missKeeps: false, hit: false, failRow: true, notes: [],
            recover: { criticalSuccess: { types: kinds, ends: true }, success: { types: kinds, ends: true, one: true } },
            lines: ["It deals no damage: don't roll the Strike's damage", `On a hit, if the creature has more than one persistent ${words} damage, the card ends one (end another instead on its sheet if you'd rather)`]
        }
    };
}
