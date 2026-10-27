// A symptom hidden for a while, seen through by a closer look (2026-10-27, docs/needs.md "afflictions"): Snake Oil's "You can apply snake oil
// onto a wound or other outward symptom of an affliction or condition … For the next hour, the symptom disappears and the wounded or afflicted
// creature doesn't feel as if it still has the wound or affliction, though all effects remain. A creature can uncover the ruse by succeeding
// at a DC 17 Perception check, but only if it uses a Seek action to specifically examine the snake oil's effects." → a note Effect on the
// creature it's applied to for the hour (its effects unchanged: nothing for PF2e to play), and plan.disbelief — the GM's disbelief card for
// that hour (scripts/disbelief.js), a creature that Seeks to examine it checking against DC 17. Pure.

import { plainText } from "./rows.js";

const HIDES = /^Activate\s*(?:\[[^\]]*\]\s*)?(?:\([^)]*\))?\s*You can apply snake oil onto a wound or other outward symptom of an affliction or condition \(such as sores from a disease or discoloration from a poison\)\. For the next (hour|(\d+) (?:minutes|hours)), the symptom disappears and the wounded or afflicted creature doesn't feel as if it still has the wound or affliction, though all effects remain\. A creature can uncover the ruse by succeeding at a @Check\[perception\|dc:(\d+)[^\]]*\] check, but only if it uses a Seek action to specifically examine the snake oil's effects\.$/i;

// The plan (its note-only reading) and the item's html → the note Effect and disbelief card, or the same plan.
export function withHiddenSymptom(plan, html) {
    const found = HIDES.exec(plainText(html).trim());
    if (!found || !plan?.noteOnly) return plan;
    const lasts = found[2] ? { value: Number(found[2]), unit: /hour/i.test(found[1]) ? "hours" : "minutes" } : { value: 1, unit: "hours" };
    const duration = { mode: "fixed", ...lasts, expiry: "turn-start", anchor: "effect-start" };
    const note = { label: "Symptom hidden", text: "A wound or outward symptom of an affliction or condition on it can't be seen, and it doesn't feel it any more; all its effects stay as they were.", duration };
    const { noteOnly: _noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { level: "automatic" },
        resolution: { ...plan.resolution, outcomes: { success: { ...plan.resolution.outcomes.success, noteEffects: [note] } } },
        disbelief: { dc: Number(found[3]), statistic: "perception", when: "Seeks to examine the oiled wound or symptom", lasts },
        item: { ...plan.item, recipient: "drinker" }
    };
}
