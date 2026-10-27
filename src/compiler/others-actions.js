// What other creatures may do with their own reactions because of it (2026-10-27, docs/needs.md "Changes to a Strike"): their actions, theirs to
// take — lines of the card, as its user's own actions are (the user's rule).
// - Singing Bowl of the Versatile Stance's "While holding the singing bowl … with one hand, you strike the lip of it with a mallet held in the
//   other. Anyone within 60 feet currently in a stance can spend a reaction to use one of their stance actions in order to change to a
//   different stance." — the card's lines, nothing more to apply.
// - Chainbreaker's Liberating Strike, "You Strike a creature with the chainbreaker. If you hit and deal damage, one Grabbed or Restrained ally
//   within 60 feet of the target can use a reaction to attempt to Escape." — the Strike card with the item's own weapon (scripts/strikes.js),
//   the ally's Escape its line.
// Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const STANCES = /^(?:While holding the [\w' -]+? with one hand, you strike the lip of it with a mallet held in the other\. )?Anyone within (\d+) feet currently in a stance can spend a reaction to use one of their stance actions in order to change to a different stance\.$/i;
const ESCAPE = /^You Strike a creature with the [\w' -]+?\s?\. If you hit and deal damage, one (?:@UUID\[[^\]]*\]\{)?(Grabbed|Restrained)\}? or (?:@UUID\[[^\]]*\]\{)?(Grabbed|Restrained)\}? ally within (\d+) feet of the target can use a reaction to attempt to (?:@UUID\[[^\]]*\]\{)?Escape\}?\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
// (Its Effect's words, from "Effect" on.)
const effectOf = (html) => plainText(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").trim();

export function othersActionsPlan(html, base, item) {
    const words = effectOf(html);
    if (STANCES.test(words)) {
        return { ...base, modelVersion: MODEL_VERSION, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [] } } }, notes: words.split(/(?<=\.)\s+(?=[A-Z])/) };
    }
    const escape = ESCAPE.exec(words);
    if (escape && item?.type === "weapon") {
        return {
            ...base,
            modelVersion: MODEL_VERSION,
            automation: { level: "automatic" },
            targeting: { target: "the creature the Strike hits", range: null, area: null },
            trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
            resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
            strike: { range: null, save: null, own: true, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], lines: [`If it hits and deals damage, one ${escape[1].toLowerCase()} or ${escape[2].toLowerCase()} ally within ${escape[3]} feet of the target can use a reaction to Escape (that ally's own reaction)`] }
        };
    }
    return null;
}
