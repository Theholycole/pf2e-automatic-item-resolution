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
// (A check link with no label — "@Check[fortitude|dc:35] save" — its save's name.)
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@Check\[(?:type:)?(\w+)[^\]]*\]/g, (all, type) => type.charAt(0).toUpperCase() + type.slice(1)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

// What follows the card's own results (2026-10-26):
// - destroyed on a failed save, Celestial Peachwood Sword's Violent Exorcism (its undead destroyed unless its Fortitude save succeeds):
//   the failure rows' terminal death (the core's), which the ability module plays;
// - its user's backlash then, "If the undead fails its saving throw and is destroyed, you suffer a backlash, taking 1d6 void damage per level of
//   the destroyed undead": plan.backlash { degrees, perLevel, type } — rolled on its user once the card is applied, by that creature's level
//   (scripts/after-ends.js);
// - its user's healing from the damage the card dealt, Horns of Naraga's "If you are an undead, you regain Hit Points equal to the void damage
//   the creature took": plan.drain { fraction: 1, type, heal: true, immediate: true, onlyIf: "undead" } — the damage the card applies seen by
//   the item module's damage listener as it lands, the Hit Points the creature lost given back to its user (scripts/drain.js).
const DESTROYED = /\bThe creature must succeed at a (Fortitude|Reflex|Will) save or be destroyed\./i;
const BACKLASH = /\bIf the undead fails its saving throw and is destroyed, you suffer a backlash, taking (\d+d\d+) (\w+) damage per level of the destroyed undead\./i;
const REGAIN = /^If you are an? (undead), you regain Hit Points equal to the (\w+) damage the creature took\.$/i;
// - its user's healing and the same amount as damage to a creature, Swarmeater's Clasp's "You recover 3d10+8 Hit Points and deal the same
//   amount of bludgeoning damage to the swarm" (its Requirements' swarm within reach): a damage card at that creature, its user healed by the
//   roll (plan.drain { fromRoll }), not by what the creature lost; not when its user has void healing, as "a vitality healing effect".
const SAME_AMOUNT = /^You recover (\d+d\d+(?:[+-]\d+)?) Hit Points and deal the same amount of (\w+) damage to the (\w+)\.$/i;
const NEAR = /\bRequirements An? (\w+) creature is within your reach\b/i;
const VITALITY = /^The Hit Point recovery is a vitality healing effect\.$/i;
const FAILURES = ["failure", "criticalFailure"];
export function withAfterApplied(plan, html) {
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes) return plan;
    const text = plainOf(html);
    let next = plan;
    const read = [];
    // (Its failures' death the ability compiler's own reading, or this one's.)
    if (plan.resolution.kind === "save" && DESTROYED.test(text) && FAILURES.every((degree) => outcomes[degree] && (outcomes[degree].terminal?.kind === "death" || (!outcomes[degree].terminal && !(outcomes[degree].effects ?? []).length)))) {
        next = { ...next, resolution: { ...next.resolution, outcomes: { ...next.resolution.outcomes, ...Object.fromEntries(FAILURES.map((degree) => [degree, { ...next.resolution.outcomes[degree], terminal: { kind: "death" } }])) } } };
        read.push(DESTROYED.exec(text)[0]);
        const backlash = BACKLASH.exec(text);
        if (backlash) {
            next = { ...next, backlash: { degrees: FAILURES, perLevel: backlash[1], type: backlash[2].toLowerCase() } };
            read.push(backlash[0]);
        }
    }
    const regain = [...(plan.notes ?? [])].map((note) => REGAIN.exec(said(note))).find(Boolean);
    if (regain && Object.values(outcomes).some((row) => row?.damage?.mode === "shared")) {
        next = { ...next, drain: { fraction: 1, type: regain[2].toLowerCase(), duration: null, heal: true, immediate: true, onlyIf: regain[1].toLowerCase() } };
        read.push(regain[0]);
    }
    const same = (plan.unread ?? []).map((entry) => SAME_AMOUNT.exec(said(entry))).find(Boolean);
    const near = NEAR.exec(text);
    const heal = outcomes.success?.effects?.find((effect) => effect?.kind === "heal" && effect.formula === same?.[1]);
    if (same && heal && near && near[1].toLowerCase() === same[3].toLowerCase() && plan.resolution.kind === "check" && Object.keys(outcomes).length === 1) {
        const type = same[2].toLowerCase();
        const vitality = (plan.unread ?? []).find((entry) => VITALITY.test(said(entry)));
        next = {
            ...next,
            targeting: { target: `1 ${near[1].toLowerCase()} creature`, range: "melee", area: null },
            resolution: { ...next.resolution, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: same[1], type, category: null }] }, outcomes: { success: { ...outcomes.success, damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: outcomes.success.effects.filter((effect) => effect !== heal) } } },
            drain: { fraction: 1, type, duration: null, heal: true, immediate: true, fromRoll: true, ...(vitality ? { vitality: true } : {}) }
        };
        read.push(same[0], ...(vitality ? [said(vitality)] : []));
    }
    if (!read.length) return plan;
    const gone = (entry) => read.some((sentence) => said(entry).replace(/^\{target\}:\s*/, "").replace(/\s*\(by hand\)\.?$/, "").replace(/\.$/, "") === sentence.replace(/\.$/, ""));
    if (next.unread) {
        const unread = next.unread.filter((entry) => !gone(entry));
        next = { ...next, unread: unread.length ? unread : undefined };
    }
    const notes = (next.notes ?? []).filter((note) => !gone(note));
    const rows = Object.fromEntries(Object.entries(next.resolution.outcomes).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: row.manualInstructions.filter((line) => !gone(line)) } : row]));
    for (const row of Object.values(rows)) if (row?.manualInstructions && !row.manualInstructions.length) delete row.manualInstructions;
    next = { ...next, notes: notes.length ? notes : undefined, resolution: { ...next.resolution, outcomes: rows } };
    const left = [...notes, ...(next.unread ?? []), ...Object.values(rows).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// Two more after a save card (2026-10-26), Cauthooj Bagpipes' Disorienting Fugue:
// - a longer immunity on one degree, "Critical Success The target is unaffected and its temporary immunity to Disorienting Fugue increases to
//   1 hour": plan.immunityLonger { criticalSuccess: { value, unit } } — the ability module's "Immune:" Effect lengthened once the card is
//   applied (scripts/after-ends.js);
// - a confused creature attacking itself, "Critical Failure The target is confused for 1 round and immediately attacks itself (in the normal
//   fashion for attacking oneself while confused)": plan.selfAttack { degrees } — its own first melee Strike's damage rolled and applied to it
//   (PF2e's confused: an attack on itself hits), once the card is applied. Before, that sentence was dropped unread.
const LONGER = /^\{target\} \((critical success|success|failure)\): The target is unaffected and its temporary immunity to [^.]+? increases to (\d+|one|an?) (hours?|minutes?)\.$/i;
const ATTACKS_ITSELF = /\bimmediately attacks itself\b/i;
const DEGREE_KEYS = { "critical success": "criticalSuccess", success: "success", failure: "failure", "critical failure": "criticalFailure" };
export function withSaveAfterApplied(plan, html) {
    const rows = plan?.resolution?.outcomes;
    if (plan?.resolution?.kind !== "save" || !rows) return plan;
    let next = plan;
    const immunity = plan.trigger?.immunity;
    for (const [degree, row] of Object.entries(rows)) {
        const lines = row?.manualInstructions ?? [];
        const found = lines.map((line) => [line, LONGER.exec(said(line))]).find(([, match]) => match);
        if (!found || !immunity || DEGREE_KEYS[found[1][1].toLowerCase()] !== degree) continue;
        const [line, match] = found;
        const time = timeOf(match[2], match[3]);
        // (Its own field: the immunity reader, later, writes trigger.immunity anew.)
        next = { ...next, immunityLonger: { ...(next.immunityLonger ?? {}), [degree]: { value: time.value, unit: time.unit } }, resolution: { ...next.resolution, outcomes: { ...next.resolution.outcomes, [degree]: { ...next.resolution.outcomes[degree], manualInstructions: lines.filter((one) => one !== line).length ? lines.filter((one) => one !== line) : undefined } } } };
    }
    // (Its critical failure's paragraph says it attacks itself, and the row is Confused.)
    const paragraph = /<p>\s*<strong>\s*Critical Failure\s*<\/strong>([\s\S]*?)<\/p>/i.exec(String(html ?? ""))?.[1] ?? "";
    if (ATTACKS_ITSELF.test(paragraph) && (rows.criticalFailure?.effects ?? []).some((effect) => effect?.slug === "confused")) next = { ...next, selfAttack: { degrees: ["criticalFailure"] } };
    if (next === plan) return plan;
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(next.resolution.outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// A flat check to Cast a Spell, its DC and time by degree (2026-10-26): Blessed Lantern Flail's Purge Unholy Magic, "Success Until the beginning
// of your next turn, the creature must succeed at a DC 5 flat check to Cast a Spell. Failure As success, but the effect lasts for 1 minute.
// Critical Failure As failure, but the DC of the flat check is 11." plan.castFlatCheck { degree: { dc, duration } }: once the card is applied,
// an Effect on each creature of those degrees that the spell module's casting rules read (its runtime castFlatCheck flag: a failed flat check
// loses the spell) — scripts/after-ends.js. Its rows' GM lines are no longer.
const FLAT_SUCCESS = /^\{target\} \(success\): Until the beginning of your next turn, the creature must succeed at a DC (\d+) [Ff]lat(?: check)? to Cast a Spell\.$/;
const FLAT_FAILURE = /^\{target\} \(failure\): As success, but the effect lasts for (\d+|one|an?) (minutes?|rounds?)\.(?: \(success: [^)]*\))?$/;
const FLAT_CRITICAL = /^\{target\} \(critical failure\): As failure, but the DC of the flat check is (\d+)\.(?: \(failure: [^)]*\))?$/;
export function withCastFlatCheck(plan) {
    const rows = plan?.resolution?.outcomes;
    if (plan?.resolution?.kind !== "save" || !rows) return plan;
    const line = (degree, pattern) => (rows[degree]?.manualInstructions ?? []).map((one) => pattern.exec(said(one))).find(Boolean);
    const success = line("success", FLAT_SUCCESS);
    if (!success) return plan;
    const failure = line("failure", FLAT_FAILURE);
    const critical = failure ? line("criticalFailure", FLAT_CRITICAL) : null;
    const turn = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
    const longer = failure ? timeOf(failure[1], failure[2]) : null;
    const checks = { success: { dc: Number(success[1]), duration: turn }, ...(failure ? { failure: { dc: Number(success[1]), duration: longer } } : {}), ...(critical ? { criticalFailure: { dc: Number(critical[1]), duration: longer } } : {}) };
    const patterns = { success: FLAT_SUCCESS, failure: FLAT_FAILURE, criticalFailure: FLAT_CRITICAL };
    const outcomes = Object.fromEntries(Object.entries(rows).map(([degree, row]) => {
        if (!checks[degree] || !row?.manualInstructions) return [degree, row];
        const kept = row.manualInstructions.filter((one) => !patterns[degree].test(said(one)));
        return [degree, { ...row, manualInstructions: kept.length ? kept : undefined }];
    }));
    const next = { ...plan, castFlatCheck: checks, resolution: { ...plan.resolution, outcomes } };
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// A reward for felling the creature marked (2026-10-26): Doom Switch's Bragging Rights, "Critical Success You and your allies gain a +1 status
// bonus to attack rolls against the target for 1 minute. If you reduce the target to 0 Hit Points during this time, you gain temporary Hit
// Points equal to twice the target's level for 1 round. Success As critical success, except you gain temporary Hit Points equal to the
// target's level." plan.felled { lasts, temp: { criticalSuccess: 2, success: 1 } (times the target's level), tempLasts }: once the card at the
// creature is applied, the creature is marked for that time; damage its user deals that leaves it at 0 Hit Points gives its user those
// temporary Hit Points (scripts/felled.js). Before, both were the GM's.
const FELLED = /\bIf you reduce the target to 0 Hit Points during this time, you gain temporary Hit Points equal to (twice )?the target's level for (\d+|one|an?) (rounds?|minutes?)\./i;
const FELLED_AS = /\bSuccess As critical success, except you gain temporary Hit Points equal to (twice )?the target's level\./i;
const DURING = /\bfor (\d+|one|an?) (rounds?|minutes?|hours?)\. If you reduce the target to 0 Hit Points during this time\b/i;
export function withFelledReward(plan, html) {
    const outcomes = plan?.resolution?.outcomes;
    const text = plainOf(html);
    const felled = FELLED.exec(text);
    const during = DURING.exec(text);
    if (!outcomes?.criticalSuccess || !felled || !during) return plan;
    const as = FELLED_AS.exec(text);
    const temp = { criticalSuccess: felled[1] ? 2 : 1, ...(as ? { success: as[1] ? 2 : 1 } : {}) };
    const gone = (entry) => /\breduce the target to 0 Hit Points during this time\b|\bOn a success, instead: you gain temporary Hit Points equal to\b/i.test(said(entry));
    const notes = (plan.notes ?? []).filter((note) => !gone(note));
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: row.manualInstructions.filter((line) => !gone(line)) } : row]));
    for (const row of Object.values(rows)) if (row?.manualInstructions && !row.manualInstructions.length) delete row.manualInstructions;
    const next = { ...plan, notes: notes.length ? notes : undefined, resolution: { ...plan.resolution, outcomes: rows }, felled: { lasts: timeOf(during[1], during[2]), temp, tempLasts: timeOf(felled[2], felled[3]) } };
    const left = [...notes, ...(next.unread ?? []), ...Object.values(rows).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
