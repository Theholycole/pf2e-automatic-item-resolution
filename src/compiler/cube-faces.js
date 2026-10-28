// A cube of walls around its user, its face pressed deciding what they keep out (2026-10-27, docs/needs.md "areas"; the user's of the same
// day: a unique item's or an artifact's effects all built): Cube of Nex's "The cube creates six walls around you, creating a cube 10 feet on
// each side centered on you … The effect of the six walls depends on which face of the cube you press when you Activate the cube, as seen on
// the Cube Effects table (below)", the table's faces after its other activation. The ways card's pick of the face pressed (faces 1 to 5; the
// sixth Dismisses), each the ability module's zone — the 10-foot square round its user, its grid squares as the environment module lays a
// square structure out (centre "around", the item module's: src/live/cube.js), never placed, never attached, until
// dismissed: gas and wind kept out, or magical effects, by the counteract card beside it (+20, the item's rank: its level halved, rounded up);
// nonliving or living creatures crossing in its save, Will DC 30, a failure pushing them back out (their move wasted); the fifth face's walls
// of force the environment module's structure (plan.item.structure, scripts/structure.js: their Wall of Force numbers, its user inside not
// pushed out). And its second activation, "A cube of force or Lesser Cube of Nex within 60 feet of you becomes inert. It can't be Activated,
// any current activation ends, and any constant abilities it has cease to function": plan.item.inert, the item module's card (scripts/inert.js).
// Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNTIL_DISMISSED = null;
// (A Wall of Force's numbers at its own rank, the walls' "AC, Hit Points, and Hardness of a Wall of Force": AC 10, Hardness 30, 60 HP.)
export const WALL_OF_FORCE = { ac: 10, hardness: 30, hp: 60, immune: ["critical-hits", "precision"] };
const WALLS_LINE = `Its walls: AC ${WALL_OF_FORCE.ac}, Hardness ${WALL_OF_FORCE.hardness}, ${WALL_OF_FORCE.hp} Hit Points, immune to critical hits and precision damage (a Wall of Force's)`;
const NONLIVING = ["construct", "undead"];

// The table's faces from the item's text: [{ face, words }] (its rows' words, a link's its label, an inline roll kept), or null.
const cell = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").trim();
export function cubeFaces(html) {
    const rows = [...String(html ?? "").matchAll(/<tr>\s*<td>\s*(\d)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
    if (rows.length !== 6) return null;
    return rows.map((row) => ({ face: Number(row[1]), words: cell(row[2]) }));
}

// The crossing save: Will at its DC, a failure its move wasted — pushed back out of the square, away from its user inside.
function crossingSave(base, dc, who) {
    const back = { ...none(), forcedMovement: { kind: "push", distance: 5, upTo: false, optional: false, direction: "away" }, noteEffects: [{ label: "Kept out by the cube", text: `Its move action is wasted: it doesn't cross the cube's walls.`, duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } }] };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: `a ${who} creature crossing its walls`, range: null, area: null },
        trigger: { event: "zone" },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } }, outcomes: { criticalSuccess: none(), success: none(), failure: back, criticalFailure: back } }
    };
}

