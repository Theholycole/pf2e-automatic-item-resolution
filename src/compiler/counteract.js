// A consumable that counteracts what afflicts its drinker (Surging Serum's "attempts to counteract each effect that's
// inflicting the Clumsy or Enfeebled condition on you, using a 2nd-rank counteract and a +8 counteract modifier", Bottled
// Catharsis's emotion effects, Panacea's curses and diseases, Contagion Metabolizer's highest-level poison or disease): what
// the counteract card (src/live/counteract-card.js, the user's answer of 2026-10-15) lists on the drinker and rolls. Not
// one aimed elsewhere (a spell within 30 feet, the triggering spell, ice, adhesives), nor one that "can't be counteracted".
// Pure.

import { plainText } from "./rows.js";

const CONDITIONS = ["blinded", "clumsy", "confused", "controlled", "dazzled", "deafened", "doomed", "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened", "grabbed", "immobilized", "paralyzed", "petrified", "restrained", "sickened", "slowed", "stunned", "stupefied"];
const CONDITION_WORDS = { paralysis: "paralyzed", petrification: "petrified" };
const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)?`;
// (And Bloodstone Doll's "Attempt a counteract check against the triggering spell", The Locksmith's "the triggering affliction", The
// Theater's "attempts to counter the misfortune effect".)
const FREE = /\b(?:counteract|counteract check against|counter) (the triggering spell|the triggering illusion|the triggering affliction|the misfortune effect|the fire|the effect or item|the spell|the darkness|that effect|the effect(?= with a counteract modifier))\b|\bto end (a magical darkness effect)\b/i;
// (Its user's numbers: "a counteract modifier of your Class DC – 10", "a counteract rank equal to your level divided by 2 (rounded up)", "using
// half your level (rounded up) as the counteract rank" — counteract.fromUser, the card's from its user's class DC and level.)
const CLASS_DC_MODIFIER = /\bcounteract (?:check )?modifier (?:of|equal to) your class DC\s*[–-]\s*10\b/i;
const HALF_LEVEL_RANK = /\bcounteract rank equal to your level divided by 2 \(rounded up\)|\busing half your level \(rounded up\) as the counteract rank\b/i;

// (Determination's benefit, Flame Navette's "you gain the benefit of the fighter's Determination class feat, with a counteract rank of 8
// and a counteract modifier of +22": the feat's own choice on its user — one nonpermanent condition ends outright, or one spell or magical
// effect is counteracted.)
const DETERMINATION = /\bgain the benefit of the fighter's Determination class feat, with a counteract rank of (\d+) and a counteract modifier of \+(\d+)/i;

// GM Core's DCs by level, 0 to 25.
const LEVEL_DCS = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];

// The text → { modifier, rank, conditions, traits, afflictions, pick: "each" | "one" | "highest", reduce?, notes } or null.
// (Determination's: { …, spells, magical, endsConditions, self }.)
export function readCounteract(html, { level = 0 } = {}) {
    const text = plainText(html).replace(/\bCraft Requirements\b.*$/i, "");
    const determination = DETERMINATION.exec(text);
    if (determination) {
        const feat = /\bIf you have the Determination feat, you can use your own modifier if it's better\./i.test(text);
        return {
            modifier: Number(determination[2]),
            rank: Number(determination[1]),
            conditions: [...CONDITIONS, "persistent-damage"],
            traits: [],
            afflictions: [],
            spells: true,
            magical: true,
            endsConditions: true,
            self: true,
            pick: "one",
            notes: [
                "Tick one: a condition ends outright; a spell or magical effect is counteracted.",
                "It doesn't undo Hit Point damage already taken, and can't end an ongoing affliction.",
                ...(feat ? ["With the Determination feat, use your own counteract modifier if it's better (by hand)."] : [])
            ]
        };
    }
    // (A counteract check with a rank and no modifier, Flowing Water's Embody the Truce, "Attempt a counteract check with a counteract rank of 2 to
    // end the effect" — the triggering effect its trigger names: GM Core's DC for the item's level, less 10, the user's answer to question 5
    // (2026-10-26), a line of the card saying the GM may change it.)
    const bare = /\bAttempt a counteract check with a counteract rank of (\d+)(?:st|nd|rd|th)? to end the effect\./i.exec(text);
    if (bare) {
        const modifier = (LEVEL_DCS[Math.max(0, Math.min(25, Number(level) || 0))] ?? 14) - 10;
        return { modifier, rank: Number(bare[1]), conditions: [], traits: [], afflictions: [], free: { name: "the triggering effect" }, pick: "one", notes: [`Its counteract modifier +${modifier}: the item gives none, so its level's DC less 10 (the GM's call).`] };
    }
    // (The sentence that counteracts, and the next one, where the rank or modifier is often given.)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(])/);
    const at = sentences.findIndex((sentence) => /\b(?:attempts? (?:a counteract check|to counteract|to counter the misfortune)|to counteract ailments|the salve attempts to counteract)\b|\bcounteract modifier (?:is|of) \+\d+/i.test(sentence));
    if (at < 0) return null;
    const said = sentences.slice(at, at + 3).join(" ");
    // (Or a spell on a creature nearby, Etheric Essence Disruptor's "attempt to counteract an active divine or occult spell within 30
    // feet, with a +7 counteract modifier and a counteract rank of 2": a spell's Effect on a creature within that distance, its
    // tradition the GM's to check.)
    const near = /\battempt to counteract an active ((?:arcane|divine|occult|primal)(?: or (?:arcane|divine|occult|primal))?) spell within (\d+) feet\b/i.exec(said);
    // (Or conditions on an adjacent creature, Violet Ray's "You apply the violet ray to an adjacent creature and attempt to counteract the
    // Blinded, Clumsy, … condition with a counteract rank of 6 and a counteract modifier of +22": the creatures beside its user.)
    const adjacent = /\bto an adjacent creature and attempt to counteract\b/i.test(said);
    // (A list of conditions to pick from, The Teamster's "Select one of the following conditions currently affecting you: Blinded, …".)
    const listed = /\bSelect one of the following conditions currently affecting you: ([^.]+)\./i.exec(text)?.[1] ?? "";
    // (Or what it's aimed at that isn't on a creature: Antimagic Armor's "attempts to counteract the triggering spell", Frost Brand's "the blade
    // attempts to counteract the fire", Cloth of Nullification's "attempt to counteract the effect or item", Reflecting Shield's "the spell",
    // Brilliant's "to end a magical darkness effect": the card's one row for it, its DC and rank the GM's, and the GM's to end once
    // counteracted. Its own rank when the text says it's a stored spell's: the GM's too.)
    const free = FREE.exec(said);
    if (free && !/\bcan't be counteracted\b/i.test(said)) {
        const modifierOf = /\+(\d+) counteract modifier\b|\bcounteract (?:check )?modifier (?:of |is )?\+(\d+)|\bcounteract (?:check )?modifier (?:of |is )?1d20\s*\+\s*(\d+)/i.exec(said);
        const fromUser = { ...(CLASS_DC_MODIFIER.test(said) ? { modifier: "class-dc" } : {}), ...(HALF_LEVEL_RANK.test(said) ? { rank: "half-level" } : {}) };
        if (!modifierOf && !fromUser.modifier) return null;
        const stated = new RegExp(String.raw`\bcounteract rank (?:of |is )?${ORDINAL}\b|\ban? ${ORDINAL}-rank (?:Dispel Magic|counteract)\b`, "i").exec(said);
        const stored = /\busing the rank of the spell stored in\b/i.test(said);
        const rank = fromUser.rank ? null : stated ? Number(stated[1] ?? stated[2]) : stored ? null : Math.max(1, Math.ceil(Number(level) / 2));
        // (Twilight Lantern's "the effect", a darkness effect it targets; Crimson Tome's "that effect", one restoring the slain to life.)
        const name = { "the triggering spell": "the triggering spell", "the triggering illusion": "the triggering illusion", "the triggering affliction": "the triggering affliction", "the misfortune effect": "the misfortune effect", "the fire": "the magical fire", "the effect or item": "the magical effect or item", "the spell": "the spell", "the darkness": "the magical darkness", "a magical darkness effect": "the magical darkness", "that effect": "the effect", "the effect": /\bdarkness effect\b/i.test(`${sentences[at - 1] ?? ""} ${said}`) ? "the darkness effect" : "the effect" }[(free[1] ?? free[2]).toLowerCase()];
        const after = sentences.slice(at + 1, at + 3).filter((sentence) => /\b(?:If it fails|If the spell is successfully counteracted|Regardless of the result|Once you do|This expends|If you succeed)\b/i.test(sentence));
        // (What a counteracted spell does then, the GM's: Bloodstone Doll's "If the spell would be counteracted, the bloodstone doll instead
        // influences the summoned creature. You gain control of …" — that sentence and those after it, notes.)
        const would = sentences.findIndex((sentence, index) => index > at && /^If the spell would be counteracted\b/i.test(sentence.trim()));
        if (would > 0) after.push(...sentences.slice(would).map((sentence) => sentence.trim()).filter(Boolean));
        // (What each degree does beside ending it, Herald's Ring's "Critical Success All of the damage is reflected back on its source", the
        // GM's by the result the card reports.)
        const degrees = sentences.slice(at + 1).map((sentence) => /^(Critical Success|Success|Failure|Critical Failure) (.+)$/.exec(sentence.trim())).filter(Boolean).map(([, degree, what]) => `${degree.charAt(0)}${degree.slice(1).toLowerCase()}: ${what.replace(/\.$/, "")} (by hand).`);
        after.push(...degrees);
        return { modifier: modifierOf ? Number(modifierOf[1] ?? modifierOf[2] ?? modifierOf[3]) : null, rank, ...(Object.keys(fromUser).length ? { fromUser } : {}), conditions: [], traits: [], afflictions: [], free: { name }, pick: "one", notes: [...(stored ? ["Its counteract rank is the stored spell's: give it on the card."] : []), ...after] };
    }
    // (Aimed at the drinker: "on you", "affecting you", "afflicting you", "within yourself", or a creature the salve is applied to.)
    if (!near && !adjacent && !listed && !/\b(?:on you|affecting you|afflicting you|you are currently suffering|within yourself|of your choice|counteract (?:the|its) (?:paralysis|petrification)|the effect causing your condition)\b/i.test(said) && !/\bApplying this [\w ]+ to a creature\b|\bWhen you (?:consume|drink|eat)\b[^.]*\bcounteract\b/i.test(text)) return null;
    if (/\bcan't be counteracted\b|\bthe triggering spell\b/i.test(said) || (!near && /\bwithin \d+ feet\b/i.test(said))) return null;
    const modifier = Number(
        /\+(\d+) counteract modifier\b/i.exec(said)?.[1]
        ?? /\bcounteract (?:check )?modifier (?:of |is )?\+(\d+)/i.exec(said)?.[1]
        // (Skarja's Heartstone's "counteract modifier 1d20+23".)
        ?? /\bcounteract (?:check )?modifier (?:of |is )?1d20\s*\+\s*(\d+)/i.exec(said)?.[1]
        ?? /\(counteract \+(\d+)\)/i.exec(said)?.[1]
        ?? /\b(?:a|with a) \+(\d+) modifier\b/i.exec(said)?.[1]
        ?? /\b(?:a )?1d20\s*\+\s*(\d+) modifier\b/i.exec(said)?.[1]
        ?? NaN
    );
    if (!Number.isFinite(modifier)) return null;
    const stated = new RegExp(String.raw`\b${ORDINAL}-rank counteract\b|\bat ${ORDINAL}-rank\b|\bcounteract (?:rank|level) (?:of |is )?${ORDINAL}\b`, "i").exec(said);
    // (No rank stated: an item's is half its level, rounded up.)
    const rank = stated ? Number(stated[1] ?? stated[2] ?? stated[3]) : Math.max(1, Math.ceil(Number(level) / 2));
    if (near) return { modifier, rank, conditions: [], traits: [], afflictions: [], spells: true, within: Number(near[2]), pick: "one", notes: [`Only an active ${near[1]} spell: tick one that is.`] };
    // (What it counteracts: in the sentences that say counteract — Fu Water names them in the one after "to counteract
    // ailments within yourself".)
    // (Bracers of Pain's "the effect causing your condition": the conditions its Trigger names, "You gain an effect that makes you
    // Immobilized, Slowed, Stupefied, or Paralyzed".)
    const trigger = /\bthe effect causing your condition\b/i.test(said) ? /\bTrigger\b(.*?)(?:\bRequirements?\b|\bEffect\b|$)/s.exec(text)?.[1] ?? "" : "";
    const counteractSentence = `${sentences.slice(Math.max(0, at - 1), at + 3).filter((sentence) => /\bcounteract|\bremoving\b/i.test(sentence)).join(" ")} ${trigger}`.trim();
    const words = `${counteractSentence} ${listed}`.toLowerCase();
    const conditions = [...new Set([...CONDITIONS.filter((slug) => new RegExp(String.raw`\b${slug}\b`).test(words)), ...Object.entries(CONDITION_WORDS).filter(([word]) => words.includes(word)).map(([, slug]) => slug)])];
    const traits = [...new Set([...[...counteractSentence.matchAll(/\bthe (\w+) trait\b/gi)].map((match) => match[1].toLowerCase()), ...[...counteractSentence.matchAll(/\b(emotion|mental|transmutation|fear) effects?\b/gi)].map((match) => match[1].toLowerCase())])];
    // (Or "any one affliction", Golden Gloves': each kind.)
    const afflictions = /\bany one affliction\b/i.test(counteractSentence) ? ["curse", "disease", "poison"] : ["curse", "disease", "poison"].filter((kind) => new RegExp(String.raw`\b${kind}s?\b`, "i").test(counteractSentence));
    if (!conditions.length && !traits.length && !afflictions.length) return null;
    const singled = /\b(?:one|a single) (?:effect|condition)\b/i.test(`${counteractSentence} ${sentences.slice(at, at + 4).join(" ")}`) || Boolean(listed);
    const pick = /\bhighest[- ]level\b/i.test(counteractSentence) ? "highest" : /\b(?:each|all|every)\b/i.test(counteractSentence) && !singled ? "each" : "one";
    // (Moon Radish Soup: "if successful, it reduces the value of your stupefied condition by 1 (or by 2 on a critical success)".)
    const reduce = /\breduces the value of your \w+ condition by (\d+)(?: \(or by (\d+) on a critical success\))?/i.exec(said);
    const notes = [
        ...sentences.slice(at + 1, at + 4).filter((sentence) => /\b(?:doesn't happen until|temporarily immune|You're then|hostile|negative|the condition returns|levels lower)\b/i.test(sentence)),
        // (The Teamster's "If the source of the condition is more than 4 levels lower than your current level, The Teamster automatically
        // counters the condition", before the counteract.)
        ...sentences.slice(Math.max(0, at - 1), at).filter((sentence) => /\bautomatically counters?\b/i.test(sentence)),
        ...(/\busing the source of the condition to determine\b/i.test(said) ? ["Its DC and rank are those of what caused the condition."] : [])
    ];
    return { modifier, rank, conditions, traits, afflictions, pick, ...(adjacent ? { within: 5 } : {}), ...(reduce ? { reduce: { success: Number(reduce[1]), criticalSuccess: Number(reduce[2] ?? reduce[1]) } } : {}), ...(notes.length ? { notes } : {}) };
}

// A partial plan without the note that only says again the counteract its card makes: Panacea Fruit's "The fruit has a counteract rank of 9
// and a 1d20+30 modifier for the rolls against each condition", its item.counteract rank 9 and +30 — and whole when that was all it left.
// (Its rank and modifier, those of the counteract read, and nothing else: no "if", "unless" or "except".)
export function restatesCounteract(sentence, counteract) {
    if (!counteract) return false;
    const text = String(typeof sentence === "string" ? sentence : sentence?.text ?? "");
    const rank = /\bcounteract rank of (\d+)\b/i.exec(text);
    const modifier = /\b(?:1d20\s*\+\s*|\+)(\d+)(?: counteract)? modifier\b/i.exec(text);
    return Boolean(rank && modifier) && Number(rank[1]) === counteract.rank && Number(modifier[1]) === counteract.modifier && !/\bif\b|\bunless\b|\bexcept\b/i.test(text);
}

export function withoutCounteractRestated(plan) {
    const counteract = plan?.item?.counteract;
    if (!counteract || !plan.notes?.length) return plan;
    const restates = (note) => restatesCounteract(note, counteract);
    const notes = plan.notes.filter((note) => !restates(note));
    if (notes.length === plan.notes.length) return plan;
    const result = { ...plan, notes: notes.length ? notes : undefined };
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
