// A dead creature brought back to life, and a body made young (2026-10-27, docs/needs.md "dying" and "afflictions"):
// - Elixir of Rejuvenation's "You can instead administer this elixir to a creature that has been dead for a week or less. When you do, that
//   creature is instantly brought back to life with 1 Hit Point and no spell slots, Focus Points, or other daily resources" — the ways card: drunk,
//   its restore as read (src/compiler/restore.js); given to the dead, item.revive { hp, words }.
// - Gift of the Poisoned Heart's "place it on the relatively intact body of a creature that died within the past year. The stone shatters,
//   restoring the recipient to life with the effects of a successful Resurrect ritual, except there's no limit to the level of the creature that
//   can be revived" — Resurrect's success: 1 Hit Point, no spells prepared or points in its pools, and Clumsy 1, Drained 1 and Enfeebled 1 for a
//   week that can't be removed or reduced (item.revive.debilitation, PF2e's GrantItem on an Effect for the week); its curse, the revived's
//   paranoia, a note Effect on it until magic such as Cleanse Affliction ends it (the user's ruling for minds).
// Live play (scripts/revive.js) brings the creature the card is given to back: PF2e's dead status off, Dying and Unconscious gone, its Hit
// Points set, its Focus Points spent, and a note Effect saying what else it lacks. Whether it died recently enough is the GM's, a line.
// - Sun Orchid Elixir's "Any physical or mental imperfections- including scars, lost limbs, and curses, diseases, poisons of 20th level or lower-
//   are removed, and you regain your full Hit Points" — Elixir of Rejuvenation's restore (item.restore), its youth, age and memories lines of the
//   card (an appearance, out of combat). Pure.

import { conditionUuid } from "./row-readings.js";
import { plainText } from "./rows.js";
import { restorePlan } from "./restore.js";

const ELIXIR = /^You can instead administer this elixir to a creature that has been dead for (a week|\d+ days) or less\. When you do, that creature is instantly brought back to life with (\d+) Hit Points? and no spell slots, Focus Points, or other daily resources\.$/i;
const GIFT = /\bTo activate the diamond, place it on the relatively intact body of a creature that died within the past year\. The stone shatters, restoring the recipient to life with the effects of a successful Resurrect ritual, except there's no limit to the level of the creature that can be revived\. This gift of life comes with a terrible cost: the recipient believes you\s*[-–—]\s*and anyone else who aided in the resurrection\s*[-–—]\s*deliberately caused their death and revived them only in furtherance of some nefarious scheme\. Having a proxy activate the gift of the poisoned heart is of no use, as the item's magic sniffs out all coconspirators and uses your attempt to avoid the drawback to feed the resurrected creature's paranoia\. No amount of information or persuasion can alleviate this mistrust, as the cursed creature twists the facts endlessly to fit their delusion\. Only magic such as Cleanse Affliction can neutralize this effect, and the subject resists any attempt to alter their beliefs by magic\.$/i;
const GIFT_FLAVOR = /^Activate 1 minute \(concentrate, manipulate\) Those who fail to see the curse view this object as a priceless gift, capable of restoring life to the deceased, but deep in the heart of this diamond lies a single flaw: a fissured occlusion of sickly, tainted red\.\s*/i;
const ORCHID = [
    /^Activate\s*(?:Interact\s*)?When you drink this elixir, you physically become as you were in whatever phase of your youth you desire\./i,
    /^Your new body begins in peak health, regardless of what your actual condition was at that age\./i,
    /^Any physical or mental imperfections\s*[-–—]?\s*including scars, lost limbs, and curses, diseases, poisons of (\d+)(?:st|nd|rd|th) level or lower\s*[-–—]?\s*are removed, and you regain your full Hit Points\./i,
    /^You immediately begin to age normally again, with your natural lifespan extended as if you had never aged past your new apparent age\./i,
    /^You retain all your memories\./i,
    /^Unlike Crafting most items, brewing the sun orchid elixir takes (\d+) months?'s? time\./i,
    /^While an individual vial of sun orchid elixir isn't unique, the formula is unique, and it's known only to Artokus Kirran of Thuvia\./i
];
// (Resurrect's success, its "temporarily debilitated" week.)
const RESURRECTED = { days: 7, conditions: [{ slug: "clumsy", value: 1 }, { slug: "drained", value: 1 }, { slug: "enfeebled", value: 1 }] };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// A plan of its own that brings the creature it's given to back.
function revivePlan(base, revive, { notes = [], noteEffects = [] } = {}) {
    return {
        ...base,
        builtin: undefined,
        automation: { level: "automatic" },
        targeting: { target: "the drinker", range: null, area: null },
        trigger: { ...(base?.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects } } },
        notes,
        item: { ...(base?.item ?? {}), recipient: "drinker", revive }
    };
}

