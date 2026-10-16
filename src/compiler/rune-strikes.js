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

// The sentence's critical-hit opening, and who it's for.
const OPENING = /^(?:(?:In addition, )?On a critical hit(?: with (?:this|the) weapon)?|When you critically hit (?:a target |a creature )?(?:with (?:this|the|a|an) [\w -]*?weapon(?: with this rune)?)?|If you critically hit a target with an? [\w -]*?weapon)\s*,?\s*/i;
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
    sentences.forEach((sentence, at) => {
        let only = null;
        let text = null;
        const already = ALREADY.exec(sentence);
        if (already) {
            only = { condition: already[1].toLowerCase() };
            text = `The target ${sentence.slice(already[0].length).replace(/\s+as well\b/i, "")}`;
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
        // (Its degree rows, when it has them: "… with the following effects. Critical Success …".)
        if (/\bwith the following effects\.?$/i.test(text)) text = [text, ...sentences.slice(at + 1)].join(" ");
        const optional = /^you can choose to force the target to\b/i.test(text);
        const words = text
            .replace(/^you can choose to force the target to succeed\b/i, "The target must succeed")
            .replace(/^your target\b/i, "The target")
            // (Merciful's "a merciful weapon causes the target to become Fascinated", Flickering's "…, Dazzling the creature for 1 round".)
            .replace(/^(?:an? [\w ]+? weapon )?causes the target to become\b/i, "The target becomes")
            .replace(/^.*?,\s*(@UUID\[[^\]]*\]\{)?(Dazzl|Blind|Deafen|Frighten)ing(\})? the (?:creature|target) for ([^.(]+).*$/i, (whole, link = "", verb, close = "", time) => `The target is ${link}${verb}ed${close} for ${time.trim()}.`)
            .replace(/^the target\b/i, "The target")
            // (A save link without the word: Brilliant's "succeed at a DC 29 Fortitude or be Blinded".)
            .replace(/(@Check\[[^\]]*\](?:\{[^}]*\})?) or be\b/g, "$1 save or be");
        let plan = null;
        try {
            plan = compileAbility({ name: rune.name, type: "action", system: { slug: rune.system?.slug ?? null, description: { value: `<p>${words}</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
        } catch {
            plan = null;
        }
        if (!readable(plan)) return;
        riders.push({ plan, optional, only, text: sentence });
    });
    return riders;
}

// A plan the card can play: a save at a fixed DC, or a row with no roll that does something.
function readable(plan) {
    const resolution = plan?.resolution;
    if (!resolution?.outcomes) return false;
    const rows = Object.values(resolution.outcomes);
    const does = rows.some((row) => (row?.effects ?? []).length || (row?.modifiers ?? []).length || row?.forcedMovement || (row?.damage?.mode ?? "none") !== "none");
    if (!does) return false;
    if (resolution.kind === "save") return resolution.check?.against?.dc === "fixed";
    return resolution.kind === "check" && resolution.check?.roll === "automatic";
}

// The riders of a weapon's etched runes: [{ rune: { key, name }, ...rider }]. index: src/compiler/runes.js runeIndex's map.
const cache = new Map();
export function etchedCritRiders(weapon, index) {
    if (weapon?.type !== "weapon" || !index?.size) return [];
    const found = [];
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