const FACE_READINGS = [
    {
        face: 1,
        pattern: /^The walls keep out gas and wind, attempting to counteract such effects that cross the threshold with a \[\[\/r 1d20\+(\d+) #Counteract\]\]\{\+\1\} counteract modifier but allowing all other things through\.$/,
        name: "1: gas and wind kept out",
        build: ([, modifier], { rank }) => ({ notes: ["Gas and wind can't cross its walls: its counteract card (+" + modifier + ") for such an effect crossing; all else passes"], counteract: { modifier: Number(modifier), rank, conditions: [], traits: [], afflictions: [], free: { name: "the gas or wind effect crossing its walls" }, pick: "one", notes: [] } })
    },
    {
        face: 2,
        pattern: /^The walls block nonliving matter from crossing; a nonliving creature must succeed at a @Check\[will\|dc:(\d+)\] save to cross the threshold, wasting their move action on a failure, and unattended objects can't cross\. Non-magical ranged attacks can't cross either and instead attack the wall\. A living creature can bring attended objects across the walls without needing to attempt a saving throw\.$/,
        name: "2: nonliving matter kept out",
        build: ([, dc], { base }) => ({ saves: [{ when: ["enter", "exit"], only: { traits: NONLIVING }, plan: crossingSave(base, Number(dc), "nonliving") }], notes: [`A nonliving creature (construct or undead) crossing its walls attempts a DC ${dc} Will save: a failure wastes its move, and it stays out`, "Unattended objects can't cross; a living creature brings attended ones across freely", "A non-magical ranged attack can't cross: it hits the wall instead"] })
    },
    {
        face: 3,
        pattern: /^The walls block living matter from crossing; a living creature must succeed at a @Check\[will\|dc:(\d+)\] save to cross the threshold, wasting their move action on a failure\.$/,
        name: "3: living matter kept out",
        build: ([, dc], { base }) => ({ saves: [{ when: ["enter", "exit"], only: { notTraits: NONLIVING }, plan: crossingSave(base, Number(dc), "living") }], notes: [`A living creature crossing its walls attempts a DC ${dc} Will save: a failure wastes its move, and it stays out`] })
    },
    {
        face: 4,
        pattern: /^The walls keep out magical effects that cross the threshold, attempting to counteract magical effects with a \[\[\/r 1d20\+(\d+) #Counteract\]\]\{\+\1\} counteract modifier, though they don't prevent a creature with magical items or effects from entering\.$/,
        name: "4: magical effects kept out",
        build: ([, modifier], { rank }) => ({ notes: [`Magical effects can't cross its walls: its counteract card (+${modifier}) for such an effect crossing; a creature with magic items or effects on it still enters`], counteract: { modifier: Number(modifier), rank, conditions: [], traits: [], afflictions: [], free: { name: "the magical effect crossing its walls" }, pick: "one", notes: [] } })
    },
    {
        face: 5,
        pattern: /^The walls block everything, with the effects of Wall of Force\.$/,
        name: "5: walls of force",
        build: () => ({ structure: { name: "Cube of walls of force", shape: "square", feet: 10, stats: { hardness: WALL_OF_FORCE.hardness, hp: WALL_OF_FORCE.hp }, ac: WALL_OF_FORCE.ac, invisible: true, pushOut: false, lines: ["Walls of force: they block everything physical, incorporeal and ethereal creatures too; teleportation and what's seen pass through (invisible)", "Immune to critical hits and precision damage, and to counteracting of their level or lower; a Disintegrate destroys them"] } })
    },
    {
        face: 6,
        pattern: /^The cube is Dismissed \(this takes only an Interact action and isn't an activation\)\.$/,
        name: null,
        build: () => null
    }
];

// The item's whole text (its table after the other activation) and { base, info } → the ways card, or null.
export function cubeWaysOf(itemHtml, { base, info }) {
    const faces = cubeFaces(itemHtml);
    if (!faces) return null;
    const rank = Math.max(1, Math.ceil((Number(info?.level) || 0) / 2));
    const built = [];
    for (const { face, words } of faces) {
        const reading = FACE_READINGS.find((entry) => entry.face === face);
        const match = reading?.pattern.exec(words);
        if (!match) return null;
        const parts = reading.build(match, { base, rank });
        if (!parts) continue;
        const square = { type: "square", value: 10 };
        const lines = [WALLS_LINE, "Centred on its user; a face a creature or object overlaps doesn't appear, and a Huge or larger user gets nothing (its space is larger than the cube)", "The sixth face Dismisses it with an Interact (no activation): delete the zone then", ...(parts.notes ?? [])];
        const plan = parts.structure
            ? { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, builtin: "structure", targeting: { target: null, range: null, area: square }, structure: { ...parts.structure, lines: [...(parts.structure.lines ?? []), ...lines.slice(1, 3)] }, item: { ...info } }
            : {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: null, area: square },
                zone: { area: square, centre: "around", range: null, lasts: UNTIL_DISMISSED, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: parts.saves ?? [], damage: [], effect: null, modifiers: [], notes: lines.map((line) => `${line}.`) },
                item: { ...info, ...(parts.counteract ? { counteract: parts.counteract } : {}) }
            };
        built.push({ name: `Face ${reading.name}`, html: `<p>${words}</p>`, plan });
    }
    return { builtin: "ways", targeting: { target: null, range: null, area: null }, ways: built, notes: ["Its user must Dismiss the cube's walls before activating it again."] };
}

// Its second activation's cube made inert: the creature holding one of those within that many feet (the presser's target), its item flagged
// inert (refused when activated), its activation's Effects and zones ended.
export function inertPlanOf([made], info) {
    const names = made[1].split(/\s+or\s+/).map((name) => name.trim().replace(/^an?\s+/i, ""));
    return {
        targeting: { target: "the creature holding it", range: `${made[2]} feet`, area: null },
        builtin: "inert",
        inert: { names, within: Number(made[2]), notes: [] },
        item: { ...info }
    };
}
