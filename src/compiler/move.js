// Its user's own movement on the map (2026-10-25, docs/needs.md): Advancing's "You Stride up to your Speed. This movement doesn't trigger
// reactions", Boots of Quick Marching's "You Step twice", Staff of Sun Wukong's "You Leap up to 50 feet in any direction", Earthglide Cloak's
// "You Burrow through dirt and stone up to your land Speed", Squire's Tabard's "You Stride twice, ignoring difficult terrain, but your
// movement must end adjacent to an ally". The teleport card's own plan (src/compiler/teleport.js) with teleport.move { verb, lines }: the
// presser clicks the space, the active GM's client checks its range from the user's token and moves the token there as a move, not a
// teleport (scripts/teleport.js). What the movement ignores or how it must end is the card's lines; its other rule sentences are notes.
// Pure.

const VERB = "Stride|Step|Leap|Burrow|Fly|Swim|Climb";
// "You Stride.", "You Stride up to 15 feet.", "You Stride up to twice your speed", "You Stride up to half your Speed and make a Strike …",
// "You Step or Stride, treating …", "You Stride or Fly up to your Speed, but …", "You Burrow through dirt and stone up to your land Speed, …".
// ("Through dirt and stone" is a line; "or Leap up to 20 feet …" after it too.)
const MOVE = new RegExp(String.raw`^You (${VERB})(?: or (${VERB}))?(?: (twice))?(?: through ((?:(?! up to\b)[\w ])+))?(?: up to (?:(\d+) feet|(twice|half) your (?:land )?speed|your (?:land )?speed))?( in any direction)?(?:(,| and| but| or)([^.]*))?\.$`, "i");
// (A Leap's own distance, PF2e's: 10 feet with a Speed of 15 or more, 15 with 30 or more — teleport.leapTimes, of its user's Speed when the
// card is made; "doubling the vertical and horizontal distance of your Leap action": twice that.)
const LEAP_DOUBLED = /^You Leap, doubling the vertical and horizontal distance of your Leap action\.$/i;
// ("You gain a +15-foot status bonus to your Speed and fly Speed for this movement": the range's 15 feet more, teleport.plus.)
// (Said another way: Umbral Armor's "You slip into the Netherworld for a moment, allowing you to Stride twice your speed", Nightmare Cudgel's
// "As part of activating this item, you can Stride twice", Dancing Scarf's "You can also Stride up to half your Speed or Step" — read as
// "You Stride up to twice your speed", "You Stride twice", "You Stride up to half your Speed or Step".)
const SAID_OTHERWISE = [
    [/^You [^.,]*, allowing you to (Stride|Step|Leap) (?:up to )?(twice|half) your speed\./i, (all, verb, times) => `You ${verb} up to ${times} your speed.`],
    [/^As part of activating this item, you can (Stride|Step)\b/i, (all, verb) => `You ${verb}`],
    [/^You can (?:also )?(Stride|Step|Leap)\b/i, (all, verb) => `You ${verb}`]
];
const plainly = (sentence) => SAID_OTHERWISE.reduce((text, [pattern, to]) => text.replace(pattern, to), sentence);
// (A condition its user takes after the move, Umbral Armor's "causing you to become Concealed for 1 round afterward": plan.userEffects, given as
// it's used — src/compiler/user-conditions.js's.)
const AFTER = /\bcausing you to become (Concealed|Quickened|Invisible) for (\d+) rounds? afterward\.$/i;
const PLUS = /^You gain a \+(\d+)-foot (?:status|circumstance|item) bonus to your (?:land )?Speed(?: and (?:fly|swim|climb|burrow) Speed)? for this movement\.$/i;
// (The card's lines, said as the item says them.)
const LINES = [
    [/^This movement doesn't trigger reactions(?:,? and [^.]+)?\.$/i, (sentence) => sentence.replace(/\.$/, "")],
    [/^You can Burrow, Climb, Fly, or Swim instead of Striding if you have the corresponding movement type\.$/i, "It can be a Burrow, Climb, Fly or Swim instead, with that movement type"],
    [/^You can (?:instead )?(?:Burrow|Climb|Fly|Swim)[^.]*instead[^.]*\.$/i, null],
    [/^If you have a (?:climb|fly|swim|burrow)(?: or (?:climb|fly|swim|burrow))? Speed, you can instead (?:Climb|Fly|Swim|Burrow)(?: or (?:Climb|Fly|Swim|Burrow))?(?: respectively)?\.$/i, (sentence) => `With a ${/\bhave a ([a-z]+(?: or [a-z]+)?) Speed/i.exec(sentence)[1]} Speed, it can be a ${/instead ([A-Za-z]+(?: or [A-Za-z]+)?)/.exec(sentence)[1]} instead`],
    // ("For each additional action you spend, you can Step or Stride again with the same benefits": the card stays open for the next, move.again.)
    [/^For each additional action you spend, you can (?:Step|Stride|Leap|Fly|Burrow|Swim|Climb)(?: or (?:Step|Stride|Leap|Fly|Burrow|Swim|Climb))? again with the same benefits\.$/i, "Again for each action more, with the same benefits"],
    [/^You can move easily through solid objects and creatures during this movement, but you can't end this movement within a solid object or in a creature's space\.$/i, "Through solid objects and creatures, ending in neither"]
];
const MOVING = /\b(?:terrain|movement|move|straight line|direction|adjacent|reactions?|Leap|Stride|Step|Fly|Burrow|Swim|Climb|tunnels?|passing|horizontally|vertically|feet)\b/i;
const RULE = /\b(?:Strike|attack|damage|save|DC|bonus|penalty|condition|action|reaction|spell|creature|If|must|terrain)\b/;

// The activation's plain text (from its Effect on) → { verb, within | speedTimes, lines, said } or null.
export function readMove(body) {
    const sentences = String(body ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const doubled = sentences.find((sentence) => LEAP_DOUBLED.test(sentence));
    if (doubled) return { verb: "Leap", leapTimes: 2, lines: [], said: [doubled], sentences };
    const at = sentences.findIndex((sentence) => MOVE.test(plainly(sentence)));
    if (at < 0) return null;
    const [, verb, or, twice, through, feet, times, anywhere, joined, rest] = MOVE.exec(plainly(sentences[at]));
    const first = verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase();
    // (A Step or Stride is a Stride's range; a Step alone 5 feet, twice 10.)
    const kind = or && /stride/i.test(or) ? "Stride" : first;
    const count = twice ? 2 : 1;
    const range = feet ? { within: Number(feet) } : times ? { speedTimes: /twice/i.test(times) ? 2 : 0.5 } : kind === "Step" ? { within: 5 * count } : kind === "Leap" ? { leapTimes: 1 } : { speedTimes: count };
    const lines = [];
    const upper = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    if (or) lines.push(`${first} or ${upper(or.toLowerCase())}`);
    if (through) lines.push(`Through ${through.trim()}`);
    if (anywhere) lines.push("In any direction");
    // (What it says after: "ignoring difficult terrain", "but your movement must end adjacent to an ally", "but you can move only in a straight
    // line", "treating both difficult and greater difficult terrain as normal terrain during the movement", "and make a Strike against a target",
    // "or Leap up to 20 feet horizontally and 5 feet vertically".)
    const clauses = String(rest ?? "").split(/,\s*(?:but\s+)?|\s+but\s+/).map((part) => part.trim()).filter(Boolean);
    if (/or/i.test(joined ?? "") && clauses.length) clauses[0] = `or ${clauses[0]}`;
    // (A Strike along the way, Skyrider Sword's "making a melee Strike with the weapon once at any point during your movement": its user's own,
    // from their sheet — a note, not a line: the move's card doesn't make it.)
    // (And what isn't about the move, Invisible Chain Shirt's "and turn partially invisible, becoming Concealed …": the rest's, not the card's.)
    const strikes = [];
    const others = [];
    for (const clause of clauses) (/\bStrike\b/.test(clause) ? strikes : MOVING.test(clause) ? lines : others).push(upper(clause));
    const said = [sentences[at]];
    const plus = sentences.map((sentence) => PLUS.exec(sentence)).find(Boolean);
    if (plus) said.push(plus[0]);
    const afterAt = sentences.findIndex((sentence) => AFTER.test(sentence));
    const after = afterAt >= 0 ? AFTER.exec(sentences[afterAt]) : null;
    if (after) said.push(sentences[afterAt]);
    for (const sentence of sentences) {
        const line = LINES.find(([pattern]) => pattern.test(sentence));
        if (!line) continue;
        said.push(sentence);
        if (line[1]) lines.push(typeof line[1] === "function" ? line[1](sentence) : line[1]);
    }
    const userEffects = after ? [{ slug: after[1].toLowerCase(), value: null, duration: { mode: "fixed", value: Number(after[2]), unit: "rounds", expiry: "turn-start", anchor: "source-turn" } }] : null;
    return { verb: kind, ...range, ...(plus ? { plus: Number(plus[1]) } : {}), lines, said, sentences, ...(userEffects ? { userEffects } : {}), ...(strikes.length ? { strikes: strikes.map((clause) => `${clause}.`) } : {}), ...(others.length ? { others: others.map((clause) => `${clause}.`) } : {}) };
}

// The reading → the teleport card's range for it, with its move.
export function moveOf(read) {
    const range = Number.isFinite(read.within) ? { within: read.within } : Number.isFinite(read.leapTimes) ? { leapTimes: read.leapTimes } : { speedTimes: read.speedTimes };
    // ("Your movement must end adjacent to an ally", Squire's Tabard's: checked where it ends, scripts/teleport.js.)
    const beside = read.lines.some((line) => /\bmust end adjacent to an ally\b/i.test(line));
    const again = read.lines.some((line) => /^Again for each action more\b/.test(line));
    return { ...range, ...(Number.isFinite(read.plus) ? { plus: read.plus } : {}), from: "self", move: { verb: read.verb, lines: read.lines, ...(beside ? { endsBeside: "ally" } : {}), ...(again ? { again: true } : {}) } };
}

// Its Effect's plain text, on: not its Trigger — Demon-Hunting Bands' "Trigger You Stride" is when it's used, not a move.
function bodyOf(html) {
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
}

// The activation's html, its base → the teleport card's plan for the move, or null.
export function movePlan(html, base) {
    const body = bodyOf(html);
    const read = readMove(body);
    if (!read) return null;
    const notes = [...(read.strikes ?? []), ...(read.others ?? []), ...read.sentences.filter((sentence) => !read.said.includes(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence))];
    return {
        ...base,
        builtin: "teleport",
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        teleport: moveOf(read),
        ...(read.userEffects ? { userEffects: read.userEffects } : {}),
        ...(notes.length ? { notes, partial: true } : {})
    };
}

// The activation's plan, its html, its base → the plan with its move: the move's own when the plan read nothing else; the move beside it when
// the plan reads the rest but not the move — Phase Spike's resistance during its Stride (plan.item.move: the teleport card, posted beside its
// own, scripts/live.js); the move alone when all the plan read is the move's own bonus, Cape of the Open Sky's +15 feet "for this movement".
export function withMove(plan, html, base) {
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") return movePlan(html, base) ?? plan;
    if (plan.builtin || !plan.unread?.length || plan.resolution?.kind !== "check") return plan;
    const read = readMove(bodyOf(html));
    if (!read || !plan.unread.includes(read.said[0])) return plan;
    const rows = Object.values(plan.resolution.outcomes ?? {});
    const speedOnly = Number.isFinite(read.plus) && rows.length === 1 && rows.every((row) => !row.effects?.length && !row.noteEffects?.length && !row.manualInstructions?.length && (row.damage?.mode ?? "none") === "none" && row.modifiers?.length && row.modifiers.every((modifier) => /-speed$|^speed$/.test(modifier.selector) && modifier.value === read.plus));
    // (Read into the plan's own top, as permanent.js keeps them until its item part is made.)
    const others = ["resist", "speeds", "senses", "light", "levelTemp", "weapon", "attacks", "fastHealing", "strikeDamage", "suppress", "ruleEffects", "coats", "creates"].some((key) => plan[key] != null || plan.item?.[key] != null);
    if (speedOnly && !others && plan.unread.length === 1 && !plan.notes?.length) return movePlan(html, base) ?? plan;
    // (Its sentence stays unread when it says more than the move — what else it says, the plan's to have read.)
    const unread = [...plan.unread.filter((sentence) => !read.said.includes(sentence) || (read.others?.length && sentence === read.said[0])), ...(read.strikes ?? [])];
    // (plan.move: permanent.js's item part makes it plan.item.move.)
    const result = { ...plan, move: moveOf(read), ...(unread.length ? { unread } : { unread: undefined }) };
    const left = [...(plan.notes ?? []), ...unread, ...rows.flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}
