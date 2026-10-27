// An item that teleports its user a short way on the battle map: Mad Mammoth's Juke's "You teleport to an unoccupied space within 200
// feet that you can see", Golden Spur's "You teleport to a space you can see within 10 feet of the target", Mercurial Mantle's "Teleport up
// to double your Speed to a location you can see", Gloaming Shard's "teleport to a space adjacent to the target of your Strike". The plan is
// the item module's builtin "teleport": { within (feet) | speedTimes, from: "self" | "target", critical?: { within }, alone?: { used },
// line?: { formula, type } }. Live play (scripts/teleport.js) has the
// presser click the space on their own canvas; the active GM's client checks it's on the map, unoccupied and in range, and moves the token
// there at once (Foundry's teleport, no animation). The text's other rule sentences are notes. Pure.

const NUMBER = { two: 2, double: 2, twice: 2, three: 3, triple: 3 };
// "You teleport (yourself) (instantly) (up to 30 feet) to an unoccupied space (you can see) within 200 feet (of the target) (that you can see)".
// (Or "… magic to teleport yourself instantly to any unoccupied square within 30 feet", "make a melee Strike … and teleport to an open space
// you can see within 100 feet". Not within some feet of another thing, "a location within 500 feet of the army".)
const OWN = /\b(?:you|You|magic to|and) (?:instantly )?teleport(?: yourself)?(?: instantly)?(?: up to (\d+) feet)? to (?:an? |any )?(?:unoccupied |open |clear )?(?:space|square|location)(?: you can see)?(?: within (\d+) feet)?(?: of (the target|you))?\b(?! of )/;
// "Teleport up to double your Speed to a location you can see".
const SPEED = /\bTeleport up to (double|twice|triple) your Speed to a (?:location|space) you can see\b/i;
// (Or "The ring transports you … to an unoccupied space you can see within a range equal to your Speed", Master Magus Ring's: once its Speed.)
const SPEED_RANGE = /\btransports you\b[^.]*?\bto an? (?:unoccupied |open )?space you can see within a range equal to your Speed\b/i;
// (Or "You instantly transport yourself and any items you're wearing and holding from your current space to an unoccupied space up to 40 feet
// away that you can see", Quartz-Coil Rail Transport's: that far from its user.)
// (Emergency Escape Shield's "to an unoccupied space that you can see within 20 feet" too.)
// (And Laboratory Coat's "to instantly transport yourself … to an unoccupied space within 20 feet of you that you can see".)
const TRANSPORT = /\b(?:You instantly transport yourself|to instantly transport yourself)\b[^.]*?\bto an? (?:unoccupied |open )?space (?:up to (\d+) feet away that you can see|that you can see within (\d+) feet|within (\d+) feet of you that you can see)\b/i;
// "teleport to a space adjacent to the target of your Strike".
const ADJACENT = /\bteleport to a space adjacent to the target of your Strike\b/i;
// (Dimension Shot's "If you hit a creature, you can teleport to an unoccupied space beside that creature" too: the creature targeted.)
const BESIDE_HIT = /\bIf you hit a creature, you can teleport to an unoccupied space adjacent to that creature\b/i;
// "You shoot an arrow at an open space on a surface within 500 feet … You teleport to that location".
const SHOT = /\bat an open space on a surface within (\d+) feet\b[^.]*\.\s*You teleport to that location\b/i;
// (Or Transposition Ammunition's "you fire transposition ammunition at any unoccupied square you can see within your weapon's first range
// increment and succeed without making an attack roll. You pull yourself through the Astral Plane, teleporting … into the square where you
// shot the ammunition": as far as the range increment of the weapon it's loaded in — teleport.weaponRange, its user's weapon's when the card
// is made, scripts/teleport.js.)
const WEAPON_SHOT = /\b(?:When you activate the ammunition, instead of making your Strike against a foe, )?you fire [\w ]+? at any unoccupied square you can see within your weapon(?:'|’)s first range increment and succeed without making an attack roll\.\s*You [^.]*?\bteleporting\b[^.]*?\binto the square where you shot the ammunition\./i;
// (Farther after the triggering save's critical success, Dweomerveil's "If you critically succeeded at the triggering save, you can instead
// teleport within 45 feet": teleport.critical, the card's tick.)
const CRITICAL = /^If you critically succeeded at the triggering save, you can instead teleport within (\d+) feet\.$/i;
// (Its user alone, with what they wear and hold: "If this would bring another creature with you—even if you're carrying it in an
// extradimensional container—the teleportation fails", Master Magus Ring's "… the activation fails and is used", Mad Mammoth's Juke's "You
// can't bring any other creature with you, even in an extradimensional space". The card moves its user's token alone; whether one rides
// along hidden is its user's to say before Pick, as a requirement is — teleport.alone, the card's line.)
const ALONE = /^(?:If this would bring another creature with you\s*[—–-]\s*even if you're carrying it in an extradimensional container\s*[—–-]\s*the (?:teleportation|activation) fails( and is used)?|You can't bring any other creature with you, even in an extradimensional space|If this would carry along any other creature \(even one in an extradimensional space\), the activation fails)\.$/i;
// (Damage along the way, Quartz-Coil Rail Transport's "You and all creatures in a line between your original location and your destination take
// 4 electricity damage": teleport.line, dealt by the card once the token's moved.)
const LINE = /^You and all creatures in a line between your original location and your destination take (\d+(?:d\d+)?(?:\+\d+)?) (acid|cold|electricity|fire|force|sonic|vitality|void|bludgeoning|piercing|slashing|mental|poison|spirit) damage\.$/i;
// (A space it must have line of effect to, Golden Spur's: teleport.lineOfEffect — no wall that blocks movement between its user and the space,
// scripts/teleport.js.)
const LINE_OF_EFFECT = /^You must have line of effect to the space\.$/i;
// (Its user's own Strike before or after, as PF2e makes it: Gloaming Shard's "You make a thrown Strike with the gloaming shard at a target within
// 60 feet", Mercurial Mantle's "At the end of the teleportation, you can make a melee Strike against a creature within reach" — a line of the
// card, its own actions. Not one the item changes: its damage, a bonus, a condition, a save.)
export const OWN_STRIKE = (sentence) => /\bStrike\b/.test(sentence) && !/\b(?:damage|bonus|penalty|Off-Guard|flat-footed|additional|instead|DC|save|critical|twice|hits?|miss(?:es)?|Hardness|undetected|hidden|concealed|invisible|remains?|whenever|each time|free action|successfully|for the next)\b/i.test(sentence);
// (Its other rule sentences: not its flavor.)
const RULE = /\b(?:Strike|attack|damage|save|DC|bonus|penalty|condition|action|reaction|spell|creatures?|line of effect|If|must)\b/;

// The text (plain) → { within, speedTimes, from, sentence } or null.
export function readTeleport(text) {
    const plain = String(text ?? "");
    const shot = SHOT.exec(plain);
    if (shot) return { within: Number(shot[1]), speedTimes: null, from: "self", match: shot };
    const weaponShot = WEAPON_SHOT.exec(plain);
    if (weaponShot) return { within: null, speedTimes: null, weaponRange: true, from: "self", match: weaponShot };
    const speed = SPEED.exec(plain);
    if (speed) return { within: null, speedTimes: NUMBER[speed[1].toLowerCase()], from: "self", match: speed };
    const ranged = SPEED_RANGE.exec(plain);
    if (ranged) return { within: null, speedTimes: 1, from: "self", match: ranged };
    const transport = TRANSPORT.exec(plain);
    if (transport) return { within: Number(transport[1] ?? transport[2] ?? transport[3]), speedTimes: null, from: "self", match: transport };
    const adjacent = ADJACENT.exec(plain) ?? BESIDE_HIT.exec(plain);
    if (adjacent) return { within: 5, speedTimes: null, from: "target", match: adjacent };
    const own = OWN.exec(plain);
    if (!own || !(own[1] || own[2])) return null;
    return { within: Number(own[1] ?? own[2]), speedTimes: null, from: own[3] === "the target" ? "target" : "self", match: own };
}

// The activation's (or item's) html, its base → the plan, or null. Its own words: the teleport's sentence is read; the others with rule
// words are notes, and the plan is partial then.
// whole: the item's whole description, when html is one activation's.
export function teleportPlan(html, base, whole = null) {
    // (Its links as their words: "@Damage[4[electricity]|options:area-damage]" as "4 electricity", a labelled link as its label.)
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@Damage\[\(?([^[\]]+?)\)?\[([\w, ]+)\](?:\|[^\]]*)?\]/g, (all, formula, type) => `${formula} ${type.replace(/,\s*/g, " ")}`).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const read = readTeleport(body);
    if (!read) return null;
    // (Not an activation its use grants later, Void Fragment's Stage 1 "You also have access to the following activation": its use is its stages.)
    const before = whole ? String(whole).replace(/<[^>]+>/g, " ").split(read.match[0])[0] : body.slice(0, read.match.index);
    if (/\bStage 1\b|\bhave access to the following activation\b/i.test(before)) return null;
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const critical = sentences.map((sentence) => CRITICAL.exec(sentence)).find(Boolean);
    const alone = sentences.map((sentence) => ALONE.exec(sentence)).find(Boolean);
    const line = sentences.map((sentence) => LINE.exec(sentence)).find(Boolean);
    const lineOfEffect = sentences.some((sentence) => LINE_OF_EFFECT.test(sentence));
    const own = (sentence) => sentence.includes(read.match[0]) || read.match[0].includes(sentence) || (SHOT.test(body) && /\b(?:at an open space on a surface|You teleport to that location)\b/.test(sentence)) || CRITICAL.test(sentence) || ALONE.test(sentence) || LINE.test(sentence) || LINE_OF_EFFECT.test(sentence);
    const ruled = sentences.filter((sentence) => !own(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence));
    const strikes = ruled.filter(OWN_STRIKE).map((sentence) => `${sentence.replace(/\.$/, "")} (its own actions).`);
    // (Or at a square, Dimension Shot's "If you fire at a square, you can teleport to a space that contains that square or an unoccupied space adjacent
    // to it": teleport.orSquare — no creature targeted, the space picked within the weapon's range of its user, 2026-10-27.)
    const square = read.from === "target" ? ruled.find((sentence) => /^If you fire at a square, you can teleport to a space that contains that square or an unoccupied space adjacent to it\.$/i.test(sentence)) : null;
    const notes = ruled.filter((sentence) => !OWN_STRIKE(sentence) && sentence !== square);
    const teleport = { within: read.within, speedTimes: read.speedTimes, ...(read.weaponRange ? { weaponRange: true } : {}), ...(square ? { orSquare: true } : {}), from: read.from, ...(critical && read.from === "self" ? { critical: { within: Number(critical[1]) } } : {}), ...(alone ? { alone: { used: Boolean(alone[1]) } } : {}), ...(line ? { line: { formula: line[1], type: line[2].toLowerCase() } } : {}), ...(lineOfEffect ? { lineOfEffect: true } : {}) };
    return {
        ...base,
        builtin: "teleport",
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: read.from === "target" ? { target: "1 creature", range: null, area: null } : { target: "self", range: null, area: null },
        trigger: { event: "use" },
        teleport,
        ...(notes.length || strikes.length ? { notes: [...strikes, ...notes] } : {}),
        ...(notes.length ? { partial: true } : {})
    };
}
