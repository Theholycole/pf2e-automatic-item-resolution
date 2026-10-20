// Damage whose type its user's loading picks, listed after it: Fortune Cord's Fling Coins, "That creature takes 4d6 untyped
// damage (… basic save); the damage type depends on the type of coins you've loaded. Copper coins deal acid damage, silver
// coins deal electricity damage, gold coins deal fire damage, and platinum coins deal cold damage." The list keeps the
// ability compiler from the save, so the activation is compiled without it; its damage then becomes the card's picker
// (plan.damageChoices, as Necklace of Fireballs' beads), one formula per type. Pure.

import { withWhilePersistent } from "./primed.js";

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
    // (A critical failure's persistent damage of the picked type, Explosive Missive's "A creature who rolls a critical failure also takes 1d4
    // persistent damage of the same type": each choice's, on that row — src/compiler/beads.js withDamageChoice.)
    const critical = /\bA creature who rolls a critical failure also takes (\d+d\d+) persistent damage of the same type\./i.exec(rest.replace(/<[^>]+>/g, " "));
    const notes = [...rest.replace(/<[^>]+>/g, " ").matchAll(/[^.]*\bof the same type\b[^.]*\./gi)].filter((match) => !critical || match[0].trim() !== critical[0].trim()).map((match) => `${match[0].trim().replace(/\.$/, "")} (by hand).`);
    const untyped = rest.replace(/\bdeals (\d+d\d+(?:\+\d+)?) damage\b/i, "deals @Damage[$1[untyped]] damage").replace(/\s*\balso takes \d+d\d+ persistent damage of the same type\b/i, "");
    return { html: untyped, types, ...(critical ? { criticalPersistent: critical[1] } : {}), ...(notes.length ? { notes } : {}) };
}

// (Or its dragon's, Orb of Dragonkind's "You breathe an elemental blast that deals 25d6 damage (… basic save) in either a cone or a line
// (your choice). The breath's damage type matches the Breath Weapon of the dragon type associated with the orb": the dragons' breath
// types, the GM's pick; the line in place of the cone a note.)
const DRAGON_TYPE = /\s*The breath's damage type matches the Breath Weapon of the dragon type associated with the [^.]*?\([^)]*\)\./i;
export const DRAGON_TYPES = ["acid", "cold", "electricity", "fire", "poison", "sonic", "force", "mental", "spirit", "void", "vitality"];
function readDragonType(text) {
    if (!DRAGON_TYPE.test(text) || !/\bdeals (\d+d\d+) damage \(@Check/i.test(text)) return null;
    const either = /\bin either an? @Template\[(?:type:)?(cone|line)\|distance:(\d+)\](?:\{[^}]*\})? or an? @Template\[(?:type:)?(cone|line)\|distance:(\d+)\](?:\{[^}]*\})? \(your choice\)/i.exec(text);
    const html = text.replace(DRAGON_TYPE, "").replace(/\bdeals (\d+d\d+) damage \(@Check/i, "deals @Damage[$1[untyped]] damage (@Check");
    return { html, types: DRAGON_TYPES.map((type) => ({ label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`, type })), notes: ["The damage type is the orb's dragon's Breath Weapon's (picked on the card).", ...(either ? [`Its area: a ${either[2]}-foot ${either[1]} or a ${either[4]}-foot ${either[3]}, its user's choice (place the other by hand).`] : [])] };
}

// The activation's html → { html (the list left out), types: [{ label, type }], notes? } or null.
export function readTypeChoice(html) {
    const text = String(html ?? "");
    const written = readWritten(text);
    if (written) return written;
    const dragon = readDragonType(text);
    if (dragon) return dragon;
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
    return { ...plan, damageChoices: choice.types.map(({ label, type }) => ({ label, formula: typed(type), ...(choice.criticalPersistent ? { criticalPersistent: `${choice.criticalPersistent}[persistent,${type}]` } : {}) })), ...(choice.notes ? { notes: [...(plan.notes ?? []), ...choice.notes], partial: true } : {}) };
}

// Damage of its user's choice of two types, each degree's row giving both, Bloodburn Censer's "the smoke deals your choice of fire or
// poison damage … Success The creature … takes @Damage[2d6[persistent,fire]] or @Damage[2d6[persistent,poison]] damage": the
// card's picker of those types (plan.damageChoices with a type, no formula), the rows keeping the picked type's formulas
// (src/compiler/beads.js withDamageChoice) — not both.
const CHOICE_OF = new RegExp(String.raw`\byour choice of (${TYPES}) or (${TYPES}) damage\b`, "i");
const typeOf = (formula) => (/\[([\w,\s]+)\]/.exec(String(formula ?? ""))?.[1] ?? "").split(",").map((part) => part.trim().toLowerCase());
export function withRowTypeChoice(plan, text) {
    const choice = CHOICE_OF.exec(String(text ?? ""));
    if (!choice || plan?.damageChoices || !plan?.resolution?.outcomes) return plan;
    const types = [choice[1].toLowerCase(), choice[2].toLowerCase()];
    const both = Object.values(plan.resolution.outcomes).some((row) => types.every((type) => (row?.damage?.formulas ?? []).some((entry) => typeOf(entry.formula).includes(type))));
    if (!both) return plan;
    // (Each type's own rows: the other type's formulas left out, and a condition "until the persistent damage ends" then that type's,
    // src/compiler/primed.js.)
    const rowsFor = (type) => {
        const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, row?.damage?.formulas ? { ...row, damage: { ...row.damage, formulas: row.damage.formulas.filter((entry) => !types.some((other) => other !== type && typeOf(entry.formula).includes(other))) } } : row]));
        return withWhilePersistent({ ...plan, resolution: { ...plan.resolution, outcomes } }, text).resolution.outcomes;
    };
    return { ...plan, damageChoices: types.map((type) => ({ label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`, type, outcomes: rowsFor(type) })) };
}

