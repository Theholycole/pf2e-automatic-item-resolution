// An item's "Activate" lines: how many actions each takes, its traits and its
// name when it has one ("Activate—Tea Ceremony 10 minutes (concentrate,
// manipulate)"). Pure.

// PF2e's action glyphs: 1/A one action, 2/D two, 3/T three, R reaction, F free.
const GLYPHS = { 1: "1", a: "1", 2: "2", d: "2", 3: "3", t: "3", r: "reaction", f: "free" };

const ACTIVATE = /<strong>\s*Activat(?:e|ion)\s*(?:[—–-]\s*([^<]*?))?\s*<\/strong>([\s\S]*?)(?=<\/p>|<br\s*\/?>|<hr|<strong>|$)/gi;

const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function readOne(name, rest) {
    const glyph = /<span class="action-glyph">\s*([^<\s]+)\s*<\/span>/i.exec(rest)?.[1]?.toLowerCase();
    const text = plain(rest.replace(/<span class="action-glyph">[^<]*<\/span>/gi, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1"));
    const traits = /\(([^)]*)\)/.exec(text)?.[1]?.split(",").map((trait) => trait.trim().toLowerCase()).filter(Boolean) ?? [];
    let time = GLYPHS[glyph] ?? null;
    if (!time) time = /^(\d+\s+(?:minutes?|hours?|rounds?|days?))\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
    // "Activate Cast a Spell": the spell's own actions (the spell module's).
    if (!time && /^Cast a Spell\b/i.test(text)) time = "cast";
    // "Activate (manipulate) …" with the glyph in the name ("Activate—Drink [1]").
    const named = name ? plain(name) : null;
    return { name: named || null, time, traits, raw: plain(`Activate${named ? `—${named}` : ""} ${glyph ? `[${glyph}] ` : ""}${text}`).slice(0, 160) };
}

// Every activation, in order; [] when the item has none (most snares, talismans with only a trigger). Each with its
// Trigger's words when it has one (Wolf Fang's "You successfully Trip a foe"), and what they're read as (triggerOn).
export function readActivations(html) {
    const text = String(html ?? "");
    const matches = [...text.matchAll(ACTIVATE)];
    return matches.map((match, index) => {
        const one = readOne(match[1], match[2]);
        const end = match.index + match[0].length;
        // (Its own lines: to the next Activate, its Effect, or any other heading — Prey Mutagen's "Benefit" and the Timely Dodge
        // reaction it grants, whose Trigger is that reaction's; its Frequency, Trigger, Requirements and Cost are its own.)
        const block = text.slice(end, matches[index + 1]?.index ?? text.length);
        const stop = block.search(/<strong>\s*(?!Frequency\b|Trigger\b|Requirements?\b|Prerequisites?\b|Cost\b)[^<]+<\/strong>/i);
        const region = stop < 0 ? block : block.slice(0, stop);
        const found = /<strong>\s*Trigger\s*<\/strong>([\s\S]*?)(?=<\/p>|<hr|<strong>|$)/i.exec(region);
        const trigger = found ? plain(found[1].replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[\/act ([\w-]+)[^\]]*\]\](?:\{([^}]*)\})?/g, (whole, slug, label) => label ?? slug.replace(/-/g, " "))).replace(/[.;,]\s*$/, "") : null;
        return trigger ? { ...one, trigger, triggerOn: triggerOn(trigger) } : one;
    });
}

