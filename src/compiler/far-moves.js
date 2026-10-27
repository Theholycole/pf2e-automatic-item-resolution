// What moves off the battle map, or moves only objects (2026-10-27, docs/needs.md "Moving creatures and the user"; the user's rulings of the
// day: out-of-combat travel and objects a line of the card, information whispered to the GM and the user). Homeward Wayfinder's "You teleport
// back to the attuned Pathfinder Lodge, as long as you are no more than 100 miles away", Cube of Recall's "You teleport to the location attuned
// to the side you press, within 100 feet of the attuned location, as long as that location is on the same planet": its user's token taken to
// that scene, a line of the card. The Paired runes' "Items in the pockets … trade places via teleportation", Magnet Coin's "The rest of the coin
// teleports into your hand", Predictable Silver Piece's toss "always lands with the side you rubbed face up": objects, lines of the card.
// Cipher of Elemental Planes' view through its keyhole gateway and Compass of Transpositional Awareness' Track Teleportation: whispered to the
// GM and its user (plan.whisper, scripts/live.js), the GM saying what it shows. Each only when the whole activation is those sentences. Pure.

const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[\/r ([^\]#]+?)(?:\s*#[^\]]*)?\]\](?:\{[^}]*\})?/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
// (Off this map: the GM's to move its token to that scene — the map's line.)
const AWAY = "off this map, its token goes to that scene";

// Each reading: its sentences in order, and its card's line (or its whisper) from their matches and the activation's whole text.
const READINGS = [
    {
        sentences: [/^You teleport back to the attuned Pathfinder Lodge, as long as you are no more than (\d+) miles away\.$/i, /^This teleportation effect fails if you would bring another creature with you, even if you're carrying it in an extradimensional space\.$/i],
        line: ([lodge]) => `Its user teleports back to the attuned Pathfinder Lodge from up to ${lodge[1]} miles away, alone: with another creature along, even in an extradimensional space, it fails (${AWAY}).`
    },
    {
        sentences: [/^While speaking a word of command and bringing the location into your mind, you push the corresponding side of the cube\.$/i, /^You teleport to the location attuned to the side you press, within (\d+) feet of the attuned location, as long as that location is on the same planet\.$/i, /^If it's not, your activation produces no effect, but the attunement remains\.$/i],
        line: ([, recall]) => `Its user teleports to within ${recall[1]} feet of the location attuned to the side it pushes, if that's on the same planet (${AWAY}); if not, nothing happens and the attunement stays.`
    },
    {
        sentences: [/^Items in the pockets \(up to (\d+) negligible Bulk items or (\d+) light Bulk item per pocket\) trade places via teleportation\.$/i],
        line: ([pockets], whole) => {
            const apart = /\bRequirements? The paired items are both invested, typically by two different characters, and are (within [^.]+? of each other|on the same plane as each other)\b/i.exec(whole)?.[1];
            return `The items in its pockets (up to ${pockets[1]} of negligible Bulk or ${pockets[2]} of light Bulk a pocket) trade places with those in the paired garment's${apart ? `, both invested and ${apart.replace(/ as each other$/, "")}` : ""}: their owners move them between the two sheets.`;
        }
    },
    {
        sentences: [/^You focus on the rest of the coin, imagining its complete form in your hand\.$/i, /^The rest of the coin teleports into your hand, reforming the complete coin\.$/i, /^If it was near any other coins, it also teleports up to (\d+d\d+) coins with it into your hand\.$/i, /^The coin can only teleport up to (\d+) miles; if you are farther when recalling the coin, it teleports the maximum distance toward you and lands in an open space\.$/i],
        line: ([, , coins, far]) => `The rest of the coin teleports into its user's hand, whole again, with up to ${coins[1]} other coins that were near it (roll ${coins[1]}); from up to ${far[1]} miles — farther, it comes ${far[1]} miles its user's way and lands in an open space.`
    },
    {
        sentences: [/^You rub your thumb on one side of the coin with the intent of slightly tweaking the strands of fate, then flip the coin into the air in a coin toss\.$/i, /^No matter how the toss is resolved[^.]*?it always lands with the side you rubbed face up\.$/i],
        line: () => "Tossed, the coin always lands with the side its user rubbed face up, however the toss is resolved."
    },
    {
        sentences: [/^You turn the discs to align symbols, creating a minute planar gateway as large as a keyhole\.$/i, /^You can look through it to view a location in an elemental plane\.$/i, /^Each cipher connects to (\d+) locations on each elemental plane\s*[-–—]\s*typically large settlements\.$/i, /^Anyone holding the cipher can understand the primary language of the plane the cipher is aligned to\.$/i, /^A cipher of the planes can be used in place of a planar key for Interplanar Teleport and similar magic for travel to the plane it's aligned to\.$/i, /^When it's used this way, you arrive unerringly at the location the cipher is aligned to\.$/i],
        whisper: ([, , places]) => `Through a keyhole-sized gateway its user views one of the ${places[1]} locations (most of them large settlements) the cipher connects to on the elemental plane it's aligned to: the GM says what it shows. Whoever holds it understands that plane's primary language; as a planar key for Interplanar Teleport and the like to that plane, the travelers arrive at that location.`
    },
    {
        sentences: [/^You point the compass of transpositional awareness at an extant teleportation effect \(such as a magical portal\) or the site of a teleportation effect that existed within the last 1 minute \(such as the space where a creature just cast Translocate\)\.$/i, /^Attempt an Occultism check to determine to where the effect leads or led\.$/i, /^The DC of this check is the effect's counteract DC\.$/i, /^On a success, you know roughly the destination of the teleportation effect\b[^.]*\.\)?\.?$/i, /^On a critical success, you ascertain the exact destination within mere feet for local effects\b.*$/i],
        whisper: () => "Its user points it at a teleportation effect, or where one was in the last minute, and attempts an Occultism check against that effect's counteract DC (the GM's): on a success the GM tells roughly where it leads (a plane, a direction, a region); on a critical success, exactly — within feet for a local one, within a few miles for a long-range one."
    }
];

// The activation's html, its base → the plan (a card of its line, or the whispered card), or null.
export function farMovesPlan(html, base) {
    const whole = plainOf(html);
    const sentences = SENTENCES(whole.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    for (const reading of READINGS) {
        if (sentences.length !== reading.sentences.length) continue;
        const matches = reading.sentences.map((pattern, index) => pattern.exec(sentences[index]));
        if (!matches.every(Boolean)) continue;
        const own = { ...base, builtin: undefined, noteOnly: undefined, partial: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" } };
        if (reading.whisper) return { ...own, builtin: "whisper", whisper: { text: reading.whisper(matches, whole) }, decided: "information" };
        return { ...own, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [reading.line(matches, whole)] };
    }
    return null;
}

// A long-range teleport cast with the item's own ways (2026-10-27): Voyager's Pack's Group Voyage, "As you activate the pack, you can harness up
// to four willing creatures to the ropes on the pack. At the end of the activation time, the pack casts a 7th-rank Interplanar Teleport or
// Teleport spell, transporting you and everyone attached to the pack. Attempt a DC 45 Survival check. On a success, you arrive 25 miles off
// target using interplanar teleport or halve the distance you're off-target with teleport. On a critical success, you arrive exactly on
// target" — the spell module's cast (its picker, its targets those harnessed); the check its user's own, and where it arrives off this map:
// lines of the cast card, partial no more. After the cast notes are judged (src/compiler/honest.js withCastNotes). Pure.
const TRAVEL = [
    [/^At the end of the activation time, the pack casts an? \d+(?:st|nd|rd|th)-rank Interplanar Teleport or Teleport spell, transporting you and everyone attached to the pack\.$/i, () => null],
    [/^As you activate the pack, you can harness up to (\w+) willing creatures to the ropes on the pack\.$/i, (match) => `Up to ${match[1]} willing creatures harnessed to its ropes go along: target them with its user.`],
    [/^Attempt an? (?:\(DC (\d+)\)|DC (\d+) Survival|@Check\[survival\|dc:(\d+)\]) check\.$/i, (match) => `Then its user attempts a DC ${match[1] ?? match[2] ?? match[3]} Survival check (its own roll).`],
    [/^On a success, you arrive (\d+) miles off target using interplanar teleport or halve the distance you're off-target with teleport\s*\.$/i, (match) => `On a success it arrives ${match[1]} miles off target with Interplanar Teleport, or half as far off target with Teleport; ${AWAY}.`],
    [/^On a critical success, you arrive exactly on target\.?$/i, () => "On a critical success it arrives exactly on target."]
];
const TRAVEL_SPELLS = /^(?:Teleport|Interplanar Teleport)$/i;
const travelLine = (note) => TRAVEL.find(([pattern]) => pattern.test(String(note).trim()));
export function withTravelCast(plan) {
    if (plan?.builtin !== "cast-spell" || !plan.partial || !TRAVEL_SPELLS.test(plan.spell?.name ?? "") || !(plan.notes ?? []).length || !plan.notes.every((note) => travelLine(typeof note === "string" ? note : note?.text))) return plan;
    const lines = plan.notes.map((note) => {
        const [pattern, words] = travelLine(typeof note === "string" ? note : note.text);
        return words(pattern.exec(String(typeof note === "string" ? note : note.text).trim()));
    }).filter(Boolean);
    const { partial, ...rest } = plan;
    return { ...rest, notes: lines, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}
