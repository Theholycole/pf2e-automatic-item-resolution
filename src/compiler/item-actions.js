// An item used by taking a skill action with it (Onyx Panther's "use a Sneak action with a +1 item bonus", Bronze Bull
// Pendant's "attempt an Athletics check to Shove with a +1 item bonus", Yarrow-Root Bandage's "Activate Administer First
// Aid"): a builtin the item module plays with PF2e's own action (scripts/item-actions.js), the bonus as a modifier on it,
// and — for the actions the ability module compiles (Trip, Grapple, Shove, Demoralize, Feint, Administer First Aid…) —
// that action's row for the degree PF2e rolled, on its target. Not an item that links its own Effect (its bonus lives
// there), nor one whose own modifier replaces yours (third-party plants; asked of the user). Pure.

import { plainText } from "./rows.js";
import { directDamagePlan } from "./direct-damage.js";

// PF2e's actions by the names items use.
export const ACTION_SLUGS = Object.freeze({
    "administer first aid": "administer-first-aid", balance: "balance", climb: "climb", coerce: "coerce", "command an animal": "command-an-animal", "create a diversion": "create-a-diversion",
    demoralize: "demoralize", "disable a device": "disable-device", "disable device": "disable-device", disarm: "disarm", escape: "escape", feint: "feint", "force open": "force-open",
    "gather information": "gather-information", "grab an edge": "grab-an-edge", grapple: "grapple", hide: "hide", "high jump": "high-jump", lie: "lie", "long jump": "long-jump",
    "make an impression": "make-an-impression", "palm an object": "palm-an-object", perform: "perform", "pick a lock": "pick-a-lock", "recall knowledge": "recall-knowledge",
    reposition: "reposition", request: "request", seek: "seek", "sense direction": "sense-direction", "sense motive": "sense-motive", shove: "shove", sneak: "sneak", squeeze: "squeeze",
    steal: "steal", swim: "swim", track: "track", "treat poison": "treat-poison", "treat wounds": "treat-wounds", trip: "trip", "tumble through": "tumble-through"
});
// The actions aimed at one creature: the presser's target is the DC's and the row's.
export const TARGETED = new Set(["administer-first-aid", "create-a-diversion", "demoralize", "disarm", "feint", "grapple", "reposition", "request", "coerce", "make-an-impression", "shove", "steal", "trip", "treat-poison", "treat-wounds"]);

