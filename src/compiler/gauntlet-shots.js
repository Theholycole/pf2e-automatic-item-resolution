// A gadget fixed to its user's gauntlet that fires it as a ranged Strike, again on each Sustain (2026-10-28, docs/needs.md "strike"): the
// third-party Power Gauntlet, each grade — its user's own gauntlet Strike at a creature within its range, its damage of the gadget's type in
// place of the gauntlet's, with no Strength added (the rest of a melee Strike with that gauntlet as it is), up to the grade's number of
// Strikes within the grade's time. → the Strike card's readied Strikes (scripts/strikes.js): strike.base "gauntlet" (only a Strike with a
// weapon of that base takes them), strike.alteration (PF2e's DamageAlteration on them), PF2e's AdjustModifier taking the Strength off their
// damage (strike.userRules), strike.uses and strike.lasts (the Effect's time). One now and one each Sustain on a later turn, its attaching
// beforehand and its range are its user's own: lines of the card. Its look is flavor. Pure.

const said = (entry) => String(entry ?? "").trim();
const sentencesOf = (text) => String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map(said).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days", round: "rounds", rounds: "rounds" };

const SENTENCES = {
    activate: /^Activate\s+(?:\[\w+\]\s*)?Interact\s+These thick, metal\s+gloves\b[^.]*\.$/,
    attach: /^The process of attaching an?\s+[\w ]+? takes (\d+) (minutes?|rounds?)\.$/,
    shot: /^When you Activate [\w ]+?,\s+clockwork gears project the gauntlet\s+making a ranged Strike with your\s+gauntlet at a target within (\d+) feet\s+of you and dealing (fire|cold|electricity|acid|sonic|force) damage\s+instead of its normal damage type\.$/,
    strength: /^Your Strike does not apply\s+your Strength to damage, but does\s+apply any other effects\b[^.]*\.$/,
    sustain: /^You can Sustain the Activation\s+of your [\w ]+? to make additional\s+Strikes for the duration\.$/,
    most: /^You can make a number\s+of ranged Strikes up to the\s+listed maximum number of Strikes\.$/,
    again: /^Starting on the turn after\s+you Activate the [\w ]+?, each time\s+you Sustain the activation\b[^.]*\.$/,
    consumed: /^The gadget is consumed after\s+it reaches the listed maximum\b[^.]*\.$/,
    numbers: /^The gauntlet(?:'|’)s maximum number\s+of ranged Strikes is (\d+) and the\s+duration is (\d+) (minutes?|hours?|days?|rounds?)\.$/
};

export function withGauntletShots(plan, { kind, text, base, info }) {
    if (kind !== "consumable" || (plan && !plan.noteOnly)) return plan;
    const found = {};
    for (const sentence of sentencesOf(text)) {
        const entry = Object.entries(SENTENCES).find(([, pattern]) => pattern.test(sentence));
        if (!entry) return plan;
        found[entry[0]] = entry[1].exec(sentence);
    }
    if (!found.shot || !found.strength || !found.numbers || !found.again) return plan;
    const [, feet, type] = found.shot;
    const uses = Number(found.numbers[1]);
    const lasts = { value: Number(found.numbers[2]), unit: UNITS[found.numbers[3].toLowerCase()] };
    const attach = found.attach ? `${found.attach[1]} ${found.attach[2]}` : null;
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: `${feet} feet`, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: {
            range: null,
            save: null,
            damage: [],
            attack: null,
            alteration: type.toLowerCase(),
            base: "gauntlet",
            own: false,
            unarmed: false,
            uses,
            until: "minute",
            lasts,
            missKeeps: false,
            hit: false,
            notes: [],
            userRules: [{ key: "AdjustModifier", selector: "strike-damage", slug: "str", suppress: true, predicate: ["item:base:gauntlet"] }],
            lines: [
                `With its user's gauntlet, at a creature within ${feet} feet: no Strength on its damage, everything else as a melee Strike with that gauntlet`,
                `One Strike now, then one each time its user Sustains it on a later turn${attach ? `; fixing it to the gauntlet takes ${attach} beforehand` : ""}`
            ]
        },
        item: { ...(info ?? {}) }
    };
}
