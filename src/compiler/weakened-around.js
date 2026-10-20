// Its holder's resistance, and a weakness for everyone else around it, while it lasts (2026-10-20): Maelstromic Destabilizer's "For the next
// minute, the creature holding the gadget gains resistance 2 to spirit damage, while all creatures not immune to spirit damage in a 10-foot
// emanation gains weakness 2 to spirit damage". The ability module's zone around its user for that time: its rules for those inside, the
// resistance its maker's own, the weakness the others' (zone.inside[i].who). A creature immune to that damage gains nothing from a weakness to
// it, as PF2e plays it. Pure.

// (In its own words, or as the module's reading puts them: "you gain resistance 2 to spirit damage. Meanwhile all creatures …".)
const AROUND = /\bFor the next (?:(\d+|one|a) )?(minute|round)s?, (?:the creature holding the gadget gains|you gain) resistance (\d+) to (\w+) damage(?:, while|\. Meanwhile) all creatures not immune to \4 damage in an? (\d+)-foot emanation gains? weakness (\d+) to \4 damage\./i;

// The item's plain text, the plan's base → its zone plan, or null.
export function weakenedAroundPlan(text, base) {
    const match = AROUND.exec(String(text ?? ""));
    if (!match) return null;
    const type = match[4].toLowerCase();
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "emanation", value: Number(match[5]) },
            centre: "self",
            range: null,
            lasts: { mode: "fixed", value: /^\d+$/.test(match[1] ?? "") ? Number(match[1]) : 1, unit: `${match[2].toLowerCase()}s`, expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [],
            damage: [],
            effect: null,
            modifiers: [],
            inside: [
                { rules: [{ key: "Resistance", type, value: Number(match[3]) }], who: "own" },
                { rules: [{ key: "Weakness", type, value: Number(match[6]) }], who: "others" }
            ],
            notes: []
        }
    };
}
