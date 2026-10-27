// An activation that is its user's own moves, with a Speed for them (2026-10-26): Dragonaut's Wingsuit's Drake's Glide, "You take 2 move actions,
// each of which can be a Fly or Stride. If you don't have a fly Speed, you gain a 20-foot fly Speed for Fly actions from this activation." The
// item card gives its user that Speed until the end of its turn (PF2e's BaseSpeed on its Effect, the higher Speed PF2e's), and the moves are
// its user's own on the map, a line of the card. Pure.

const MOVES = /^You take (\d|two|three) move actions, each of which can be an? (Fly|Stride|Swim|Climb|Burrow) or (?:an? )?(Fly|Stride|Swim|Climb|Burrow)\.$/i;
const SPEED_FOR = /^If you don't have an? (fly|swim|climb|burrow) Speed, you gain an? (\d+)-foot \1 Speed for \w+ actions from this activation\.$/i;
const COUNT = { two: 2, three: 3 };
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const END_OF_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };

// The activation's html and the plan's base → the item card's plan, or null when it says more than these.
export function moveActionsPlan(html, base) {
    const sentences = SENTENCES(plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    const moves = sentences.map((sentence) => MOVES.exec(sentence)).find(Boolean);
    const speed = sentences.map((sentence) => SPEED_FOR.exec(sentence)).find(Boolean);
    if (!moves || !speed || sentences.length !== 2) return null;
    const count = COUNT[moves[1].toLowerCase()] ?? Number(moves[1]);
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        speeds: [{ type: speed[1].toLowerCase(), value: Number(speed[2]), duration: END_OF_TURN }],
        notes: [`Then take ${count} move actions, each a ${moves[2]} or a ${moves[3]} (its own moves on the map).`]
    };
}

// Its allies' own moves (2026-10-26): Guiding Cajon Drum's "Up to 2 allies that can hear the drum can use a reaction to Stride 5 feet." Each ally's
// reaction is its own to use, on the map: a line of the card, nothing for the card to apply. Only when that and the use's own flavor are all
// it says.
const ALLIES_MOVE = /^Up to (\d+|two|three) allies that can hear the [\w' -]+? can use a reaction to (Stride|Step) (\d+) feet\.$/i;
const FLAVOR = /^You (?:play|beat|strike|sound|shake) the [\w' -]+?, [^.]*\.$/i;
export function alliesMovePlan(html, base) {
    const sentences = SENTENCES(plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    const moves = sentences.map((sentence) => ALLIES_MOVE.exec(sentence)).find(Boolean);
    if (!moves || !sentences.every((sentence) => ALLIES_MOVE.test(sentence) || FLAVOR.test(sentence))) return null;
    const count = COUNT[moves[1].toLowerCase()] ?? Number(moves[1]);
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [`Up to ${count} allies that can hear it can use a reaction to ${moves[2]} ${moves[3]} feet (their own moves on the map).`]
    };
}

// Its user's own one move as the whole of it (2026-10-26): Viper Rapier's reaction "With a slight, obviously mocking bow or curtsy, you Step.",
// Little Love's "You Leap (or Vault, if you're Spring-Heeled Jack)." Its user's own move on the map: a line of the card, nothing to apply.
const OWN_MOVE = /^(?:[^.]+?, )?you (Step|Stride|Leap)( \([^)]*\))?\.$/i;
// (Or its own actions of another kind as the whole of it, 2026-10-27: Swiftmount Saddle's "You Mount the creature wearing the swiftmount saddle",
// Spangled Rider's Suit's "You dismount, moving off your mount into a space adjacent to it", Maestro's Chair's Stride and Sustain, Sandals of
// the Stag's jump that "doesn't automatically fail" — PF2e has no rule for mounting, nor for a jump's Stride first: a line of the card.)
const OWN_ACTS = [
    [[/^You Mount the creature wearing the [\w' -]+?\s*\.$/i], () => "Mount the creature wearing it (its own action on the map)."],
    [[/^You dismount, moving off your mount into a space adjacent to it\.$/i], () => "Dismount into a space adjacent to its mount (its own move on the map)."],
    [[/^You use your chair to Stride up to your chair's speed\.$/i, /^If you have a composition cantrip that is currently active, you Sustain it as a free action\.$/i], () => "Stride up to the chair's Speed, and Sustain an active composition cantrip as a free action (its own actions)."],
    [[/^You can attempt the jump normally\.$/i, /^It doesn't automatically fail\.$/i], () => "The jump it attempts doesn't automatically fail for want of a 10-foot Stride first (its own action)."],
    // (The Cricket's "Stride up to three times your Speed. You can Burrow, Climb, Fly, or Swim instead …. This movement doesn't trigger reactions
    // and you can move through creatures' spaces …", after its glowing feet.)
    [[/^Your feet begin to glow\b[^.]*\.$/i, /^Stride up to three times your Speed\.$/i, /^You can Burrow, Climb, Fly, or Swim instead of Striding if you have the corresponding movement type\.$/i, /^This movement doesn't trigger reactions and you can move through creatures' spaces as if they weren't there during this movement\.$/i],
        () => "Stride (or Burrow, Climb, Fly or Swim, with that Speed) up to three times its Speed, triggering no reactions and moving through creatures' spaces (its own move on the map)."],
    // (Clockwork Diving Suit's jet: "Swim 25 feet in a straight line", whatever its swim Speed or its armor's penalty, difficult terrain still
    // slowing it.)
    [[/^The diving suit shoots out a water jet that causes you to Swim (\d+) feet in a straight line\.$/i, /^The distance of this movement is unaffected by your swim Speed, if you have one, or the armor's Speed penalty\.$/i, /^However, difficult terrain, such as the difficult terrain for moving up or down or moving against a current, still slows this movement\.$/i],
        (sentences) => `Swim ${/(\d+) feet/.exec(sentences[0])[1]} feet in a straight line, whatever its swim Speed or its armor's Speed penalty; difficult terrain still slows it (its own move on the map).`]
];
export function ownMovePlan(html, base) {
    const sentences = SENTENCES(plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    const acts = OWN_ACTS.find(([forms]) => forms.length === sentences.length && forms.every((form, index) => form.test(sentences[index])));
    if (acts) return { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [acts[1](sentences)] };
    const move = sentences.length === 1 ? OWN_MOVE.exec(sentences[0]) : null;
    if (!move) return null;
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [`${move[1].charAt(0).toUpperCase()}${move[1].slice(1).toLowerCase()}${move[2] ?? ""} (its own move on the map).`]
    };
}
