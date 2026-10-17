// A weapon's property runes on a critical hit (the user's question, 2026-10-16: PF2e only notes them): Thundering's "the
// target must succeed at a DC 24 Fortitude save or be Deafened for 1 minute", Frost's slowed unless it saves, Brilliant's
// blinded, Impactful's push (its wielder's choice), and the ones with no save — Crushing's clumsy and enfeebled, Fearsome's
// frightened, Flickering's dazzled, Merciful's fascinated, Nightmare's stupefied. Each critical-hit sentence of the rune's
// own text (its passive part, not its activations) is read by the ability compiler as an ability's, after a few words are
// put as it reads them ("Your target becomes", "succeed at a DC 29 Fortitude or be"). Live play posts each one's card at the
// creature PF2e's attack roll critically hit (scripts/rune-strikes.js): the ability module's save card, or its card with
// no roll. A rider only against some creatures ("the undead", "the giant", "a target that's taking persistent bleed damage",
// "a creature that's already stupefied") says so, for live play to check. PF2e itself rolls the runes' damage. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { etchedKeys } from "./runes.js";
import { ownerDCs } from "./item-data.js";

// The sentence's critical-hit opening, and who it's for.
// (A weapon's own, its name or kind in it: Mindlance's "When you critically succeed at an attack roll with a mindlance", Deathseeker's
// "When you critically succeed at a Strike made with a deathseeker", Golden Blade of Mzali's "When you critically hit a creature
// with the spear"; Fearcutter's "… a creature with the unholy trait with Fearcutter" only against that trait, below.)
const OPENING = /^(?:(?:In addition, )?On a critical hit(?: with (?:this|the) weapon| with (?:a|an|the) [\w' -]+?)?|When you critically hit (?:a target |a creature )?(?:with (?:this|the|a|an) [\w -]*?weapon(?: with this rune)?|with (?:this|the|a|an) [\w' -]+?(?=\s*,))?|If you critically hit a target with an? [\w -]*?weapon|When you critically succeed at (?:an attack roll|a Strike)(?: made)? (?:with|using) (?:(?:this|the|a|an) )?[\w' -]+?(?=\s*,))\s*,?\s*/i;
const TRAIT_OPENING = /^When you critically hit a creature with the (\w+) trait with [\w' -]+?\s*,\s*/i;
const FOR = [
    [/^against a creature possessing another creature, the possessing creature\b/i, { note: "only against a creature possessing another" }, "the target"],
    [/^(?:the )?undead(?: creature)? is\b/i, { trait: "undead" }, "the target is"],
    [/^(?:instead of being [^,]+, )?the giant\b/i, { trait: "giant" }, "the target"],
    [/^(?:a target )?that's taking persistent bleed damage, your target\b/i, { condition: "bleed" }, "the target"]
];
// (A rider's own opening: "If you critically hit a creature that's already stupefied, it becomes Frightened 2 as well".)
const ALREADY = /^If you critically hit a creature that's already (\w+), it\b/i;

// (Its tags dropped, its links kept: the reader needs the @Check and the condition links.)
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// A rune item's source → its critical-hit riders: [{ plan, optional, only: { trait | condition | note } | null, text }].
export function runeCritRiders(rune) {
    const passive = String(rune?.system?.description?.value ?? "").split(/<strong>\s*Activat/i)[0];
    const sentences = plain(passive).split(/(?<=[.!?])\s+(?=[A-Z@])/);
    const riders = [];
    sentences.forEach((sentence) => {
        let only = null;
        let text = null;
        const already = ALREADY.exec(sentence);
        if (already) {
            only = { condition: already[1].toLowerCase() };
            text = `The target ${sentence.slice(already[0].length).replace(/\s+as well\b/i, "")}`;
        } else if (TRAIT_OPENING.test(sentence)) {
            only = { trait: TRAIT_OPENING.exec(sentence)[1].toLowerCase() };
            text = sentence.replace(TRAIT_OPENING, "");
        } else if (OPENING.test(sentence)) {
            text = sentence.replace(OPENING, "");
            for (const [pattern, who, words] of FOR) {
                if (!pattern.test(text)) continue;
                only = who;
                text = text.replace(pattern, words);
                break;
            }
        }
        if (!text) return;
        // (Its degree rows, when it has them: "… with the following effects." and then each row's paragraph, read as the html is,
        // the creature it names the target: Greater Giant-Killing's "The giant is Enfeebled 2 for the next minute".)
        const rowsAt = /\bwith the following effects\.?$/i.test(text) ? passive.search(/<p>\s*<strong>\s*Critical Success\b/i) : -1;
        const rows = rowsAt >= 0 ? passive.slice(rowsAt).replace(/\b(?:The|the) (?:giant|undead|creature)\b/g, "The target").replace(/\bfor the next minute\b/gi, "for 1 minute") : "";
        const optional = /^you can choose to force the target to\b/i.test(text);
        const words = text
            .replace(/^you can choose to force the target to succeed\b/i, "The target must succeed")
            .replace(/^your target\b/i, "The target")
            // (Merciful's "a merciful weapon causes the target to become Fascinated", Flickering's "…, Dazzling the creature for 1 round".)
            .replace(/^(?:an? [\w ]+? weapon )?causes the target to become\b/i, "The target becomes")
            .replace(/^.*?,\s*(@UUID\[[^\]]*\]\{)?(Dazzl|Blind|Deafen|Frighten)ing(\})? the (?:struck )?(?:creature|target) for ([^.(]+).*$/i, (whole, link = "", verb, close = "", time) => `The target is ${link}${verb}ed${close} for ${time.trim()}.`)
            // (Spider Gun's "the venom clings to the target and they take persistent poison damage equal to @Damage[(1d4+@item.system.
            // damage.dice)[persistent,poison]]": the target takes it, the weapon's dice counted — its own and its striking rune's.)
            .replace(/^(?:[^.]*? and )?they take (?:@UUID\[[^\]]*\]\{)?persistent (?:\w+ )?damage\}?(?: of the same type as the weapon)? equal to (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])\.?/i, "The target takes $1 damage.")
            .replace(/@item\.system\.damage\.dice\b/g, String(Math.max(Number(rune?.system?.damage?.dice) || 1, 1 + (Number(rune?.system?.runes?.striking) || 0))))
            // (Deflecting Branch's "you knock the target Prone".)
            .replace(/^you knock the target (@UUID\[[^\]]*\]\{Prone\}|Prone)\.$/i, "The target is knocked $1.")
            // (Thundercrasher's "a Fortitude save against your class DC": its wielder's, filled in live play — src/compiler/item-data.js's
            // stand-in, the core's { dc: "owner" }.)
            .replace(/\ban? (Fortitude|Reflex|Will) save against your (class|spell) DC\b/gi, (whole, save, kind) => `a @Check[${save.toLowerCase()}|dc:${kind.toLowerCase() === "class" ? 9001 : 9002}] save`)
            .replace(/^the target\b/i, "The target")
            // (A save link without the word: Brilliant's "succeed at a DC 29 Fortitude or be Blinded".)
            .replace(/(@Check\[[^\]]*\](?:\{[^}]*\})?) or be\b/g, "$1 save or be");
        let plan = null;
        try {
            plan = compileAbility({ name: rune.name, type: "action", system: { slug: rune.system?.slug ?? null, description: { value: `<p>${words}</p>${rows}` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
        } catch {
            plan = null;
        }
        plan = ownerDCs(plan);
        if (!readable(plan)) return;
        // (Damage PF2e's own rules roll on a critical hit already — Golden Blade of Mzali's, Bloodletting Kukri's: not twice.)
        if (rolledByPF2e(rune) && damageOnly(plan)) return;
        riders.push({ plan, optional, only, text: sentence });
    });
    return riders;
}

// The item's own PF2e rules that add damage on a critical hit; a plan that only deals damage.
const rolledByPF2e = (item) => (item?.system?.rules ?? []).some((rule) => ["DamageDice", "FlatModifier"].includes(rule?.key) && (rule.critical === true || /critical/i.test(JSON.stringify(rule.predicate ?? []))));
const damageOnly = (plan) => Object.values(plan.resolution.outcomes ?? {}).every((row) => !(row?.effects ?? []).length && !(row?.modifiers ?? []).length && !row?.forcedMovement);

// A plan the card can play: a save at a fixed DC (or its wielder's, filled in live play), or a row with no roll that does something.
function readable(plan) {
    const resolution = plan?.resolution;
    if (!resolution?.outcomes) return false;
    const rows = Object.values(resolution.outcomes);
    const does = rows.some((row) => (row?.effects ?? []).length || (row?.modifiers ?? []).length || row?.forcedMovement || (row?.damage?.mode ?? "none") !== "none");
    if (!does) return false;
    if (resolution.kind === "save") return ["fixed", "owner"].includes(resolution.check?.against?.dc);
    return resolution.kind === "check" && resolution.check?.roll === "automatic";
}

// The riders of a weapon's etched runes, and its own (Gluttonous Spear's, Tidal Crossbow's: the same wording in the weapon's
// text): [{ rune: { key, name }, ...rider }]. index: src/compiler/runes.js runeIndex's map.
const cache = new Map();
export function etchedCritRiders(weapon, index) {
    if (weapon?.type !== "weapon") return [];
    const own = `own:${weapon.system?.slug ?? weapon.name}:${String(weapon.system?.description?.value ?? "").length}`;
    if (!cache.has(own)) cache.set(own, runeCritRiders(weapon));
    const found = cache.get(own).map((rider) => ({ rune: { key: null, name: weapon.name }, own: true, ...rider }));
    if (!index?.size) return found;
    for (const key of etchedKeys(weapon)) {
        const rune = index.get(key);
        if (!rune) continue;
        if (!cache.has(key)) cache.set(key, runeCritRiders(rune));
        for (const rider of cache.get(key)) found.push({ rune: { key, name: rune.name }, ...rider });
    }
    return found;
}

// Whether a rider is for the creature hit: { traits: [...], conditions: [slugs], persistent: [damage types] }.
export function riderFits(rider, creature = {}) {
    const only = rider?.only;
    if (!only || only.note) return true;
    if (only.trait) return (creature.traits ?? []).includes(only.trait);
    if (only.condition === "bleed") return (creature.persistent ?? []).includes("bleed");
    if (only.condition) return (creature.conditions ?? []).includes(only.condition);
    return true;
}
