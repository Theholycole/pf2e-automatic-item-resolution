// An alchemical item installed in the item, whose numbers its activation uses and which the activation uses up: Living Leaf Weave's
// "Requirements An elixir of life is installed in the armor Effect Slithering vines grow from the armor, granting an item bonus to
// Athletics checks to Grapple, to your Fortitude DC to resist Grapple, Disarm, or Shove attempts, and to your Reflex DC to resist Trip
// attempts. The bonus is equal to the elixir's item bonus, and lasts for 3 rounds. The activation uses up the elixir, …", Dread Helm's
// ampoule (an item bonus to Intimidation, mental damage equal to its splash damage to all creatures within 5 feet), Bone Dreadnought
// Plate's lodestone bomb (resistance equal to its splash damage), Ooze Skin's acid flask (rounds equal to its level), Troll Hide's two
// elixirs of life (fast healing, the elixirs' level), Powered Full Plate's bottled lightning.
// plan.item.installed { name, count, modifiers: [{ selector, predicate? }], resistance?: { types }, damage?: { type, radius },
// fastHealing?: true, duration } — values the installed item's: its item bonus, splash damage or level. PF2e doesn't track what's
// installed: the item card picks one of its user's own (scripts/live.js), reads its numbers, gives the Effect and uses the item up.
// What else it says stays a note. Pure.

import { durationIn } from "./rows.js";

const KINDS = "acid flask|bottled lightning|lodestone bomb|dread ampoule|elixirs? of life";
const INSTALLED = new RegExp(String.raw`\bRequirements (An?|Two) (${KINDS}) (?:is|are) installed in the (?:armor|shield|helm)\b`, "i");
const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const actions = (words) => words.split(/,\s*(?:or |and )?|\s+(?:or|and)\s+/).map((name) => name.trim()).filter(Boolean).map((name) => `action:${slug(name)}`);
const anyOf = (list) => (list.length === 1 ? [list[0]] : [{ or: list }]);

// The words a bonus is to → modifiers: "Athletics checks to Grapple", "your Fortitude DC to resist Grapple, Disarm, or Shove attempts",
// "Intimidation checks", "Escape and Squeeze checks" (actions, not a skill: any check for them).
function modifiersOf(words) {
    const parts = words.replace(/^to /i, "").split(/,? and to |, to /i);
    const modifiers = [];
    for (const part of parts) {
        const dc = /^(?:your )?(Fortitude|Reflex|Will) DC to resist (.+?) attempts$/i.exec(part.trim());
        if (dc) {
            modifiers.push({ selector: `${dc[1].toLowerCase()}-dc`, predicate: anyOf(actions(dc[2])) });
            continue;
        }
        const skill = /^(?:your )?([A-Z]\w+) checks(?: to (.+))?$/.exec(part.trim());
        if (skill && SKILLS.includes(skill[1].toLowerCase())) {
            modifiers.push({ selector: skill[1].toLowerCase(), ...(skill[2] ? { predicate: anyOf(actions(skill[2])) } : {}) });
            continue;
        }
        const named = /^((?:[A-Z]\w+)(?:,? (?:and|or) [A-Z]\w+)*) checks$/.exec(part.trim());
        if (named) {
            modifiers.push({ selector: "check", predicate: anyOf(actions(named[1])) });
            continue;
        }
        return null;
    }
    return modifiers.length ? modifiers : null;
}

