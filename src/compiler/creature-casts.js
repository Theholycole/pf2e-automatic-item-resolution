// A spell's effects made by a creature let out of a flask (2026-10-28, docs/needs.md "Moving creatures and the user"), the installed alchemists'
// module's:
//   GLOBE   Dweomerflacon's grades: a dweomercat teleports to a space it sees within 25 feet and makes Dispelling Globe there (the rank and
//           counteract modifier the text gives) for 1 minute rather than the spell's 10, then fades. The spell module's cast as read before,
//           its time the item's (plan.castDuration, scripts/casts.js); the globe round the cat's space, not its user's, and the spell's own
//           open-space rule are the map's — lines of the cast card. The text's "10-foot cone" is read as the spell's own 10-foot globe.
//   QUAKE   Encapsulated Titanosaur: the titanosaur Strides up to 30 feet and slams the ground with an 8th-rank Earthquake, nonmagical and with
//           no fissures under it, then crumbles. The cast as read before, its burst centred within 30 feet (plan.castRange { feet, area }: a
//           target beyond the burst's reach from there refused); where it lands, nonmagical effects (magic immunity and resistance don't
//           apply) and the fissures it doesn't make, lines of the card — the GM's to keep to.
// The creature itself is gone at once: no token. Every sentence one of these or flavour, its crafting none: else the plan as it was. Their
// words stay theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";

const effectSentences = (text) => sentencesOf(String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
const flavour = (opening) => new RegExp(String.raw`^Activate (?:\d )?Interact ${opening}\b(?:(?!\b(?:feet|DC|check|damage|bonus)\b)[^.\d])*\.$`, "i");
const GLOBE = {
    flavour: flavour("An oily sheen"),
    spawns: /^When activated, it spawns an? (?:Small|Medium|Large) [\w' -]+?\.$/i,
    globe: /^It surges forward, and teleports to a\s+space it can see within (\d+) feet and creates the effects of an? (\d+)(?:st|nd|rd|th) rank Dispelling Globe \(counteract modifier is \+(\d+)\) in an? (\d+)-foot cone that lasts for (\d+) (minutes?|rounds?) instead of\s+the normal duration\.$/i,
    open: /^The creature must form the sphere in\s+an unbroken open space\b[^.]*\bthe effect immediately ends\b[^.]*\.$/i,
    fades: /^After the creature creates the globe, it\s+fades into nothingness\.$/i
};
const QUAKE = {
    flavour: flavour("This capsule"),
    emerges: /^When Activated, an? (?:Large|Huge|Gargantuan) [\w' -]+? emerges\.$/i,
    quake: /^The [\w' -]+? Strides up to (\d+) feet, before rearing up\b[^.]*?\breplicating the effects of an? (\d+)(?:st|nd|rd|th)-rank Earthquake\b[^.]*?, except the effects are\s+nonmagical, and the [\w' -]+? does not create\s+fissures underneath it\.$/i,
    dust: /^The [\w' -]+? then returns to a skeleton, and\s+turns to dust\.$/i
};

const matchAll = (sentences, patterns) => {
    const found = Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null]));
    return Object.values(found).every(Boolean) && sentences.every((sentence) => Object.values(patterns).some((pattern) => pattern.test(sentence))) ? found : null;
};

// The cast plan read before, the consumable's plain text → the cast with its creature's words, or the same plan.
export function withCreatureCast(plan, text) {
    if (plan?.builtin !== "cast-spell") return plan;
    const sentences = effectSentences(text);
    const globe = plan.spell?.name === "Dispelling Globe" ? matchAll(sentences, GLOBE) : null;
    if (globe) {
        const [, within, rank, modifier, size, value, unit] = globe.globe;
        // (Only the rank and modifier the cast already read: else the text says another and this isn't it.)
        if (Number(plan.rank) !== Number(rank) || Number(plan.attack) !== Number(modifier)) return plan;
        return {
            ...plan,
            castDuration: { value: Number(value), unit: /^min/i.test(unit) ? "minutes" : "rounds", said: [globe.globe[0]] },
            notes: [
                `A dweomercat blinks to a spot it sees up to ${within} feet away and the globe forms round it there, not round its user: put the spell's template on that space (its ${size}-foot globe, the text's "cone").`,
                "The globe must sit in open space, its edge through no creature or object, or it ends at once (the map's); creatures can enter it after."
            ],
            partial: undefined,
            automation: { level: "automatic" }
        };
    }
    const quake = plan.spell?.name === "Earthquake" ? matchAll(sentences, QUAKE) : null;
    if (quake) {
        const [, feet, rank] = quake.quake;
        if (Number(plan.rank) !== Number(rank)) return plan;
        // (The spell's 60-foot burst, its centre where the titanosaur lands.)
        const burst = 60;
        return {
            ...plan,
            castRange: { feet: Number(feet), area: burst, said: `Strides up to ${feet} feet` },
            notes: [
                `The titanosaur Strides up to ${feet} feet before it slams the ground: the quake's burst centres where it stops (the map's).`,
                "Its effects are nonmagical — no magic immunity or resistance to magic against them — and no fissures open under the titanosaur (the GM's to keep to)."
            ],
            partial: undefined,
            automation: { level: "automatic" }
        };
    }
    return plan;
}
