// Live play for plan.grantSpell (src/live/grimoire.js, 2026-10-27: Grimoire of Unknown Necessities): the card finds its user's prepared
// spellcasting entry of the tradition and the highest rank it casts; the GM names the spell; Apply (the GM's) puts PF2e's own spell from
// its compendium in that entry, flagged with when it was granted. Gone at its user's next rest (PF2e's pf2e.restForTheNight) or once
// the world's clock is a day on — with every scroll, wand or spell of it its user made since.

import { copiesSince, createGrantCard, grantCardHTML, grantProblem, highestRank } from "../src/live/grimoire.js";
import { FLAG, MODULE_ID, entryOf, isActiveGM, stateOf } from "./foundry.js";

const GRANTED = "grantedSpell";
const sourceOf = (item) => item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? null;
const spellSourceOf = (item) => sourceOf(item) ?? (item?.type === "consumable" ? sourceOf(item.system?.spell) : null);

function entryFor(actor, grant) {
    return (actor?.itemTypes?.spellcastingEntry ?? []).find((entry) => entry.system?.tradition?.value === grant.tradition && (!grant.prepared || entry.system?.prepared?.value === "prepared")) ?? null;
}

export async function postGrantCard({ message, plan, used, actor, token }) {
    const entry = entryFor(actor, plan.grantSpell);
    const state = createGrantCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor), entry: entry ? { id: entry.id, name: entry.name } : null, rank: entry ? highestRank(entry.system?.slots) : 0 });
    return ChatMessage.create({ content: grantCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// The spell by name in PF2e's spells compendium.
async function spellNamed(name) {
    const pack = game.packs.get("pf2e.spells-srd");
    const found = pack?.index?.find?.((entry) => entry.name.toLowerCase() === String(name ?? "").trim().toLowerCase());
    return found ? pack.getDocument(found._id) : null;
}

// On the active GM's client: { spell, gm } → the spell in its user's spellbook for the day.
export async function applyGrantCard(message, { spell = "", gm = false } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "grant-spell" || state.status !== "open") return null;
    if (!gm) throw new Error("the GM picks the spell it grants.");
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    const entry = actor?.items?.get(state.entry?.id ?? "");
    if (!entry) throw new Error(`${state.user.name}'s spellcasting isn't there any more.`);
    const found = await spellNamed(spell);
    if (!found) throw new Error(`no spell named "${spell}" in PF2e's spells.`);
    const traits = found.system?.traits?.value ?? [];
    const known = (actor.itemTypes?.spell ?? []).filter((one) => one.system?.location?.value === entry.id).map(sourceOf).filter(Boolean);
    const problem = grantProblem({ name: found.name, rank: Number(found.system?.level?.value) || 0, traditions: found.system?.traits?.traditions ?? [], cantrip: traits.includes("cantrip"), sourceId: found.uuid }, { tradition: state.plan.grantSpell.tradition, rank: state.rank, known });
    if (problem) throw new Error(problem);
    const source = found.toObject();
    delete source._id;
    source.system.location = { ...(source.system.location ?? {}), value: entry.id };
    source._stats = { ...(source._stats ?? {}), compendiumSource: found.uuid };
    source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { [GRANTED]: { until: game.time.worldTime + 86_400, since: Date.now(), sourceId: found.uuid, from: state.item.name } } };
    await actor.createEmbeddedDocuments("Item", [source]);
    const next = { ...state, status: "applied", results: [`${found.name} (rank ${found.system?.level?.value}) is in ${state.user.name}'s ${entry.name} until the next day; any copy made of it goes with it.`] };
    return message.update({ content: grantCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// Its granted spells gone (all of them, or those whose day is over), with the copies made since.
async function removeGranted(actor, { pastOnly = false } = {}) {
    const granted = (actor?.itemTypes?.spell ?? []).filter((spell) => spell.flags?.[MODULE_ID]?.[GRANTED] && (!pastOnly || game.time.worldTime >= Number(spell.flags[MODULE_ID][GRANTED].until)));
    if (!granted.length) return;
    const items = [...actor.items].map((item) => ({ id: item.id, sourceId: spellSourceOf(item), createdTime: item._stats?.createdTime ?? 0 }));
    const ids = new Set(granted.map((spell) => spell.id));
    for (const spell of granted) for (const copy of copiesSince(items, spell.flags[MODULE_ID][GRANTED].sourceId, spell.flags[MODULE_ID][GRANTED].since)) ids.add(copy.id);
    await actor.deleteEmbeddedDocuments("Item", [...ids]);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")).map((user) => user.id), content: `<p><strong>${granted[0].flags[MODULE_ID][GRANTED].from}</strong>: ${granted.map((spell) => spell.name).join(", ")} gone from ${actor.name}'s mind and pages, with ${ids.size - granted.length} cop${ids.size - granted.length === 1 ? "y" : "ies"}.</p>` });
}

export function setUpGrantedSpells() {
    Hooks.on("pf2e.restForTheNight", (actor) => {
        if (isActiveGM()) removeGranted(actor).catch((error) => console.error(`${MODULE_ID} | granted spell`, error));
    });
    Hooks.on("updateWorldTime", () => {
        if (!isActiveGM()) return;
        for (const actor of game.actors ?? []) if ((actor.itemTypes?.spell ?? []).some((spell) => spell.flags?.[MODULE_ID]?.[GRANTED])) removeGranted(actor, { pastOnly: true }).catch((error) => console.error(`${MODULE_ID} | granted spell`, error));
    });
}
