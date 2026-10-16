// Damage whose type its user's loading picks, listed after it: Fortune Cord's Fling Coins, "That creature takes 4d6 untyped
// damage (… basic save); the damage type depends on the type of coins you've loaded. Copper coins deal acid damage, silver
// coins deal electricity damage, gold coins deal fire damage, and platinum coins deal cold damage." The list keeps the
// ability compiler from the save, so the activation is compiled without it; its damage then becomes the card's picker
// (plan.damageChoices, as Necklace of Fireballs' beads), one formula per type. Pure.

const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void";
const LIST = new RegExp(String.raw`;?\s*the damage type depends on the type of [\w' ]+?\.\s*((?:(?:and )?[A-Z]?[a-z]+ [\w ]+? deals? (?:${TYPES}) damage(?:,\s*|\.\s*))+)`, "i");
const ENTRY = new RegExp(String.raw`(?:and )?([A-Za-z]+) [\w ]+? deals? (${TYPES}) damage`, "gi");

// The activation's html → { html (the list left out), types: [{ label, type }] } or null.
export function readTypeChoice(html) {
    const text = String(html ?? "");
    const list = LIST.exec(text);
    if (!list) return null;
    const types = [...list[1].matchAll(ENTRY)].map((match) => ({ label: `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()}: ${match[2].toLowerCase()}`, type: match[2].toLowerCase() }));
    if (types.length < 2) return null;
    return { html: `${text.slice(0, list.index)}.${text.slice(list.index + list[0].length).replace(/^\s*(?=<\/p>)/, "")}`.replace(/\)\.\./, ")."), types };
}

// The plan's one damage, a choice of those types: its formula with each type in place of its own.
export function withTypeChoices(plan, choice) {
    const components = plan?.resolution?.sharedDamage?.components ?? [];
    if (!choice || components.length !== 1) return plan;
    const formula = String(components[0].formula ?? "");
    const typed = (type) => (/\[[\w,]+\]$/.test(formula) ? formula.replace(/\[([\w,]+)\]$/, (whole, inside) => `[${inside.split(",").map((part) => (TYPES.split("|").includes(part) || part === "untyped" ? type : part)).join(",")}]`) : `${formula}[${type}]`);
    return { ...plan, damageChoices: choice.types.map(({ label, type }) => ({ label, formula: typed(type) })) };
}
