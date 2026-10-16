// A condition its user has until the end of their rage: a third-party Instinct Crown's quickened until its user's rage
// ends, its extra action limited to some actions (Barbarians+ crowns). plan.item.untilRage { conditions: [{ slug, value }] }: the
// item card gives a raging user an Effect that grants each condition (PF2e's GrantItem), lasting at most a minute (a
// Rage's own), and removed when the user's Rage ends (scripts/live.js, on the Rage Effect's deletion). What the extra
// action may be used for stays a note. Not a creature's other than its user's ("Your animal companion … until the end of
// its rage"). Pure.
//
// To give another item this mechanic when its words differ, add it to EXTRA (by its slug) — see docs/mechanics.md.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied"]);
const UNTIL_RAGE = /\bYou (?:become|are) ([A-Za-z-]+)(?: (\d))? until the end of your rage\b/i;

// Items whose words the reader doesn't take, by slug: { conditions: [{ slug, value }] }.
export const EXTRA = Object.freeze({});

// The text (plain) → { conditions, notes } or null.
export function readUntilRage(text, item = null) {
    const extra = EXTRA[item?.system?.slug ?? ""];
    if (extra) return { conditions: extra.conditions, notes: [] };
    const sentences = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/);
    for (const [index, sentence] of sentences.entries()) {
        const match = UNTIL_RAGE.exec(sentence);
        if (!match) continue;
        const slug = match[1].toLowerCase();
        const value = match[2] ? Number(match[2]) : VALUED.has(slug) ? 1 : null;
        const notes = sentences.filter((other, at) => at !== index && /\b(?:extra action|action|can|until|bonus|penalty)\b/i.test(other)).map((other) => other.trim());
        return { conditions: [{ slug, value }], notes };
    }
    return null;
}

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan for an item whose only reading is this: the item card's, the conditions on plan.item.
export function untilRagePlan(base, notes = []) {
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        ...(notes.length ? { notes, partial: true } : {})
    };
}
