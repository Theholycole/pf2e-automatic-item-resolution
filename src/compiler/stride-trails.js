// Difficult terrain its user's Strides leave (2026-10-28, docs/needs.md "Moving creatures and the user"): Instinct Crown (Breach)'s second
// activation, the installed barbarians' module's — its user's Strides leave difficult terrain in their path for a minute (its Breach Blow's
// lasting till its rage ends), and it deals 2 more damage with melee Strikes while in terrain it made. Its user's Effect of this module
// (plan.userEffects kind "rules", src/live/card.js ruleEffectSource) flagged trail and untilRage: while it lasts, each walked move of its token
// leaves the ability module's zone over the squares it crossed (scripts/trails.js) — PF2e's difficult terrain for the minute, and inside it
// for its maker a FlatModifier on its melee Strikes' damage (zone.inside who "own"); gone when its rage ends. The text gives the activation
// no time: until its rage ends, a minute at most (the user's ruling: the card says the GM may change it). The Breach Blow's terrain is the
// map's, a line; the flavour no rule. Their words stay theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";

const SOLIDIFY = /^You solidify your union with your\s+designated plane\b[^.]*\.$/i;
const STRIDE = /^When you Stride, you leave difficult\s+terrain in your path that lasts for (\d+) (minutes?|rounds?) and difficult terrain\s+created by your ([\w' -]+?) lasts until you\s+stop raging\.$/i;
const INSIDE = /^While in an area of difficult terrain\s+you created, you deal (\d+) additional damage\s+with your melee Strikes\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const slugOf = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The activation's plan read before (its note alone), its plain text, its context → its user's trail Effect, or the same plan.
export function withStrideTrail(plan, text, { base, info, item } = {}) {
    if (plan && !plan.noteOnly) return plan;
    const effect = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "");
    const sentences = sentencesOf(effect);
    const stride = sentences.map((sentence) => STRIDE.exec(sentence)).find(Boolean);
    const inside = sentences.map((sentence) => INSIDE.exec(sentence)).find(Boolean);
    if (!stride || !inside || !sentences.every((sentence) => [SOLIDIFY, STRIDE, INSIDE].some((pattern) => pattern.test(sentence)))) return plan;
    const [, value, unit, blow] = stride;
    const lasts = { mode: "fixed", value: Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const name = item?.name ?? plan?.source?.name ?? "The item";
    const bonus = { key: "FlatModifier", selector: "melee-strike-damage", value: Number(inside[1]), slug: `${slugOf(name)}-trail`, label: name };
    const trail = {
        label: name,
        lasts,
        inside: [{ who: "own", label: `${name}: in its trail`, rules: [bonus] }],
        notes: [`Difficult terrain its maker's Stride left, for ${value} ${unit.toLowerCase()}; ${inside[1]} more damage on its maker's melee Strikes while it's inside.`]
    };
    const own = { kind: "rules", name: "trail", words: `Its Strides leave difficult terrain on the squares they cross, for ${value} ${unit.toLowerCase()}; ${inside[1]} more melee Strike damage in it`, rules: [], duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, untilRage: true, trail };
    return {
        ...(base ?? plan ?? {}),
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        userEffects: [own],
        notes: [
            `Its Strides leave the trail till its rage ends, a minute at most (the text gives no time: the GM may change it); each walked move makes the squares it crossed difficult terrain for ${value} ${unit.toLowerCase()}.`,
            `Difficult terrain its ${blow} makes lasts until its rage ends (the map's: leave it till then).`,
            "Only for a barbarian of the crown's own instinct (its Requirements: its user's to keep to)."
        ],
        item: { ...(info ?? plan?.item ?? {}) },
        noteOnly: undefined
    };
}
