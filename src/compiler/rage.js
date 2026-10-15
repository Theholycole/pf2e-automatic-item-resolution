// An item that has its user Rage with more temporary Hit Points: PF2e's Instinct Crowns' "You use Quick-Tempered and gain
// 10 additional temporary Hit Points from your Rage", Barbarians+' crowns' "You Rage, gaining 10 additional temporary Hit
// Points". Rage is PF2e's own: its Rage action applies "Effect: Rage", whose TempHP rule reads the barbarian's rage
// temporary Hit Points (@actor.flags.system.rageTempHP). The plan is that Effect on the user, its TempHP raised by the
// item's (application.tempHP), played by the item card, which checks the user can Rage and isn't raging. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

export const RAGE_EFFECT = "Compendium.pf2e.feat-effects.Item.z3uyCMBddrPK5umr";
const RAGE = /\bYou (?:use Quick-Tempered|Rage)\b(?: and|,)? (?:gain|gaining) (\d+) additional temporary Hit Points(?: from your Rage)?\b/i;

// The text (plain) → { extra, notes } or null.
export function readRage(text) {
    const body = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const match = RAGE.exec(body);
    if (!match) return null;
    const notes = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !RAGE.test(sentence));
    return { extra: Number(match[1]), notes };
}

export function ragePlan(text, base) {
    const read = readRage(text);
    if (!read) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: RAGE_EFFECT, label: "Effect: Rage", recipients: "self", tempHP: read.extra, rage: true }] },
        rage: { extra: read.extra },
        ...(read.notes.length ? { notes: read.notes, partial: true } : {})
    };
}

// The plan to keep: the Rage over nothing, a note alone or the GM's fallback.
export function rageOver(plan, rage) {
    if (!rage) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? rage : plan;
}
