// A lit candle's or incense's area for as long as it burns (2026-10-20): Candle of Inflamed Passions' "creatures within 10 feet of the candle
// … Creatures in the area take a -1 status penalty to saving throws against emotion effects", Candle of Truth's -4 status penalty to Lie and
// its Will save "when first entering the affected area, each creature (including you)", Incense of Distilled Death's "fills a 10-foot
// emanation …. Undead creatures, including incorporeal undead, gain fast healing 4 while in the area" — "Once lit, the candle burns for 10
// minutes". The ability module's zone (ability c4b48ed): around its user for a candle (carried, as Thawing Candle's), placed beside it for
// incense; its penalties for those inside with PF2e's predicates (zone.modifiers[i].predicate), its rules for the creatures with a trait
// (zone.inside), its save for its maker too (zone.saves[i].own). What else it says is the zone's notes, the plan partial. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";

const LIT = /\bYou activate the (candle|incense) by lighting it\b/i;
const BURNS = /\bOnce lit, the (?:candle|incense) burns for (\d+) (minute|hour|round)s?\b/i;
const AREA = /\bcreatures within (\d+) feet of the (?:lit )?candle\b|\bfills an? (\d+)-foot emanation\b/i;
// (A penalty for those inside, the words PF2e's own Effects use for it: Wine of the Blood's "item:trait:emotion", Honeyed Words' "action:lie".)
const PENALTIES = [
    [/\bCreatures in the area (?:take|receive) an? -(\d+) status penalty to saving throws against emotion effects\b/i, { selector: "saving-throw", predicate: ["item:trait:emotion"] }],
    [/\bCreatures in the area (?:take|receive) an? -(\d+) status penalty to Lie\b/i, { selector: "deception", predicate: ["action:lie"] }]
];
const FAST_HEALING = /\b(Undead) creatures(?:, including incorporeal undead,)? gain fast healing (\d+) while in the area\b/i;
const ENTERING = /\bwhen first entering the affected area, each creature \(including you\) must succeed at an? (@Check\[(?:will|fortitude|reflex)\|dc:\d+\]) save or ([^.]+)\./i;

// The item's plain text, the plan's base → its zone plan, or null.
export function litAreaPlan(text, base) {
    const plain = String(text ?? "");
    const lit = LIT.exec(plain);
    const burns = BURNS.exec(plain);
    const area = AREA.exec(plain);
    if (!lit || !burns || !area) return null;
    const said = [lit[0], burns[0], area[0]];
    const modifiers = [];
    for (const [pattern, entry] of PENALTIES) {
        const found = pattern.exec(plain);
        if (!found) continue;
        modifiers.push({ selector: entry.selector, value: -Number(found[1]), type: "status", predicate: [...entry.predicate] });
        said.push(found[0]);
    }
    const inside = [];
    const healing = FAST_HEALING.exec(plain);
    if (healing) {
        inside.push({ rules: [{ key: "FastHealing", value: Number(healing[2]) }], only: { traits: [healing[1].toLowerCase()] } });
        said.push(healing[0]);
    }
    const saves = [];
    const notes = [];
    const entering = ENTERING.exec(plain);
    if (entering) {
        let plan = null;
        try {
            // (Its failure in the degree's words, the ability compiler's GM line for it: "be unable to tell any deliberate lies …" → "The target is
            // unable to …".)
            const failure = `The target ${entering[2].replace(/^be\b/i, "is")}.`;
            plan = compileAbility({ name: base?.source?.name ?? "Area", type: "action", system: { slug: null, description: { value: `<p>The target must attempt a ${entering[1]} save.</p><p><strong>Critical Success</strong> The target is unaffected.</p><p><strong>Success</strong> The target is unaffected.</p><p><strong>Failure</strong> ${failure}</p><p><strong>Critical Failure</strong> As failure.</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
        } catch {
            plan = null;
        }
        if (plan?.resolution?.kind !== "save" || plan.resolution.check?.against?.dc !== "fixed") return null;
        saves.push({ when: ["initial", "enter"], own: true, plan: { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null } } });
        said.push(entering[0]);
        // (Only on first entering, and its result only while there: the GM's.)
        notes.push("Each creature attempts it only the first time it enters; what a failure does lasts only while it's within the area, for as long as it burns.");
    }
    if (!modifiers.length && !inside.length && !saves.length) return null;
    // (Its other rule sentences: notes.)
    const sentences = plain.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    for (const sentence of sentences) {
        if (said.some((words) => sentence.includes(words) || words.includes(sentence))) continue;
        if (/^(?:This lasts for as long as the candle is lit|If extinguished, it can't be relit|Activate\b)/i.test(sentence) || /\bcan't be extinguished\b/i.test(sentence)) continue;
        if (/\b(?:bonus|penalty|save|damage|immune|Hit Points|healing|can't|must)\b/i.test(sentence) && !/\bthough this healing comes from void energy\b/i.test(sentence)) notes.push(sentence);
    }
    const candle = lit[1].toLowerCase() === "candle";
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: candle ? { type: "emanation", value: Number(area[1] ?? area[2]) } : { type: "burst", value: Number(area[1] ?? area[2]) },
            centre: candle ? "self" : "placed",
            range: candle ? null : 5,
            lasts: { mode: "fixed", value: Number(burns[1]), unit: `${burns[2].toLowerCase()}s`, expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves,
            damage: [],
            effect: null,
            modifiers,
            ...(inside.length ? { inside } : {}),
            notes
        }
    };
}
