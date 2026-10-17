// A check an item makes with its own modifier, at one creature: a maneuver ("The tentacle attempts to Grapple with a +13
// bonus", Tentacle Cannon; "You shove the creature using the bands' Athletics modifier of +14", Bands of Force) — PF2e's
// basic action rows (the ability module's compiled actions) rolled at that modifier — or an attack of its own ("The armor
// makes a melee attack with an attack modifier of +14 that deals 2d6 piercing damage", Swallow-Spike) against the
// target's AC, its damage on a hit and double on a critical hit. Both are the core's check family with a set modifier
// (check.modifier), which the ability module's card rolls as that, at the creature its presser targets. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { ACTION_SLUGS } from "./item-actions.js";
import { riderRow } from "./bombs.js";

const MANEUVERS = ["grapple", "shove", "trip", "disarm", "reposition", "demoralize", "feint"];
const NAMES = MANEUVERS.join("|");
const OWN_MANEUVER = new RegExp(String.raw`\b(?:attempts?|attempt another check) to (${NAMES})\b[^.]*?\bwith an? \+(\d+) (?:bonus|modifier)\b|\b(${NAMES})\b[^.]*?\busing [^.]*?\b(?:Athletics|Acrobatics|Intimidation|Deception) modifier of \+(\d+)`, "i");
const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed";
const OWN_ATTACK = new RegExp(String.raw`\bmakes? an? (?:(melee|ranged) )?(?:attack|Strike)\b[^.]*?\b(?:attack modifier of \+(\d+)|with an? \+(\d+) (?:to hit|attack modifier))\b[^.]*?\bdeal(?:s|ing)? (\d+d\d+(?:\s*\+\s*\d+)?) (?:(persistent) )?(${TYPES}) damage\b`, "i");
// (A creature an item calls up that Strikes once at its own modifier: "Strikes with a jaw Strike with a +28 attack modifier. The
// Strike deals 3d12 plus 19 piercing damage", "uses its spike Strike, which has a +14 modifier, and deals 1d10 plus 5 piercing
// damage", "attempts a +11 Strike … which deals 3d6 acid damage" — its attack, once.)
const CALLED_ATTACK = new RegExp(String.raw`\b(?:Strikes|attempts?|makes?|uses its)\b[^.]*?\b(?:with an? \+(\d+) (?:attack modifier|modifier|to hit)|which has an? \+(\d+) (?:attack )?modifier|an? \+(\d+) Strike)\b[^.]*?\bdeal(?:s|ing)? (\d+d\d+(?:\s*\+\s*\d+)?) (?:(persistent) )?(${TYPES}) damage\b`, "i");
const MANY = /\b(?:each|every|all|up to (?:two|three|four|\d+)(?! feet))\b/i;
// (Warriors that each Strike an enemy at the item's modifier: Spiritual Warhorn's "Each warrior appears in an open square
// adjacent to an enemy within 60 feet of you, makes a Strike for 2d6 force …" and "Two warriors manifest with a +11 attack
// modifier" — the own attack at up to that many enemies the presser targets.)
const WARRIORS = /\b(two|three|four|five|six|seven|eight|\d+) warriors manifest with an? \+(\d+) attack modifier\b/i;
const WARRIOR_STRIKE = new RegExp(String.raw`\bmakes a Strike for (\d+d\d+(?:\s*\+\s*\d+)?) (${TYPES})(?: damage)?\b`, "i");
const WARRIOR_RANGE = /\badjacent to an enemy within (\d+) feet\b/i;
const COUNTS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
// (Its modifier or its user's, the higher: Urn of Ashes' "Attempt a spell attack roll against the target's AC, using a modifier
// of +15 or your own spell attack modifier, whichever is higher. On a success, the bolt deals 4d4 void damage (doubled on a
// critical success)" — the card's pick of its user's spell attack, at least +15.)
const HIGHER_ATTACK = new RegExp(String.raw`\bAttempt a spell attack roll against the target's AC, using a modifier of \+(\d+) or your own spell attack modifier, whichever is higher\.\s*On a (?:hit|success), [^.]*?\bdeals (\d+d\d+(?:\s*\+\s*\d+)?) (?:(persistent) )?(${TYPES}) damage \(doubled on a critical (?:hit|success)\)\.?`, "i");
const WITHIN = /\bwithin (\d+) feet\b/i;
// (An attack with its user's own spell or ranged attack modifier, their pick: Clockwork Helm's "Make a spell or ranged attack roll (your
// choice) to affect the target. On a hit, the target takes 10d8 fire damage and is Drained 2." — the card's pick of the two, the
// damage doubled on a critical hit, the condition on any hit.)
const CHOSEN_ATTACK = new RegExp(String.raw`\bMake a spell or ranged attack roll \(your choice\)[^.]*\.\s*On a hit, the target takes (\d+d\d+(?:\s*\+\s*\d+)?) (?:(persistent) )?(${TYPES}) damage(?: and is ([^.]+))?\.`, "i");
// (One of two maneuvers at the item's modifier: Twisting Twine's "attempting to Disarm or Trip (your choice) a creature in
// the square with a total of +9 to the Athletics check" — both plans, the card's picker.)
const MANEUVER_CHOICE = new RegExp(String.raw`\battempt(?:s|ing)? to (${NAMES}) or (${NAMES}) \(your choice\)[^.]*?\bwith a total of \+(\d+) to the (?:Athletics|Acrobatics|Intimidation|Deception) check\b`, "i");

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const sentencesOf = (text) => String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// The text (plain) → { kind: "maneuver", slug, modifier, notes } | { kind: "attack", range, modifier, formula, type, category, notes } | null.
export function readOwnCheck(given) {
    // ("3d12 plus 19": 3d12+19; "… attack modifier. The Strike deals …": one sentence.)
    // (A released creature's attack modifier with its damage in the next sentence, "On a successful Strike it deals …" — third-party
    // alchemical items: one sentence too.)
    const text = String(given ?? "").replace(/(\d+d\d+) plus (\d+)\b/g, "$1+$2").replace(/(\+\d+ (?:attack )?modifier)\. The Strike deals\b/g, "$1, dealing").replace(/(\+\d+ (?:attack )?modifier\b[^.]*)\. On a successful Strike,? it deals\b/g, "$1, dealing");
    const sentences = sentencesOf(text);
    const chosen = CHOSEN_ATTACK.exec(String(text ?? ""));
    if (chosen) {
        const notes = sentencesOf(String(text ?? "").replace(chosen[0], "")).filter((sentence) => !/^You fire a beam\b[^.]*\bat a target\.$/i.test(sentence));
        return { kind: "attack", range: null, reach: null, modifier: 0, choose: ["spell", "ranged"], formula: chosen[1].replace(/\s+/g, ""), category: chosen[2] ? "persistent" : null, type: chosen[3].toLowerCase(), ...(chosen[4] ? { rider: chosen[4].trim() } : {}), notes };
    }
    const higher = HIGHER_ATTACK.exec(String(text ?? ""));
    if (higher) {
        const notes = sentencesOf(String(text ?? "").replace(higher[0], "")).filter((sentence) => !/^The [\w' -]+? (?:shoots|fires|hurls|launches) [^.]+ at an? (?:foe|creature|enemy|target) within \d+ feet\.$/i.test(sentence));
        const range = WITHIN.exec(String(text ?? "").replace(/^.*?\bEffect\b/s, ""))?.[1];
        return { kind: "attack", range: null, reach: range ? `${range} feet` : null, modifier: Number(higher[1]), atLeast: true, choose: ["spell"], formula: higher[2].replace(/\s+/g, ""), category: higher[3] ? "persistent" : null, type: higher[4].toLowerCase(), notes };
    }
    for (const [index, sentence] of sentences.entries()) {
        const choice = MANEUVER_CHOICE.exec(sentence);
        if (!choice) continue;
        const slugs = [choice[1], choice[2]].map((name) => ACTION_SLUGS[name.toLowerCase()] ?? name.toLowerCase());
        return { kind: "maneuver", slug: slugs[0], slugs, modifier: Number(choice[3]), notes: sentences.filter((_, at) => at !== index) };
    }
    const warriors = WARRIORS.exec(String(text ?? ""));
    const warriorStrike = warriors && WARRIOR_STRIKE.exec(String(text ?? ""));
    if (warriorStrike) {
        const count = COUNTS[warriors[1].toLowerCase()] ?? Number(warriors[1]);
        const range = WARRIOR_RANGE.exec(String(text ?? ""))?.[1];
        return { kind: "attack", range: null, count, reach: range ? `${range} feet` : null, modifier: Number(warriors[2]), formula: warriorStrike[1].replace(/\s+/g, ""), category: null, type: warriorStrike[2].toLowerCase(), notes: [`${count} warriors, each Striking one of the enemies you target; the GM rolls any more at the same enemy.`] };
    }
    for (const [index, sentence] of sentences.entries()) {
        if (MANY.test(sentence)) continue;
        const notes = sentences.filter((_, at) => at !== index);
        const maneuver = OWN_MANEUVER.exec(sentence);
        if (maneuver) {
            const slug = ACTION_SLUGS[(maneuver[1] ?? maneuver[3]).toLowerCase()] ?? (maneuver[1] ?? maneuver[3]).toLowerCase();
            return { kind: "maneuver", slug, modifier: Number(maneuver[2] ?? maneuver[4]), notes };
        }
        const attack = OWN_ATTACK.exec(sentence);
        if (attack) return { kind: "attack", range: attack[1]?.toLowerCase() ?? null, modifier: Number(attack[2] ?? attack[3]), formula: attack[4].replace(/\s+/g, ""), category: attack[5] ? "persistent" : null, type: attack[6].toLowerCase(), notes };
        const called = /\bobject\b/i.test(sentence) ? null : CALLED_ATTACK.exec(sentence);
        if (called) return { kind: "attack", range: null, modifier: Number(called[1] ?? called[2] ?? called[3]), formula: called[4].replace(/\s+/g, ""), category: called[5] ? "persistent" : null, type: called[6].toLowerCase(), notes };
    }
    return null;
}

// The plan; null when nothing is read, or a maneuver whose basic action the ability module hasn't compiled.
// options.basicActions: the ability module's compiled actions.
export function ownCheckPlan(text, base, options = {}) {
    const read = readOwnCheck(text);
    if (!read) return null;
    // (Its user's own attack, picked on the card — at least the item's modifier when it says "whichever is higher".)
    const own = read.choose ? { choose: read.choose, ...(read.atLeast ? { atLeast: read.modifier } : {}) } : {};
    const common = { ...base, modelVersion: MODEL_VERSION, automation: { level: read.notes.length ? "guided" : "automatic" }, trigger: { event: "use" }, ownCheck: { kind: read.kind, modifier: read.modifier, ...own }, notes: read.notes, ...(read.notes.length ? { partial: true } : {}) };
    if (read.kind === "maneuver") {
        const basic = options.basicActions?.[read.slug];
        if (!basic?.resolution?.check || basic.builtin) return null;
        const at = (action) => ({ ...action.resolution, check: { ...action.resolution.check, modifier: read.modifier } });
        // (One of several: each one's resolution, picked on the card — plan.checkChoices [{ label, resolution }].)
        const choices = (read.slugs ?? []).map((slug) => options.basicActions?.[slug]).filter((action) => action?.resolution?.check && !action.builtin);
        return { ...common, targeting: { ...(basic.targeting ?? {}), target: "1 creature" }, resolution: at(basic), ...(choices.length > 1 ? { checkChoices: choices.map((action, index) => ({ label: read.slugs[index].charAt(0).toUpperCase() + read.slugs[index].slice(1), resolution: at(action) })) } : {}) };
    }
    const component = { id: "0", formula: read.formula, type: read.type, category: read.category };
    // (A condition on any hit, Clockwork Helm's Drained 2: the bombs' rider reader.)
    const riders = read.rider ? riderRow(`The target is ${read.rider}.`).effects ?? [] : [];
    const hit = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["0"] }, effects: [...riders], modifiers: [] });
    return {
        ...common,
        targeting: { target: read.count ? `up to ${read.count} enemies` : "1 creature", range: read.reach ?? null, area: null },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: read.modifier }, sharedDamage: { rollOnce: true, components: [component] }, outcomes: { criticalSuccess: hit(2), success: hit(1), failure: none(), criticalFailure: none() } }
    };
}

// The plan to keep: the check over nothing, a note alone or the GM's fallback.
export function ownCheckOver(plan, check) {
    if (!check) return plan;
    return !plan || plan.noteOnly || plan.builtin === "no-effect" ? check : plan;
}
