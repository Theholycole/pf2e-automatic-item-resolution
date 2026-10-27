// Live play for plan.item.reshape (src/compiler/reshape.js: Bestiary of Metamorphosis's Shifting Form): its user's polymorph Effect with PF2e's
// choice of forms is made again — PF2e's ChoiceSet asks for the new form — for half the time it had left, and the old one removed.

import { reshapeCandidates, reshapedSource } from "../src/live/reshape.js";

const originTraits = (effect) => {
    const uuid = effect.system?.context?.origin?.item;
    try {
        return uuid ? fromUuidSync(uuid)?.system?.traits?.value ?? [] : [];
    } catch {
        return [];
    }
};

// The creature → the card's line.
export async function reshapeForm(actor) {
    const effects = (actor?.itemTypes?.effect ?? []).map((effect) => ({ effect, name: effect.name, traits: effect.system?.traits?.value ?? [], originTraits: originTraits(effect), rules: effect.system?.rules ?? [] }));
    const [found] = reshapeCandidates(effects);
    if (!found) return `${actor?.name ?? "Its user"} is under no polymorph spell with a choice of forms: nothing to reshape.`;
    const { effect } = found;
    const seconds = Number(effect.remainingDuration?.remaining ?? NaN);
    const left = Number.isFinite(seconds) ? seconds : (Number(effect.system?.duration?.value) || 1) * ({ rounds: 6, minutes: 60, hours: 3600, days: 86_400 }[effect.system?.duration?.unit] ?? 6);
    const source = reshapedSource(effect.toObject(), { seconds: left, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null });
    const [made] = await actor.createEmbeddedDocuments("Item", [source]);
    if (!made) return `${effect.name}: pick its new form by hand (PF2e didn't make it again).`;
    await effect.delete();
    return `${actor.name} takes another form of ${effect.name}, for ${source.system.duration.value} round${source.system.duration.value === 1 ? "" : "s"} (half what was left).`;
}
