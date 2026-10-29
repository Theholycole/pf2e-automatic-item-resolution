// Ammunition whose hit ties its target to the shooter with a sticky string (2026-10-28, docs/needs.md "strike"): the third-party Tackfied
// Trail Ammunition, each grade. → its next ranged Strike readied (the Strike card, scripts/strikes.js: strike.ammo), whose hit gives the
// creature a note Effect for the string's minute — it can't move farther from the shooter than the string's length unless it Escapes at the
// grade's DC, and the string can be attacked (its AC and Hit Points) — PF2e having no tether to play. The rest is its user's own and the
// map's, lines of the card: only within the string's length (farther, it dissolves after the Strike), no ranged Strikes with that weapon
// while it holds (unless it has several barrels) and an Interact or a reload taking it off, or a 5-foot square aimed at instead (AC 10), the
// string an anchored rope there that an Interact pulls its user along (forced movement, onto solid ground or a fall). Pure.

const said = (entry) => String(entry ?? "").trim();
const sentencesOf = (text) => String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map(said).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

const SENTENCES = {
    fired: /^(?:Ammunition \w+\s+)?(?:Activate\s+(?:\[\w+\]\s*)?(?:1\s+)?Interact\s+)?When a shot is fired with\s+[\w ]+?, it leaves behind a\s+sticky, jelly-like string\b[^.]*\.$/,
    within: /^If your Strike is successful\s+and the target is within (\d+) feet\s+of you, you create a string\b[^.]*\.$/,
    lasts: /^The string connects you and\s+a target in a\s+straight line for (\d+) (minutes?|rounds?), and the\s+target or others can break the string\b[^.]*\.$/,
    numbers: /^The string has an? (\d+) AC,\s+(\d+) Hit Points, and an Escape DC of (\d+)\.$/,
    far: /^If the target(?:'|’)s distance to you\s+exceeds the string(?:'|’)s maximum range,\s+it automatically dissolves\b[^.]*\.$/,
    held: /^While the string is in place,\s+the target cannot move more than\s+the maximum distance unless it\b[^.]*\bEscape\.$/,
    weapon: /^You cannot use the weapon for\s+ranged Strikes while a string\b[^.]*\bmultiple barrels,\s+but you can Interact to\b[^.]*\.$/,
    square: /^You can choose to target a\s+specific 5-foot square with your\s+Strike instead of a creature, which\s+typically has an AC of (\d+),[^.]*\.$/,
    pull: /^When you use an? [\w ]+? in\s+this way, you can pull the string\s+as an Interact action\b[^.]*\.$/,
    land: /^You must land on a space\s+of solid ground, or else you\s+immediately fall\.$/,
    forced: /^This is forced movement\.$/
};

export function withTrailString(plan, { kind, item, base, info }) {
    if (kind !== "activation" || item?.type !== "ammo" || (plan && !plan.noteOnly)) return plan;
    const plain = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").trim();
    const found = {};
    for (const sentence of sentencesOf(plain)) {
        const entry = Object.entries(SENTENCES).find(([, pattern]) => pattern.test(sentence));
        if (!entry) return plan;
        found[entry[0]] = entry[1].exec(sentence);
    }
    if (!found.within || !found.lasts || !found.numbers || !found.held || !found.weapon) return plan;
    const feet = Number(found.within[1]);
    const [, ac, hp, dc] = found.numbers;
    const duration = { mode: "fixed", value: Number(found.lasts[1]), unit: /^m/i.test(found.lasts[2]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const string = { label: "Sticky string", text: `A sticky string ties it to the creature that shot it: it can't move farther than ${feet} feet from them unless it Escapes (DC ${dc}). Anyone can attack the string to break it (AC ${ac}, ${hp} Hit Points).`, duration };
    const hit = () => ({ ...none(), noteEffects: [string] });
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: hit(), success: hit(), failure: none(), criticalFailure: none() } },
        strike: {
            range: "ranged",
            save: null,
            ammo: true,
            notes: [],
            lines: [
                `Only at a target within ${feet} feet: farther, the string dissolves after the Strike`,
                "While the string holds, that weapon makes no ranged Strikes (unless it has several barrels); an Interact, or reloading it, takes the string off",
                `Or aimed at a 5-foot square (AC ${found.square?.[1] ?? 10}): the string is a rope anchored there, and an Interact pulls its user to that square (forced movement, ending it), onto solid ground or it falls`
            ]
        },
        item: { ...(info ?? {}) }
    };
}
