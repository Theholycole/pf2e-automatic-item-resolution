// A Strike whose hit splits into one more attack roll at several others (2026-10-27, docs/needs.md "Changes to a Strike"): Splithead Bow's
// Five-Headed Arrow, "You make a powerful Strike propelled by the ferocity of a hydra at a target within your first range increment. If your
// Strike is successful, the arrow deals damage as normal and then passes through the target, splitting into four pieces. Choose four other
// targets within 30 feet of the original target and make a single ranged Strike with your multiple attack penalty, comparing the result to
// each secondary target's AC. After using this ability, you do not regain Hit Points from wielding the bow until after your next daily
// preparations." The Strike card with the bow (scripts/strikes.js), its hit posting a second Strike card (strike.thenStrike): one ranged Strike
// at up to four creatures its user targets then (strike.volley.oneRoll, the one roll compared to each one's AC — Hippopotamus Klar's); the bow's
// own healing off until its user's next daily preparations (plan.toggleOff untilRest, PF2e's own toggle on it, src/compiler/toggle-off.js). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const SPLIT = /^You make a powerful Strike propelled by the ferocity of a hydra at a target within your first range increment\. If your Strike is successful, the arrow deals damage as normal and then passes through the target, splitting into (two|three|four|five) pieces\. Choose \1 other targets within (\d+) feet of the original target and make a single ranged Strike with your multiple attack penalty, comparing the result to each secondary target's AC\. After using this ability, you do not regain Hit Points from wielding the bow until after your next daily preparations\.$/i;
const COUNT = { two: 2, three: 3, four: 4, five: 5 };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The activation's html, its base, the item (its own healing toggle) → the plan, or null.
export function splitArrowPlan(html, base, item) {
    const words = plainText(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
    const found = SPLIT.exec(words);
    if (!found || item?.type !== "weapon") return null;
    const rules = item.system?.rules ?? [];
    const healing = rules.find((rule) => rule?.key === "FastHealing");
    const toggle = rules.find((rule) => rule?.key === "RollOption" && rule.toggleable && (healing?.predicate ?? []).includes(rule.option));
    const count = COUNT[found[1].toLowerCase()];
    const strikeOf = (strike, name) => ({
        ...base,
        ...(name ? { source: { ...base.source, name } } : {}),
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: { range: "ranged", save: null, own: true, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], ...strike }
    });
    const pieces = strikeOf({ volley: { each: "creature", oneRoll: { count, upTo: true, within: Number(found[2]) } }, lines: [`At up to ${count} creatures within ${found[2]} feet of the first target (target them, then Apply), with your multiple attack penalty (PF2e's next button)`] }, `${base.source?.name ?? item.name} (the pieces)`);
    return {
        ...strikeOf({ lines: ["At a target within your first range increment; on a hit, its pieces' Strike card follows"], thenStrike: pieces }),
        ...(toggle ? { toggleOff: { option: toggle.option, words: "No Hit Points from it until your next daily preparations", duration: null, untilRest: true } } : {})
    };
}
