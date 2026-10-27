// A brew that turns its drinker into an animal (2026-10-27, docs/needs.md): Bloodhammer Reserve's "you transform into an animal, gaining the
// effects of Animal Form except you can't Dismiss the effect, and you transform into a random animal battle form. To determine the battle form,
// roll 1d10 (1 = ape, 2 = bear, 3 = bull, 4 = canine, 5 = cat, 6 = deer, 7 = frog, 8 = shark, 9 = snake, 10 = reroll)"; the Select's "you
// can choose which battle form you take and the temporary Hit Points you gain from the battle form increase to 10"; the Black Label's "you gain
// the effects of 4th-rank animal form, can choose which battle form you take, and the temporary Hit Points … increase to 20". PF2e has a Spell
// Effect for each of Animal Form's battle forms ("Spell Effect: Animal Form (Bull)", its BattleForm by rank): the Reserve's roll is the table
// card (its 10's reroll a d9 over the nine), the others' choice the ways card, each way that form's Effect on the drinker at the brew's rank,
// its BattleForm's temporary Hit Points the brew's (application.battleTempHP, src/live/card.js). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const BREW = /\bAfter drinking the brew, you transform into an animal, gaining the effects of Animal Form except you can't Dismiss the effect\b/i;
const RANDOM = /\band you transform into a random animal battle form\. To determine the battle form, roll (?:1d10|\[\[\/r 1d10[^\]]*\]\])\s*\(((?:\d+ = [a-z]+,? ?)+)\)\./i;
const CHOOSE = /\bWhen you consume the brew, (?:you gain the effects of (\d+)(?:st|nd|rd|th)-rank animal form\s*,\s*)?(?:you )?can choose which battle form you take\s*,? and the temporary Hit Points you gain from the battle form increase to (\d+)\./i;
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// One form's plan: its Spell Effect on the drinker at the rank, its temporary Hit Points the brew's.
function formPlan(base, form, effect, rank, tempHP) {
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: effect.uuid, label: effect.name, recipients: "target", level: rank, ...(tempHP ? { battleTempHP: tempHP } : {}) }] },
        notes: ["It can't be Dismissed."]
    };
}

// The item, its plan's base and the options (PF2e's Spell Effects by name) → its plan, or null.
export function animalBrewPlan(item, base, options = {}) {
    const text = plainText(item?.system?.description?.value);
    if (item?.type !== "consumable" || !BREW.test(text)) return null;
    const effects = options.spellEffects ?? {};
    const effectOf = (form) => effects[`animal form (${form})`] ?? null;
    const random = RANDOM.exec(text);
    if (random) {
        const listed = [...random[1].matchAll(/(\d+) = ([a-z]+)/gi)].map(([, roll, form]) => ({ roll: Number(roll), form: form.toLowerCase() }));
        const forms = listed.filter((entry) => entry.form !== "reroll");
        if (!forms.length || forms.some((entry) => !effectOf(entry.form))) return null;
        // (Its 10 rerolled: a d9 over the nine forms, in order.)
        const rows = forms.map((entry, index) => ({ low: index + 1, high: index + 1, text: `${capital(entry.form)} battle form`, plan: formPlan(base, entry.form, effectOf(entry.form), 2, null) }));
        return { ...base, modelVersion: MODEL_VERSION, builtin: "table", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, table: { die: `1d${rows.length}`, rows }, notes: [`Its form is rolled: the text's 1d10 with a 10 rolled again is a 1d${rows.length} over the ${rows.length} forms.`, "It can't be Dismissed."] };
    }
    const choose = CHOOSE.exec(text);
    if (!choose) return null;
    const rank = Number(choose[1]) || 2;
    const tempHP = Number(choose[2]);
    const forms = Object.keys(effects).map((key) => /^animal form \(([a-z ]+)\)$/.exec(key)?.[1]).filter(Boolean).sort();
    if (!forms.length) return null;
    const ways = forms.map((form) => ({ name: `${capital(form)} battle form`, html: "", plan: formPlan(base, form, effectOf(form), rank, tempHP) }));
    return { ...base, modelVersion: MODEL_VERSION, builtin: "ways", once: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, notes: [`Its drinker picks the battle form: Animal Form at rank ${rank}, its temporary Hit Points ${tempHP}.`, "It can't be Dismissed."] };
}
