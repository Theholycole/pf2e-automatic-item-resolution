// One affliction on a creature, saved against or counteracted now — ended, or only held off for a time (2026-10-27, docs/needs.md
// "afflictions"): the counteract card (src/live/counteract-card.js, scripts/counteract.js) listing the creature's curses, diseases and poisons —
// PF2e's affliction items and the Effects Pseudo Afflictions tracks them with — with what each does on a success:
// - a save against one, at its DC (counteract.save { maxLevel }): Affliction Suppressant (Major)'s "When you drink the affliction suppressant, you
//   can attempt a save against one affliction of 14th level or lower affecting you. If you succeed, the affliction is suppressed for 10 minutes",
//   Antidote (Major)'s "the poison is neutralized", Antiplague (Major)'s "you are cured of the disease" (their bonus the item card's, the save's
//   card beside it), and Mantle of Amazing Health's "immediately attempt a saving throw to end the effect … Furthermore, you gain immunity to
//   that poison or disease for 24 hours" (counteract.immunity, a note Effect naming it);
// - held off rather than removed (counteract.suppress { value, unit, stageDown?, words }): Razmiri Wayfinder's "On a success, you halt the
//   effects of the poison or disease for 1 day, rather than removing it", and Razmiri Mask's Call Upon Razmir's Mercy — its Cleanse Affliction
//   at half its user's level, which "doesn't reduce the stage of the affliction; instead, if the counteract check is successful, the
//   affliction's stage is temporarily reduced by 1 and its effects are suppressed for 24 hours": its stage lowered and a note Effect on the
//   creature for that time saying what's held off and what follows it (PF2e and Pseudo Afflictions have no pause of their own). The spell's
//   counteract by its rank (counteract.afflictionsByRank: disease or poison from rank 3, a curse too from rank 4), its modifier the item's
//   level's DC less 10 (the user's answer to question 5, 2026-10-26), the card saying the GM may change it. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { LEVEL_DCS } from "./counteract.js";
import { plainText } from "./rows.js";

