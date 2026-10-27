// A spectral army that arrives, then charges at the end of its user's next turn (2026-10-27, docs/needs.md "several"; the user's of the same
// day: a unique item's or an artifact's effects all built): Dragon-Lotus Drum's "Spend a Mythic Point; beating the drum summons a spectral army
// to an area you designate within 500 feet. The army takes its Arrive action when you finish playing. At the end of your next turn, the army
// Strides up to 60 feet and then takes its Depart action", the Arrive's save (read before: 16d10 sonic, basic Fortitude, Frightened 3 or 4)
// with its own emotion, fear, mental and sonic traits, its enemies the creatures targeted; the Depart's "Each creature it moves through takes
// 20d8 bludgeoning, piercing, or slashing damage (whichever would be most harmful at the GM's discretion) with a … basic Reflex save. A creature
// who critically fails its save is also knocked Prone" its later card (plan.again: kept open for that turn's end, its type picked on the card);
// the army itself a Gargantuan marker beside its user (plan.item.alsoConjure: the ability module's conjured token, gone at the end of its next
// turn) to move where it's designated and charges; "once every 20 years" its wait (trigger.recharge, 7300 days). Pure.

const shared = (multiplier, effects = []) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects });
const UNTIL_NEXT_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "effect-start" };
const TYPES = ["bludgeoning", "piercing", "slashing"];

// The reading's matches (src/compiler/artifact-readings.js), the plan read before (the Arrive's save) and { base, info } → its changes.
export function dragonArmyOf(found, plan, { base }) {
    const [summon, , stride, , , , gargantuan, arrive, , emanation, charge, through, prone] = found;
    const traits = arrive[1].split(/,\s*/).map((trait) => trait.trim().toLowerCase());
    const strides = Number(stride[1]);
    const [dice, dc] = [through[1], Number(through[2])];
    const depart = {
        ...base,
        source: { ...base.source, name: `${base.source.name.replace(/:.*$/, "")}: Devastating Charge` },
        automation: { level: "automatic" },
        targeting: { target: "each creature it moves through", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: dc } },
            sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${dice}[bludgeoning]`, type: null, category: null }] },
            outcomes: { criticalSuccess: shared(0), success: shared(0.5), failure: shared(1), criticalFailure: shared(2, prone ? [{ kind: "condition", slug: "prone", value: null, duration: null }] : []) }
        },
        damageChoices: TYPES.map((type) => ({ label: type.charAt(0).toUpperCase() + type.slice(1), formula: `${dice}[${type}]` })),
        notes: [
            `The army charges up to ${charge[1]} feet in a straight line (move its marker): each creature it moves through attempts this save`,
            "Its damage type is whichever of the three would harm that creature most, at the GM's discretion (picked on the card)"
        ],
        item: { ...(plan.item ?? {}) }
    };
    const army = {
        ...base,
        source: { ...base.source, name: `${base.source.name.replace(/:.*$/, "")}: Dragon-Lotus Army` },
        builtin: "conjure",
        automation: { level: "automatic" },
        targeting: { target: "self", range: `${summon[1]} feet`, area: null },
        trigger: { event: "use" },
        creatures: [{ name: "Dragon-Lotus Army", count: 1, size: gargantuan[1].toLowerCase(), stats: { speeds: { land: strides } }, from: null, traits: [], initiative: null }],
        max: 1,
        lasts: UNTIL_NEXT_TURN_END,
        vanishAtZero: false,
        notes: [
            `Move it to the area its user designates within ${summon[1]} feet; it doesn't block movement`,
            "It isn't fully a creature: it takes no actions but its Arrive and Depart, and only what could target or end a spell effect (such as Dispel Magic) can target or harm it"
        ]
    };
    return {
        keep: true,
        traits: [...new Set([...(plan.traits ?? []), ...traits])],
        targeting: { ...(plan.targeting ?? {}), target: `each enemy within ${emanation[1]} feet of the army` },
        trigger: { ...(plan.trigger ?? {}), recharge: { value: 7300, unit: "days" } },
        again: { plan: depart, later: true, when: `at the end of {user}'s next turn, the army Strides up to ${strides} feet, then charges` },
        item: { ...(plan.item ?? {}), alsoConjure: army },
        notes: [
            "The army follows its user's orders and avoids harming them and their allies: target only enemies",
            `Its Arrive now, as the playing ends; at the end of its user's next turn it Strides up to ${strides} feet and takes its Depart (that card follows this one)`
        ],
        partial: undefined,
        automation: { level: "automatic" }
    };
}
