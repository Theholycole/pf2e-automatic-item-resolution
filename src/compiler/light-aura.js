// A bonus for the creatures in the light its user sheds, Sprite Apple's: "you shed bright light in a 20-foot emanation … Creatures in the
// bright light feel a burst of creativity, gaining a +1 item bonus to Performance checks". plan.item.lightAura { radius, modifiers,
// duration } — live play starts the ability module's zone on its user's token for the light's time, whose modifiers each creature inside
// gets (src/live/zones.js there). The light itself stays the item card's own Effect (plan.item.light). What the bonus is narrower in (its
// second half, a feat's case) stays a note. Pure.

import { allyAreaRow } from "./rows.js";

const IN_LIGHT = /\bCreatures in the bright light\b[^.]*?,\s*(gaining|taking) (an? [+-]\d+ (?:item|status|circumstance) (?:bonus|penalty) to [^.(]+?)(?:\s*\([^)]*\))?\./i;

// The item's html and its plan → { aura, said } (the sentence read), or null.
export function readLightAura(html, plan) {
    const light = (plan?.item?.light ?? [])[0];
    if (!light?.bright) return null;
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const found = IN_LIGHT.exec(text);
    if (!found) return null;
    // (Only its first part when it goes on to a narrower one: "to Nature checks and to Diplomacy checks attempted against animals".)
    const words = found[2].split(/ and to /)[0].replace(/\btheir\b/g, "your");
    const read = allyAreaRow(`You and allies within ${light.bright} feet of you gain ${words} for ${light.duration?.value ?? 10} ${light.duration?.unit ?? "minutes"}.`, light.duration ?? null);
    const modifiers = read?.row?.modifiers ?? [];
    if (!modifiers.length) return null;
    return { aura: { radius: light.bright, modifiers, duration: light.duration ?? null }, said: found[0], whole: found[2] === words };
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
