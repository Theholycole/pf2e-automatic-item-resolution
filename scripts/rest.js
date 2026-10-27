// Live play for plan.item.rest (src/compiler/legend-readings.js, 2026-10-27: Hallajin Key's "renewing them as if they had spent a full day
// resting"): the item card at each creature targeted, on the active GM's client — PF2e's own Rest for the Night for it (its Hit Points, its
// conditions and its daily resources, spell slots and frequencies renewed), and for a full day of rest, as PF2e's long-term rest gives,
// as many Hit Points again (its Constitution modifier, at least 1, times its level).

// The Hit Points a night's rest gives a creature: { con, level } → its Constitution modifier (at least 1) times its level. Pure.
export const nightsHitPoints = ({ con = 0, level = 1 } = {}) => Math.max(Number(con) || 0, 1) * Math.max(Number(level) || 0, 1);

// target: { actor, token }; rest: { day } → the card's lines.
export async function restCreature(target, name, rest) {
    const actor = target?.actor;
    if (!actor) return [];
    if (actor.type !== "character") return [`${name} isn't a character: PF2e's Rest for the Night is for characters only (rest it by hand).`];
    const restForTheNight = game.pf2e?.actions?.restForTheNight;
    if (typeof restForTheNight !== "function") return [`${name}: rest it by hand (PF2e's Rest for the Night isn't here).`];
    await restForTheNight({ actors: [actor], skipDialog: true });
    const lines = [`${name} rests as for a night (PF2e's Rest for the Night)`];
    // (A full day of rest: the night's Hit Points once more.)
    if (rest.day) {
        const hp = actor.system?.attributes?.hp ?? {};
        const more = Math.min(nightsHitPoints({ con: actor.abilities?.con?.mod ?? actor.system?.abilities?.con?.mod, level: actor.level }), Math.max(0, (Number(hp.max) || 0) - (Number(hp.value) || 0)));
        if (more > 0) {
            await actor.update({ "system.attributes.hp.value": (Number(hp.value) || 0) + more });
            lines.push(`${name} regains ${more} more Hit Points for the full day of rest`);
        }
    }
    return lines;
}
