// Damage whose type its user's loading picks, listed after it: Fortune Cord's Fling Coins, "That creature takes 4d6 untyped
// damage (… basic save); the damage type depends on the type of coins you've loaded. Copper coins deal acid damage, silver
// coins deal electricity damage, gold coins deal fire damage, and platinum coins deal cold damage." The list keeps the
// ability compiler from the save, so the activation is compiled without it; its damage then becomes the card's picker
// (plan.damageChoices, as Necklace of Fireballs' beads), one formula per type. Pure.

const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void";
const LIST = new RegExp(String.raw`;?\s*the damage type depends on the type of [\w' ]+?\.\s*((?:(?:and )?[A-Z]?[a-z]+ [\w ]+? deals? (?:${TYPES}) damage(?:,\s*|\.\s*))+)`, "i");
const ENTRY = new RegExp(String.raw`(?:and )?([A-Za-z]+) [\w ]+? deals? (${TYPES}) damage`, "gi");

// (Or what its user writes, Explosive Missive's "The tenor of what you write … determines the damage type and adds the
// corresponding trait to the missive: @Damage[4d6[acid]]{acid} for a caustic inscription, … or @Damage[4d6[sonic]]{sonic} for an
// overly emphatic one. The missive deals 4d6 damage to each creature in a …": the list left out, the damage its dice untyped, and
// what's "of the same type" a note.)
const WRITTEN = new RegExp(String.raw`[^.]*\bdetermines the damage type\b[^:.]*:\s*((?:(?:or )?@Damage\[[^\]]*?\[(?:${TYPES})\][^\]]*\]\{\w+\} for [^,.]+(?:,\s*|\.\s*))+)`, "i");
const WRITTEN_ENTRY = new RegExp(String.raw`@Damage\[[^\]]*?\[(${TYPES})\][^\]]*\]\{\w+\}`, "gi");
function readWritten(text) {
    const list = WRITTEN.exec(text);
    if (!list) return null;
    const types = [...list[1].matchAll(WRITTEN_ENTRY)].map((match) => ({ label: `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()}`, type: match[1].toLowerCase() }));
    if (types.length < 2) return null;
    const rest = `${text.slice(0, list.index)}${text.slice(list.index + list[0].length)}`;
    const notes = [...rest.replace(/<[^>]+>/g, " ").matchAll(/[^.]*\bof the same type\b[^.]*\./gi)].map((match) => `${match[0].trim().replace(/\.$/, "")} (by hand).`);
    const untyped = rest.replace(/\bdeals (\d+d\d+(?:\+\d+)?) damage\b/i, "deals @Damage[$1[untyped]] damage").replace(/\s*\balso takes \d+d\d+ persistent damage of the same type\b/i, "");
    return { html: untyped, types, ...(notes.length ? { notes } : {}) };
}

// The activation's html → { html (the list left out), types: [{ label, type }], notes? } or null.
export function readTypeChoice(html) {
    const text = String(html ?? "");
    const written = readWritten(text);
    if (written) return written;
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
    return { ...plan, damageChoices: choice.types.map(({ label, type }) => ({ label, formula: typed(type) })), ...(choice.notes ? { notes: [...(plan.notes ?? []), ...choice.notes], partial: true } : {}) };
}
