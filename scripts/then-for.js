// Live play for a note Effect's "air-then-for:<value>:<unit>:<type>" RollOption (src/compiler/triggered.js withBleedWorse: Secret-Keeper's Mask
// (Father Skinsaw)'s penalties "while it is bleeding and for 1 minute after it ceases bleeding"). That Effect lasts while its creature takes
// persistent damage of the type (the ability module's whilePersistent); once it's deleted and the creature no longer takes that damage, the
// active GM's client gives it the same rules — but the marker and what acts on that damage — for that time after. An Effect deleted by hand
// while the bleeding goes on gets none.

import { MODULE_ID, isActiveGM } from "./foundry.js";

const MARKER = /^air-then-for:(\d+):(rounds|minutes|hours):(\w+)$/;
const takesPersistent = (actor, type) => (actor?.itemTypes?.condition ?? []).some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === type);

// The Effect's marker → { value, unit, type }, or null. Pure.
export function thenForOf(effect) {
    const rule = (effect?.system?.rules ?? []).find((entry) => entry?.key === "RollOption" && MARKER.test(String(entry.option ?? "")));
    if (!rule) return null;
    const [, value, unit, type] = MARKER.exec(rule.option);
    return { value: Number(value), unit, type };
}

// The Effect for the time after: its rules but the marker and those on the persistent damage (its recovery DC), its words said again. Pure.
export function thenForSource(effect, then, { worldTime = 0, initiative = null } = {}) {
    const rules = (effect.system?.rules ?? []).filter((rule) => !(rule?.key === "RollOption" && MARKER.test(String(rule.option ?? ""))) && !(rule?.key === "ItemAlteration" && rule.itemType === "condition"));
    return {
        name: `${effect.name} (after)`,
        type: "effect",
        img: effect.img ?? "icons/svg/book.svg",
        flags: { [MODULE_ID]: { thenFor: { from: effect.name } } },
        system: {
            description: { value: `<p>Its ${then.type} damage has ended: this stays for ${then.value} ${then.value === 1 ? then.unit.replace(/s$/, "") : then.unit}.</p>${effect.system?.description?.value ?? ""}` },
            duration: { value: then.value, unit: then.unit, expiry: "turn-start", sustained: false },
            start: { value: worldTime, initiative },
            context: effect.system?.context ?? null,
            rules: rules.map((rule) => structuredClone(rule))
        }
    };
}

export async function followThenFor(effect) {
    const then = thenForOf(effect);
    const actor = effect?.parent ?? effect?.actor ?? null;
    if (!then || !actor?.createEmbeddedDocuments || takesPersistent(actor, then.type)) return null;
    const [made] = await actor.createEmbeddedDocuments("Item", [thenForSource(effect, then, { worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null })]);
    return made ?? null;
}

export function setUpThenFor() {
    Hooks.on("deleteItem", (item) => {
        if (item?.type !== "effect" || !isActiveGM()) return;
        followThenFor(item).catch((error) => console.error(`${MODULE_ID} | then for`, error));
    });
}