// The plan, the item's html, and its base plan (one where none was read) → the plan, or the same plan.
export function withRevival(plan, html, base = null) {
    const text = plainText(html);
    // (Elixir of Rejuvenation: its restore's plan, the revival its notes.)
    const elixir = plan?.item?.restore ? (plan.notes ?? []).map(said).join(" ") : "";
    const raised = ELIXIR.exec(elixir.trim());
    if (raised) {
        const { notes: _notes, partial: _partial, ...drink } = plan;
        const time = /week/i.test(raised[1]) ? "a week" : raised[1];
        const back = revivePlan({ ...drink, item: { ...drink.item, restore: undefined } }, { hp: Number(raised[2]), words: "Back from death without its daily resources: no spell slots or Focus Points, nor any other" }, { notes: [`Only a creature dead for ${time} or less (the GM's).`] });
        return { ...drink, builtin: "ways", automation: { level: "automatic" }, ways: [{ name: "Drink it", html: "", plan: { ...drink, automation: { level: "automatic" } } }, { name: "On a dead creature", html: "", plan: back }], once: true };
    }
    if (!plan && base && GIFT.test(text.replace(GIFT_FLAVOR, "").trim()) && GIFT_FLAVOR.test(text)) {
        const curse = { label: "The poisoned heart's curse", text: "It believes whoever revived it, and anyone who helped, caused its death on purpose and brought it back for some scheme; nothing they say or show changes that, and it resists magic that would change its beliefs. Only magic such as Cleanse Affliction ends this.", duration: null };
        const rules = RESURRECTED.conditions.map((condition) => ({ key: "GrantItem", uuid: conditionUuid(condition.slug), onDeleteActions: { grantee: "restrict" }, alterations: [{ mode: "override", property: "badge-value", value: condition.value }] }));
        return revivePlan(base, { hp: 1, words: "Back from death as by a successful Resurrect: no spells prepared or points in its pools", debilitation: { days: RESURRECTED.days, words: "Debilitated by the time in the Boneyard: Clumsy 1, Drained 1 and Enfeebled 1 for the week, which can't be removed or reduced until it's passed", rules } }, {
            notes: ["Only on the relatively intact body of a creature that died within the past year (the GM's); any level can be revived.", "Using someone else to activate it doesn't escape the curse: the magic finds everyone involved."],
            noteEffects: [curse]
        });
    }
    if (!plan && base) {
        let rest = text.trim();
        let level = null;
        for (const [index, pattern] of ORCHID.entries()) {
            const found = pattern.exec(rest);
            if (!found) return plan;
            if (index === 2) level = Number(found[1]);
            rest = rest.slice(found[0].length).trim();
        }
        if (rest || !level) return plan;
        const month = ORCHID[5].exec(text.slice(text.search(/Unlike Crafting/i)))?.[1] ?? "1";
        const restored = restorePlan({ ...base, item: { ...(base.item ?? {}), restore: { hp: "max", afflictions: { level } } } });
        const { partial: _partial, ...whole } = restored;
        return { ...whole, automation: { level: "automatic" }, notes: ["Its drinker's body becomes as it was at any age of its youth it wants, in peak health, scars and lost limbs gone; it keeps its memories and ages normally from there, its lifespan extended (out of combat).", `Brewing it takes ${month === "1" ? "a month" : `${month} months`}, and only Artokus Kirran of Thuvia knows its formula.`] };
    }
    return plan;
}
