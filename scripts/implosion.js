// Live play for Implosion Dust's shrink (src/compiler/implosion.js): at the end of each turn of a creature carrying its Effect (its marker
// "air-implosion:<save>:<dc>"), the active GM's client rolls that save through PF2e and moves the Effect's steps — its CreatureSize rules and
// melee damage penalty made again for them —, or removes it once none are left. PF2e ends it after its 6 rounds.

import { implosionNext, implosionRules, implosionWords } from "../src/compiler/implosion.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];
const markerOf = (effect) => (effect.system?.rules ?? []).map((rule) => (rule?.key === "RollOption" ? /^air-implosion:(\w+):(\d+)$/.exec(String(rule.option ?? "")) : null)).find(Boolean);

async function newSave(actor, effect, marker) {
    const [, save, dc] = marker;
    const steps = (effect.system?.rules ?? []).filter((rule) => rule?.key === "CreatureSize").length;
    const roll = await actor.saves?.[save]?.roll({ dc: { value: Number(dc) }, skipDialog: true, extraRollOptions: ["air-implosion"] });
    const degree = Number(roll?.degreeOfSuccess);
    if (!Number.isFinite(degree)) return;
    const next = implosionNext(steps, degree);
    if (next <= 0) {
        await effect.delete();
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${effect.name}</strong>: ${actor.name} is back to its normal size.</p>` });
        return;
    }
    // (Each step's −2 for a step it really shrank: its natural size above Tiny.)
    const natural = SIZES.indexOf(actor.system?.traits?.naturalSize ?? actor.system?.traits?.size?.value ?? "med");
    const shrunk = Math.min(next, Math.max(0, natural));
    const label = String(effect.name ?? "Implosion Dust").replace(/:.*$/, "");
    await effect.update({ "system.rules": implosionRules({ save, dc: Number(dc), steps: next, shrunk, label }), "system.description.value": `<p>${implosionWords(next)}</p>` });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${effect.name}</strong>: ${actor.name} is now ${next} size step${next === 1 ? "" : "s"} smaller.</p>` });
}

export function setUpImplosion() {
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isActiveGM()) return;
        const actor = combatant?.actor;
        for (const effect of actor?.itemTypes?.effect ?? []) {
            const marker = markerOf(effect);
            if (marker && !(effect.isExpired ?? effect.system?.expired)) newSave(actor, effect, marker).catch((error) => console.error(`${MODULE_ID} | implosion`, error));
        }
    });
}
