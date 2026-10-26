// A condition that follows once another ends (2026-10-26, docs/needs.md "Sustained, repeating and later effects"): Heart of Sarnax's Crush
// Heart, "Critical Failure … Stunned 3. When it recovers from being stunned, it is Slowed 2 for 1 minute", and its Bestow Vim, "The target
// creature becomes Quickened … This effect lasts for 1 minute, after which the target creature becomes Fatigued for 1 hour". plan.afterEnds
// [{ degree, when, then: { slug, value, duration } }]: once the card at the creature is applied (the ability module's applied hook), each
// creature of that degree is marked, and when PF2e no longer has it `when`, it gets `then` for its time (scripts/after-ends.js). Pure.

const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
const COUNT = { one: 1, a: 1, an: 1 };
const timeOf = (amount, unit) => ({ mode: "fixed", value: COUNT[String(amount).toLowerCase()] ?? Number(amount), unit: UNITS[String(unit).toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const CONDITIONS = "blinded|clumsy|dazzled|deafened|drained|enfeebled|fatigued|frightened|quickened|sickened|slowed|stunned|stupefied|off-guard|immobilized|confused|fascinated";

// "When it recovers from being stunned, it is Slowed 2 for 1 minute." (a row's note Effect, the GM's until now)
const RECOVERS = new RegExp(String.raw`^When it recovers from being (${CONDITIONS}), it is (${CONDITIONS})(?: (\d+))? for (\d+|one|an?) (rounds?|minutes?|hours?)\.(?: \(by hand\))?$`, "i");

// The plan → its rows' "when it recovers" note Effects as plan.afterEnds, or the same plan.
export function withAfterEnds(plan) {
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes) return plan;
    const entries = [];
    const rows = {};
    for (const [degree, row] of Object.entries(outcomes)) {
        const kept = [];
        for (const note of row?.noteEffects ?? []) {
            const match = RECOVERS.exec(said(note));
            // (Only after a condition the row itself gives.)
            if (!match || !(row.effects ?? []).some((effect) => effect?.kind === "condition" && effect.slug === match[1].toLowerCase())) {
                kept.push(note);
                continue;
            }
            entries.push({ degree, when: match[1].toLowerCase(), then: { slug: match[2].toLowerCase(), value: match[3] ? Number(match[3]) : null, duration: timeOf(match[4], match[5]) } });
        }
        rows[degree] = row?.noteEffects ? { ...row, noteEffects: kept } : row;
    }
    if (!entries.length) return plan;
    const next = { ...plan, resolution: { ...plan.resolution, outcomes: rows }, afterEnds: [...(plan.afterEnds ?? []), ...entries] };
    // (Whole once nothing else is left the GM.)
    const left = [...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(rows).flatMap((row) => [...(row?.manualInstructions ?? []), ...(row?.noteEffects ?? []).filter((note) => /\(by hand\)\.?$/.test(said(note)))])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// An option that is a condition for a time and another after it, Bestow Vim's: "The target creature becomes Quickened, and it can use the
// extra action to Stride, Strike, or attempt an Athletics check that resolves as a single action. Any Strikes made during this action …
// This effect lasts for 1 minute, after which the target creature becomes Fatigued for 1 hour." → the card at the creature its activation
// targets: the condition for its time, what the extra action is for a note Effect beside it (the user's note-Effect rule), and the one after.
const BECOMES = new RegExp(String.raw`^The target creature becomes (${CONDITIONS})(?: (\d+))?(?:, and it can use the extra action to ([^.]+))?\.$`, "i");
const LASTS = new RegExp(String.raw`^This effect lasts for (\d+|one|an?) (rounds?|minutes?|hours?), after which the target creature becomes (${CONDITIONS})(?: (\d+))? for (\d+|one|an?) (rounds?|minutes?|hours?)\.$`, "i");
// (What the extra action does: its Strikes, checks and Strides.)
const ABOUT_ACTION = /\b(?:during this action|uses the action to)\b/i;
// (The activation's own words before the option: whom it's at.)
const TARGETING = /\btargeting an? (living )?creature within (\d+) feet\b/i;
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function afterEffectPlan(html, base) {
    const body = plainOf(html).replace(/^.*?\bEffect\b\s*/s, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const becomes = sentences.map((sentence) => [sentence, BECOMES.exec(sentence)]).find(([, match]) => match);
    const lasts = sentences.map((sentence) => [sentence, LASTS.exec(sentence)]).find(([, match]) => match);
    const target = TARGETING.exec(body);
    if (!becomes || !lasts || !target) return null;
    // (Every other sentence the option's own: the extra action's, or the activation's flavor before it.)
    const at = sentences.indexOf(becomes[0]);
    const others = sentences.slice(at + 1).filter((sentence) => sentence !== lasts[0]);
    if (others.some((sentence) => !ABOUT_ACTION.test(sentence))) return null;
    const [, slug, value, action] = becomes[1];
    const [, amount, unit, after, afterValue, afterAmount, afterUnit] = lasts[1];
    const duration = timeOf(amount, unit);
    const limit = [action ? `Its extra action: to ${action}.` : null, ...others].filter(Boolean).join(" ");
    const success = { ...none(), effects: [{ kind: "condition", slug: slug.toLowerCase(), value: value ? Number(value) : null, duration }], ...(limit ? { noteEffects: [{ label: `${slug.charAt(0).toUpperCase()}${slug.slice(1).toLowerCase()}'s extra action`, text: limit, duration }] } : {}) };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: target[1] ? "1 living creature" : "1 creature", range: `${target[2]} feet`, area: null },
        trigger: { ...(base?.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success, failure: none(), criticalFailure: none() } },
        afterEnds: [{ degree: "success", when: slug.toLowerCase(), then: { slug: after.toLowerCase(), value: afterValue ? Number(afterValue) : null, duration: timeOf(afterAmount, afterUnit) } }]
    };
}

// A death at 0 Hit Points from its damage, Heart of Sarnax's Crush Heart (death): "A creature reduced to 0 HP by this damage is slain." The
// core's postDamageTerminal { kind: "death", threshold: 0 } — the save family's death change once that damage leaves it at 0, which the
// ability module plays. Before, the sentence was dropped unread.
const SLAIN = /\bA creature reduced to 0 (?:HP|Hit Points) by this damage (?:is slain|dies instantly)(?:; this is a death effect)?\./i;
export function withSlain(plan, html) {
    const resolution = plan?.resolution;
    if (resolution?.kind !== "save" || resolution.postDamageTerminal || !resolution.sharedDamage?.components?.length || !SLAIN.test(plainOf(html))) return plan;
    const sentence = SLAIN.exec(plainOf(html))[0];
    const notes = (plan.notes ?? []).filter((note) => !said(note).includes(sentence.replace(/\.$/, "")));
    return { ...plan, resolution: { ...resolution, postDamageTerminal: { kind: "death", threshold: 0 } }, ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}) };
}
