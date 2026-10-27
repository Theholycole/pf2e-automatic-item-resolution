// What a Strike gains against a foe in a condition (2026-10-27, docs/needs.md "Changes to a Strike"): Minotaur Chair's charge, "If the foe is
// Prone, the following effects apply: the attack gains a +1 circumstance bonus to damage per weapon damage die, and the wounding rune deals
// @Damage[1d12[bleed]] on a hit (or @Damage[3d6[bleed]] on a critical hit)." PF2e's own rules on the readied Strike's Effect, each predicated on
// PF2e's "target:condition:prone" (src/live/strike-card.js strikeRules): the bonus a FlatModifier of the weapon's damage dice (strike.flat), the
// wounding rune's own 1d6 persistent bleed taken off (strike.runeDice, DamageAlteration on that rune's dice) and its 1d12 put in its place on a
// hit, its 3d6 on a critical hit (strike.damage: the hit's predicated off on a critical hit — PF2e's critical false is only "not doubled", so
// the hit's dice would join the critical hit's; the critical hit's critical true, added undoubled — the live check's reading, 2026-10-27). Pure.

const IF_FOE = /^If the foe is (Prone|Off-Guard|Grabbed|Restrained|Immobilized|Frightened|Clumsy|Dazzled), the following effects apply: the attack gains an? \+(\d+) (circumstance|status|item) bonus to damage per weapon damage die, and the (\w+) rune deals (\d+)d(\d+) (\w+) on a hit \(or (\d+)d(\d+) \7 on a critical hit\)\.$/i;
const PERSISTENT = new Set(["bleed"]);
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → its Strike with those rules, or the same plan.
export function withStrikeIf(plan) {
    const strike = plan?.strike;
    const found = (strike?.notes ?? []).map((note) => [note, IF_FOE.exec(said(note))]).find(([, match]) => match);
    if (!found) return plan;
    const [note, [, condition, bonus, type, rune, hitCount, hitFaces, damageType, critCount, critFaces]] = found;
    const predicate = [`target:condition:${condition.toLowerCase()}`];
    const category = PERSISTENT.has(damageType.toLowerCase()) ? "persistent" : null;
    const dice = (count, faces, critical) => ({ diceNumber: Number(count), dieSize: `d${faces}`, category, damageType: damageType.toLowerCase(), predicate: critical ? predicate : [...predicate, { not: "check:outcome:critical-success" }], critical });
    const notes = strike.notes.filter((entry) => entry !== note);
    const left = [...notes, ...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    return {
        ...plan,
        strike: {
            ...strike,
            notes,
            damage: [...(strike.damage ?? []), dice(hitCount, hitFaces, false), dice(critCount, critFaces, true)],
            flat: [...(strike.flat ?? []), { value: Number(bonus), perDie: true, type: type.toLowerCase(), predicate }],
            runeDice: [...(strike.runeDice ?? []), { rune: rune.toLowerCase(), predicate }]
        },
        ...(plan.partial && !left.length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
