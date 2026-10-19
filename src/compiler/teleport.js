// An item that teleports its user a short way on the battle map: Mad Mammoth's Juke's "You teleport to an unoccupied space within 200
// feet that you can see", Golden Spur's "You teleport to a space you can see within 10 feet of the target", Mercurial Mantle's "Teleport up
// to double your Speed to a location you can see", Gloaming Shard's "teleport to a space adjacent to the target of your Strike". The plan is
// the item module's builtin "teleport": { within (feet) | speedTimes, from: "self" | "target" }. Live play (scripts/teleport.js) has the
// presser click the space on their own canvas; the active GM's client checks it's on the map, unoccupied and in range, and moves the token
// there at once (Foundry's teleport, no animation). The text's other rule sentences are notes. Pure.

const NUMBER = { two: 2, double: 2, twice: 2, three: 3, triple: 3 };
// "You teleport (yourself) (instantly) (up to 30 feet) to an unoccupied space (you can see) within 200 feet (of the target) (that you can see)".
// (Or "… magic to teleport yourself instantly to any unoccupied square within 30 feet", "make a melee Strike … and teleport to an open space
// you can see within 100 feet". Not within some feet of another thing, "a location within 500 feet of the army".)
const OWN = /\b(?:you|You|magic to|and) (?:instantly )?teleport(?: yourself)?(?: instantly)?(?: up to (\d+) feet)? to (?:an? |any )?(?:unoccupied |open |clear )?(?:space|square|location)(?: you can see)?(?: within (\d+) feet)?(?: of (the target|you))?\b(?! of )/;
// "Teleport up to double your Speed to a location you can see".
const SPEED = /\bTeleport up to (double|twice|triple) your Speed to a (?:location|space) you can see\b/i;
// "teleport to a space adjacent to the target of your Strike".
const ADJACENT = /\bteleport to a space adjacent to the target of your Strike\b/i;
// "You shoot an arrow at an open space on a surface within 500 feet … You teleport to that location".
const SHOT = /\bat an open space on a surface within (\d+) feet\b[^.]*\.\s*You teleport to that location\b/i;
// (Its other rule sentences: not its flavor.)
const RULE = /\b(?:Strike|attack|damage|save|DC|bonus|penalty|condition|action|reaction|spell|creature|line of effect|If|must)\b/;

// The text (plain) → { within, speedTimes, from, sentence } or null.
export function readTeleport(text) {
    const plain = String(text ?? "");
    const shot = SHOT.exec(plain);
    if (shot) return { within: Number(shot[1]), speedTimes: null, from: "self", match: shot };
    const speed = SPEED.exec(plain);
    if (speed) return { within: null, speedTimes: NUMBER[speed[1].toLowerCase()], from: "self", match: speed };
    const adjacent = ADJACENT.exec(plain);
    if (adjacent) return { within: 5, speedTimes: null, from: "target", match: adjacent };
    const own = OWN.exec(plain);
    if (!own || !(own[1] || own[2])) return null;
    return { within: Number(own[1] ?? own[2]), speedTimes: null, from: own[3] === "the target" ? "target" : "self", match: own };
}

// The activation's (or item's) html, its base → the plan, or null. Its own words: the teleport's sentence is read; the others with rule
// words are notes, and the plan is partial then.
// whole: the item's whole description, when html is one activation's.
export function teleportPlan(html, base, whole = null) {
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const read = readTeleport(body);
    if (!read) return null;
    // (Not an activation its use grants later, Void Fragment's Stage 1 "You also have access to the following activation": its use is its stages.)
    const before = whole ? String(whole).replace(/<[^>]+>/g, " ").split(read.match[0])[0] : body.slice(0, read.match.index);
    if (/\bStage 1\b|\bhave access to the following activation\b/i.test(before)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const own = (sentence) => sentence.includes(read.match[0]) || (SHOT.test(body) && /\b(?:at an open space on a surface|You teleport to that location)\b/.test(sentence));
    const notes = sentences.filter((sentence) => !own(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence));
    const teleport = { within: read.within, speedTimes: read.speedTimes, from: read.from };
    return {
        ...base,
        builtin: "teleport",
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: read.from === "target" ? { target: "1 creature", range: null, area: null } : { target: "self", range: null, area: null },
        trigger: { event: "use" },
        teleport,
        ...(notes.length ? { notes, partial: true } : {})
    };
}
