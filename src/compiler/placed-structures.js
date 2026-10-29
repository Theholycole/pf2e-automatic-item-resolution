// Structures an item places where its user clicks (2026-10-28, docs/needs.md "Structures and walls"): the structure card's plan.structure
// (src/live/structure-card.js, scripts/structure.js — the Guiding Chisel's), the environment module's walls (its api.placeStructure: a square
// round the point or a line along the grid's lines, a door with a lock and its own Force Open DC, a material or the item's own numbers, the
// creatures in its space pushed out), kept open for its user's commands, ended after its time or as its door opens or breaks.
//   FORTRESS  Instant Fortress's "You toss the cube on the ground, and it immediately unfolds into an adamantine fortress. The fortress is 20
//             feet square and 30 feet high … The DC to Force Open the door or Pick its Lock is 40 … Once deactivated, the fortress can't be
//             activated again for 4 hours": a 20-foot square of high-grade adamantine walls 30 feet high, its door facing its user, the
//             creatures there pushed out; its door opened, or shut and locked, within 100 feet; folded up by a command, its 4 hours' wait
//             started then. Its cover, roofless shaft, stairs and repair the card's lines (the map's and out of combat).
//   DOOR      Warding Escutcheon's (both grades') "The shield becomes a locked door in an empty, adjacent space no wider than 5 feet … The door has the same
//             Hardness, HP, and Broken Threshold as the shield, with DC 25 Athletics and Thievery to open. The door remains in place for 1
//             hour, until it's opened or broken, or until you spend an action to end this effect": a locked 5-foot door on the grid line
//             clicked, the shield's numbers from its text, gone after the hour, as it's opened or broken, or on its user's command.
//   BARRIER   Testudo Shield's "The wall is 1 inch thick, 15 feet long, and 10 feet high. The barrier is conjured adjacent to you in a straight
//             line on the border between squares and lasts for 1 minute. The barrier is created with the Hardness and Hit Points equal to
//             those of the testudo shield": a see-through line of wall (its translucent copies) on the grid line clicked, its shield's numbers,
//             gone after the minute; immune to critical hits and precision damage a line. Pure.

import { sentencesOf } from "./lasting.js";

// (A grid line's two ways: the shape's words and its rotation — 0 runs east–west, 90 north–south.)
const LINES = (feet, height, what) => [
    { shape: "line", feet, ...(height ? { height } : {}), rotation: 0, words: `${what}, ${feet} feet along a grid line running east–west` },
    { shape: "line", feet, ...(height ? { height } : {}), rotation: 90, words: `${what}, ${feet} feet along a grid line running north–south` }
];
const all = (sentences, patterns) => sentences.length === patterns.length && patterns.every((pattern, index) => pattern.test(sentences[index]));
const shieldStats = (item) => {
    const stats = /\(Hardness (\d+), HP (\d+), BT (\d+)\)/i.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " "));
    return stats ? { hardness: Number(stats[1]), hp: Number(stats[2]), bt: Number(stats[3]) } : null;
};

const FORTRESS = [
    /^You toss the cube on the ground, and it immediately unfolds into an adamantine fortress\.$/,
    /^The fortress is (\d+) feet square and (\d+) feet high, with adamantine stairs leading up to three sets of battlements at heights of 10 feet and 20 feet and at the top\.$/,
    /^Arrow slits along the lower battlements and crenelations at the top provide standard cover to anyone within the fortress\.$/,
    /^There's no roof, leaving an open, 10-foot-square vertical shaft through the center of the structure\.$/,
    /^As a magical structure, the fortress has the structure trait\.$/,
    /^Because it expands outward, the fortress can't catch creatures inside it as a magical structure normally does\.$/,
    /^Instead, it pushes those creatures back\.$/,
    /^It can't push a creature into a surface or hazard this way, and stops expanding if that would happen\.$/,
    /^The fortress has a single door in the center of one wall on the ground level, and the door appears directly in front of you when you activate the fortress\.$/,
    /^Provided you're within (\d+) feet of the door, you can cause the door to open or slam shut and lock by spending a single action to issue a verbal command, which has the auditory trait\.$/,
    /^The DC to Force Open the door or Pick its Lock is (\d+)\.$/,
    /^You can instantly return the instant fortress to its cube form by spending a single action to issue a verbal command, which has the auditory trait\.$/,
    /^Once deactivated, the fortress can't be activated again for (\d+) (hours?)\.$/,
    /^If the fortress becomes damaged, it can be repaired only with a remake spell or by someone who is legendary at Crafting\.$/
];
const DOOR = [
    /^The shield becomes a locked door in an empty, adjacent space no wider than 5 feet, becoming flush with the surrounding structure so it blocks all passage\.$/,
    /^The door has the same Hardness, HP, and Broken Threshold as the shield, with @Check\[athletics\|dc:(\d+)[^\]]*\] and @Check\[thievery\|dc:(\d+)[^\]]*\] to open\.+$/,
    /^The door remains in place for 1 hour, until it's opened or broken, or until you spend an action to end this effect, at which point the shield returns to your hand \(or falls to the ground in your space if your hands are full\)\.$/
];
const BARRIER = [
    /^Your shield creates a magical barrier, consisting of translucent copies of the shield\.$/,
    /^The wall is 1 inch thick, (\d+) feet long, and (\d+) feet high\.$/,
    /^The barrier is conjured adjacent to you in a straight line on the border between squares and lasts for (1) (minute)\.$/,
    /^The barrier is created with the Hardness and Hit Points equal to those of the testudo shield and is immune to critical\s+hits and precision damage\.$/
];

