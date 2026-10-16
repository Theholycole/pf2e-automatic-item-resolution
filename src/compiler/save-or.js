// "The target must succeed at a @Check[fortitude|dc:37] save or be decapitated": a save whose failure is one result the
// ability compiler has no row for, as the etched runes' reactions have it (2026-10-16):
// - death: Vorpal's "or be decapitated. This kills any creature except ones that don't require a head to live", Celestial
//   Peachwood Sword's "or be destroyed" (the core's terminal death; the exceptions a note for the GM);
// - moved: Hauling's "or be moved 5 feet in a direction you choose. This is forced movement." (the core's push away from its
//   user, the direction of their choice the GM's);
// - pulled to its user: Ouroboros Flail's "or be pulled adjacent to you", and what follows ("A creature pulled to you is then
//   Grabbed by the flail until the end of your next turn …") read as the failure's riders.
// A failure and a critical failure alike; a success nothing. The plan is the save family's, at the creature its presser
// targets (src/live/route.js "save"). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";

const SAVE = /\b(?:The|the|That|that) (?:target|creature|damaged creature|triggering creature)(?: of the triggering Strike)? must succeed at an? @Check\[(?:type:)?(fortitude|reflex|will)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})? save or (?:be |is )?([^.]+)\./i;
const DEATH = /^(?:be )?(?:decapitated|destroyed|slain|killed)\b|^die\b/i;
const MOVED = /^moved (\d+) feet in a direction (?:you|of your) choos(?:e|ing)\b/i;
const PULLED = /^pulled adjacent to you\b/i;
// (As far as a pull to its user goes: it stops next to them.)
const PULL_FEET = 120;

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], manualInstructions: [] });

// The html → { statistic, dc, failure (a row), notes } or null.
export function readSaveOr(html) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ");
    const match = SAVE.exec(text);
    if (!match) return null;
    const [, statistic, dc, result] = match;
    const after = text.slice(match.index + match[0].length).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !/^Craft Requirements\b|^Activate\b/i.test(sentence));
    const failure = none();
    const notes = [];
    if (DEATH.test(result.trim())) {
        failure.terminal = { kind: "death" };
        // (Who it doesn't kill: "except ones that don't require a head to live".)
        notes.push(...after.slice(0, 2));
    } else if (MOVED.test(result.trim())) {
        failure.forcedMovement = { kind: "push", distance: Number(MOVED.exec(result.trim())[1]), upTo: false, optional: false, direction: "away" };
        failure.manualInstructions.push("The direction is its user's choice: the card moves it straight away; move it by hand for another.");
    } else if (PULLED.test(result.trim())) {
        failure.forcedMovement = { kind: "pull", distance: PULL_FEET, upTo: true, optional: false, direction: "toward" };
        // (What a creature pulled to its user then is: its riders.)
        const then = after.find((sentence) => /^A creature pulled to you is then\b/i.test(sentence));
        if (then) {
            const riders = riderRow(then.replace(/^A creature pulled to you is then\s+/i, "is ").replace(/ by the [\w ]+? until/, " until").replace(/\s+unless\b.*$/i, "."));
            failure.effects = riders.effects ?? [];
            if (/\bunless\b/i.test(then)) notes.push(then);
        }
    } else return null;
    return { statistic: statistic.toLowerCase(), dc: Number(dc), failure, notes };
}

export function saveOrPlan(html, base) {
    const read = readSaveOr(html);
    if (!read) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: read.statistic, basic: false, against: { dc: "fixed", value: read.dc } },
            outcomes: { criticalSuccess: none(), success: none(), failure: read.failure, criticalFailure: structuredClone(read.failure) },
            // (What it says beyond the row: the GM's, on the card.)
            ...(read.notes.length ? { reminders: read.notes } : {})
        },
        ...(read.notes.length ? { notes: read.notes, partial: true } : {})
    };
}
