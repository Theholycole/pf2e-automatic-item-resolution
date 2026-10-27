// A light spell cast from the item that counteracts darkness a rank higher, and its flash when it does (2026-10-27, docs/needs.md): Dawnlight's
// "The dawnlight's spell attack roll and counteract modifier are +13, and any spell with the light trait is treated as though its counteract
// rank were 1 higher for counteracting darkness", and the Greater's and Major's "Whenever you successfully counteract magical darkness while
// holding this symbol, the clash of magic unleashes a momentary flash of light. Creatures with darkvision in the area of the light spell or
// targeted by it must succeed at a DC 23 Fortitude save or be Dazzled for 1 round. Those with light blindness are also exposed to bright
// light." → plan.darkLight { rankUp, spells, flash? }: once the cast card has cast one of those light spells, its counteract card against the
// magical darkness (the item's counteract modifier, the spell's rank and 1 more; the darkness's DC and rank the GM's), and once that
// counteracts it, the flash's save card at the creatures its presser targets — only those with darkvision attempt it (scripts/casts.js,
// scripts/counteract.js). Pure.

const RANK_UP = /^The [\w' -]+?\s*'?s spell attack roll and counteract modifier are \+(\d+), and any spell with the light trait is treated as though its counteract rank were (\d+) higher for counteracting darkness\.$/i;
const FLASH = /^Whenever you successfully counteract magical darkness while holding this symbol, the clash of magic unleashes a momentary flash of light\.$/i;
const DAZZLED = /^Creatures with darkvision in the area of the light spell or targeted by it must succeed at a \(DC (\d+)\)(?: Fortitude save)? or be Dazzled for (\d+) rounds?\.$/i;
const LIGHT_BLIND = /^Those with light blindness are also exposed to bright light\.$/i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

// The flash's save: Fortitude against its DC, Dazzled for its rounds on a failure; none for a creature without darkvision (plan.ifTarget's
// lacks), and its light-blind creatures' own Light Blindness a line of the card.
export function flashPlan({ dc, rounds, name }) {
    const dazzled = () => ({ ...none(), effects: [{ kind: "condition", slug: "dazzled", value: null, duration: { mode: "fixed", value: rounds, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } }] });
    return {
        source: { name: `${name}: flash of light` },
        automation: { level: "automatic" },
        targeting: { target: "creatures with darkvision in the light spell's area or targeted by it", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: dc } }, outcomes: { criticalSuccess: none(), success: none(), failure: dazzled(), criticalFailure: dazzled() } },
        ifTarget: [{ senses: ["darkvision", "greater-darkvision"], lacks: true, immune: true }],
        notes: ["Those with light blindness are also exposed to bright light: their own Light Blindness then."]
    };
}

// The cast's plan and PF2e's spells by name → the plan with darkLight, or the same plan.
export function withDarkLight(plan, spells = {}) {
    if (plan?.builtin !== "cast-spell" || !Number.isFinite(plan.attack)) return plan;
    const notes = plan.notes ?? [];
    const rank = notes.find((note) => RANK_UP.test(said(note)));
    if (!rank) return plan;
    const choices = plan.choices?.length ? plan.choices : [{ spell: plan.spell, rank: plan.rank }];
    const lit = choices.filter((choice) => (spells[String(choice.spell?.name ?? "").toLowerCase()]?.traits ?? []).includes("light")).map((choice) => choice.spell.uuid);
    if (!lit.length) return plan;
    const flash = notes.find((note) => FLASH.test(said(note)));
    const dazzled = flash ? notes.map((note) => [note, DAZZLED.exec(said(note))]).find(([, match]) => match) : null;
    const blind = dazzled ? notes.find((note) => LIGHT_BLIND.test(said(note))) : null;
    // (The flash whole, or not at all.)
    const read = flash && dazzled && blind ? [rank, flash, dazzled[0], blind] : [rank];
    const left = notes.filter((note) => !read.includes(note));
    const { notes: _, ...rest } = plan;
    const darkLight = {
        rankUp: Number(RANK_UP.exec(said(rank))[2]),
        spells: [...new Set(lit)],
        ...(read.length > 1 ? { flash: flashPlan({ dc: Number(dazzled[1][1]), rounds: Number(dazzled[1][2]), name: plan.source?.name ?? "The item" }) } : {})
    };
    return {
        ...rest,
        ...(left.length ? { notes: left } : {}),
        darkLight,
        ...(plan.partial && !left.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