const NAMES = Object.keys(ACTION_SLUGS).sort((a, b) => b.length - a.length).map((name) => name.replace(/ /g, "\\s+")).join("|");
const BONUS = String.raw`with an? \+(\d+) (item|circumstance|status) bonus`;
const FORMS = [
    // "use a Sneak action with a +1 item bonus", "make a Climb action with a +1 item bonus"
    new RegExp(String.raw`\b(?:use|make|attempt) an? (${NAMES})(?: action)?(?: check)? ${BONUS}`, "i"),
    // "attempt an Athletics check to Shove with a +1 item bonus", "Attempt a Deception check to Feint with a +4 circumstance bonus"
    new RegExp(String.raw`\battempts? (?:a|an) \w+ check to (${NAMES})\b(?: (?:the|a|an|one) [\w' -]+?)? ${BONUS}`, "i"),
    // "You Seek with a +1 item bonus" (Motion-Seeking Lenses)
    new RegExp(String.raw`(?:^|[.;]\s+|\bEffect\s+)You (${NAMES}) ${BONUS}`, "i"),
    // "You Administer First Aid to stabilize an adjacent ally with the dying condition" (Medic's Shield: no bonus of its own)
    new RegExp(String.raw`(?:^|[.;]\s+|\bEffect\s+)You (${NAMES}) to (?:stabilize|stop (?:the )?bleeding)\b`, "i"),
    // "attempt to Administer First Aid using Medicine with a +1 item bonus to the check"
    new RegExp(String.raw`\battempt to (${NAMES}) using \w+ ${BONUS}`, "i"),
    // "Attempt to Recall Knowledge about any one creature or object that you can see with a +2 item bonus to the check" (Calligraphic
    // Illumination, 2026-10-27)
    new RegExp(String.raw`\battempt to (${NAMES}) about (?:any )?one creature or object\b[^.]*? ${BONUS}`, "i"),
    // "allowing you to attempt to Disarm it from its wielder with a +2 item bonus" (Ensnaring Disk)
    new RegExp(String.raw`\battempt to (${NAMES}) (?:it|them|the (?:triggering )?(?:creature|weapon|foe|attacker)) from its wielder ${BONUS}`, "i"),
    // "When you activate the bracelet, attempt to Escape", "When you activate it, make a Leap"
    new RegExp(String.raw`\bWhen you activate [^,.]+, (?:you (?:can )?(?:immediately )?)?(?:use|attempt|make) (?:an? |to )?(${NAMES})\b`, "i"),
    // "…, attempting an Intimidation check to Demoralize that creature", "Make an Athletics check to Disarm the attacking creature",
    // "Roll an Intimidation check to Demoralize the target": a clause of its own, a skill named.
    // (And Wrestler's Armbands' "boasting of your prowess and attempting an Intimidation check to Demoralize that creature".)
    new RegExp(String.raw`(?:^|[.;]\s+|\bEffect\s+|,\s+|\band\s+(?=attempting\b))(?:attempting|[Mm]ake|[Aa]ttempt|[Rr]oll) (?:a|an) (?:Athletics|Acrobatics|Intimidation|Deception|Diplomacy|Stealth|Thievery|Medicine|Survival|Performance) check to (${NAMES})\b(?![^.]*\+\d+)(?![^.]*\b(?:up to (?:two|three|four|\d+)|each|all)\b)`, "i"),
    // "Attempt to Grapple a creature" (Bracers of Strength): an activation that is the action.
    new RegExp(String.raw`(?:^|[.;)]\s+|\bEffect\s+)Attempt to (${NAMES}) (?:a|an|one|the) (?:creature|foe|enemy|target)\b(?![^.]*\+\d+)`, "i"),
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
// (Or the activation itself is either: Blast Boots' "When you Activate the blast boots, you can High Jump or Long Jump, without the need
// to Stride first".)
const ACTIVATE_CHOICE = new RegExp(String.raw`\bWhen you Activate (?:it|the [\w' -]+?), you can ((?:${NAMES})(?:,\s*(?:${NAMES}))*,?\s+or\s+(?:${NAMES}))\b([^.]*)\.`, "i");
const CHOICE_BONUS = /\bYou gain an? \+(\d+) (status|circumstance|item) bonus to (?:your|the) check\b/i;
const ITEM_BONUS = /\badd the [\w' -]+? item bonus to the check\b/i;
const USING = /\busing (Athletics|Acrobatics|Thievery|Deception|Intimidation|Stealth|Diplomacy|Performance) instead of (?:Athletics|Acrobatics|Thievery|Deception|Intimidation)\b/i;

// Items whose words the readers don't take, by slug — see docs/mechanics.md:
//   { slugs: ["trip", "disarm"], bonus?: { value, type }, statistic?: "thievery" }   one of several actions, picked on the card;
//   { slug: "shove", minimum: { value: 5, skill: "athletics" } }                     an action at the item's modifier when higher.
export const EXTRA = Object.freeze({
    // (2026-10-27: Uzunjati Storytelling Amulet's Enamoring Story, "You attempt to Make an Impression or Request, using a Performance check instead of a
    // Diplomacy check" — its trigger's anecdote the user's own.)
    "uzunjati-storytelling-amulet": { slugs: ["make-an-impression", "request"], statistic: "performance" }
});
function extraAction(entry) {
    const slugs = entry.slugs ?? [entry.slug];
    const names = slugs.map((slug) => Object.entries(ACTION_SLUGS).find(([, value]) => value === slug)?.[0] ?? slug).map((name) => name.replace(/\b\w/g, (letter) => letter.toUpperCase()));
    return { slug: slugs[0], name: names[0], ...(slugs.length > 1 ? { slugs, names } : {}), bonus: entry.bonus ?? null, ...(entry.statistic ? { statistic: entry.statistic } : {}), ...(entry.minimum ? { minimum: entry.minimum } : {}), targeted: slugs.some((slug) => TARGETED.has(slug)) };
}

// (The item's modifier when it's higher than its user's — some Alchemists+ plants give one for an action, used in place of the
// user's own when higher: the action, at that modifier at least.)
const OWN_BONUS = /\b(?:If you use|With) your own \w+ modifier,? you (?:gain|get) an? \+(\d+) (item|circumstance|status) bonus to (?:your|the) check\b/i;
const AT_LEAST = new RegExp(String.raw`\buse an? \+(\d+) (Athletics|Acrobatics|Thievery|Deception|Intimidation|Stealth|Diplomacy) modifier for your (${NAMES}) instead of your \w+ modifier if it is higher than your own\b`, "i");

// (Binding Coil's "This has a Grapple's normal effects, except that the DC to Escape is 20 and you can move without freeing the creature as long as
// you don't move further away from it": its Escape DC on the grab, its user's own move a line — 2026-10-27.)
const ESCAPE_DC = /^This has a Grapple's normal effects, except that the DC to Escape is (\d+) and you can move without freeing the creature as long as you don't move further away from it\.$/i;
// (Venomed Tongue's "You use Deception to Create a Diversion, Feint, or Lie. Choose one target against whom your Deception check succeeded; that
// target takes 2d6 persistent poison damage" — one of the three, picked on the card, its damage at the creature targeted on a success; the whole
// of its Effect read, over the ability compiler's partial check — action.whole, itemActionOver. 2026-10-27.)
const USE_SKILL_TO = (names) => new RegExp(String.raw`^You use (Deception|Intimidation|Diplomacy|Athletics) to ((?:${names})(?:,\s*(?:${names}))*,?\s+or\s+(?:${names}))\.$`, "i");
const SUCCEEDED_TAKES = /^Choose one target against whom your (?:Deception|Intimidation|Diplomacy|Athletics) check succeeded; that target takes (\d+d\d+) (persistent )?(\w+) damage\.$/i;

// An item used within its user's own action (2026-10-27, docs/needs.md "Actions and feats for the user"): "Activate Administer First Aid … You can
// Activate the item as part of the same activity you use to Administer First Aid to stabilize a creature" — every sentence after the first (its
// flavor) read, else nothing (action.within: none left over):
// - Lady's Blessing Oil's lower DC, "reduced to the creature's recovery roll DC, rather than 5 + the recovery roll DC" (action.dc { less: 5 }), and
//   "if you roll a failure on the check, you get a critical failure instead" (action.degree);
// - Yarrow-Root Bandage's "you can Administer First Aid to stop bleeding and dying as part of the same activity with only one Medicine check …
//   the DC … is equal to the 5 + the higher of the two DCs" (action.both, dc { more: 5 }: the higher of the stabilize DC and the bleed's — its
//   condition's DC since 2026-10-27, scripts/item-actions.js), the bleed after it as PF2e's stop bleeding: a success's assisted recovery (flat
//   check DC 10), a critical failure's bleed at once;
// - Curled Cure Gel's "If you successfully Treat Wounds, you can also reduce the value of one of the targets' Clumsy, Enfeebled, or Stupefied
//   conditions by 1" (action.reduce: the highest of them, a line saying its user may pick another) and its 24 hours' immunity for the creature
//   treated, success or not (action.immunity, scripts/immunity.js);
// - Artevil Suspension's ingested poison a stage lower on a success, never below stage 1, and Sickened 2 when it is (action.stage).
// What the card does, in words: action.after, its lines. Live play: scripts/item-actions.js.
const WITHIN_ACTIONS = "Administer First Aid|Treat Wounds|Treat Poison";
const WITHIN_FIRST = new RegExp(String.raw`^Activate (${WITHIN_ACTIONS}) (.+)$`);
const WITHIN = new RegExp(String.raw`^(?:You can Activate the item|You can administer the [\w' -]+? orally, Activating the item|Activating the item is) (?:as )?part of the same activity you use to (${WITHIN_ACTIONS})(?: to (stabilize|stop bleeding on) a creature(?: who's also dying)?)?\.$`, "i");
const WITHIN_RULES = [
    [/^If you use [\w' -]+?, the DC of the check to Administer First Aid is reduced to the creature's recovery roll DC, rather than 5 \+ the recovery roll DC\.$/i, () => ({ dc: { less: 5 }, line: "Its DC is the creature's recovery roll DC, 5 lower than usual" })],
    [/^However, if you roll a failure on the check, you get a critical failure instead\.$/i, () => ({ degree: { failure: "criticalFailure" }, line: "and a failure is a critical failure" })],
    [/^When you do, you can Administer First Aid to stop bleeding and dying as part of the same activity with only one Medicine check\.$/i, () => ({ both: true, line: "One Medicine check both stabilizes it and stops its bleeding" })],
    [/^However, the DC for the Medicine check is equal to the 5 \+ the higher of the two DCs to Administer First Aid\.$/i, () => ({ dc: { more: 5 }, line: "at 5 more than the higher of its stabilize DC and its bleed's" })],
    [/^If you successfully Treat Wounds, you can also reduce the value of one of the targets' (\w+), (\w+), or (\w+) conditions by (\d+)\.$/i, (said) => ({ reduce: { choose: [said[1], said[2], said[3]].map((slug) => slug.toLowerCase()), by: Number(said[4]) }, line: `On a success it also lowers the highest of its ${said[1]}, ${said[2]} or ${said[3]} by ${said[4]} (its user may pick another instead: change it on the sheet)` })],
    [/^The target of your Treat Wounds is then temporarily immune to [\w' -]+? for (\d+) (hours?|minutes?|days?), whether or not your attempt to Treat Wounds was successful\.$/i, (said, sentence) => ({ immunity: { value: Number(said[1]), unit: `${said[2].toLowerCase().replace(/s$/, "")}s`, raw: sentence }, line: `The creature treated is then immune to it for ${said[1]} ${said[2].toLowerCase()}, success or not` })],
    [/^If you succeed at your Medicine check to Treat Poison against an? (ingested|inhaled|contact|injury) poison, you can reduce the stage of the toxin by one stage, though this can't reduce the stage below stage 1 or cure the poison entirely\.$/i, (said) => ({ stage: { by: 1, min: 1, vector: said[1].toLowerCase() }, line: `On a success its ${said[1].toLowerCase()} poison drops a stage, never below stage 1` })],
    [/^If you do, the creature becomes (Sickened|Fatigued|Enfeebled|Drained|Clumsy) (\d+) as its body purges the toxin\.$/i, (said) => ({ stageThen: { slug: said[1].toLowerCase(), value: Number(said[2]) }, line: `and then it's ${said[1]} ${said[2]}` })],
    [/^An? [\w' -]+? doesn't work unless the poison was administered through (ingestion|injury|inhalation|contact); for instance, .+ won't work\.$/i, (said) => ({ line: `Only against a poison given by ${said[1].toLowerCase()} (one that could be but wasn't doesn't count): the GM's to say` })]
];
function readWithinActivity(text, item) {
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const first = WITHIN_FIRST.exec(sentences[0] ?? "");
    const within = sentences.length > 2 ? WITHIN.exec(sentences[1]) : null;
    // (Its first sentence after the action's name its flavor: no rule word in it.)
    if (!first || !within || within[1].toLowerCase() !== first[1].toLowerCase() || /\d|\b(?:check|DC|bonus|penalty|damage|immune|stage|condition)\b/i.test(first[2])) return null;
    const read = [];
    for (const sentence of sentences.slice(2)) {
        const rule = WITHIN_RULES.find(([pattern]) => pattern.test(sentence));
        if (!rule) return null;
        read.push(rule[1](rule[0].exec(sentence), sentence));
    }
    const name = first[1];
    const slug = ACTION_SLUGS[name.toLowerCase()];
    const parts = Object.assign({}, ...read.map(({ line, ...part }) => part));
    const { immunity, stageThen, ...rest } = parts;
    const variant = within[2] ? (/^stop/i.test(within[2]) && !rest.both ? "stop-bleeding" : "stabilize") : null;
    const lines = read.map((entry) => entry.line).filter(Boolean);
    const after = lines.reduce((words, line) => (!words ? line : /^(?:and|at)\b/.test(line) ? `${words}, ${line}` : `${words}. ${line}`), "");
    return {
        slug,
        name,
        bonus: null,
        targeted: TARGETED.has(slug),
        within: true,
        ...(variant ? { variant } : {}),
        ...rest,
        ...(rest.stage && stageThen ? { stage: { ...rest.stage, then: stageThen } } : {}),
        ...(immunity ? { immunity: { scope: "target", raw: immunity.raw, duration: { value: immunity.value, unit: immunity.unit }, degrees: ["criticalSuccess", "success", "failure", "criticalFailure"], against: "all", slug: item?.system?.slug ?? String(item?.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } } : {}),
        ...(after ? { after: `${after}.` } : {})
    };
}

// Its Effect "You use Deception to A, B, or C" then the damage at the one it succeeded against, every sentence after its flavor read → the action
// of several, its damage on a success, or null.
function readUsedSkillTo(text) {
    const effect = /\bEffect\b\s*(.*)$/s.exec(String(text ?? ""))?.[1] ?? "";
    const sentences = effect.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const at = sentences.findIndex((sentence) => USE_SKILL_TO(NAMES).test(sentence));
    const takes = at >= 0 ? SUCCEEDED_TAKES.exec(sentences[at + 1] ?? "") : null;
    // (Before it, its flavor only; nothing after the damage.)
    if (!takes || sentences.length !== at + 2 || sentences.slice(0, at).some((sentence) => /\d|\b(?:check|DC|bonus|penalty|damage|immune|condition|Strike)\b/i.test(sentence))) return null;
    const used = USE_SKILL_TO(NAMES).exec(sentences[at]);
    const names = [...used[2].matchAll(new RegExp(NAMES, "gi"))].map(([name]) => name.replace(/\s+/g, " "));
    const slugs = names.map((name) => ACTION_SLUGS[name.toLowerCase()]).filter(Boolean);
    if (slugs.length !== names.length || slugs.length < 2) return null;
    return { slug: slugs[0], name: names[0], slugs, names, bonus: null, statistic: used[1].toLowerCase(), targeted: true, whole: true, succeededTakes: { formula: takes[1], type: takes[3].toLowerCase(), persistent: Boolean(takes[2]) }, after: `On a success, the creature targeted takes ${takes[1]} ${takes[2] ? "persistent " : ""}${takes[3].toLowerCase()} damage (target the one it succeeded against).` };
}

// (A size for the moment of an Escape, Miniaturization Module's Miraculous Escape, 2026-10-27: "You become Tiny, then attempt to Escape the
// triggering effect, gaining a +4 circumstance bonus to this check. If you successfully Escape, you Step into an adjacent space. Regardless of
// the result, you then return to your original size." — PF2e's Escape at that bonus; the size, which no Escape rule reads, and the Step after
// a success, its user's own move, the card's line: every sentence after its flavor read, action.whole.)
const SIZED_ESCAPE = [/^You become (Tiny|Small), then attempt to Escape the triggering \w+, gaining an? \+(\d+) (circumstance|item|status) bonus to this check\.$/i, /^If you successfully Escape, you Step into an? \w+ space\.$/i, /^Regardless of the result, you then \w+ to your original size\.$/i];
function readSizedEscape(text) {
    const effect = /\bEffect\b\s*(.*)$/s.exec(String(text ?? ""))?.[1] ?? "";
    const sentences = effect.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const at = sentences.findIndex((sentence) => SIZED_ESCAPE[0].test(sentence));
    // (Before it, its flavor only; after it, the Step and the size back, nothing else.)
    if (at < 0 || sentences.length !== at + 3 || !SIZED_ESCAPE[1].test(sentences[at + 1]) || !SIZED_ESCAPE[2].test(sentences[at + 2]) || sentences.slice(0, at).some((sentence) => /\d|\b(?:check|DC|bonus|penalty|damage|immune|condition|Strike)\b/i.test(sentence))) return null;
    const [, size, value, type] = SIZED_ESCAPE[0].exec(sentences[at]);
    return { slug: "escape", name: "Escape", bonus: { value: Number(value), type: type.toLowerCase() }, targeted: false, whole: true, after: `${size} for the Escape, then its own size again whatever the result; on a success, Step into an adjacent space (its own move on the map).` };
}

// The text → { slug, name, bonus: { value, type } | null, targeted, after } or null.
// item: the item, for its own runes (Blade of the Rabbit Prince's potency as its item bonus).
export function readItemAction(html, item = null) {
    if (EXTRA[item?.system?.slug ?? ""]) return extraAction(EXTRA[item.system.slug]);
    // (Used within its user's own action, every sentence read: readWithinActivity.)
    const within = readWithinActivity(plainText(String(html ?? "")).replace(/\bCraft Requirements\b.*$/i, ""), item);
    if (within) return within;
    const used = readUsedSkillTo(plainText(String(html ?? "")).replace(/\bCraft Requirements\b.*$/i, ""));
    if (used) return used;
    const sized = readSizedEscape(plainText(String(html ?? "")).replace(/\bCraft Requirements\b.*$/i, ""));
    if (sized) return sized;
    const raw = String(html ?? "");
    if (/@UUID\[[^\]]*\]\{Effect:/i.test(raw)) return null;
    const text = plainText(raw).replace(/\bCraft Requirements\b.*$/i, "");
    const choice = CHOICE.exec(text) ?? ACTIVATE_CHOICE.exec(text);
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
        // (Its bonus to the user's own modifier, when that's the one used: a third-party flytrap's +2 item bonus.)
        const own = OWN_BONUS.exec(after);
        return { slug, name: atLeast[3].replace(/\s+/g, " "), bonus: null, minimum: { value: Number(atLeast[1]), skill: atLeast[2].toLowerCase(), ...(own ? { ownBonus: { value: Number(own[1]), type: own[2].toLowerCase() } } : {}) }, targeted: TARGETED.has(slug), ...(after ? { after } : {}) };
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
    // (Or at every creature of a kind in an area: Horn of Exorcism's "Make an Intimidation check to Demoralize against all creatures
    // with the undead or unholy trait in a 30-foot emanation" — as many as are targeted; Lion's Armor's "Attempt a check to
    // Demoralize each enemy within 30 feet of you. On a critical success, the target is also Fleeing for 1 round", that
    // condition added to the action's row.)
    const everyone = new RegExp(String.raw`\b[Mm]ake an? \w+ check to (${NAMES}) against all (creatures?\b[^.]*?|enemies|foes) in an? (\d+)-foot (?:emanation|burst)\b`, "i").exec(text);
    const each = everyone ? null : new RegExp(String.raw`\b[Aa]ttempt an? (?:\w+ )?check to (${NAMES}) each (enemy|foe|creature) within (\d+) feet of you\b`, "i").exec(text);
    // (Windlass Bola's "attempt a ranged Trip against all creatures in a @Template[burst|distance:5] within the weapon's first range
    // increment. Roll a separate Athletics check for each target": each creature targeted, a roll of its own — action.separate.)
    const burst = everyone || each ? null : new RegExp(String.raw`\battempt an? (?:ranged |melee )?(${NAMES}) against all creatures in an? (\d+)-foot (burst|emanation)\b[^.]*\.\s*Roll a separate \w+ check for each target\b`, "i").exec(text);
    if (burst) {
        const name = burst[1].replace(/\s+/g, " ");
        const slug = ACTION_SLUGS[name.toLowerCase()];
        const after = text.slice(burst.index + burst[0].length).split(/(?<=[.!?])\s+(?=[A-Z])/).map((line) => line.trim()).filter((line) => line && !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line) && !/^\.$/.test(line)).slice(0, 2).join(" ").replace(/^\.\s*/, "").trim();
        if (slug) return { slug, name, bonus: null, targeted: true, maxTargets: 99, separate: true, everyone: `all creatures in a ${burst[2]}-foot ${burst[3]}`, ...(after ? { after } : {}) };
    }
    // (Shrieking Skull's "attempt to Demoralize the target as well as each enemy within 30 feet of the target".)
    const around = everyone || each ? null : new RegExp(String.raw`\battempt to (${NAMES}) the target as well as each (enemy|foe|creature) within (\d+) feet of the target\b`, "i").exec(text);
    if (around) {
        const name = around[1].replace(/\s+/g, " ");
        const slug = ACTION_SLUGS[name.toLowerCase()];
        const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
        const at = sentences.findIndex((sentence) => sentence.includes(around[0]));
        // (When it may be used, before it: "If you Strike with the weapon before the end of your turn, …".)
        const after = sentences.slice(Math.max(0, at - 1), at).filter((line) => !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line)).join(" ").trim();
        if (slug) return { slug, name, bonus: null, targeted: true, maxTargets: 99, everyone: `the target and each ${around[2]} within ${around[3]} feet of it`, ...(after ? { after } : {}) };
    }
    const area = everyone ?? each;
    if (area) {
        const name = area[1].replace(/\s+/g, " ");
        const slug = ACTION_SLUGS[name.toLowerCase()];
        const lines = text.slice(area.index).split(/(?<=[.!?])\s+(?=[A-Z])/).slice(1, 3).filter((line) => !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line));
        const riders = lines.map(degreeRider).filter(Boolean);
        const after = lines.filter((line) => !degreeRider(line)).join(" ").trim();
        const who = everyone ? `all ${area[2]}` : `each ${area[2]}`;
        if (slug) return { slug, name, bonus: null, targeted: true, maxTargets: 99, everyone: `${who} within ${area[3]} feet`, ...(riders.length ? { riders } : {}), ...(after ? { after } : {}) };
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
    // (What it adds, for the card: "You can move your full Speed (instead of half) on this Sneak action …".)
    const sentence = text.slice(index).split(/(?<=[.!?])\s+(?=[A-Z])/);
    const lines = sentence.slice(1, 3).filter((line) => !/^(?:Craft|Activate|Usage|Frequency|Trigger|Requirements?)\b/.test(line));
    // (Its bonus said a sentence after the activation, as a gain to the action's checks: a third-party puffball's item bonus to Sneak.)
    const gained = match[2] ? null : new RegExp(String.raw`\bgain an? \+(\d+) (item|circumstance|status) bonus to your (?:${name} )?checks?\b`, "i").exec(lines.join(" "));
    const bonus = match[2] ? { value: Number(match[2]), type: match[3].toLowerCase() } : gained ? { value: Number(gained[1]), type: gained[2].toLowerCase() } : null;
    // (What a success adds, Medic's Shield's "On a success, they gain 6d6+20 Hit Points, can immediately Stand as a free action, and
    // become Quickened for 1 round": its healing and condition on that degree and the better one; the rest stays on the card.)
    const gains = lines.map(successGains).find(Boolean) ?? null;
    // (An inline Escape with its DC, "[[/act escape dc=20]]", as its name: the DC is said in words beside it.)
    const after = lines.join(" ").replace(/\b[Ee]scape dc=\d+\b/g, "Escape").trim();
    // (A grapple whose Escape DC is the item's, Binding Coil's: action.escape, its rows' Grabbed and Restrained ended by an Escape against it.)
    const escape = slug === "grapple" ? ESCAPE_DC.exec(after) : null;
    return { slug, name, bonus, targeted: TARGETED.has(slug), ...(gains ? { riders: gains } : {}), ...(escape ? { escape: { dc: Number(escape[1]) } } : {}), ...(after ? { after } : {}) };
}

// Damage the action's success deals, a number its owner's gave (src/compiler/item-data.js withOwnerNumbers): Bracers of
// Strength's "If you succeed, you crush the creature in your grasp, dealing 4 bludgeoning damage to it. If you critically
// succeeded, the damage is equal to double your Strength modifier" → { success: 4, criticalSuccess: 8 } plans of outright
// damage at the creature, posted after PF2e's roll (scripts/item-actions.js).
const SUCCESS_DAMAGE = /\bIf you succeed, [^.]*?\bdealing @Damage\[(\d+)\[(\w+)\]\](?:\{[^}]*\})? damage\b/i;
const CRITICAL_DOUBLE = /\bIf you critically succeed(?:ed)?, the damage is equal to double\b/i;
// (Or dice on a success, Bracers of Hammers' "On a success, the creature is knocked Prone and takes 10d6 bludgeoning damage (double on a critical
// hit)", Constricting Meteor's "In addition to being Grabbed on a success, the target takes 1d10+7 bludgeoning damage", 2026-10-27: the same,
// a critical success's doubled when it says so.)
const SUCCESS_DICE = /\bon a success\b[^.]*?\btakes (\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage(?: \((double) on a critical (?:hit|success)\))?/i;
function degreeDamage(html, base) {
    const dice = SUCCESS_DICE.exec(plainText(html));
    if (dice) {
        const plan = directDamagePlan(`The target takes ${dice[1].replace(/\s+/g, "")} ${dice[2]} damage.`, { ...base, activation: base.activation ?? null });
        if (!plan) return null;
        const doubled = dice[3] ? { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...plan.resolution.outcomes.success, damage: { ...plan.resolution.outcomes.success.damage, multiplier: 2 } } } } } : plan;
        return { success: plan, criticalSuccess: doubled };
    }
    const success = SUCCESS_DAMAGE.exec(String(html ?? ""));
    if (!success) return null;
    const plan = (amount) => directDamagePlan(`The target takes ${amount} ${success[2]} damage.`, { ...base, activation: base.activation ?? null });
    const amount = Number(success[1]);
    return { success: plan(amount), criticalSuccess: plan(CRITICAL_DOUBLE.test(String(html)) ? amount * 2 : amount) };
}

// A condition the action's degree adds to its row: "On a critical success, the target is also Fleeing for 1 round" →
// { degree, effect } or null.
const RIDER_CONDITIONS = "blinded|clumsy|confused|dazzled|deafened|enfeebled|fascinated|fatigued|fleeing|frightened|immobilized|off-guard|prone|sickened|slowed|stunned|stupefied";
const DEGREE_WORDS = { "critical success": "criticalSuccess", success: "success" };
const UNIT_WORDS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes" };
function degreeRider(line) {
    const match = new RegExp(String.raw`^On an? (critical success|success), the (?:target|creature) is also (${RIDER_CONDITIONS})(?: (\d+))? for (\d+|one|an?) (rounds?|minutes?)\.$`, "i").exec(String(line ?? "").trim());
    if (!match) return null;
    const count = /^\d+$/.test(match[4]) ? Number(match[4]) : 1;
    return { degree: DEGREE_WORDS[match[1].toLowerCase()], effect: { kind: "condition", slug: match[2].toLowerCase(), value: match[3] ? Number(match[3]) : null, duration: { mode: "fixed", value: count, unit: UNIT_WORDS[match[5].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } } };
}

// "On a success, they gain 6d6+20 Hit Points, …, and become Quickened for 1 round" → riders for success and critical success: its
// healing and its conditions with their time; null when the sentence isn't that.
function successGains(line) {
    const match = /^On an? success, (?:they|the (?:target|ally|creature)|it) (?:gains?|regains?) \(?(\d+d\d+(?:\s*\+\s*\d+)?|\d+)\)? Hit Points\b(.*)$/i.exec(String(line ?? "").trim());
    if (!match) return null;
    const effects = [{ kind: "heal", formula: match[1].replace(/\s+/g, "") }];
    for (const clause of match[2].matchAll(new RegExp(String.raw`\bbecomes? (${RIDER_CONDITIONS}|quickened)(?: (\d+))? for (\d+|one|an?) (rounds?|minutes?)\b`, "gi"))) {
        effects.push({ kind: "condition", slug: clause[1].toLowerCase(), value: clause[2] ? Number(clause[2]) : null, duration: { mode: "fixed", value: /^\d+$/.test(clause[3]) ? Number(clause[3]) : 1, unit: UNIT_WORDS[clause[4].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } });
    }
    return ["success", "criticalSuccess"].flatMap((degree) => effects.map((effect) => ({ degree, effect })));
}

// The action's compiled row with the item's own riders added for their degrees.
function withRiders(basic, riders = []) {
    if (!basic || !riders.length) return basic;
    const outcomes = { ...basic.resolution.outcomes };
    for (const { degree, effect } of riders) {
        const row = outcomes[degree] ?? { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] };
        outcomes[degree] = { ...row, effects: [...(row.effects ?? []).filter((existing) => effect.kind !== "condition" || existing.slug !== effect.slug), effect] };
    }
    return { ...basic, resolution: { ...basic.resolution, outcomes } };
}

// What the card's lines after the action say that it doesn't play (2026-10-27, an audit: they were never counted): not a line its user keeps to
// — no hand free needed, no penalty for language, a larger target, the action said again, its multiple attack penalty —, nor what its riders,
// its healing and conditions on a success, or its damage on a success play. Bracers of Hammers' 10d6 on its Trip, Binding Coil's Escape DC 20,
// Ensnaring Disk's critical failure made a failure: left over, the plan partial.
const AFTER_LINES = [/\b(?:do not|don't) need to have a hand free\b|\beven if you don't have a hand free\b/i, /\b(?:don't|do not) take (?:a|any) penalt(?:y|ies)\b|\btakes? no penalty\b/i, /\bcan affect even a mindless\b/i, /^You can Activate the item as part of the same activity\b/i, /\b(?:uses the same|counts toward your) multiple attack penalty\b/i, /^(?:Attempt|Make|Roll) an? \w+ check to [A-Z][\w ]*? (?:the|a|an)\b[^.]*\.$/, /^You (?:Administer First Aid|Seek|Grapple|Trip|Disarm|Shove|Demoralize|Feint)\b[^.]*\.$/, /^If you find a hidden creature or object, you can Point Out as a free action\.$/, /\byour target can be up to two sizes larger than you\b/i, /^The foe can be as far as\b/i, /^If you Strike with the weapon before the end of your turn\b/i,
    // (Its user's own movement or Strikes, a line it keeps to: Onyx Panther's full Speed while Sneaking, Blast Boots' longer jumps, The Bear's
    // Strike while grappling with a weapon.)
    /^You can move your full Speed \(instead of half\) on this Sneak action\b/i, /\byou move your full Speed during the Climb\b/i, /\byou can increase the (?:vertical|horizontal) distance of your (?:High|Long) Jump by up to \d+ feet\b/i, /^If you Grapple using a weapon, you can Strike with the weapon only if\b/i,
    // (A temporary immunity to its user's Demoralize it doesn't give, Admonishing Band's with the Warning Shot feat: no card keeps that one, its user
    // does — 2026-10-27.)
    /^If you already have the Warning Shot feat, the target doesn't become temporarily immune to your Demoralize, potentially allowing you to Demoralize them again\.$/i];
// (A degree the item changes, Ensnaring Disk's "If you roll a critical failure on this check, you get a failure instead", Jug of Fond
// Remembrance's "If you fail but don't critically fail this check, you get a success instead": action.degree, the outcome the card acts on —
// scripts/item-actions.js. And a condition on its user after it, the Jug's "You're then Stupefied 1 for 3 rounds": action.selfAfter.)
const DEGREE_ADJUST = [[/^If you roll a critical failure(?: on (?:this|the) check)?, you get a failure instead\.$/i, { criticalFailure: "failure" }], [/^If you fail but don't critically fail this check, you get a success instead\.$/i, { failure: "success" }]];
const SELF_AFTER = /^You're then (Stupefied|Fatigued|Sickened|Clumsy|Enfeebled|Drained) (\d+) for (\d+) (rounds?|minutes?)\.$/i;
export function degreeAdjustOf(after) {
    const sentences = String(after ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    return Object.assign({}, ...sentences.flatMap((sentence) => DEGREE_ADJUST.filter(([line]) => line.test(sentence)).map(([, change]) => change)));
}
export function selfAfterOf(after) {
    const match = String(after ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => SELF_AFTER.exec(sentence.trim())).find(Boolean);
    return match ? { slug: match[1].toLowerCase(), value: Number(match[2]), duration: { mode: "fixed", value: Number(match[3]), unit: /^min/i.test(match[4]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" } } : null;
}
export function actionLeaves(action) {
    // (Used within its user's own action, every sentence read: its after its card's lines, readWithinActivity; or its whole Effect, readUsedSkillTo.)
    if (action?.within || action?.whole) return [];
    const sentences = String(action?.after ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    return sentences.filter((sentence) => {
        if (AFTER_LINES.some((line) => line.test(sentence))) return false;
        if (successGains(sentence) || degreeRider(sentence)) return false;
        if (action.damage && (SUCCESS_DAMAGE.test(sentence) || SUCCESS_DICE.test(sentence) || CRITICAL_DOUBLE.test(sentence) || /^If you succeed, you crush the creature\b/i.test(sentence))) return false;
        if (DEGREE_ADJUST.some(([line]) => line.test(sentence)) || SELF_AFTER.test(sentence)) return false;
        if (action.escape && ESCAPE_DC.test(sentence)) return false;
        if (action.bonus && /\bgain an? \+\d+ (?:item|circumstance|status) bonus\b/i.test(sentence) && !/\bif\b/i.test(sentence)) return false;
        return true;
    });
}

// options.basicActions: the ability module's compiled actions — their rows for the degree, applied after PF2e's roll.
export function itemActionPlan(html, base, options = {}) {
    const read = readItemAction(html, options.item ?? null);
    if (!read) return null;
    const takes = read.succeededTakes ? directDamagePlan(`The target takes ${read.succeededTakes.formula} ${read.succeededTakes.persistent ? "persistent " : ""}${read.succeededTakes.type} damage.`, { ...base, activation: base.activation ?? null }) : null;
    const damage = takes ? { success: takes, criticalSuccess: takes } : degreeDamage(html, base);
    const degree = degreeAdjustOf(read.after);
    const selfAfter = selfAfterOf(read.after);
    const action = { ...read, ...(damage ? { damage } : {}), ...(Object.keys(degree).length ? { degree } : {}), ...(selfAfter ? { selfAfter } : {}) };
    // (Its own Escape DC on the grab's Grabbed and Restrained: Binding Coil's.)
    const escaped = (basic) => (!basic || !read.escape ? basic : { ...basic, resolution: { ...basic.resolution, outcomes: Object.fromEntries(Object.entries(basic.resolution.outcomes).map(([degree, row]) => [degree, { ...row, effects: (row.effects ?? []).map((effect) => (effect.kind === "condition" && ["grabbed", "restrained"].includes(effect.slug) && effect.recipient !== "self" ? { ...effect, duration: { ...(effect.duration ?? { mode: "until-escape" }), escape: { dc: read.escape.dc } } } : effect)) }])) } });
    const compiled = (slug) => {
        const basic = options.basicActions?.[slug] ?? null;
        return basic && !basic.builtin ? escaped(basic) : null;
    };
    // (One of several: each one's rows, by slug.)
    const basics = action.slugs ? Object.fromEntries(action.slugs.map((slug) => [slug, compiled(slug)])) : null;
    const leaves = actionLeaves(action);
    return { ...base, builtin: "item-action", automation: { level: leaves.length ? "guided" : "automatic" }, targeting: { target: action.targeted ? "the creature targeted" : "self", range: null, area: null }, trigger: { event: "use" }, action: { ...action, basic: withRiders(compiled(action.slug), action.riders), ...(basics ? { basics } : {}) }, ...(leaves.length ? { partial: true } : {}) };
}

// The plan to keep: the action over nothing, a note alone or the GM's fallback.
// (Or over a partial reading when the action read its whole Effect, Venomed Tongue's: action.whole.)
export const itemActionOver = (plan, action) => (action && (!plan || plan.noteOnly || plan.builtin === "no-effect" || (action.action?.whole && plan.partial)) ? action : plan);
