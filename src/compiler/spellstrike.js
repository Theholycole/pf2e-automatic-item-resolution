// Spellstrike Ammunition (Types I–IX; the item side, the spell module casting it, 2026-10-16): "You activate spellstrike
// ammunition by Casting a Spell into the ammunition. The spell must be of a spell rank the ammunition can hold, and the
// spell must be able to target a creature other than the caster. A creature hit by activated spellstrike ammunition is
// targeted by the spell. … If the spell requires a spell attack roll, use the result of your ranged attack roll … If the
// spell requires a saving throw, the target attempts the save against your spell DC." … "Maximum Spell Rank 3rd".
// The activation is the module's own card (builtin "spellstrike", scripts/spellstrike.js): its user picks one of their
// spells and its rank (PF2e spends the slot), and the ammunition holds it; the Strike that fires it and hits casts it at the
// creature hit through the spell module's castFromItem (its hit as the spell attack's degree, the caster's spell DC); a
// miss loses it. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const ACTIVATE = /\bactivate spellstrike ammunition by Casting a Spell into the ammunition\b|\bby Casting a Spell into (?:the|this) ammunition\b/i;
const MAX_RANK = /\bMaximum Spell Rank (\d+)(?:st|nd|rd|th)?\b/i;

// The text (html) → { maxRank } or null.
export function readSpellstrike(html) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (!ACTIVATE.test(text)) return null;
    const rank = Number(MAX_RANK.exec(text)?.[1]);
    return Number.isInteger(rank) && rank >= 1 ? { maxRank: Math.min(10, rank) } : null;
}

export function spellstrikePlan(html, base) {
    const read = readSpellstrike(html);
    if (!read) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        builtin: "spellstrike",
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        spellstrike: read
    };
}

// Why a spell can't go into it at that rank (null when it can): its rank, a creature other than its caster to target.
export function spellstrikeProblem(spell, rank, maxRank) {
    const name = spell?.name ?? "That spell";
    if (spell?.type !== "spell") return `${name} isn't a spell.`;
    if (spell.system?.ritual) return `${name} is a ritual.`;
    if (!(Number(rank) >= 1) || Number(rank) > maxRank) return `It holds a spell of rank ${maxRank} or lower, and ${name} would be rank ${rank}.`;
    const target = String(spell.system?.target?.value ?? "").trim();
    if (!target || /^(?:you|yourself|self)$/i.test(target)) return `${name} doesn't target a creature other than its caster.`;
    return null;
}

// Whether a spell is cast with a spell attack (the hit's degree is its degree).
export const isSpellAttack = (spell) => (spell?.system?.traits?.value ?? []).includes("attack");

// The ammunition holding a spell: its name.
export const chargedName = (ammo, spell, rank) => `${ammo.name} (${spell.name}, rank ${rank})`;

// The ammunition the attack roll fired, by PF2e's roll option "item:ammo:id:<id>" (or "ammo:id:<id>").
export function firedAmmoId(options) {
    for (const option of options ?? []) {
        const match = /(?:^|:)ammo:id:([A-Za-z0-9]{16})$/.exec(String(option));
        if (match) return match[1];
    }
    return null;
}
