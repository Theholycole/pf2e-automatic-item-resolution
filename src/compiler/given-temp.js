// Temporary Hit Points an item gives another creature, Skeletal Claw's "The triggering undead creature has 10 temporary Hit Points that last
// for 1 minute": the core's automatic check row with a temp-hp effect, at the creature the presser targets (the save card's route; the
// ability module's card applies it). What else the text says is a note. Pure.

import { durationIn } from "./rows.js";

const GIVEN = /\bThe (?:triggering |target |summoned )?(?:[a-z]+ )?creature (?:has|gains) (\d+) temporary Hit Points (?:that last )?for (\d+ (?:rounds?|minutes?|hours?))\./i;

// The activation's html, its base → the plan, or null.
export function givenTempPlan(html, base) {
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const given = GIVEN.exec(body);
    if (!given) return null;
    const none = { mode: "none", multiplier: 0, sourceComponentIds: [] };
    const notes = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !sentence.includes(given[0].trim()) && !GIVEN.test(sentence));
    return {
        ...base,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use", ...(base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: none, effects: [{ kind: "temp-hp", amount: Number(given[1]), duration: durationIn(`for ${given[2]}`, null) }], modifiers: [] } } },
        ...(notes.length ? { notes, partial: true } : {})
    };
}
