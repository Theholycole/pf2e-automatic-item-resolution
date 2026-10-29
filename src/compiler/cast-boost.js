// A check that changes the spell its user casts (2026-10-29, docs/spell-module-requests.md row 14, the user's answer to question 8): Starless
// Scope's reaction as its user casts with it as a divine focus — a Religion check against the spell's DC (its rank's and rarity's), whose
// degree is the spell's: a status bonus to its attack rolls and a status penalty to a foe's saves against it (2 or 1), its slot not spent (rank
// 5 or lower, on a critical success); a failure's flat check that shatters the scope's lens, a critical failure the spell lost and the lens
// shattered. → plan.builtin "cast-boost", plan.castBoost { skill, rows: { degree: { attack, save, refund: { maxRank }, flat: { dc }, lose,
// shatter } } } — scripts/cast-boost.js plays it on its user's last cast. Without a lens the scope does nothing until its user puts one in.
// Pure.

import { sentencesOf } from "./lasting.js";

const ENHANCE = /^\s*You attempt to enhance the effects of a spell as you cast it by attempting an? ([A-Z][a-z]+) check against the spell's DC\b[^.]*\.$/;
const BOOST = /^\s*(Critical Success|Success) Any attack rolls you make with the spell gain a \+(\d+) status bonus, and any saving throw a foe makes against the spell takes a -(\d+) status penalty\.$/;
const REFUND = /^\s*If you would normally cast the spell from a spell slot, and the spell is (\d+)(?:st|nd|rd|th) rank or lower, you don't spend the spell slot\b[^.]*\.$/;
const FAILURE = /^\s*Failure The spell is cast normally\.$/;
const FLAT = /^\s*Attempt a @Check\[flat\|dc:(\d+)\]\.$|^\s*Attempt a DC (\d+) flat check\.$/;
const SHATTERS = /^\s*On a failure, the [\w' ]+?'s lens shatters\.$/;
const CRITICAL_FAILURE = /^\s*Critical Failure The spell is disrupted and the [\w' ]+?'s lens shatters\.$/;
const DEGREE = { "Critical Success": "criticalSuccess", Success: "success" };

// The plan read before (none), the activation's context → the cast-boost plan, or the same plan.
export function withCastBoost(plan, context = {}) {
    if (plan && !plan.noteOnly && plan.builtin !== "no-effect") return plan;
    const sentences = sentencesOf(context.words ?? context.text ?? "");
    const enhance = sentences.map((sentence) => ENHANCE.exec(sentence)).find(Boolean);
    if (!enhance) return plan;
    const rows = {};
    let last = null;
    for (const sentence of sentences) {
        const boost = BOOST.exec(sentence);
        if (boost) {
            last = DEGREE[boost[1]];
            rows[last] = { attack: Number(boost[2]), save: -Number(boost[3]) };
            continue;
        }
        const refund = REFUND.exec(sentence);
        if (refund && last) rows[last].refund = { maxRank: Number(refund[1]) };
        if (FAILURE.test(sentence)) rows[(last = "failure")] = {};
        const flat = FLAT.exec(sentence);
        if (flat && last === "failure") rows.failure.flat = { dc: Number(flat[1] ?? flat[2]) };
        if (SHATTERS.test(sentence) && rows.failure?.flat) rows.failure.flat.shatter = true;
        if (CRITICAL_FAILURE.test(sentence)) rows.criticalFailure = { lose: true, shatter: true };
    }
    if (!rows.criticalSuccess || !rows.success || !rows.failure || !rows.criticalFailure) return plan;
    return {
        ...(context.base ?? {}),
        automation: { level: "automatic" },
        trigger: { event: "use", ...(context.frequency ? { frequency: context.frequency } : {}) },
        builtin: "cast-boost",
        actions: null,
        targeting: { target: null, range: null, area: null },
        castBoost: { skill: enhance[1].toLowerCase(), rows },
        notes: ["Use it as its user casts a spell with the scope as its divine focus (a Desna worshipper's): it acts on that last cast. Target the foes the spell is cast at for their save penalty."],
        item: { ...(context.info ?? plan?.item ?? {}) }
    };
}
