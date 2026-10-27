// Its user's own moves on the map, said as lines of its card (2026-10-27, docs/needs.md, the user's ruling 2: what its user does on the map is
// a line of the card): Eagle Wing's and the Gliding rune's "You glide slowly toward the ground, 5 feet down and 30 feet forward through the air.
// Provided you spend at least 1 action gliding on your turn and haven't yet reached the ground, you remain in the air at the end of your turn.
// Otherwise, you fall."; Pocket Watch of Stethelos' Step Between the Ticks, "You gain 3 actions, each of which must be immediately used to Leap,
// Stand, Step, or Stride … While you take these actions, time pauses …"; Gadget Skates' "moving you up to twice your Speed …"; Emerald
// Grasshopper's "When you activate it, make a Leap, traveling up to 40 feet horizontally and up to 10 feet vertically" beside its fall (src/
// compiler/falls.js). The whole activation those sentences (and its flavor): its own card, those lines and nothing to apply. Beside a card that
// reads the rest: its notes' move sentences those lines, and its other own-move sentences too; partial no more when nothing else is left. Pure.

const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\]/g, (_all, skill, dc) => `DC ${dc} ${skill.charAt(0).toUpperCase()}${skill.slice(1)}`).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// Each sentence of its user's own move → its words on the card ("" when it says nothing the others don't).
const MOVES = [
    // (Gliding down: Eagle Wing's Soar, the Gliding rune.)
    [/^You glide slowly toward the ground, 5 feet down and (?:up to )?(\d+) feet forward through the air\.$/i, (match) => `Glide 5 feet down and up to ${match[1]} feet forward through the air`],
    [/^Provided you spend at least 1 action gliding on your turn and haven't yet reached the ground, you remain in the air at the end of your turn\.$/i, () => "having glided this turn and not yet reached the ground, it stays in the air at the end of its turn"],
    [/^Otherwise, you fall\.$/i, () => "otherwise it falls"],
    // (Time paused for its moves: Pocket Watch of Stethelos' Step Between the Ticks.)
    [/^You gain (\d|three) actions, each of which must be immediately used to Leap, Stand, Step, or Stride\.$/i, (match) => `Take ${match[1] === "three" ? 3 : match[1]} actions at once, each a Leap, Stand, Step or Stride`],
    [/^If you have an appropriate Speed, you can add Burrow, Climb, Fly, or Swim to this list\.$/i, () => "or a Burrow, Climb, Fly or Swim with that Speed"],
    [/^While you take these actions, time pauses\.$/i, () => "while time pauses"],
    [/^All other creatures are completely unaware of your actions, can't speak, and can't use any actions that would be triggered by your movements\.$/i, () => "no other creature knows of them, speaks or acts on them"],
    [/^While you're taking these actions, you can't take any other actions, including any that would be triggered by the move actions\.$/i, () => "and it takes no other action meanwhile, not even one its moves would trigger"],
    [/^Once the actions are complete, time starts again, and to onlookers, you seem to have suddenly teleported across the distance you traveled\.$/i, () => "then time starts again, and it seems to have teleported"],
    // (Skating: Gadget Skates, Sustained.)
    [/^Gadget skates are metal devices that come in pairs and strap onto existing footwear \(or a creature's feet\)\.$/i, () => ""],
    [/^When you Activate gadget skates, clockwork gears reveal small wheels that propel you along the ground, moving you up to twice your Speed\.$/i, () => "Skate up to twice its Speed along the ground"],
    [/^During this movement, you must succeed at a DC (\d+) Acrobatics check to turn up to 90 degrees, and you can't turn more than once or more than 90 degrees\.$/i, (match) => `turning, once and up to 90 degrees, takes a DC ${match[1]} Acrobatics check`],
    [/^During the activation and after the activation is complete, you can't Stride, Step, or otherwise move on the ground until the end of your next turn\.$/i, () => "until the end of its next turn it can't Stride, Step or otherwise move on the ground"],
    [/^However, you can use this movement instead of a Stride to perform a High Jump or Long Jump just after the activation ends, in the direction of your last movement using the gadget skates\.$/i, () => "but just after, this movement can be a High Jump's or Long Jump's Stride, the way it skated"],
    [/^You can Sustain the Activation of your gadget skates for up to 1 minute\.$/i, () => "Sustained up to 1 minute"],
    [/^Starting on the turn after you Activate the gadget skates, the first time you Sustain the Activation each turn, you gain the effects of the activation again: you move up to twice your Speed in the same direction as your last movement with the gadget skates, and the restrictions continue to apply until you choose to cease Sustaining the Activation or you reach the maximum duration\.$/i, () => "from its next turn, its first Sustain each turn skates it up to twice its Speed again the same way, the same limits holding until it stops"],
    [/^Once the effect ends, the skates fall away and you can move normally\.$/i, () => ""],
    // (A long Leap: Emerald Grasshopper's, beside its fall.)
    [/^When you activate it, make a Leap, traveling up to (\d+) feet horizontally and up to (\d+) feet vertically\.$/i, (match) => `Leap up to ${match[1]} feet horizontally and up to ${match[2]} feet vertically`],
    [/^This benefit applies to any other Leaps you make before the end of your turn\.$/i, () => "and so can its other Leaps before the end of its turn"]
];
// (Words of a rule, not flavor: a sentence with none of them is the item's look.)
const RULE = /\b(?:feet|Speed|Strike|attack|damage|save|DC|bonus|penalty|condition|actions?|reactions?|spell|creatures?|Leap|Stride|Step|Fly|Burrow|Climb|Swim|fall|glide|move\w*|turn|Sustain|If|must)\b/i;
const lineOf = (sentence) => {
    for (const [pattern, words] of MOVES) {
        const match = pattern.exec(sentence);
        if (match) return words(match);
    }
    return null;
};
// Its lines joined as the card says them: "Glide …; having glided …; otherwise it falls (its own move on the map)."
// (A line going on from the one before, "or …", "while …", "and …", "but …": after a comma.)
const cardLine = (lines) => {
    const words = lines.filter(Boolean).reduce((all, line) => (all ? `${all}${/^(?:or|while|and|but) /.test(line) ? ", " : "; "}${line}` : line), "");
    return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)} (its own move on the map).` : null;
};

// The plan (or none), the activation's (or consumable's) html, its base → the plan with its user's own moves as card lines, or the same plan.
export function withOwnMoves(plan, html, base) {
    // (From its Effect on, else after a consumable's Activate line.)
    const text = plainOf(html).replace(/\s*\bCraft Requirements\b.*$/s, "");
    const body = /\bEffect\b/.test(text) ? text.replace(/^.*?\bEffect\b\s*/s, "") : text.replace(/^\s*Activate\s+(?:\d|[AFRr])\s*(?:\([^)]*\))?\s*/, "");
    const sentences = SENTENCES(body);
    const moving = sentences.filter((sentence) => lineOf(sentence) !== null);
    if (!moving.length) return plan;
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    // (The whole of it: every sentence a move's or flavor.)
    if (empty) {
        if (!sentences.every((sentence) => lineOf(sentence) !== null || !RULE.test(sentence))) return plan;
        const line = cardLine(moving.map(lineOf));
        return { ...base, ...(plan?.item ? { item: plan.item } : {}), builtin: undefined, noteOnly: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [line] };
    }
    // (Beside the rest: its notes' and unread move sentences that line, with its other own-move sentences.)
    const isMove = (entry) => moving.includes(said(entry)) || moving.some((sentence) => said(entry).includes(sentence.replace(/\.$/, "")));
    const notes = plan.notes ?? [];
    const unread = plan.unread ?? [];
    if (!notes.some(isMove) && !unread.some(isMove)) return plan;
    const keptNotes = notes.filter((entry) => !isMove(entry));
    const keptUnread = unread.filter((entry) => !isMove(entry));
    const next = { ...plan, notes: [...keptNotes, cardLine(moving.map(lineOf))], ...(plan.unread ? { unread: keptUnread.length ? keptUnread : undefined } : {}) };
    const left = keptNotes.length || keptUnread.length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    if (next.partial && !left) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}
