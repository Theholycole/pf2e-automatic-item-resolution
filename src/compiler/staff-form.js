// An item that becomes a staff for a while (2026-10-29, docs/spell-module-requests.md row 15, the user's answer to question 8): Sorshen's
// Sinuous Guisarme's Arcane Shift — it transforms into the staff it names with that many charges; a Mythic Point and more charges heighten a
// spell cast from it to a rank, its DC and attack at mythic proficiency; in that form its weapon runes are off and its other activation
// refused; it reverts once its charges are spent, or when its user says so. → plan.builtin "staff-form", plan.staffForm { staff: { uuid,
// name }, charges, mythic: { charges, rank } | null, runesOff, refuses: [activation names], revertsEmpty } — scripts/staff-form.js plays
// it: the item made the staff (its Strikes the staff's, its runes off, its own kept on it to put back), an Effect on its user whose badge is
// the charges, and the staff card, the staff's spells by rank cast through the spell module at its user's own spell DC. Pure.

import { sentencesOf } from "./lasting.js";

const TRANSFORMS = /^\s*The [\w' ]+? transforms into an? (?:@UUID\[([^\]]+)\]\{([^}]+)\}|(Staff of [^.]+?)) with (\d+) charges\.$/;
const MYTHIC = /^\s*If you spend 1 Mythic Point when you Cast a Spell from this staff and expend (\d+) charges,\s+the spell is heightened to (\d+)(?:st|nd|rd|th) rank, and its save DC and attack rolls are calculated at mythic proficiency\.$/;
const RUNES_OFF = /^\s*While in [\w' ]+ form, none of the [\w' ]+? weapon runes are active\b/;
const REFUSES = /\bnor can (?:she|he|it|they) ([A-Z][a-z]+(?: [A-Z][a-z]+)*),/;
const OWN_CASTS = /\bcan use (?:her|his|its|their) actions to Cast a Spell from the staff but can't spend Mythic Points\b/;
const REVERTS = /^\s*(?:She|He|It|They) automatically reverts? to [\w' ]+ form once all (?:her|his|its|their) charges are expended\b/;

// The plan read before (none), the activation's context → the staff-form plan, or the same plan.
export function withStaffForm(plan, context = {}) {
    if (plan && !plan.noteOnly && plan.builtin !== "no-effect") return plan;
    const sentences = sentencesOf(context.words ?? context.text ?? "");
    const transforms = sentences.map((sentence) => TRANSFORMS.exec(sentence)).find(Boolean);
    if (!transforms) return plan;
    // (The staff's uuid from the words, or from the activation's own HTML when the words have only its name.)
    const name = transforms[2] ?? transforms[3];
    const linked = new RegExp(`@UUID\\[([^\\]]+)\\]\\{${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`).exec(String(context.html ?? ""));
    const uuid = transforms[1] ?? linked?.[1] ?? null;
    if (!uuid) return plan;
    const mythic = sentences.map((sentence) => MYTHIC.exec(sentence)).find(Boolean);
    const text = sentences.join(" ");
    const itemName = context.info?.name ?? context.item?.name ?? "The item";
    const refuses = [...new Set(sentences.map((sentence) => REFUSES.exec(sentence)?.[1]).filter(Boolean))];
    const notes = [
        `Its staff's spells at its user's own spell DC and attack (a spell on its user's list: a spellcasting entry of its tradition). A spontaneous caster can pay with a slot of the spell's rank and 1 charge instead.`,
        ...(OWN_CASTS.test(text) ? [`${itemName} can Cast a Spell from the staff with its own actions: its user's numbers, without a Mythic Point.`] : [])
    ];
    return {
        ...(context.base ?? {}),
        automation: { level: "automatic" },
        trigger: { event: "use", ...(context.frequency ? { frequency: context.frequency } : {}) },
        builtin: "staff-form",
        actions: null,
        targeting: { target: null, range: null, area: null },
        staffForm: {
            staff: { uuid, name },
            charges: Number(transforms[4]),
            mythic: mythic ? { charges: Number(mythic[1]), rank: Number(mythic[2]) } : null,
            runesOff: sentences.some((sentence) => RUNES_OFF.test(sentence)),
            refuses,
            revertsEmpty: sentences.some((sentence) => REVERTS.test(sentence))
        },
        notes,
        item: { ...(context.info ?? plan?.item ?? {}) }
    };
}