// The plan: the structure card's, over what the readers before left (nothing else of its text is left to play; the GM's no-effect over the
// activation's base).
const structurePlan = (plan, base, structure, notes) => ({
    ...(base ?? {}),
    ...plan,
    builtin: "structure",
    gm: undefined,
    partial: undefined,
    noteOnly: undefined,
    decided: undefined,
    unread: undefined,
    resolution: undefined,
    automation: { level: "automatic" },
    trigger: { ...(plan?.trigger ?? {}), event: "use" },
    targeting: { target: null, range: null, area: null },
    structure,
    notes
});

// The activation's words (after "Effect") and the item → the structure card's plan, or the same plan.
export function withPlacedStructure(plan, { kind, words, item, base }) {
    if (kind !== "activation" || !plan) return plan;
    const sentences = sentencesOf(words);
    const read = (patterns) => patterns.map((pattern, index) => pattern.exec(sentences[index]));
    if (item?.name === "Instant Fortress" && all(sentences, FORTRESS)) {
        const [, size, , , , , , , , command, dc, , wait] = read(FORTRESS);
        const material = "adamantine-high";
        return structurePlan(plan, base, {
            name: "Instant Fortress",
            what: "fortress",
            kind: "wall-iron",
            material,
            door: { kind: "door-iron", material, side: "facing", lock: { dc: Number(dc[1]) }, forceOpen: Number(dc[1]), locked: false, command: { within: Number(command[1]) } },
            sizes: [{ feet: Number(size[1]), height: Number(size[2]), words: `A ${size[1]}-foot-square adamantine fortress, ${size[2]} feet high, its door facing its user` }],
            ends: { label: "Fold it back into a cube", wait: { value: Number(wait[1]), unit: "hours" }, words: "It's a palm-sized cube again." }
        }, [
            "Its user tosses it to the ground: click the fortress's middle, its door on the side facing its user; it pushes the creatures in its space out (never into a surface or hazard: then it stops growing, the map's).",
            "Inside: adamantine stairs up to battlements 10 and 20 feet high and at its top, standard cover from its arrow slits and crenelations for anyone within, and no roof — a 10-foot-square open shaft down its middle (the map's).",
            "Its door opens, or shuts and locks, at its user's spoken command (1 action, auditory) within 100 feet: the card's command; DC 40 to Force it Open or Pick its Lock. Folding it up is a spoken command too (1 action, auditory).",
            "It has the structure trait; once damaged, only Remake or a legendary crafter repairs it (out of combat)."
        ]);
    }
    if (/^Warding Escutcheon\b/.test(item?.name ?? "") && all(sentences, DOOR)) {
        const [, dcs] = read(DOOR);
        const stats = shieldStats(item);
        return structurePlan(plan, base, {
            name: `${item.name}'s door`,
            what: "door",
            kind: "door-stone",
            ...(stats ? { stats } : {}),
            door: { kind: "door-stone", ...(stats ? { stats } : {}), feet: 5, lock: { dc: Number(dcs[2]) }, forceOpen: Number(dcs[1]), locked: true },
            sizes: LINES(5, null, "A locked door"),
            lasts: { value: 1, unit: "hours" },
            ends: { label: "End it", whenOpened: true, words: "The shield is back in its user's hand (or on the ground in its space if its hands are full)." }
        }, [
            "Click the grid line of an empty space beside its user no wider than 5 feet: the shield is a locked door there, flush with what's around it, blocking all passage.",
            `Its numbers are the shield's${stats ? ` (Hardness ${stats.hardness}, HP ${stats.hp}, BT ${stats.bt})` : ""}; DC ${dcs[1]} Athletics to Force it Open, DC ${dcs[2]} Thievery to Pick its Lock.`,
            "It lasts 1 hour, until it's opened or broken, or until its user spends an action to end it."
        ]);
    }
    if (/^Testudo Shield\b/.test(item?.name ?? "") && all(sentences, BARRIER)) {
        const [, size, lasts] = read(BARRIER);
        const stats = shieldStats(item);
        return structurePlan(plan, base, {
            name: `${item.name}'s barrier`,
            what: "barrier",
            ...(stats ? { stats: { hardness: stats.hardness, hp: stats.hp } } : {}),
            transparent: true,
            sizes: LINES(Number(size[1]), Number(size[2]), "A barrier"),
            lasts: { value: Number(lasts[1]), unit: "minutes" }
        }, [
            `Click the grid line beside its user it stands on: a barrier of translucent copies of the shield, 1 inch thick, ${size[1]} feet long and ${size[2]} feet high, for 1 minute (seen through).`,
            `Its numbers are the shield's${stats ? ` (Hardness ${stats.hardness}, HP ${stats.hp})` : ""}; it's immune to critical hits and precision damage.`
        ]);
    }
    return plan;
}