// A trigger's words → { event, action?, degrees? }, for the plan's other readers (the simulator):
//   "after-action"  its user's action ("You successfully Trip a foe": trip, success or critical success);
//   "after-strike"  its user's Strike ("You critically hit with a Strike", "Your Strike with the affixed weapon hits a target");
//   "after-save"    its user's save ("You fail or critically fail a Will save");
//   "attacked"      an attack at its user ("You are hit by a ranged attack", "An enemy targets you with a Strike"); "missed"
//                   one that misses it ("An attack misses you");
//   "before-roll"   a roll it hasn't made yet ("You make an attack with the affixed weapon, but you haven't rolled yet"), what:
//                   "attack" | "save" | "check";
//   "damaged"       damage it takes or would take ("You take fire damage", "You would take physical damage"), types?, before;
//   "reduced-to-0"  "You would be reduced to 0 Hit Points but not immediately killed";
//   "condition"     a condition it gains or loses ("You gain the Frightened condition", "You lose the Dying condition"), slug,
//                   change "gain" | "lose" (and "You are Dying at the beginning of your turn": dying, "start");
//   "action"        an action of its own ("You Stride or Step", "You attempt to Escape", "You Shield Block"), actions (or
//                   traits: "You use an action with the move trait"); "strike" a Strike as it's made ("You Strike with the
//                   affixed weapon");
//   "initiative"    "You roll for initiative"; "turn-start" "You begin your turn …"; "falling" "You fall", "You begin to fall";
//   "other"         anything else (its words say).
// Each but "other" with the trigger's qualifiers too (above): target { condition, trait, foe }, weapon/shield "affixed".
// What a trigger says about the creature and the item: target { condition?, trait?, foe? } ("an Off-Guard creature", "a
// creature that has the unholy trait", "an incorporeal creature", "a foe") and weapon/shield "affixed" ("with the affixed
// weapon") — the simulator's to check before it plays one.
const CONDITION_NAMES = "off-guard|frightened|prone|grabbed|restrained|immobilized|blinded|dazzled|sickened|slowed|stunned|stupefied|clumsy|enfeebled|fascinated|fleeing|confused|paralyzed|unconscious|dying|wounded|concealed|hidden|undetected|persistent bleed";
const TRAIT_NAMES = "unholy|holy|undead|incorporeal|fiend|demon|devil|celestial|construct|dragon|giant|fey|aberration|animal|beast|elemental|plant|fungus|ooze|spirit|living|metal";
function qualifiers(text) {
    const target = {};
    const condition = new RegExp(String.raw`\b(?:an?|the|to an?) (${CONDITION_NAMES}) (?:creature|target|foe|enemy|opponent)\b|\b(?:creature|target|foe|enemy) (?:that's|that is|who is) (${CONDITION_NAMES})\b`, "i").exec(text);
    if (condition) target.condition = (condition[1] ?? condition[2]).toLowerCase();
    const trait = new RegExp(String.raw`\b(?:creature|target|foe|enemy) (?:that has|with) the (\w+) trait\b|\b(?:an?|the) (${TRAIT_NAMES}) (?:creature|target|foe|enemy|opponent)\b`, "i").exec(text);
    if (trait) target.trait = (trait[1] ?? trait[2]).toLowerCase();
    if (/\b(?:a foe|an enemy|enemies|foes|an opponent)\b/i.test(text)) target.foe = true;
    const affixed = /\bthe affixed (weapon|shield|firearm or crossbow|firearm|crossbow|armor)\b/i.exec(text);
    return {
        ...(Object.keys(target).length ? { target } : {}),
        ...(affixed ? { [/shield/i.test(affixed[1]) ? "shield" : /armor/i.test(affixed[1]) ? "armor" : "weapon"]: "affixed" } : {})
    };
}

const ACTIONS = "Trip|Grapple|Shove|Disarm|Demoralize|Feint|Reposition|Escape|Recall Knowledge|Seek|Hide|Sneak|Treat Wounds|Administer First Aid|Create a Diversion";
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
export function triggerOn(words) {
    const read = readTrigger(words);
    return read.event === "other" ? read : { ...read, ...qualifiers(String(words ?? "")) };
}

