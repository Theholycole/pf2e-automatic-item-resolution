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

// The text → { slug, name, bonus: { value, type } | null, targeted, after } or null.
export function readItemAction(html) {
    const raw = String(html ?? "");
    if (/@UUID\[[^\]]*\]\{Effect:/i.test(raw)) return null;
    const text = plainText(raw).replace(/\bCraft Requirements\b.*$/i, "");
    // (Its own modifier in place of yours, a total of its own, or a DC of its own: PF2e's plain action would roll it wrong.
    // "your attribute modifier, proficiency bonus, and item bonus … total +7", "the DC of the check … is reduced to the
    // creature's recovery roll DC".)
    if (/\buse an? \+\d+ \w+ modifier\b|\binstead of your (?:own|\w+ modifier)\b|\bregardless of what they would normally be\b|\bproficiency bonus\b[^.]*\btotal\b|\bthe DC (?:of|for) the\b[^.]*\bcheck\b[^.]*\b(?:is|equal)\b/i.test(text)) return null;
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
    const action = readItemAction(html);
    if (!action) return null;
    const basic = options.basicActions?.[action.slug] ?? null;
    return { ...base, builtin: "item-action", automation: { level: "automatic" }, targeting: { target: action.targeted ? "the creature targeted" : "self", range: null, area: null }, trigger: { event: "use" }, action: { ...action, basic: basic && !basic.builtin ? basic : null } };
}

// The plan to keep: the action over nothing, a note alone or the GM's fallback.
export const itemActionOver = (plan, action) => (action && (!plan || plan.noteOnly || plan.builtin === "no-effect") ? action : plan);
