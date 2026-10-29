// A creature let out of a flask that runs at a foe, does one thing and is gone (2026-10-28, docs/needs.md "Moving creatures and the user"), the
// installed alchemists' module's:
//   THIEF  Cauthooj Egg: the bird runs at a creature within 35 feet, a Thievery check at +22 against its Reflex DC, and on a success takes one
//          item it holds, wields or could draw with one action (the GM's pick), runs on and dissolves, the item dropped where it stops. The
//          ability module's check card at the creature targeted (the check family with a set modifier against its Reflex DC), then on a success
//          the drop card for that creature (plan.dropHeld one, attended — scripts/drop-held.js, as The Crows' is): the item ticked there is
//          dropped. Its runs are the map's, lines of the card.
//   SPIT   Liquid Ore Louse: the louse runs at a metal object its user names and spits at it, a +11 Strike — against the AC of the creature
//          holding it, when one does — for 3d6 acid that ignores Hardness, a shield it hits broken. The ability module's check card (the
//          attack at a set modifier against the AC of the creature targeted); what the spit does to the object (its acid, a shield broken) the
//          object's, lines of the card (the user's ruling on objects), and an unattended object's own AC the GM's.
// Every sentence one of these or flavour, its crafting none: else the plan as it was. Their words stay theirs: the regexes split by \s+. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const rows = () => ({ criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() });
// (Its words without the crafting: "Craft Requirements Supply the corpse of …".)
const effectSentences = (text) => sentencesOf(String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
const APOSTROPHE = "['’]";

const THIEF = {
    flavour: /^Activate Interact This bottle contains\b(?:(?!\b(?:feet|DC|check|damage)\b)[^.\d])*\.$/i,
    emerges: /^When you Activate it, an? (?:Tiny|Small|Medium|Large) [\w' -]+? emerges,\s+[^.]*?\bchooses a creature within (\d+) feet\.$/i,
    check: new RegExp(String.raw`^The [\w' -]+? then Strides up to (\d+) feet, attempts a Thievery\s+check with a \+(\d+) modifier against the creature${APOSTROPHE}s Reflex DC\.$`, "i"),
    takes: /^If the [\w' -]+? is successful, it takes a single\s+item the creature is holding or wielding,\s+or an item the creature could draw\b[^.]*\.$/i,
    runs: /^If it successfully takes an item from\s+a creature, it then Strides up to (\d+) feet\.$/i,
    dissolves: /^The [\w' -]+? then dissolves with the item falling in\s+the space it ends its movement\.$/i
};
const SPIT = {
    flavour: /^Activate Interact This oxidized liquid\b(?:(?!\b(?:feet|DC|check|damage)\b)[^.\d])*\.$/i,
    strike: /^The [\w' -]+? moves up to (\d+) feet towards a\s+metal object you designate and attempts a \+(\d+) Strike\b[^.]*?\bagainst the object, which deals (\d+d\d+) (\w+) damage\.$/i,
    held: new RegExp(String.raw`^If the Strike is attempted\s+against a metal\s+object held or wielded\s+by another creature, the Strike is made\s+against the creature${APOSTROPHE}s AC instead\b[^.]*\.$`, "i"),
    hardness: /^This damage ignores the Hardness\.$/i,
    shield: /^If the target of this\s+effect is a\s+shield and the Strike is\s+successful, the shield gains the broken condition\.$/i
};

const matchAll = (sentences, patterns) => {
    const found = Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null]));
    const whole = Object.values(found).every(Boolean) && sentences.every((sentence) => Object.values(patterns).some((pattern) => pattern.test(sentence)));
    return whole ? found : null;
};

// The plan read before (nothing, or a note), the consumable's plain text, its base and item part → the released creature's card, or the same plan.
export function withReleasedCreature(plan, text, { base, info } = {}) {
    if (plan && !plan.noteOnly && plan.builtin !== "no-effect") return plan;
    const sentences = effectSentences(text);
    const card = (fields) => ({ ...(base ?? {}), modelVersion: MODEL_VERSION, automation: { level: "automatic" }, trigger: { event: "use" }, ...fields, item: { ...(info ?? plan?.item ?? {}) } });
    const thief = matchAll(sentences, THIEF);
    if (thief) {
        const [, within] = thief.emerges;
        const [, first, modifier] = thief.check;
        const [, then] = thief.runs;
        return card({
            targeting: { target: "1 creature", range: `${within} feet`, area: null },
            // (The item's own check at a creature: the ability module's card, as src/compiler/own-checks.js's are — plan.ownCheck its route.)
            ownCheck: { kind: "maneuver", modifier: Number(modifier) },
            resolution: { kind: "check", check: { roll: "skill", statistic: "thievery", against: { dc: "target", statistic: "reflex" }, modifier: Number(modifier) }, outcomes: rows() },
            dropHeld: { degrees: ["criticalSuccess", "success"], one: true, attended: true, said: "one item it holds, wields or could draw with one action" },
            notes: [
                `Target the creature it runs at, within ${within} feet; it runs up to ${first} feet to reach it (the map's).`,
                "On a success, tick the item it takes on the next card — one held, wielded or drawn with a single action, the GM's say.",
                `With an item, it runs on up to ${then} feet and dissolves, dropping the item where it stops (the map's).`
            ]
        });
    }
    const spit = matchAll(sentences, SPIT);
    if (spit) {
        const [, feet, modifier, formula, type] = spit.strike;
        return card({
            targeting: { target: "the creature holding the metal object", range: null, area: null },
            ownCheck: { kind: "attack", modifier: Number(modifier) },
            resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: Number(modifier) }, outcomes: rows() },
            notes: [
                `It runs up to ${feet} feet to the metal object its user names (the map's); target the creature holding it, whose AC the Strike is against — an unattended object's own AC is the GM's.`,
                `On a hit, the object takes ${formula} ${type.toLowerCase()} damage, ignoring its Hardness (the object's: roll it for the object).`,
                "A shield it hits is broken (mark it on the shield)."
            ]
        });
    }
    return plan;
}
