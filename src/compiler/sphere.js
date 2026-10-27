// A sphere that destroys whatever it touches, held by a check each round (2026-10-27, docs/needs.md "moving"; the user's of the same day: a
// unique item's or an artifact's effects all built): Sphere of Annihilation's "You attempt a … Arcana or … Occultism check to take control of
// the sphere. If someone else already controls the sphere, this check uses their Will DC if higher. If you succeed, you take control of the
// sphere. If you fail, the sphere moves 10 feet closer to you (or 20 feet on a critical failure). You keep control as long as you remain within
// 80 feet of the sphere and Sustain the Activation each round. When you Sustain the Activation, you must attempt a … check. If you succeed, you
// direct the sphere to move up to 10 feet in a straight line (or up to 20 feet on a critical success). On a failure, you lose control of the
// sphere, and it moves 10 feet closer to you in a straight line (or 20 feet on a critical failure)", with its item's "pulls any matter that
// comes into contact with it into a void, destroying it utterly. Anything or anyone destroyed by the sphere can be brought back only by a
// deity's direct intervention" and "A talisman of the sphere makes it easier to control the sphere" (Talisman of the Sphere's DC 10 lower for
// a wielder who casts arcane or occult spells, held). → plan.builtin "sphere", plan.sphere { skills, dc, controllerWill, within, keep, take,
// sustain, destroys, deity, talisman }: the item module's sphere card (scripts/sphere.js) — the check rolled, the control Effect, the sphere's
// token moved and the creatures it touches destroyed. Pure.

// (Talisman of the Sphere's: "This reduces the DC of the check to control the sphere or Sustain the Activation by 10", for a wielder who "can
// cast arcane or occult spells", held.)
const TALISMAN = { slug: "talisman-of-the-sphere", name: "Talisman of the Sphere", by: 10, traditions: ["arcane", "occult"] };

// The reading's matches (src/compiler/whole-artifacts.js: its eight sentences), its Requirements line's and its item's whole text → the
// card's parts.
export function spherePlanOf(found, requirements, item = "") {
    const [take, , , fail, keep, sustain, moved, lost] = found;
    const text = String(item ?? "");
    return {
        builtin: "sphere",
        targeting: { target: null, range: null, area: null },
        sphere: {
            skills: [take[1], take[3]],
            dc: Number(take[2]),
            // (The DC its current controller's Will DC when that's higher.)
            controllerWill: true,
            within: Number(requirements[1]),
            keep: Number(keep[1]),
            take: { criticalSuccess: { control: true }, success: { control: true }, failure: { closer: Number(fail[1]) }, criticalFailure: { closer: Number(fail[2]) } },
            sustain: { skills: [sustain[1], sustain[3]], dc: Number(sustain[2]), criticalSuccess: { move: Number(moved[2]) }, success: { move: Number(moved[1]) }, failure: { lose: true, closer: Number(lost[1]) }, criticalFailure: { lose: true, closer: Number(lost[2]) } },
            destroys: /\bpulls any matter that comes into contact with it into a void, destroying it utterly\b/i.test(text),
            deity: /\bcan be brought back only by a deity's direct intervention\b/i.test(text),
            ...(/\bA talisman of the sphere makes it easier to control the sphere\b/i.test(text) ? { talisman: TALISMAN } : {})
        }
    };
}
