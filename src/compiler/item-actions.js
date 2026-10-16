// An item used by taking a skill action with it (Onyx Panther's "use a Sneak action with a +1 item bonus", Bronze Bull
// Pendant's "attempt an Athletics check to Shove with a +1 item bonus", Yarrow-Root Bandage's "Activate Administer First
// Aid"): a builtin the item module plays with PF2e's own action (scripts/item-actions.js), the bonus as a modifier on it,
// and — for the actions the ability module compiles (Trip, Grapple, Shove, Demoralize, Feint, Administer First Aid…) —
// that action's row for the degree PF2e rolled, on its target. Not an item that links its own Effect (its bonus lives
// there), nor one whose own modifier replaces yours (third-party plants; asked of the user). Pure.

import { plainText } from "./rows.js";

// PF2e's actions by the names items use.
export const ACTION_SLUGS = Object.freeze({
    "administer first aid": "administer-first-aid", balance: "balance", climb: "climb", coerce: "coerce", "command an animal": "command-an-animal", "create a diversion": "create-a-diversion",
    demoralize: "demoralize", "disable a device": "disable-device", "disable device": "disable-device", disarm: "disarm", escape: "escape", feint: "feint", "force open": "force-open",
    "gather information": "gather-information", "grab an edge": "grab-an-edge", grapple: "grapple", hide: "hide", "high jump": "high-jump", lie: "lie", "long jump": "long-jump",
    "make an impression": "make-an-impression", "palm an object": "palm-an-object", perform: "perform", "pick a lock": "pick-a-lock", "recall knowledge": "recall-knowledge",
    reposition: "reposition", request: "request", seek: "seek", "sense direction": "sense-direction", "sense motive": "sense-motive", shove: "shove", sneak: "sneak", squeeze: "squeeze",
    steal: "steal", swim: "swim", track: "track", "treat wounds": "treat-wounds", trip: "trip", "tumble through": "tumble-through"
});
// The actions aimed at one creature: the presser's target is the DC's and the row's.
export const TARGETED = new Set(["administer-first-aid", "create-a-diversion", "demoralize", "disarm", "feint", "grapple", "reposition", "request", "coerce", "make-an-impression", "shove", "steal", "trip", "treat-wounds"]);

