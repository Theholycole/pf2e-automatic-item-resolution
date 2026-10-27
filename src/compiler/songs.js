// A Strike whose hit sets off one of several songs around the creature hit (2026-10-27, docs/needs.md): Singing Shortbow's Harmonic Shot — "Make a
// Strike with the singing shortbow. If it hits, the bow generates a magical effect determined by the note you produced … This affects every
// creature in a @Template[type:emanation|distance:10] from the creature you hit. As normal for an emanation, you choose whether the creature you
// hit is affected.", then its songs: "Song of Soothing (emotion, healing, mental) Each creature regains 3d10 Hit Points and gains a +1 status bonus
// to saves against mental effects for 1 minute. @UUID[…]{Effect: Song of Soothing}", "Song of Suffering (sonic) Each creature takes 3d10 sonic
// damage with a … basic save". The ways card, a way for each song, each the Strike card with strike.around — that song's card at every creature
// within the radius of the one hit (the healing and PF2e's Effect, or the save); whether the creature hit is in it its user's (the card's targets,
// its "Use my targets"). Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const HIT = /\bMake a Strike with the [\w' -]+?\. If it hits, the [\w' -]+? generates a magical effect determined by the note you produced\b/i;
const AREA = /\bThis affects every creature in an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? from the creature you hit\./i;
const SONG = /\b(Song of [A-Z][a-z]+) \(([^)]*)\) (.*?)(?=\s*\bSong of [A-Z][a-z]+ \(|\s*\bCraft Requirements\b|$)/gs;
const HEALS = /^Each creature regains @Damage\[(\d+d\d+(?:\+\d+)?)\[healing\]\][^ ]* Hit Points and gains an? \+(\d+) (status|circumstance|item) bonus to saves against (\w+) effects for (\d+) (minutes?|rounds?)\.\s*@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}$/i;
const HURTS = /^Each creature takes (@Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage with an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\bbasic\b[^\]]*\])(?:\{[^}]*\})? save\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

function songPlan(name, traits, words, item, base, options) {
    const heals = HEALS.exec(words.trim());
    if (heals) {
        return {
            ...base,
            modelVersion: MODEL_VERSION,
            source: { ...base.source, name: `${item.name}: ${name}` },
            traits: traits.split(/,\s*/).map((trait) => trait.trim().toLowerCase()).filter(Boolean),
            automation: { level: "automatic" },
            targeting: { target: "each creature around the one hit", range: null, area: null },
            trigger: { event: "use" },
            resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), effects: [{ kind: "heal", formula: heals[1] }], nativeEffects: [{ uuid: heals[7], label: heals[8] }] }, failure: none(), criticalFailure: none() } }
        };
    }
    const hurts = HURTS.exec(words.trim());
    if (!hurts) return null;
    let read = null;
    try {
        read = compileAbility({ ...item, name: `${item.name}: ${name}`, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> The target takes ${hurts[1]} damage with a ${hurts[2]} save.</p>` }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    } catch {
        read = null;
    }
    return read?.resolution?.kind === "save" && read.resolution.check?.against?.dc === "fixed" ? { ...read, trigger: { event: "use" }, traits: traits.split(/,\s*/).map((trait) => trait.trim().toLowerCase()).filter(Boolean) } : null;
}

// The activation's html, its base, the item → the ways plan, or null.
export function songWaysPlan(html, base, item, options = {}) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const area = AREA.exec(text);
    if (!HIT.test(text) || !area) return null;
    const after = text.slice(area.index + area[0].length);
    const ways = [];
    for (const [, name, traits, words] of after.matchAll(SONG)) {
        const plan = songPlan(name, traits, words, item, base, options);
        if (!plan) return null;
        const strike = {
            ...base,
            modelVersion: MODEL_VERSION,
            source: { ...base.source, name: `${base.source?.name ?? item.name} (${name})` },
            automation: { level: "automatic" },
            targeting: { target: "the creature the Strike hits", range: null, area: null },
            trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
            resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
            strike: { range: "ranged", save: null, own: true, around: [{ radius: Number(area[1]), includeTarget: true, plan }], notes: [], lines: [`${name}: every creature within ${area[1]} feet of the one it hits; whether the one hit is affected is its user's (that card's Use my targets)`] }
        };
        ways.push({ name, html: `<p>${name} (${traits})</p>`, plan: strike });
    }
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", once: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base.trigger?.frequency ? { frequency: base.trigger.frequency } : {}), event: "use" }, ways };
}