// The activation's text (plain) → { name, count, modifiers, resistance?, damage?, fastHealing?, duration, said } or null.
export function readInstalled(text) {
    const plain = String(text ?? "");
    const installed = INSTALLED.exec(plain);
    if (!installed) return null;
    const name = installed[2].toLowerCase().replace(/^elixirs of life$/, "elixir of life");
    const body = plain.slice(installed.index + installed[0].length).replace(/^\.?\s*Effect\s*/i, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((sentence) => sentence.trim()).filter(Boolean);
    const said = new Set();
    let modifiers = [];
    let resistance = null;
    let damage = null;
    let fastHealing = false;
    let duration = null;
    let lowered = null;
    for (const [index, sentence] of sentences.entries()) {
        // ("granting an item bonus to X equal to the acid flask's item bonus", "The mist grants an item bonus to Intimidation checks equal to …",
        // "add the bottled lightning's item bonus to your Athletics checks to …"; Living Leaf Weave's list, its value the next sentence's.)
        const equal = /\b(?:granting|grants) an item bonus to (.+?) equal to the [\w ]+?'s item bonus\b/i.exec(sentence) ?? /\badd the [\w ]+?'s item bonus to (.+?)\.$/i.exec(sentence);
        const listed = equal ? null : /\bgranting an item bonus to (.+?)\.$/i.exec(sentence);
        const next = sentences[index + 1] ?? "";
        const words = equal?.[1] ?? (listed && /^The bonus is equal to the [\w ]+?'s item bonus\b/i.test(next) ? listed[1] : null);
        if (words) {
            const read = modifiersOf(words);
            if (read) {
                modifiers.push(...read);
                said.add(index);
                if (listed) said.add(index + 1);
            }
        }
        const resist = /\bresistance to ([a-z, ]+?) damage equal to the [\w ]+?'s splash damage\b/i.exec(sentence);
        if (resist) {
            resistance = { types: resist[1].split(/,\s*(?:and )?|\s+and\s+/).map((type) => type.trim()).filter(Boolean) };
            said.add(index);
        }
        const harm = /\bdeals (\w+) damage equal to the [\w ]+?'s splash damage to all creatures within an? (?:@Template\[[^\]]*?distance:(\d+)[^\]]*\]|(\d+)-foot emanation) other than you\b/i.exec(sentence);
        if (harm) {
            damage = { type: harm[1].toLowerCase(), radius: Number(harm[2] ?? harm[3]) };
            said.add(index);
        }
        if (/\bAt the start of each of your turns, you regain Hit Points equal to the level of the loaded elixirs\b/i.test(sentence)) {
            fastHealing = true;
            said.add(index);
        }
        // (Its time: "for 3 rounds", "for 10 minutes", "These effects last for 20 minutes", or the item's level in rounds.)
        if (/\bfor a number of rounds equal to the level of the [\w ]+? installed\b/i.test(sentence)) {
            duration = { from: "level", unit: "rounds" };
            said.add(index);
        } else if (!duration) {
            const time = /\b(?:for|lasts for) (\d+) (rounds?|minutes?|hours?)\b/i.exec(sentence);
            if (time) {
                duration = durationIn(`for ${time[1]} ${time[2]}`, null);
                // (A sentence about its time alone, "Ooze skin remains activated for …", is read; one saying more stays.)
                if (/^(?:These effects last for|[\w ]+? remains activated for)\b/i.test(sentence) && !/\bbut\b/i.test(sentence)) said.add(index);
            }
        }
        // (The armor's own Strength requirement lowered, Powered Full Plate's "lowered by 1, or by 2 if the loaded bottled lightning's item
        // bonus to attack rolls is +3 or higher": PF2e's ItemAlteration on it, its penalties PF2e's from that — so that sentence too.)
        const strength = /\bThe armor's Strength requirement is lowered by (\d+), or by (\d+) if the loaded [\w ]+?'s item bonus to attack rolls is \+(\d+) or higher\./i.exec(sentence);
        if (strength) {
            lowered = { by: Number(strength[1]), more: Number(strength[2]), at: Number(strength[3]) };
            said.add(index);
        }
        if (/^The armor's normal penalties still apply, based on this altered Strength\.$/i.test(sentence)) said.add(index);
        // (Using it up is the card's.)
        if (/\bThe activation uses up the\b/i.test(sentence)) said.add(index);
    }
    if (!modifiers.length && !resistance && !damage && !fastHealing) return null;
    // (Its other sentences that say a rule: notes.)
    const RULE = /\b(?:damage|bonus|penalty|Hit Points|resistance|checks?|saves?|DC|Strength|Speed|deactivat\w*|Interact|attack|Strike|grapples?|swallows?|reduce|decrease)\b/i;
    const notes = sentences.filter((sentence, index) => !said.has(index) && RULE.test(sentence));
    return { name, count: /^two$/i.test(installed[1]) ? 2 : 1, modifiers, ...(resistance ? { resistance } : {}), ...(damage ? { damage } : {}), ...(fastHealing ? { fastHealing: true } : {}), ...(lowered ? { strength: lowered } : {}), duration, notes };
}

// The plan: the item card's own row, its installed item's numbers given on Apply.
export function installedPlan(base, read) {
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    return {
        ...base,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        ...(read.notes.length ? { notes: read.notes, partial: true } : {})
    };
}