const NAMES = Object.keys(ACTION_SLUGS).sort((a, b) => b.length - a.length).map((name) => name.replace(/ /g, "\\s+")).join("|");
const BONUS = String.raw`with an? \+(\d+) (item|circumstance|status) bonus`;
const FORMS = [
    // "use a Sneak action with a +1 item bonus", "make a Climb action with a +1 item bonus"
    new RegExp(String.raw`\b(?:use|make|attempt) an? (${NAMES})(?: action)?(?: check)? ${BONUS}`, "i"),
    // "attempt an Athletics check to Shove with a +1 item bonus", "Attempt a Deception check to Feint with a +4 circumstance bonus"
    new RegExp(String.raw`\battempts? (?:a|an) \w+ check to (${NAMES})\b(?: (?:the|a|an|one) [\w' -]+?)? ${BONUS}`, "i"),
    // "attempt to Administer First Aid using Medicine with a +1 item bonus to the check"
    new RegExp(String.raw`\battempt to (${NAMES}) using \w+ ${BONUS}`, "i"),
    // "allowing you to attempt to Disarm it from its wielder with a +2 item bonus" (Ensnaring Disk)
    new RegExp(String.raw`\battempt to (${NAMES}) (?:it|them|the (?:triggering )?(?:creature|weapon|foe|attacker)) from its wielder ${BONUS}`, "i"),
    // "When you activate the bracelet, attempt to Escape", "When you activate it, make a Leap"
    new RegExp(String.raw`\bWhen you activate [^,.]+, (?:you (?:can )?(?:immediately )?)?(?:use|attempt|make) (?:an? |to )?(${NAMES})\b`, "i"),
    // "…, attempting an Intimidation check to Demoralize that creature", "Make an Athletics check to Disarm the attacking creature":
    // a clause of its own, a skill named.
    new RegExp(String.raw`(?:^|[.;]\s+|\bEffect\s+|,\s+)(?:attempting|[Mm]ake|[Aa]ttempt) (?:a|an) (?:Athletics|Acrobatics|Intimidation|Deception|Diplomacy|Stealth|Thievery|Medicine|Survival|Performance) check to (${NAMES})\b(?![^.]*\+\d+)(?![^.]*\b(?:up to (?:two|three|four|\d+)|each|all)\b)`, "i"),
    // "You attempt to Demoralize the foe the Strike hit", "You can activate the tiger fork to attempt to Grapple the creature": its
    // user's own, at one creature (not "The tentacle attempts to Grapple with a +13 bonus", its own check).
    new RegExp(String.raw`(?:^|[.;]\s+|\bEffect\s+)You (?:can (?:immediately )?)?(?:attempt to|activate [^,.]+? to attempt to) (${NAMES}) (?:the|that|a|an|one) (?:[\w-]+ )?(?:creature|foe|enemy|target|opponent)\b(?![^.]*\+\d+)`, "i")
];
// "Activate Administer First Aid", "Activate Treat Wounds": the action is the activation.
const ACTIVATE_LINE = new RegExp(String.raw`^\s*Activate\s+(${NAMES})\b`, "i");
// (One of several actions, the card's pick: The Bear's "You attempt to Grapple, Shove, or Trip the creature you hit … You gain
// a +2 status bonus to your check"; Blade of the Rabbit Prince's "You attempt to Trip or Disarm an opponent using Thievery
// instead of Athletics, and you add the blade of the Rabbit Prince's item bonus to the check" — that skill, the weapon's
// potency as an item bonus.)
const CHOICE = new RegExp(String.raw`\bYou (?:can )?attempt to ((?:${NAMES})(?:,\s*(?:${NAMES}))*,?\s+or\s+(?:${NAMES}))\s+(?:the|an?|one|that) [\w' -]*?(?:creature|opponent|foe|enemy|target)\b([^.]*)\.`, "i");
const CHOICE_BONUS = /\bYou gain an? \+(\d+) (status|circumstance|item) bonus to (?:your|the) check\b/i;
const ITEM_BONUS = /\badd the [\w' -]+? item bonus to the check\b/i;
const USING = /\busing (Athletics|Acrobatics|Thievery|Deception|Intimidation|Stealth|Diplomacy|Performance) instead of (?:Athletics|Acrobatics|Thievery|Deception|Intimidation)\b/i;

// Items whose words the readers don't take, by slug — see docs/mechanics.md:
//   { slugs: ["trip", "disarm"], bonus?: { value, type }, statistic?: "thievery" }   one of several actions, picked on the card;
//   { slug: "shove", minimum: { value: 5, skill: "athletics" } }                     an action at the item's modifier when higher.
export const EXTRA = Object.freeze({});
function extraAction(entry) {
    const slugs = entry.slugs ?? [entry.slug];
    const names = slugs.map((slug) => Object.entries(ACTION_SLUGS).find(([, value]) => value === slug)?.[0] ?? slug).map((name) => name.replace(/\b\w/g, (letter) => letter.toUpperCase()));
    return { slug: slugs[0], name: names[0], ...(slugs.length > 1 ? { slugs, names } : {}), bonus: entry.bonus ?? null, ...(entry.statistic ? { statistic: entry.statistic } : {}), ...(entry.minimum ? { minimum: entry.minimum } : {}), targeted: slugs.some((slug) => TARGETED.has(slug)) };
}

// (The item's modifier when it's higher than its user's: Alchemists+ plants' "You can use a +5 Athletics modifier for your
// Shove instead of your Athletics modifier if it is higher than your own" — the action, at that modifier at least.)
const AT_LEAST = new RegExp(String.raw`\buse an? \+(\d+) (Athletics|Acrobatics|Thievery|Deception|Intimidation|Stealth|Diplomacy) modifier for your (${NAMES}) instead of your \w+ modifier if it is higher than your own\b`, "i");

// The text → { slug, name, bonus: { value, type } | null, targeted, after } or null.
// item: the item, for its own runes (Blade of the Rabbit Prince's potency as its item bonus).
export function readItemAction(html, item = null) {
    if (EXTRA[item?.system?.slug ?? ""]) return extraAction(EXTRA[item.system.slug]);
    const raw = String(html ?? "");
    if (/@UUID\[[^\]]*\]\{Effect:/i.test(raw)) return null;
    const text = plainText(raw).replace(/\bCraft Requirements\b.*$/i, "");
    const choice = CHOICE.exec(text);
    if (choice) {
        const names = [...choice[1].matchAll(new RegExp(NAMES, "gi"))].map(([name]) => name.replace(/\s+/g, " "));
        const slugs = names.map((name) => ACTION_SLUGS[name.toLowerCase()]).filter(Boolean);
        if (slugs.length > 1) {
            const sentences = text.slice(choice.index).split(/(?<=[.!?])\s+(?=[A-Z])/);
            const bonus = CHOICE_BONUS.exec(sentences.slice(0, 2).join(" "));
            const potency = Number(item?.system?.runes?.potency) || 0;
            const using = USING.exec(choice[0]);
            const after = sentences.slice(1, 3).filter((line) => !CHOICE_BONUS.test(line) && !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line)).join(" ").trim();
            return {
                slug: slugs[0],
                name: names[0],
                slugs,
                names,
                bonus: bonus ? { value: Number(bonus[1]), type: bonus[2].toLowerCase() } : ITEM_BONUS.test(choice[0]) && potency ? { value: potency, type: "item" } : null,
                ...(using ? { statistic: using[1].toLowerCase() } : {}),
                targeted: slugs.some((slug) => TARGETED.has(slug)),
                ...(after ? { after } : {})
            };
        }
    }
    const atLeast = AT_LEAST.exec(text);
    if (atLeast) {
        const slug = ACTION_SLUGS[atLeast[3].replace(/\s+/g, " ").toLowerCase()];
        if (!slug) return null;
        const after = text.slice(atLeast.index).split(/(?<=[.!?])\s+(?=[A-Z])/).slice(1, 3).filter((line) => !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line)).join(" ").trim();
        return { slug, name: atLeast[3].replace(/\s+/g, " "), bonus: null, minimum: { value: Number(atLeast[1]), skill: atLeast[2].toLowerCase() }, targeted: TARGETED.has(slug), ...(after ? { after } : {}) };
    }
    // (Its own modifier in place of yours, a total of its own, or a DC of its own: PF2e's plain action would roll it wrong.
    // "your attribute modifier, proficiency bonus, and item bonus … total +7", "the DC of the check … is reduced to the
    // creature's recovery roll DC".)
    if (/\buse an? \+\d+ \w+ modifier\b|\binstead of your (?:own|\w+ modifier)\b|\bregardless of what they would normally be\b|\bproficiency bonus\b[^.]*\btotal\b|\bthe DC (?:of|for) the\b[^.]*\bcheck\b[^.]*\b(?:is|equal)\b/i.test(text)) return null;
    // (One check at several creatures: Grim Trophy's "make an Intimidation check to Demoralize up to two targets, comparing your
    // Intimidation check result to both of their DCs" — PF2e's action at the first, its result against each other's DC.)
    const several = new RegExp(String.raw`\bmake an? \w+ check to (${NAMES}) up to (two|three|four|\d+) targets, comparing your [\w ]*?check result to (?:both|all|each)(?: (?:two|three|four))? of their DCs\b`, "i").exec(text);
    if (several) {
        const name = several[1].replace(/\s+/g, " ");
        const slug = ACTION_SLUGS[name.toLowerCase()];
        if (slug) return { slug, name, bonus: null, targeted: true, maxTargets: { two: 2, three: 3, four: 4 }[several[2].toLowerCase()] ?? Number(several[2]) };
    }
    let match = null;
    let index = -1;
    for (const form of FORMS) {
        match = form.exec(text);
        // (An action that's also an everyday word is the action only capitalized: "you make a request for a bespoke set of
        // clothing" isn't Request; "attempt to grapple the creature" is Grapple.)
        if (match && /^(?:request|perform|seek|track|lie|hide|balance|steal|squeeze|swim|climb|sneak)$/.test(match[1])) match = null;
        if (match) {
            index = match.index;
            break;
        }
    }
    if (!match) {
        match = ACTIVATE_LINE.exec(text);
        if (!match) return null;
        index = match.index;
    }
    const name = match[1].replace(/\s+/g, " ");
    const slug = ACTION_SLUGS[name.toLowerCase()];
    if (!slug) return null;
    const bonus = match[2] ? { value: Number(match[2]), type: match[3].toLowerCase() } : null;
    // (What it adds, for the card: "You can move your full Speed (instead of half) on this Sneak action …".)
    const sentence = text.slice(index).split(/(?<=[.!?])\s+(?=[A-Z])/);
    const after = sentence.slice(1, 3).filter((line) => !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line)).join(" ").trim();
    return { slug, name, bonus, targeted: TARGETED.has(slug), ...(after ? { after } : {}) };
}

// options.basicActions: the ability module's compiled actions — their rows for the degree, applied after PF2e's roll.
export function itemActionPlan(html, base, options = {}) {
    const action = readItemAction(html, options.item ?? null);
    if (!action) return null;
    const compiled = (slug) => {
        const basic = options.basicActions?.[slug] ?? null;
        return basic && !basic.builtin ? basic : null;
    };
    // (One of several: each one's rows, by slug.)
    const basics = action.slugs ? Object.fromEntries(action.slugs.map((slug) => [slug, compiled(slug)])) : null;
    return { ...base, builtin: "item-action", automation: { level: "automatic" }, targeting: { target: action.targeted ? "the creature targeted" : "self", range: null, area: null }, trigger: { event: "use" }, action: { ...action, basic: compiled(action.slug), ...(basics ? { basics } : {}) } };
}

// The plan to keep: the action over nothing, a note alone or the GM's fallback.
export const itemActionOver = (plan, action) => (action && (!plan || plan.noteOnly || plan.builtin === "no-effect") ? action : plan);
