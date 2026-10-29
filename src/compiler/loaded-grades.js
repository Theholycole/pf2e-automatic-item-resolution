// A weapon loaded with two alchemical items whose weakest decides its use (2026-10-28, docs/needs.md "reader"): the Alchemists+ module's Acid
// Cannon (persistent acid in a burst at range), Drum Stone Amplifier (sonic in an emanation around its user, Deafened on a critical failure),
// Electro-Magnetic Rod (an electric bolt at one creature that arcs on to more, Off-Guard on a critical failure) and Slushwand (cold in a few
// contiguous squares, a Speed penalty on a critical failure). Their Effect names the shared rider; a line per grade of the loaded item
// (Lesser to Major) gives its damage, basic Reflex DC and area, range or extra targets. As PF2e's Alchemist's Flamethrower
// (src/compiler/permanent.js gradeWaysPlan), the ways card's pick of the grade loaded, once: each way that grade's basic save, its rider on
// the critical failure. Where to aim (an emanation made smaller, the bolt's arcs, the squares), and the two loaded items spent, are its
// card's lines. Pure.

import { durationIn, timeIn } from "./rows.js";

const NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const CONDITION = { deafened: "deafened", "off-guard": "off-guard", dazzled: "dazzled", sickened: "sickened" };

// A grade's line, in plain text: its name (and the loaded item's), its dice and damage type, its basic save's statistic and DC, and the rest.
const GRADE = /^(Lesser|Moderate|Greater|Major)\s+([A-Z][\w' ]+?)\s*:\s*The [\w' -]+? deals (\d+d\d+) (\w+)( persistent)?(?: damage)?\s*\(@Check\[(fortitude|reflex|will)\|dc:(\d+)\|basic[^\]]*\]\s*save\)\s*(.*)$/;
// (Its area or targets: a burst at a range, an emanation, extra creatures, or squares — with the Speed penalty its rider takes. Slushwand's
// Major line also carries a burst and range left over from another item's line before its squares: its squares win, as its other lines'.)
const BURST = /^in an? (\d+)-foot (burst|cone|line) within (\d+) feet\.$/;
const EMANATION = /^in an? (\d+)-foot emanation\.$/;
const MORE = /^and can hit (one|two|three|four|five|\d+) additional creatures?\s+after the first target\.$/;
const SQUARES = /^(?:in an? \d+-foot burst within \d+ feet\.\s*)?in (\d+) contiguous squares\s+within (\d+) feet\s+The status penalty\s+to Speed is an? [–-](\d+)-foot penalty\.$/;

// The Effect's own sentences: the use (which spends both loaded items), the damage by the weakest loaded, and the rider.
const USE = /^You (pull the trigger|smash both hands\s+on the drum|point the (?:rod|wand) at (?:a target|an area)),\s*(.*)$/;
const BY_WEAKEST = /^Creatures (?:in the area|the bolt targets) take (?:persistent )?\w+ damage\s+based on the weakest [\w' -]+? loaded\s+into the [\w' -]+?, as noted below\.$/;
const SMALLER = /^You can choose\s+the size of the emanation\s+up to a maximum\s+based on the weakest [\w' -]+? loaded\s+into the [\w' -]+?\.$/;
const RIDER_CONDITION = /^Creatures that critically\s+fail the basic\s+(?:Fortitude|Reflex|Will) save are ([A-Z][\w-]+) ((?:for \d+ rounds?|until the (?:start|end) of\s+your next turn))\.$/;
const RIDER_SPEED = /^Creatures that critically\s+fail the basic\s+(?:Fortitude|Reflex|Will) save also take\s+a status penalty\s+to its Speeds\s+until the end\s+of its next turn\.$/;
// (The bolt's arcs: its range, and how near the first target the next must be.)
const ARCS = /\bhits a target\s+within (\d+) feet\s+and then arcs\s+to another creature\s+within (\d+) feet\s+of the initial target\s+unless the initial\s+target[’']s saving throw\s+was a critical success\.$/;
const EMANATES = /^causing the sound\s+to erupt outwards\s+in an emanation\s+around you\.$/;
const SPENDS = /^expending both loaded [\w' -]+?(?: to spray out \w+| and creating\s+an area of \w+\s+in contiguous squares\s+within range| and creating a bolt\b.*)\.$/;

const row = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] });

