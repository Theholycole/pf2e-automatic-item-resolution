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
