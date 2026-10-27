// What a zone's notes left of two items (2026-10-27, docs/needs.md):
// - Arctic Worm Chitin Shield's Misty Chill, "You Raise the Shield and an icy mist begins to flow off it. Until the beginning of your next turn,
//   you gain resistance 5 to cold and any creature that ends its turn adjacent to you takes 3d6 cold damage (basic Reflex save)" and its link
//   to PF2e's Effect: Misty Chill (Raise a Shield and the cold resistance). The zone has the mist's save; PF2e's Effect goes on its user as
//   the card is posted (plan.userEffects { kind: "native" }, scripts/live.js giveUserConditions), its "apply it to yourself" note gone, and
//   the sentence the two now play no longer a note.
// - Candle of Truth's "when first entering the affected area, each creature (including you) must succeed at a DC 26 Will save or be unable to
//   tell any deliberate lies while within 10 feet of the lit candle. This lasts for as long as the candle is lit." Only the first time: the
//   save's trigger.immunity for the candle's 10 minutes (the ability module's cards leave out a creature already immune); a failure's lie
//   words on the creature's note Effect for that time (the user's ruling for minds), its GM's lines gone.
// Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const ALL = ["criticalSuccess", "success", "failure", "criticalFailure"];
const OWN_EFFECT = /^You also gain (?:[^(]+?) \((Effect: [^:]+): apply it to yourself from the item\)\.$/;
const LINKED = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.\w+)\]\{(Effect: [^}]+)\}/g;
const MIST = /^Until the beginning of your next turn, you gain resistance (\d+) to (\w+) and any creature that ends its turn adjacent to you takes (\d+d\d+) \2 damage \(@Check\[reflex\|dc:\d+\|basic\] save\)\.$/;

// A zone plan and its activation's html → the plan with its user's own PF2e Effect, or the same plan.
export function withZoneOwnEffect(plan, html) {
    const notes = plan?.builtin === "zone" ? plan.zone?.notes ?? [] : [];
    const own = notes.map((note) => [note, OWN_EFFECT.exec(said(note))]).find(([, match]) => match);
    const link = own ? [...String(html ?? "").matchAll(LINKED)].find((entry) => entry[2] === own[1][1]) : null;
    if (!own || !link) return plan;
    const mist = notes.find((note) => MIST.test(said(note)) && (plan.zone.saves ?? []).some((save) => save.when.includes("end") && save.plan?.resolution?.sharedDamage?.components?.[0]?.formula === `${MIST.exec(said(note))[3]}[${MIST.exec(said(note))[2]}]`));
    const kept = notes.filter((note) => note !== own[0] && note !== mist);
    const left = kept.length || (plan.notes ?? []).length || (plan.unread ?? []).length;
    return {
        ...plan,
        zone: { ...plan.zone, notes: kept },
        userEffects: [...(plan.userEffects ?? []), { kind: "native", uuid: link[1], label: link[2] }],
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

const FIRST = /\bwhen first entering the affected area, each creature \(including you\) must succeed at a @Check\[will\|dc:\d+\] save or be unable to tell any deliberate lies while within (\d+) feet of the lit candle\. This lasts for as long as the candle is lit\./;
const ONCE_NOTE = /^Each creature attempts it only the first time it enters; what a failure does lasts only while it's within the area, for as long as it burns\.$/;
const LIES = /^\{target\} \((?:critical )?failure\): (?:As failure\. \(failure: )?The target is unable to tell any deliberate lies while within (\d+) feet of the lit candle\.\)?$/;

// A consumable's zone plan and the item → the plan with its first-time save and its lie words, or the same plan.
export function withFirstEntrySave(plan, item) {
    const html = String(item?.system?.description?.value ?? "");
    const first = FIRST.exec(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const zone = plan?.builtin === "zone" ? plan.zone : null;
    const onceNote = (zone?.notes ?? []).find((note) => ONCE_NOTE.test(said(note)));
    if (!first || !zone?.lasts || !onceNote || (zone.saves ?? []).length !== 1) return plan;
    const [save] = zone.saves;
    const duration = { mode: "fixed", value: zone.lasts.value, unit: zone.lasts.unit, expiry: "turn-start", anchor: "effect-start" };
    const outcomes = Object.fromEntries(Object.entries(save.plan.resolution.outcomes).map(([degree, row]) => {
        const line = (row?.manualInstructions ?? []).find((entry) => LIES.test(said(entry)));
        if (!line) return [degree, row];
        const { manualInstructions, ...rest } = row;
        const others = manualInstructions.filter((entry) => entry !== line);
        return [degree, { ...rest, ...(others.length ? { manualInstructions: others } : {}), noteEffects: [...(rest.noteEffects ?? []), { label: "No lies", text: `Unable to tell any deliberate lies while within ${first[1]} feet of the lit candle, for as long as it burns.`, duration }] }];
    }));
    const immunity = { scope: "target", raw: "when first entering the affected area", duration: { value: zone.lasts.value, unit: zone.lasts.unit }, degrees: [...ALL], against: "all", slug: item.system?.slug || "candle-of-truth" };
    const saves = [{ ...save, plan: { ...save.plan, trigger: { ...(save.plan.trigger ?? {}), immunity }, resolution: { ...save.plan.resolution, outcomes } } }];
    const notes = zone.notes.filter((note) => note !== onceNote);
    const left = notes.length || (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(outcomes).some((row) => (row?.manualInstructions ?? []).length);
    return { ...plan, zone: { ...zone, notes, saves }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// A snare set off by a creature moving beside it (Clockwork Monkey's "It's activated once a creature moves adjacent to the square it sits in, at
// which point it leaps on the creature … riding the creature and raising a racket. The creature … must find a way to escape its agitator either
// via flinging the monkey off with the Escape action (DC 18) or by breaking the monkey. The monkey has AC 19, Hardness 2, HP 10 (BT 5) and object
// immunities."): the snares' zone (as Alarm Snare's, gone once set off), its area the 15-foot square around the monkey's that the GM places, the
// creature that enters it the one the note names — what rides it and how it's rid of it, its racket the table's.
const MONKEY = /\bIt's activated once a creature moves adjacent to the square it sits in, at which point it leaps on the creature, [^.]+?, riding the creature and raising a racket\. The creature being assaulted by the monkey must find a way to escape its agitator either via flinging the monkey off with the \[\[\/act escape (?:show-dc=all )?dc=(\d+)\]\] action or by breaking the monkey\. The monkey has AC (\d+), Hardness (\d+), HP (\d+) \(BT (\d+)\) and object immunities\./i;
export function withRidingSnare(plan, item, base) {
    const read = plan ? null : MONKEY.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!read) return plan;
    const [, escape, ac, hardness, hp, bt] = read;
    const made = base();
    return {
        ...made,
        builtin: "zone",
        actions: null,
        automation: { level: "automatic" },
        trigger: { event: "use" },
        zone: {
            area: { type: "square", value: 15 },
            centre: "placed",
            range: 5,
            lasts: null,
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], note: `The monkey leaps onto it and rides it, pounding its instrument and raising a racket, until it flings the monkey off with an Escape (DC ${escape}) or breaks it (AC ${ac}, Hardness ${hardness}, HP ${hp}, BT ${bt}, object immunities).` }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: ["Its area is the 15-foot square centred on the monkey's square: the first creature to move beside the monkey sets it off; then it's spent."],
            once: true
        }
    };
}
