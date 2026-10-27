// Live play for a curse of impending doom (src/compiler/special-sentences.js: Hex Blaster's critical failure, "If the target falls Unconscious
// from damage dealt by this Strike or the persistent mental damage, it remains unconscious for 1 day or until this curse is removed. After 1
// day, if the creature is still unconscious, it must succeed at a DC 28 Fortitude save or die"). Its note Effect carries the RollOption
// "air-doom-curse:<DC>:<days>" (src/live/card.js doomCurseOf). On the active GM's client: a cursed creature given PF2e's Unconscious gets an
// Effect holding it unconscious for those days (GrantItem, restricted); once that Effect ends and the curse is still on it, the ability
// module's save card at it — that Fortitude save, death and incapacitation, a failure its death. The curse removed, the hold goes with it.

import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";
import { doomCurseOf } from "../src/live/card.js";

const HOLD = "doomHold";
const UNCONSCIOUS = "Compendium.pf2e.conditionitems.Item.fBnFDH2MTzgFijKf";
const curseOf = (actor) => (actor?.itemTypes?.effect ?? []).map((effect) => ({ effect, curse: doomCurseOf(effect) })).find((entry) => entry.curse) ?? null;
const holdOf = (actor) => (actor?.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.[HOLD]);

async function hold(actor, found) {
    if (holdOf(actor)) return;
    const name = String(found.effect.name ?? "Hex of impending doom").replace(/:.*$/, "");
    await actor.createEmbeddedDocuments("Item", [{ name: `${name}: doomed sleep`, type: "effect", img: "icons/svg/sleep.svg", flags: { [MODULE_ID]: { [HOLD]: { dc: found.curse.dc, curseId: found.effect.id, item: name } } }, system: { description: { value: `<p>Unconscious from the curse for ${found.curse.days} day${found.curse.days === 1 ? "" : "s"}, or until it's removed; then a DC ${found.curse.dc} Fortitude save (death, incapacitation) or it dies.</p>` }, duration: { value: found.curse.days, unit: "days", expiry: "turn-start", sustained: false }, start: { value: game.time.worldTime }, rules: [{ key: "GrantItem", uuid: UNCONSCIOUS, onDeleteActions: { grantee: "restrict" } }] } }]);
}

async function doomSave(actor, flag) {
    const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
    const token = actor.getActiveTokens?.(false, true)?.[0] ?? null;
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
    const plan = { modelVersion: 13, source: { name: flag.item }, rank: 1, traits: ["death", "incapacitation"], activation: { time: null, traits: [] }, automation: { level: "automatic" }, targeting: { target: "the cursed creature", range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: flag.dc } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), terminal: { kind: "death" } }, criticalFailure: { ...none(), terminal: { kind: "death" } } } } };
    if (postCard && token) return postCard({ plan, item: { name: flag.item, uuid: null }, sourceActor: actor, sourceToken: token.document ?? token, tokens: [token.object ?? token], cause: "the doomed sleep ended" });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id), content: `<p><strong>${flag.item}</strong>: ${actor.name}'s doomed sleep is over — a DC ${flag.dc} Fortitude save (death, incapacitation) or it dies (roll it by hand).</p>` });
}

export function setUpDoomHex() {
    Hooks.on("createItem", (item) => {
        if (!isActiveGM() || item?.type !== "condition" || item.slug !== "unconscious") return;
        const found = curseOf(item.parent);
        if (found) hold(item.parent, found).catch((error) => console.error(`${MODULE_ID} | doom hold`, error));
    });
    Hooks.on("deleteItem", (item) => {
        if (!isActiveGM() || item?.type !== "effect" || !item.parent) return;
        const actor = item.parent;
        // (The curse removed: its hold goes too, no save.)
        if (doomCurseOf(item)) {
            const held = holdOf(actor);
            if (held) actor.deleteEmbeddedDocuments("Item", [held.id]).catch(() => null);
            return;
        }
        const flag = item.flags?.[MODULE_ID]?.[HOLD];
        if (!flag || !curseOf(actor)) return;
        // (Its days over — not deleted early by hand: its time passed.)
        const ends = (Number(item.system?.start?.value) || 0) + (Number(item.system?.duration?.value) || 0) * 86_400;
        if (Number(game.time.worldTime) + 6 < ends) return;
        doomSave(actor, flag).catch((error) => console.error(`${MODULE_ID} | doom save`, error));
    });
}