const KINDS = ["curse", "disease", "poison"];
const count = (word) => ({ one: 1, a: 1, an: 1 }[String(word).toLowerCase()] ?? Number(word));
const unitOf = (word) => (/^min/i.test(word) ? "minutes" : /^hour/i.test(word) ? "hours" : /^day/i.test(word) ? "days" : "rounds");
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const levelModifier = (level) => (LEVEL_DCS[Math.max(0, Math.min(25, Number(level) || 0))] ?? 14) - 10;
const timeWords = ({ value, unit }) => `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;

// --- A save against one, on drinking it --------------------------------------------------------------------------------------------------
const SAVE_ONE = /\byou can (?:immediately )?attempt a sav(?:e|ing throw) against one (affliction|poison|disease|curse) of (\d+)(?:st|nd|rd|th) level or lower affecting you\.\s*If you succeed, (the poison is neutralized|you are cured of the disease|the affliction is suppressed for (\d+|one|an?) (minutes?|hours?|days?))\.(\s*The affliction's duration doesn't elapse during this time, but its symptoms are suppressed\.)?/i;
const SUPPRESSED_WORDS = "suppressed: its symptoms (its stage's conditions and damage) don't apply, and its duration doesn't elapse";

// The plan and the item's html → the plan with its save's card (item.counteract) beside its own, or the same plan.
export function withSaveAgainstOne(plan, html) {
    const text = plainText(html);
    const found = SAVE_ONE.exec(text);
    if (!found || !plan || plan.item?.counteract || plan.builtin) return plan;
    const [, kind, level, outcome, amount, unit, symptoms] = found;
    if (/suppressed/i.test(outcome) && !symptoms) return plan;
    const suppress = amount ? { value: count(amount), unit: unitOf(unit), words: SUPPRESSED_WORDS } : null;
    const counteract = { save: { maxLevel: Number(level) }, conditions: [], traits: [], afflictions: kind.toLowerCase() === "affliction" ? KINDS : [kind.toLowerCase()], pick: "one", ...(suppress ? { suppress } : {}) };
    // (Its sentence and the ones after it, no longer left: "When you drink …, you can attempt a save against one affliction …".)
    const ours = (entry) => found[0].includes(said(entry).replace(/^When you drink the [\w' -]+?, /i, "").slice(0, 60));
    const unread = (plan.unread ?? []).filter((entry) => !ours(entry));
    const outcomes = plan.resolution?.outcomes;
    const left = unread.length || (plan.notes ?? []).length || Object.values(outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    // (The whole text's reminder, a partial plan's, gone once nothing else is left.)
    const kept = !left && outcomes ? Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((note) => !note.reminder) } : row])) : outcomes;
    const { unread: _unread, ...rest } = plan;
    return {
        ...rest,
        ...(unread.length ? { unread } : {}),
        ...(kept ? { resolution: { ...plan.resolution, outcomes: kept } } : {}),
        item: { ...(plan.item ?? {}), counteract },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

// An activation's plan of its own: its source, time and traits, its frequency kept from the plan it replaces.
function activationPlan(plan, item, entry, counteract, notes = []) {
    const activation = entry?.activation ?? {};
    return {
        modelVersion: MODEL_VERSION,
        source: plan?.source ?? { name: `${item.name}${activation.name ? `: ${activation.name}` : ""}`, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits: [...(item.system?.traits?.value ?? [])],
        activation: { time: activation.time ?? null, traits: activation.traits ?? [] },
        builtin: "counteract",
        automation: { level: "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { ...(plan?.trigger ?? {}), event: "use" },
        ...(notes.length ? { notes } : {}),
        item: { ...(plan?.item ?? { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: "user" }), counteract }
    };
}

// --- A save to end one, and immunity to it after -----------------------------------------------------------------------------------------
const SAVE_ENDS = /^Effect If you're currently afflicted by a (poison|disease) or a (poison|disease), you can hold the cloak tight to your body and immediately attempt a saving throw to end the effect\. If that saving throw succeeds, you end the effect of either the poison or disease no matter the stage of the affliction\. Furthermore, you gain immunity to that poison or disease for (\d+) (hours?|days?)\.$/i;

function withSaveToEnd(plan, item, entry) {
    const text = plainText(entry?.activation?.html).replace(/^.*?(?=\bEffect\b)/s, "").trim();
    const found = SAVE_ENDS.exec(text);
    if (!found) return null;
    const immunity = { value: Number(found[3]), unit: unitOf(found[4]) };
    return activationPlan(plan, item, entry, { save: { maxLevel: null }, conditions: [], traits: [], afflictions: [found[1].toLowerCase(), found[2].toLowerCase()].sort(), pick: "one", self: true, immunity });
}

// --- A counteract that halts one instead of removing it ----------------------------------------------------------------------------------
const HALTS = /^Effect You touch an adjacent creature and attempt a counteract check against one (poison|disease) or (poison|disease) afflicting the creature\. On a success, you halt the effects of the poison or disease for (\d+|one|an?) (days?|hours?|minutes?), rather than removing it\. This temporarily relieves any penalties imposed by the affliction but doesn't cure the effect or count against its duration; the poison or disease is merely halted for a time, and it resumes where it left off once this effect ends\.$/i;

function withHalted(plan, item, entry) {
    const text = plainText(entry?.activation?.html).replace(/^.*?(?=\bEffect\b)/s, "").trim();
    const found = HALTS.exec(text);
    if (!found) return null;
    const level = Number(item.system?.level?.value) || 0;
    const modifier = levelModifier(level);
    const suppress = { value: count(found[3]), unit: unitOf(found[4]), words: "halted: its penalties don't apply and this time doesn't count toward its duration; it resumes where it left off once this ends" };
    return activationPlan(plan, item, entry, { modifier, rank: Math.max(1, Math.ceil(level / 2)), conditions: [], traits: [], afflictions: [found[1].toLowerCase(), found[2].toLowerCase()].sort(), pick: "one", within: 5, suppress, notes: [`Its counteract modifier +${modifier}: the item gives none, so its level's DC less 10 (the GM's call).`] });
}

// --- Cleanse Affliction that only suppresses ---------------------------------------------------------------------------------------------
const MERCY = [
    /^Effect Exhorting Razmir to purge impurities from your target, you lay hands on a creature within reach and cast Cleanse Affliction as an occult spell with a spell rank equal to half your level\./i,
    /^Unlike a normal cleanse affliction spell, this doesn't reduce the stage of the affliction; instead, if the counteract check is successful, the affliction's stage is temporarily reduced by 1 and its effects are suppressed for (\d+) (hours?|days?), after which the affliction resumes in full force\./i,
    /^If the target would have been required to attempt additional saves against the affliction during the \1 \2 it was suppressed, they must attempt all of those saving throws as soon as the \1-\w+ duration ends\./i,
    /^This could mean that the target saves successfully and it is as if the affliction were truly healed, or it could mean that the affliction returns and advances multiple stages all at once\./i
];

function withMercy(plan, item, entry) {
    let text = plainText(entry?.activation?.html).replace(/^.*?(?=\bEffect\b)/s, "").trim();
    let time = null;
    for (const [index, pattern] of MERCY.entries()) {
        // (The time the second sentence gives, the third's own.)
        const source = index === 2 && time ? new RegExp(pattern.source.replace(/\\1/g, time[0]).replace(/\\2/g, time[1]), "i") : pattern;
        const found = source.exec(text);
        if (!found) return null;
        if (index === 1) time = [found[1], found[2]];
        text = text.slice(found[0].length).trim();
    }
    if (text) return null;
    const level = Number(item.system?.level?.value) || 0;
    const modifier = levelModifier(level);
    const suppress = { value: Number(time[0]), unit: unitOf(time[1]), stageDown: 1, words: "suppressed, its stage lowered by 1 for now: its effects don't apply. When this ends it resumes in full force — its stage raised again — and every save it would have called for meanwhile is rolled at once" };
    return activationPlan(plan, item, entry, {
        modifier,
        rank: null,
        fromUser: { rank: "half-level" },
        conditions: [],
        traits: [],
        afflictions: [],
        afflictionsByRank: [{ rank: 3, afflictions: ["disease", "poison"] }, { rank: 4, afflictions: KINDS }],
        pick: "one",
        within: 5,
        suppress,
        notes: [`Its counteract modifier +${modifier}: the item gives none, so its level's DC less 10 (the GM's call).`, "Cleanse Affliction at half its user's level: below rank 3 it counteracts nothing; a disease or poison from rank 3, a curse too from rank 4."]
    });
}

// An activation's plan, its item and its entry → its counteract card, or the same plan.
export function withAfflictionHeldOff(plan, item, entry) {
    if (!item || !entry?.activation) return plan;
    return withSaveToEnd(plan, item, entry) ?? withHalted(plan, item, entry) ?? withMercy(plan, item, entry) ?? plan;
}
