// Several Strikes in one activation (2026-10-20): Liar's Gun's "Make up to four Strikes with the liar's gun. Each of the four Strikes must be
// against a different target within a 20-foot cone", Hydra Spear's "Make up to three melee Strikes with the Hydra Spear, each at a different
// creature within 20 feet", Caress of the Great Serpent's eight Strikes "with a -2 penalty", its "For each Strike you choose to make, you take
// 1d6 piercing damage", Splithead Bow's "Make two ranged Strikes, each against a separate target", Spike Launcher's "Make a Strike with the
// spike launcher against each creature in the area", Shield of the Unified Legion's "Make a shield bash Strike against each enemy within the
// area", Minotaur Chair's attack "against every foe in the line".
// strike.volley { each, different, within, cone, area, sight, penalty, selfDamage, mapHeld, misfire, removal }: the Strike card readies that
// many Strikes (or, against each creature in an area, one at each creature targeted at Apply), each at a creature it hasn't struck yet
// (scripts/strikes.js). PF2e rolls each Strike; its multiple attack penalty is the user's to pick on PF2e's own buttons, so what the text says
// of it ("the penalty doesn't increase until after you've made both attacks") is the card's line. Pure.

const COUNT = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

// "Make up to four Strikes", "You can make up to eight Strikes", "Make up to three melee Strikes".
export const UP_TO = /\b(?:make|You can make) up to (two|three|four|five|six|seven|eight|\d+) ((?:melee|ranged|unarmed) )?Strikes\b/i;
// "Make a Strike with the spike launcher against each creature in the area", "Make a shield bash Strike against each enemy within the area",
// "making an attack with the wheel spikes against every foe in the line".
export const EACH_IN = /\b(?:make|making) an? ((?:melee|ranged|shield bash) )?(?:Strike|attack) (?:with (?:the|your) [\w' -]+? )?against (?:each|every) (enemy|creature|foe) (?:with)?in the (?:area|line|cone)\b/i;
export const countOf = (word) => COUNT[String(word ?? "").toLowerCase()] ?? Number(word);

// What the volley's own sentences say — the penalty, the targets, the area, the user's damage, the multiple attack penalty, a misfire — read
// out of the text the Strike reader goes on with, its results put in the hit's words the bombs' reader takes ("On a hit, …"). text: the
// plain text from the Strike on (whole: the activation's, for an area said before it) → { text, sentence, volley, notes }; sentence, the
// Strike's own sentence as it now reads; notes, what of its own sentence the card can't do.
const AREA = /\bin an? (\d+-foot (?:burst|cone|line|emanation)(?: or (?:an? )?\d+-foot (?:burst|cone|line|emanation))?(?: \(your choice\))?(?: centered anywhere within its range)?)/i;
export function readVolley(text, sentence = null, whole = null) {
    const volley = {};
    const notes = [];
    let rest = String(text ?? "");
    let own = String(sentence ?? "");
    const cut = (pattern, read) => {
        const found = pattern.exec(rest);
        if (!found) return;
        read(found);
        rest = rest.replace(found[0], "");
        own = own.replace(found[0], "");
    };
    // (Who it's at: each creature or enemy in the area; each one a different one, within that far.)
    cut(/\s*against (?:each|every) (enemy|creature|foe) (?:with)?in the (?:area|line|cone)\b/i, (found) => {
        volley.each = found[1].toLowerCase() === "creature" ? "creature" : "enemy";
    });
    cut(/,\s*each (?:at|against) a (?:different|separate) (?:creature|target)(?: within (\d+) feet)?/i, (found) => {
        volley.different = true;
        if (found[1]) volley.within = Number(found[1]);
    });
    cut(/\s*with an? ([-−]\d+) penalty\b/i, (found) => {
        volley.penalty = -Math.abs(Number(found[1].replace("−", "-")));
    });
    // (Coldstar Pistols' "Make two Strikes against one target, taking the highest of the two attack rolls and applying it to both attacks": one
    // roll for both, which PF2e's two Strikes can't be — a note.)
    cut(/\s*against one target, taking the highest of the two attack rolls and applying it to both attacks/i, () => {
        notes.push("Both Strikes are at one target, and the higher of their two attack rolls counts for both.");
    });
    const sentences = rest.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((entry) => entry.trim()).filter(Boolean);
    const kept = [];
    // (The Strike's own sentence, as it ends up: what the Strike reader knows it by.)
    let mine = null;
    const head = own.slice(0, 30);
    for (const entry of sentences) {
        let line = entry;
        // (Its sentence, or the sentence it's within: "Stride …, moving … and making an attack …".)
        const isOwn = Boolean(head) && entry.includes(head);
        // (The multiple attack penalty held until all are rolled: its own sentence, or the clause after the Strike's.)
        const held = /\bmultiple attack penalty\b[^.;]*\b(?:until|only after)\b/i;
        if (held.test(line)) {
            volley.mapHeld = true;
            const clause = /;\s*[^;]*\bmultiple attack penalty\b[^;]*?(?=\.$)/i.exec(line);
            if (clause && !held.test(line.slice(0, clause.index))) line = `${line.slice(0, clause.index)}${line.slice(clause.index + clause[0].length)}`;
            else continue;
        }
        const different = /^Each of the (?:\w+ )?Strikes must be against a different target within an? (\d+)-foot cone\.$/i.exec(line);
        if (different) {
            volley.different = true;
            volley.cone = Number(different[1]);
            continue;
        }
        const sight = /^Both targets must be in your line of sight, and within (\d+) feet of you\.$/i.exec(line);
        if (sight) {
            volley.within = Number(sight[1]);
            volley.sight = true;
            continue;
        }
        const bleeding = /^For each Strike you (?:choose to )?make, you take (\d+d\d+(?:\+\d+)?) (\w+) damage\.$/i.exec(line);
        if (bleeding) {
            volley.selfDamage = { formula: bleeding[1], type: bleeding[2].toLowerCase() };
            continue;
        }
        if (/^If the weapon misfires on any of these attacks, wait to apply the misfire until you resolve all of the attacks\.$/i.test(line)) {
            volley.misfire = true;
            continue;
        }
        if (/^This is forced movement\.$/i.test(line)) continue;
        // (The area it's at, Spike Launcher's "a volley of spikes in a 10-foot burst centered anywhere within its range", the shield's "in a
        // 90-foot line or 60-foot cone (your choice)": the card's line for which creatures to target.)
        const area = volley.each ? AREA.exec(line) : null;
        if (area && !/\b(?:Strike|attack|damage)\b/i.test(line)) {
            volley.area = area[1];
            continue;
        }
        // (Its results in the hit's words: the shield's "Each target you hit is moved 10 feet away from you (each target you critically hit is
        // also knocked prone)", Spike Launcher's "On a success, the spike causes the creature to take a -5-foot status penalty to their Speed".)
        const moved = /^Each target you hit is moved (\d+) feet away from you \(each target you critically hit is also knocked prone\)\.$/i.exec(line);
        if (moved) {
            kept.push(`On a hit, the target is pushed ${moved[1]} feet away from you. On a critical hit, the target is pushed ${moved[1]} feet away from you and knocked Prone.`);
            continue;
        }
        line = line
            .replace(/^On a success, the [\w ]+? causes the creature to take (an? [-−]\d+-foot status penalty to) their Speed\./i, "On a hit, the target takes $1 its Speed.")
            .replace(/^On a critical success, the creature becomes (\w+) instead\./i, "On a critical hit, the target is $1 instead.");
        // (Taking the spike out ends it: its user's or a neighbour's Interact action, the Effect or condition taken off then.)
        if (/^In either case, the creature, or an adjacent creature, can use an Interact action to remove the [\w ]+? and end the penalty or \w+ condition\.$/i.test(line)) {
            volley.removal = true;
            continue;
        }
        // (A damage type for all of it, the shield's "except that the damage dealt is force damage": the Strike reader's own words for it.)
        line = line.replace(/,\s*except that the damage dealt is (\w+) damage\./i, ". All damage from this Strike is $1 damage.");
        // (A move before it, Minotaur Chair's "Stride in a straight line, moving through enemies' spaces and making an attack …": the card's line.)
        const striding = /^Stride in a straight line, moving through enemies' spaces and (?:making|make) (an attack|a Strike)\b/i.exec(line);
        if (striding) {
            volley.move = "Stride in a straight line first, through the enemies' spaces";
            line = line.replace(striding[0], `Make ${striding[1]}`);
        }
        if (isOwn) mine = line.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
        kept.push(line);
    }
    // (Its area said before the Strike, Spike Launcher's "fires a volley of spikes in a 10-foot burst centered anywhere within its range".)
    const before = volley.each && !volley.area && whole ? AREA.exec(String(whole).slice(0, Math.max(0, String(whole).indexOf(String(text ?? "").slice(0, 30))))) : null;
    if (before) volley.area = before[1];
    return { text: kept.join(" "), sentence: (mine ?? own).trim(), volley, notes };
}

// The card's lines for it.
export function volleyLines(volley, { uses = null } = {}) {
    if (!volley) return [];
    const who = volley.each ? `One Strike at each ${volley.each} ${volley.area ? `in the ${volley.area}` : "in the area"} (target them all, then Apply)` : uses ? `Up to ${uses} Strikes` : null;
    return [
        who,
        volley.different && !volley.each ? `Each at a different ${volley.cone ? "target" : "creature"}${volley.within ? ` within ${volley.within} feet` : ""}${volley.cone ? ` in a ${volley.cone}-foot cone` : ""} (a creature already struck doesn't take another)` : null,
        !volley.different && volley.within ? `Each at a target within ${volley.within} feet${volley.sight ? ", in your line of sight" : ""}` : null,
        volley.different && volley.sight ? "Each in your line of sight" : null,
        volley.move ? volley.move : null,
        volley.penalty ? `${volley.penalty} to each of these Strikes` : null,
        volley.selfDamage ? `Each Strike made deals ${volley.selfDamage.formula} ${volley.selfDamage.type} damage to you` : null,
        volley.mapHeld ? "Roll them all at the multiple attack penalty you're at now (the same PF2e button); it rises only after the last" : null,
        volley.misfire ? "A misfire waits until all are rolled" : null,
        volley.removal ? "Taking the spike out (an Interact action by the creature or one next to it) ends it: delete its Effect or condition then" : null
    ].filter(Boolean);
}
