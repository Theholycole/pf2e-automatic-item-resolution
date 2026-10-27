// An item's proficiency or class requirement (2026-10-20): a talisman's "Requirements You're an expert in Stealth", Lion Badge's "You are an expert in
// Will saves", Jade Cat's "You are trained in Acrobatics" — { kind: "skill" | "save" | "perception", slugs, rank, words }, or null for one
// it can't check ("an expert with the affixed weapon": PF2e doesn't keep what a talisman is affixed to). Live play (scripts/live.js) whispers
// the GM when a character who uses it has a lower rank, as an activation used past its frequency is: the item's been used already. Pure.

const RANKS = { trained: 1, expert: 2, master: 3, legendary: 4 };
const SKILLS = ["acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation", "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"];
// (Or Prerequisites, Wooden Nickel's "Prerequisites You are a master in Deception", 2026-10-27.)
const REQUIREMENT = /\b(?:Requirements?|Prerequisites?) You(?:'re| are) (?:an? )?(trained|expert|master|legendary) in ([A-Za-z ]+?)(?=\.|,| Effect\b| This\b| A\b| An\b| The\b| In\b|$)/;

// (Or its class: Accompaniment Cloak's "Requirements You are a bard", Hexing Jar's "You are a witch" — the class alone; what more it says,
// "a cleric who worships the deity tied to the robe", the GM's.)
const CLASSES = "alchemist|animist|barbarian|bard|champion|cleric|commander|druid|exemplar|fighter|guardian|gunslinger|inventor|investigator|kineticist|magus|monk|oracle|psychic|ranger|rogue|sorcerer|summoner|swashbuckler|thaumaturge|witch|wizard";
const CLASS_REQUIREMENT = new RegExp(String.raw`\bRequirements? You(?:'re| are) an? (${CLASSES})\b`, "i");

// The item's (or activation's) plain text → its requirement, or null.
export function readProficiencyRequirement(text) {
    const kind = CLASS_REQUIREMENT.exec(String(text ?? ""));
    if (kind) return { kind: "class", slugs: [kind[1].toLowerCase()], rank: null, words: `a${/^[aeiou]/i.test(kind[1]) ? "n" : ""} ${kind[1].toLowerCase()}` };
    const match = REQUIREMENT.exec(String(text ?? ""));
    if (!match) return null;
    const rank = RANKS[match[1].toLowerCase()];
    const named = match[2].trim().toLowerCase();
    const save = /^(fortitude|reflex|will) saves?$/.exec(named);
    if (save) return { kind: "save", slugs: [save[1]], rank, words: `${match[1]} in ${match[2].trim()}` };
    if (named === "perception") return { kind: "perception", slugs: ["perception"], rank, words: `${match[1]} in Perception` };
    // (One skill, or one of two: "Deception or Diplomacy".)
    const slugs = named.split(/\s+or\s+/).map((word) => word.trim());
    if (!slugs.every((slug) => SKILLS.includes(slug))) return null;
    return { kind: "skill", slugs, rank, words: `${match[1]} in ${match[2].trim()}` };
}

// The creature's best rank of the ones the requirement names (a character's; null when PF2e keeps none, an NPC's).
export function rankFor(actor, requirement) {
    if (!actor || !requirement || actor.type !== "character") return null;
    const ranks = requirement.slugs.map((slug) => Number(requirement.kind === "save" ? actor.saves?.[slug]?.rank : requirement.kind === "perception" ? actor.perception?.rank : actor.skills?.[slug]?.rank)).filter(Number.isFinite);
    return ranks.length ? Math.max(...ranks) : null;
}

const RANK_WORDS = ["untrained", "trained", "expert", "master", "legendary"];
// Its warning when the creature's rank is below it (or its class another), else null. A character with no class isn't judged.
export function requirementWarning(actor, requirement, itemName) {
    if (requirement?.kind === "class") {
        const slug = actor?.type === "character" ? actor.class?.slug ?? actor.system?.details?.class?.slug ?? null : null;
        if (!slug || requirement.slugs.includes(String(slug).toLowerCase())) return null;
        return `${itemName}: its Requirements need its user to be ${requirement.words}; ${actor.name} is a${/^[aeiou]/i.test(slug) ? "n" : ""} ${String(slug).toLowerCase()}. The GM's call.`;
    }
    const rank = rankFor(actor, requirement);
    if (rank === null || rank >= requirement.rank) return null;
    return `${itemName}: its Requirements need its user to be ${requirement.words}; ${actor.name} is ${RANK_WORDS[rank] ?? "untrained"}. The GM's call.`;
}
