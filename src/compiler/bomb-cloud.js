// A cloud a bomb leaves around the creature it's thrown at, Silver Orb's: "Except on a critical miss, the filings linger airborne in a
// @Template[burst|distance:5] around the target. The cloud lasts for 1 minute … Creatures inside the cloud are Concealed to those outside.
// Each breathing creature who ends its turn in the cloud takes @Damage[1d6[slashing]] damage from a silver source, with a
// @Check[fortitude|dc:19|basic] save." → plan.item.cloud { zone, onMiss }: the ability module's zone, a burst set down at the target's
// square (not following it), its basic save at the end of each turn in it, Concealed inside; on any degree but a critical miss
// (onMiss: a plain miss too, when PF2e rolls no damage — scripts/bombs.js posts the card from the attack roll then). Its own breathing
// and silver words, and what the filings do to the creature hit, are notes. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { damageMaterial } from "./materials.js";
import { durationIn } from "./rows.js";

const LINGERS = /\b(Except on a critical miss|On a hit), [^.]*?\blinger[^.]*?\bin an? @Template\[(?:type:)?burst\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? around the target\./i;
const LASTS = /\bThe cloud lasts for (\d+|one|a) (minutes?|rounds?)\b[^.]*\./i;
const CONCEALS = /\bCreatures inside the cloud are (?:@UUID\[[^\]]*\]\{)?Concealed\}? to those outside\./i;
const ENDS_TURN = /\bEach (breathing )?creature (?:who|that) ends its turn in the cloud takes (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage([^.,]*?),? with an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save\./i;
const readable = (text) => String(text ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The bomb's html → { zone, onMiss } or null.
export function readBombCloud(html, name = "Cloud") {
    const text = String(html ?? "");
    const lingers = LINGERS.exec(text);
    const ends = ENDS_TURN.exec(text);
    const lasts = LASTS.exec(readable(text));
    if (!lingers || !ends || !lasts) return null;
    let plan = null;
    try {
        plan = compileAbility({ name, type: "action", system: { slug: null, description: { value: `<p>The target takes ${ends[2]} damage (${ends[4]} save).</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
    } catch {
        plan = null;
    }
    if (plan?.resolution?.kind !== "save" || plan.resolution.check?.against?.dc !== "fixed") return null;
    // ("from a silver source": the material in its damage's flavor, as PF2e's roll reads it, src/compiler/materials.js.)
    const material = /\bfrom an? (silver|cold iron|adamantine) source\b/i.exec(ends[3] ?? "");
    if (material) plan = damageMaterial(plan, `The damage is treated as ${material[1].toLowerCase()}`);
    const notes = [
        ...(ends[1] ? ["Only a breathing creature takes the cloud's damage: the GM's call for any other."] : []),
        ...(ends[3]?.trim() && !material ? [`Its damage is ${ends[3].trim()}.`] : []),
        ...readable(text).split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\bis covered with\b|\btreated as (?:silver|cold iron|adamantine)\b/i.test(sentence) && /^A creature hit\b/i.test(sentence))
    ];
    const zone = {
        area: { type: "burst", value: Number(lingers[2]) },
        centre: "self",
        range: null,
        lasts: durationIn(`for ${lasts[1]} ${lasts[2]}`, null),
        untilReused: false,
        concealed: CONCEALS.test(text),
        terrain: [],
        others: false,
        hazard: null,
        saves: [{ when: ["end"], plan: { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the cloud", range: null, area: null } } }],
        damage: [],
        effect: null,
        modifiers: [],
        notes
    };
    return { zone, onMiss: /^Except on a critical miss$/i.test(lingers[1]) };
}