function readTrigger(words) {
    const text = String(words ?? "").trim();
    const action = new RegExp(String.raw`^You (successfully|critically succeed (?:at|to|on)(?: an? \w+ check to)?|succeed at (?:an? \w+ check to)?|critically succeed at an? \w+ check to) (${ACTIONS})\b`, "i").exec(text);
    if (action) return { event: "after-action", action: slugOf(action[2]), degrees: /critically/i.test(action[1]) ? ["criticalSuccess"] : ["success", "criticalSuccess"] };
    if (/^You critically (?:hit|succeed at (?:a|an|your) (?:Strike|attack roll))\b|^Your Strike [^.]*?\b(?:critically hits|was a critical success)\b|^You critically succeed at a Strike\b|attack roll [^.]*?\bis a critical success\b/i.test(text)) return { event: "after-strike", degrees: ["criticalSuccess"] };
    if (/^You (?:hit|successfully Strike|damage|deal damage)\b|^Your Strike [^.]*?\b(?:hits|damages)\b|^You (?:succeed|hit) (?:at|with) (?:a|an|your) (?:Strike|attack)\b/i.test(text)) return { event: "after-strike", degrees: ["success", "criticalSuccess"] };
    if (/^You miss (?:on|with) (?:a|an|your) (?:[\w-]+ )?(?:Strike|attack)\b/i.test(text)) return { event: "after-strike", degrees: ["failure", "criticalFailure"] };
    const save = /^You (fail(?: or critically fail)?|critically fail|succeed(?: or critically succeed)?|critically succeed) (?:at )?an? (?:(Fortitude|Reflex|Will) )?(?:saving throw|save)\b/i.exec(text);
    if (save) {
        const said = save[1].toLowerCase();
        const degrees = said === "critically fail" ? ["criticalFailure"] : said.startsWith("fail") ? (said.includes("or") ? ["failure", "criticalFailure"] : ["failure"]) : said === "critically succeed" ? ["criticalSuccess"] : said.includes("or") ? ["success", "criticalSuccess"] : ["success"];
        return { event: "after-save", ...(save[2] ? { statistic: save[2].toLowerCase() } : {}), degrees };
    }
    if (/^(?:You are|You're|You would be) (?:hit|critically hit|targeted)\b|^An? (?:[\w-]+ (?:or [\w-]+ )?)?(?:enemy|creature|foe|attacker) [^.]*?\b(?:targets|attacks|hits|critically hits|successfully Strikes) you\b/i.test(text)) return { event: "attacked" };
    // (A creature in its reach acting: Viper's Fang's "A creature within your reach uses a manipulate or move action".)
    if (/^An? (?:creature|enemy|foe) (?:with)?in (?:your )?reach\b/i.test(text)) return { event: "reach-action" };
    if (/^An? (?:attack|Strike) misses you\b/i.test(text)) return { event: "missed" };
    if (/^You fail to save\b/i.test(text)) return { event: "after-save", degrees: ["failure", "criticalFailure"] };
    const rolled = /^You roll a (critical )?(failure|success) on an? (?:(Fortitude|Reflex|Will) )?(?:save|saving throw)\b/i.exec(text);
    if (rolled) return { event: "after-save", ...(rolled[3] ? { statistic: rolled[3].toLowerCase() } : {}), degrees: [`${rolled[1] ? "critical" : ""}${rolled[1] ? rolled[2].charAt(0).toUpperCase() + rolled[2].slice(1).toLowerCase() : rolled[2].toLowerCase()}`] };
    if (/\bhaven't rolled(?: it)?(?: yet)?\b|\bare about to roll\b|^You would roll\b|^You attempt an? (?:[\w ]+? )?(?:check|saving throw|save)\b/i.test(text)) return { event: "before-roll", what: /\battack\b/i.test(text) ? "attack" : /\bsav(?:e|ing throw)\b/i.test(text) ? "save" : "check" };
    if (/\breduced to 0 (?:Hit Points|HP)\b/i.test(text)) return { event: "reduced-to-0" };
    const damaged = /^You (would )?take (?:([\w, ]+?) )?damage\b/i.exec(text);
    if (damaged) {
        const types = (damaged[2] ?? "").toLowerCase().split(/,\s*(?:or\s+)?|\s+or\s+/).map((type) => type.trim()).filter((type) => type && type !== "the");
        return { event: "damaged", ...(types.length ? { types } : {}), ...(damaged[1] ? { before: true } : {}) };
    }
    const condition = /^You (gain|lose|become|would become|would be|are knocked) (?:the )?(\w+)(?: condition)?\b/i.exec(text) ?? /^You are (Dying) at the beginning of your turn\b/i.exec(text);
    if (condition && condition.length === 3) return { event: "condition", slug: condition[2].toLowerCase(), change: condition[1].toLowerCase() === "lose" ? "lose" : "gain" };
    if (condition) return { event: "condition", slug: "dying", change: "start" };
    if (/^You roll (?:\w+ )?(?:for )?initiative\b/i.test(text)) return { event: "initiative" };
    // (The Strike itself, as it's made: "You Strike with the affixed weapon", "You attempt a Strike with …".)
    if (/^You (?:attempt an? |make an? )?(?:[\w-]+ )?Strike\b|^You attack with\b|^You (?:make an attack|attempt an attack roll) with\b/i.test(text)) return { event: "strike" };
    if (/^You begin your turn\b/i.test(text)) return { event: "turn-start" };
    if (/^You (?:begin to )?fall\b/i.test(text)) return { event: "falling" };
    if (/^You use an action with the move trait\b/i.test(text)) return { event: "action", traits: ["move"] };
    const own = new RegExp(String.raw`^You (?:take the |attempt to |use (?:the )?(?:affixed shield to |shield to )?)?((?:Stride|Step|Leap|Escape|Shield Block|Raise a Shield|Treat Wounds|Sense Direction|Balance|Climb|Swim|Seek|Hide|Sneak)(?:(?:,| or) (?:Stride|Step|Leap|Escape|Shield Block|Raise a Shield|Treat Wounds|Sense Direction|Balance|Climb|Swim|Seek|Hide|Sneak))*)\b`, "i").exec(text);
    if (own) return { event: "action", actions: own[1].split(/,\s*|\s+or\s+/).map(slugOf) };
    return { event: "other" };
}

// The ability-compiler action type for an activation time.
export function actionTypeOf(time) {
    if (time === "reaction") return { actionType: "reaction", actions: null };
    if (time === "free") return { actionType: "free", actions: null };
    if (["1", "2", "3"].includes(time)) return { actionType: "action", actions: Number(time) };
    return { actionType: "passive", actions: null };
}
