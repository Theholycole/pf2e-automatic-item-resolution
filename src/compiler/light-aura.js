// A bonus for the creatures in the light its user sheds, Sprite Apple's: "you shed bright light in a 20-foot emanation … Creatures in the
// bright light feel a burst of creativity, gaining a +1 item bonus to Performance checks". plan.item.lightAura { radius, modifiers,
// duration } — live play starts the ability module's zone on its user's token for the light's time, whose modifiers each creature inside
// gets (src/live/zones.js there). The light itself stays the item card's own Effect (plan.item.light). Its narrower half is a modifier with
// PF2e's predicate (2026-10-26): Chartreuse's "and to Diplomacy checks attempted against animals or plants" for checks at a creature of those
// traits; Golden's "–1 item penalty to their Will DC against Diplomacy checks", the Will DC's against a Diplomacy check (as PF2e's Stone
// Face has it for Intimidation). Pure.

import { allyAreaRow } from "./rows.js";

const IN_LIGHT = /\bCreatures in the bright light\b[^.]*?,\s*(gaining|taking) (an? [+\-–]\d+ (?:item|status|circumstance) (?:bonus|penalty) to [^.(]+?)(?:\s*\([^)]*\))?\./i;
// ("and to Diplomacy checks attempted against animals or plants": that skill's, at a creature of either trait.)
const AGAINST_TRAITS = /^(\w+) checks attempted against (\w+?)s? or (\w+?)s?$/i;
// ("a –1 item penalty to their Will DC against Diplomacy checks": that save's DC, against that skill's check.)
const DC_AGAINST = /^an? [+\-–](\d+) (item|status|circumstance) (bonus|penalty) to (?:your|their) (Fortitude|Reflex|Will) DC against (\w+) checks$/i;
// (Its user's own in that light, Sprite Apple's "While shedding this light, you can't be Concealed if you're visible, and if you're
// Invisible, you're concealed instead rather than being undetected": words on the light's Effect — PF2e has no rule for it.)
const REVEALED = /\bWhile shedding this light, you can't be Concealed if you're visible, and if you're Invisible, you're concealed instead rather than being undetected\./i;
export const REVEALED_NOTE = "while it sheds it, it can't be concealed if it's visible, and invisible it's concealed rather than undetected";
export const revealedSentence = (html) => REVEALED.exec(String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))?.[0] ?? null;

// The item's html and its plan → { aura, said } (the sentence read), or null.
export function readLightAura(html, plan) {
    const light = (plan?.item?.light ?? [])[0];
    if (!light?.bright) return null;
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const found = IN_LIGHT.exec(text);
    if (!found) return null;
    const dc = DC_AGAINST.exec(found[2].trim());
    if (dc) {
        const value = Number(dc[1]) * (/^penalty$/i.test(dc[3]) ? -1 : 1);
        return { aura: { radius: light.bright, modifiers: [{ selector: `${dc[4].toLowerCase()}-dc`, value, type: dc[2].toLowerCase(), predicate: [`check:statistic:${dc[5].toLowerCase()}`], duration: light.duration ?? null }], duration: light.duration ?? null }, said: found[0], whole: true };
    }
    // (Its first part read as its user's own; a narrower second one, "and to Diplomacy checks attempted against animals", with its predicate.)
    const [words, narrower] = found[2].split(/ and to /);
    const read = allyAreaRow(`You and allies within ${light.bright} feet of you gain ${words.replace(/\btheir\b/g, "your")} for ${light.duration?.value ?? 10} ${light.duration?.unit ?? "minutes"}.`, light.duration ?? null);
    const modifiers = read?.row?.modifiers ?? [];
    if (!modifiers.length) return null;
    const against = narrower ? AGAINST_TRAITS.exec(narrower.trim()) : null;
    const extra = against && modifiers.length === 1 ? [{ ...modifiers[0], selector: against[1].toLowerCase(), predicate: [{ or: [`target:trait:${against[2].toLowerCase()}`, `target:trait:${against[3].toLowerCase()}`] }] }] : [];
    return { aura: { radius: light.bright, modifiers: [...modifiers, ...extra], duration: light.duration ?? null }, said: found[0], whole: !narrower || extra.length > 0 };
}

// The ability module's zone for it: an emanation on its user's token, its modifiers for each creature inside, for its time.
export function lightAuraZone(aura) {
    return {
        area: { type: "emanation", value: aura.radius },
        centre: "self",
        range: null,
        lasts: aura.duration,
        untilReused: false,
        concealed: false,
        terrain: [],
        others: false,
        hazard: null,
        saves: [],
        damage: [],
        effect: null,
        modifiers: aura.modifiers.map((modifier) => ({ ...modifier, duration: null })),
        notes: [`Each creature in the bright light gets it while it's inside.`]
    };
}
