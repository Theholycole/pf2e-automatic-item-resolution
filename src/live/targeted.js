// What ends an Effect with the RollOption "air-ends-on:targeted" (src/compiler/hostile-ends.js: Flawed Orb of Gold Dragonkind's stun, "ends if
// the dragon is attacked or otherwise subject to a hostile act other than that of the orb"; live in scripts/ends-on-hostile.js): an attack
// roll at its creature, a saving throw its creature rolls, damage it takes — unless the act is its own source's, the Effect's item by name
// (PF2e's Effect name "<item>: <label>"). Pure.

const ATTACKS = new Set(["attack-roll", "spell-attack-roll"]);

// A chat message's PF2e context and its roller's uuid → { at: [uuids] } — whom it's hostile to (an attack's target token and actor, a save's
// roller) — or null for a message that's no such act.
export function hostileAt(context, rollerUuid = null) {
    if (ATTACKS.has(context?.type)) {
        const at = [context.target?.token, context.target?.actor].filter(Boolean);
        return at.length ? { at } : null;
    }
    if (context?.type === "saving-throw" && rollerUuid) return { at: [rollerUuid] };
    return null;
}

// Whether the Effect ends for an act from that item (its name, or null when the act names none): not for its own source's.
export const endsFor = (effectName, originName) => !originName || String(effectName ?? "").split(":")[0].trim().toLowerCase() !== String(originName).trim().toLowerCase();