// The item's whole text (its loading time), the activation's words, the plan read before, its base and item part → the ways plan, or null.
export function loadedGradesPlan({ words, item, base, info, plan }) {
    if (item?.type === "consumable" || !words) return null;
    const sentences = String(words).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const grades = [];
    let use = null;
    let smaller = false;
    let arcs = null;
    let rider = null;
    let speed = false;
    for (const sentence of sentences) {
        const grade = GRADE.exec(sentence);
        if (grade) {
            grades.push(grade);
            continue;
        }
        const used = USE.exec(sentence);
        if (used && !use) {
            const rest = used[2];
            // (The bolt's range and arcs are in the same sentence.)
            arcs = ARCS.exec(rest);
            if (!SPENDS.test(rest) && !EMANATES.test(rest) && !arcs) return null;
            use = used;
            continue;
        }
        if (BY_WEAKEST.test(sentence)) continue;
        if (SMALLER.test(sentence)) {
            smaller = true;
            continue;
        }
        const condition = RIDER_CONDITION.exec(sentence);
        if (condition && CONDITION[condition[1].toLowerCase()]) {
            const slug = CONDITION[condition[1].toLowerCase()];
            rider = { kind: "condition", slug, value: null, duration: /^until\b/.test(condition[2]) ? timeIn(condition[2], null) : durationIn(condition[2], null) };
            continue;
        }
        if (RIDER_SPEED.test(sentence)) {
            speed = true;
            continue;
        }
        return null;
    }
    if (!use || grades.length < 2) return null;
    // (Its loading time, in the item's own text: "Properly loading … takes 1 minute".)
    const loading = /\bloading the [\w' -]+? in this way takes (\d+) (minutes?|rounds?)\b/i.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const spent = `Both loaded items are spent: two more must be loaded${loading ? ` (${loading[1]} ${loading[2]})` : ""} before the next use.`;
    const ways = [];
    for (const [, gradeName, loaded, dice, type, persistent, statistic, dc, tail] of grades) {
        const burst = BURST.exec(tail);
        const emanation = EMANATION.exec(tail);
        const more = MORE.exec(tail);
        const squares = SQUARES.exec(tail);
        const notes = [];
        let targeting;
        if (squares) {
            targeting = { target: `the creatures in ${squares[1]} contiguous squares`, range: `${squares[2]} feet`, area: null };
            notes.push(`Its area is ${squares[1]} contiguous squares within ${squares[2]} feet: pick them on the map and target the creatures in them.`);
        } else if (more && arcs) {
            const extra = NUMBER[more[1]] ?? Number(more[1]);
            targeting = { target: `up to ${extra + 1} creatures`, range: `${arcs[1]} feet`, area: null };
            notes.push(`The bolt hits one creature within ${arcs[1]} feet, then up to ${extra} more within ${arcs[2]} feet of that first one: target them all. If the first critically succeeds, the bolt doesn't arc: apply only its result.`);
        } else if (burst) targeting = { target: null, range: `${burst[3]} feet`, area: { type: burst[2], value: Number(burst[1]) } };
        else if (emanation) {
            targeting = { target: null, range: null, area: { type: "emanation", value: Number(emanation[1]) } };
            if (smaller) notes.push(`Its emanation can be smaller, up to ${emanation[1]} feet: its user's choice (resize it on the map).`);
        } else return null;
        if (speed && !squares) return null;
        const critical = { ...row(2), effects: rider ? [rider] : [], ...(speed ? { modifiers: [{ selector: "all-speeds", value: -Number(squares[3]), type: "status", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } }] } : {}) };
        notes.push(spent);
        ways.push({
            name: `${gradeName} ${loaded.trim()}`,
            html: `<p>${sentences.find((sentence) => sentence.startsWith(`${gradeName} `)) ?? ""}</p>`,
            plan: {
                ...base,
                automation: { level: "automatic" },
                targeting,
                trigger: { event: "use" },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic, basic: true, against: { dc: "fixed", value: Number(dc) } },
                    sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${dice}[${type.toLowerCase()}${persistent ? ",persistent" : ""}]`, type: null, category: null }] },
                    outcomes: { criticalSuccess: row(0), success: row(0.5), failure: row(1), criticalFailure: critical }
                },
                ...(plan?.requirementUnread ? { requirementUnread: plan.requirementUnread } : {}),
                notes,
                item: info
            }
        });
    }
    return { ...base, builtin: "ways", once: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, item: info };
}
