// Live play for the sphere card (2026-10-27, src/compiler/sphere.js, src/live/sphere-card.js: Sphere of Annihilation). Its user's check to
// take control of the sphere — PF2e's own skill check of theirs, against the sphere's DC or its controller's Will DC — then a Sustain each
// round; its control an Effect on them, a round long and renewed by each Sustain, that another's success takes away. A failure moves the
// sphere's token toward them square by square; a success at Sustaining has them click where it goes. Every creature the sphere touches on its
// way, or that moves into it (a Region on the sphere's token, its script calling api.sphereTouched), is destroyed: no Hit Points, PF2e's dead
// status, flagged so the module's revivals refuse it (scripts/revive.js). The sphere is the token on the scene named Sphere of Annihilation
// (or whose actor holds the item), not its user's. The card's buttons are its own (this file's hook), sent to the active GM's client.

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { createSphereCard, degreeName, degreeWords, sphereCardHTML, sphereDC, sphereRow, stepToward, touchedOn } from "../src/live/sphere-card.js";
import { squaresAlong } from "../src/live/teleport-card.js";
import { FLAG, MODULE_ID, SOCKET, entryOf, isActiveGM, mayApply, spaceOf, stateOf } from "./foundry.js";
import { pickTeleportSpace } from "./teleport.js";

const CONTROL = "sphereControl";
const ANNIHILATED = "annihilated";
const SPHERE_SLUG = "sphere-of-annihilation";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const gridOf = (scene) => ({ size: scene?.grid?.size ?? canvas.grid.size, gridFeet: scene?.grid?.distance ?? canvas.dimensions?.distance ?? 5 });
const sizeOf = (token, grid) => ({ w: Math.max(1, Number(token.width) || 1) * grid.size, h: Math.max(1, Number(token.height) || 1) * grid.size });
const spaceIn = (token, grid) => ({ x: Number(token.x), y: Number(token.y), ...sizeOf(token, grid), elevation: Number(token.elevation ?? 0) });

// Whether a token is a sphere of annihilation: by its name, or the item its actor holds.
const isSphereToken = (token) => /\bsphere of annihilation\b/i.test(String(token?.name ?? "")) || (token?.actor?.items?.contents ?? [...(token?.actor?.items ?? [])]).some((item) => item.system?.slug === SPHERE_SLUG);

// The sphere nearest its user on their scene (not their own token), or null.
function findSphere(userToken) {
    const scene = userToken?.parent;
    if (!scene) return null;
    const grid = gridOf(scene);
    const from = spaceIn(userToken, grid);
    const found = scene.tokens.filter((token) => token.id !== userToken.id && isSphereToken(token));
    return found.sort((a, b) => distanceFeet(from, spaceIn(a, grid), grid) - distanceFeet(from, spaceIn(b, grid), grid))[0] ?? null;
}

// The control Effects held over that sphere, on any actor on its scene: [{ actor, effect }].
function controlsOf(sphere) {
    const out = [];
    for (const token of sphere.parent?.tokens ?? []) {
        const actor = token.actor;
        for (const effect of actor?.itemTypes?.effect ?? []) if (effect.getFlag?.(MODULE_ID, CONTROL)?.sphere === sphere.uuid && !out.some((one) => one.effect === effect)) out.push({ actor, effect });
    }
    return out;
}

// Whether its user holds the talisman and casts arcane or occult spells.
function holdsTalisman(actor, talisman) {
    if (!talisman) return false;
    const held = (actor?.itemTypes?.equipment ?? []).some((item) => item.system?.slug === talisman.slug && item.system?.equipped?.carryType === "held");
    const casts = (actor?.itemTypes?.spellcastingEntry ?? []).some((entry) => (talisman.traditions ?? []).includes(entry.system?.tradition?.value ?? entry.tradition));
    return held && casts;
}

export async function postSphereCard({ message, plan, used, actor, token }) {
    const own = token?.document ?? token ?? null;
    const sphere = own ? findSphere(own) : null;
    if (sphere) await ensureContact(sphere).catch((error) => console.error(`${MODULE_ID} | sphere contact`, error));
    const state = createSphereCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor), sphere: sphere ? { tokenUuid: sphere.uuid, name: sphere.name } : null });
    return ChatMessage.create({ content: sphereCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// A creature the sphere touched: destroyed — no Hit Points, PF2e's dead status — and flagged. → the card's line.
export async function annihilate(token, plan) {
    const actor = token?.actor;
    if (!actor || actor.getFlag?.(MODULE_ID, ANNIHILATED)) return null;
    await actor.update({ "system.attributes.hp.value": 0, [`flags.${MODULE_ID}.${ANNIHILATED}`]: { by: plan?.source?.name ?? "Sphere of Annihilation", deity: Boolean(plan?.sphere?.deity ?? true), at: game.time.worldTime } });
    for (const slug of ["dying", "unconscious", "wounded"]) if (actor.hasCondition?.(slug)) await actor.decreaseCondition?.(slug, { forceRemove: true }).catch(() => null);
    if (!actor.statuses?.has?.("dead")) await actor.toggleStatusEffect?.("dead", { active: true, overlay: true }).catch(() => null);
    return `${token.name} touches the sphere and is destroyed utterly${plan?.sphere?.deity === false ? "" : ": only a deity's direct intervention can bring it back"}.`;
}

// The sphere's contact: a Region on its token's space, attached to it, its script calling api.sphereTouched as a token enters (once).
async function ensureContact(sphere) {
    const scene = sphere.parent;
    if (!scene || (scene.regions?.contents ?? [...(scene.regions ?? [])]).some((region) => region.getFlag?.(MODULE_ID, "sphere") === sphere.uuid)) return;
    const source = `if (game.users.activeGM?.id !== game.user.id) return;\nawait game.modules.get(${JSON.stringify(MODULE_ID)})?.api?.sphereTouched?.(region, event);`;
    await scene.createEmbeddedDocuments("Region", [{
        name: `${sphere.name}: contact`,
        color: "#000000",
        shapes: [{ type: "emanation", base: { type: "token", x: Number(sphere.x), y: Number(sphere.y), width: Number(sphere.width) || 1, height: Number(sphere.height) || 1, shape: sphere.shape ?? 0 }, radius: 0, gridBased: true }],
        attachment: { token: sphere.id },
        behaviors: [{ name: `${sphere.name}: destroys what touches it`, type: "executeScript", system: { events: ["tokenEnter"], source } }],
        visibility: 0,
        highlightMode: "coverage",
        displayMeasurements: false,
        flags: { [MODULE_ID]: { sphere: sphere.uuid } }
    }]);
}

// A token entering the sphere's Region (its script, on the active GM's client): destroyed, said in the chat.
export async function sphereTouched(region, event) {
    const token = event?.data?.token ?? null;
    const sphereUuid = region?.getFlag?.(MODULE_ID, "sphere");
    if (!token || !sphereUuid || token.uuid === sphereUuid || !token.actor?.isOfType?.("creature")) return null;
    const line = await annihilate(token, { source: { name: "Sphere of Annihilation" }, sphere: { deity: true } });
    if (line) await ChatMessage.create({ content: `<p><strong>Sphere of Annihilation</strong>: ${escape(line)}</p>`, speaker: ChatMessage.getSpeaker({ token }) });
    return line;
}

// The sphere moved to end, through the squares on its way (spaces [{ x, y, w, h }], its own space at the end among them): the creatures they
// touch destroyed (not the sphere itself), the token moved. → the card's lines.
async function moveSphere(sphere, end, spaces, plan) {
    const scene = sphere.parent;
    const grid = gridOf(scene);
    const others = scene.tokens.filter((token) => token.id !== sphere.id && !token.hidden && token.actor?.isOfType?.("creature") && !token.actor.getFlag?.(MODULE_ID, ANNIHILATED)).map((token) => ({ id: token.id, ...spaceIn(token, grid) }));
    const touched = touchedOn(spaces, others);
    await sphere.update({ x: end.x, y: end.y }, { [MODULE_ID]: { sphereMoved: true } });
    const lines = [];
    for (const id of touched) {
        const line = await annihilate(scene.tokens.get(id), plan);
        if (line) lines.push(line);
    }
    return lines;
}

// A button pressed (on the active GM's client): { action: "roll" | "move", skill, destination } → the card updated.
export async function applySphere(message, { action, skill = 0, destination = null } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "sphere" || state.status !== "open") return null;
    const plan = state.plan;
    const sphereRule = plan.sphere;
    const userToken = state.user.tokenUuid ? await fromUuid(state.user.tokenUuid).catch(() => null) : null;
    const actor = userToken?.actor ?? (await fromUuid(state.user.actorUuid).catch(() => null));
    if (!userToken || !actor) throw new Error(`${state.user.name}'s token isn't on a scene.`);
    const sphere = (state.sphere?.tokenUuid ? await fromUuid(state.sphere.tokenUuid).catch(() => null) : null) ?? findSphere(userToken);
    if (!sphere || sphere.parent?.id !== userToken.parent?.id) throw new Error("No sphere of annihilation on this scene: put its token on the map (named Sphere of Annihilation).");
    await ensureContact(sphere);
    const grid = gridOf(sphere.parent);
    const far = distanceFeet(spaceIn(userToken, grid), spaceIn(sphere, grid), grid);
    const lines = [];
    const found = { tokenUuid: sphere.uuid, name: sphere.name };
    const save = (next) => message.update({ content: sphereCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
    const own = controlsOf(sphere).filter((one) => one.actor === actor);
    if (action === "move") {
        if (state.phase !== "move") throw new Error("There's no move to direct now.");
        if (!destination) throw new Error("Pick the space first.");
        const at = { x: Number(destination.x), y: Number(destination.y) };
        const size = sizeOf(sphere, grid);
        const away = distanceFeet(spaceIn(sphere, grid), { ...at, ...size, elevation: Number(sphere.elevation ?? 0) }, grid);
        if (away > state.allowed) throw new Error(`That space is ${away} feet from the sphere (it moves up to ${state.allowed}).`);
        const rect = canvas.dimensions?.sceneRect;
        if (rect && (at.x < rect.x || at.y < rect.y || at.x + size.w > rect.x + rect.width || at.y + size.h > rect.y + rect.height)) throw new Error("That space is off the map.");
        // (The squares it crosses on the straight line, and its space where it stops.)
        const spaces = [...squaresAlong({ x: Number(sphere.x), y: Number(sphere.y) }, at, size, grid.size).map((cell) => ({ x: cell.x, y: cell.y, w: grid.size, h: grid.size })), { ...at, ...size }];
        lines.push(away ? `${state.user.name} directs the sphere ${away} feet.` : `${state.user.name} leaves the sphere where it is.`);
        if (away) lines.push(...(await moveSphere(sphere, at, spaces, plan)));
        return save({ ...state, sphere: found, phase: "sustain", allowed: undefined, results: [...state.results, ...lines].slice(-8) });
    }
    if (state.phase === "move") throw new Error("Pick where the sphere goes first.");
    const phase = state.phase;
    // (Its requirement to take control, and its control kept within that distance: out of it, lost — no roll.)
    if (phase === "take" && far > sphereRule.within) throw new Error(`${state.user.name} is ${far} feet from the sphere (it must be within ${sphereRule.within}).`);
    if (phase === "sustain" && (!own.length || far > sphereRule.keep)) {
        if (own.length) await actor.deleteEmbeddedDocuments("Item", own.map((one) => one.effect.id));
        lines.push(own.length ? `${state.user.name} is ${far} feet from the sphere (more than ${sphereRule.keep}): control is lost.` : `${state.user.name} no longer controls the sphere: nothing to Sustain.`);
        return save({ ...state, sphere: found, status: "applied", results: [...state.results, ...lines].slice(-8) });
    }
    const skills = phase === "take" ? sphereRule.skills : sphereRule.sustain?.skills ?? sphereRule.skills;
    const slug = skills[Number(skill)] ?? skills[0];
    const statistic = actor.skills?.[slug] ?? actor.getStatistic?.(slug);
    if (!statistic) throw new Error(`${state.user.name} has no ${slug}.`);
    const others = controlsOf(sphere).filter((one) => one.actor !== actor);
    const { dc, words } = sphereDC(sphereRule, { phase, controllers: others.map((one) => Number(one.actor.saves?.will?.dc?.value)), talisman: holdsTalisman(actor, sphereRule.talisman) });
    const roll = await statistic.roll({ dc: { value: dc }, skipDialog: true, extraRollOptions: ["action:control-sphere-of-annihilation"] });
    const degree = degreeName(roll?.degreeOfSuccess);
    if (!degree) throw new Error("The check wasn't rolled.");
    lines.push(`${state.user.name}: ${degreeWords(degree)} (${slug}, DC ${dc}${words.length ? `: ${words.join(", ")}` : ""}).`);
    const row = sphereRow(sphereRule, phase, degree);
    const effectSource = () => ({
        name: `${state.item.name}: in control`,
        type: "effect",
        img: state.item.img ?? "icons/svg/aura.svg",
        flags: { [MODULE_ID]: { [CONTROL]: { sphere: sphere.uuid } } },
        system: {
            description: { value: `<p>${escape(state.user.name)} controls ${escape(sphere.name)} while within ${sphereRule.keep} feet of it and Sustaining the activation each round (its card's Sustain); it ends at the end of the next turn without one.</p>` },
            duration: { value: 1, unit: "rounds", expiry: "turn-end", sustained: false },
            start: { value: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null },
            tokenIcon: { show: true },
            rules: []
        }
    });
    if (row.control) {
        // (Taken from whoever held it.)
        for (const one of others) {
            await one.actor.deleteEmbeddedDocuments("Item", [one.effect.id]);
            lines.push(`${one.actor.name} loses control of the sphere.`);
        }
        if (own.length) await actor.deleteEmbeddedDocuments("Item", own.map((one) => one.effect.id));
        await actor.createEmbeddedDocuments("Item", [effectSource()]);
        lines.push(`${state.user.name} takes control of the sphere.`);
        return save({ ...state, sphere: found, skill: Number(skill) || 0, phase: "sustain", results: [...state.results, ...lines].slice(-8) });
    }
    if (row.move) {
        // (Its control renewed for another round.)
        if (own.length) await actor.deleteEmbeddedDocuments("Item", own.map((one) => one.effect.id));
        await actor.createEmbeddedDocuments("Item", [effectSource()]);
        lines.push(`It moves up to ${row.move} feet as ${state.user.name} directs (Pick).`);
        return save({ ...state, sphere: found, skill: Number(skill) || 0, phase: "move", allowed: row.move, results: [...state.results, ...lines].slice(-8) });
    }
    if (row.lose && own.length) {
        await actor.deleteEmbeddedDocuments("Item", own.map((one) => one.effect.id));
        lines.push(`${state.user.name} loses control of the sphere.`);
    }
    if (row.closer) {
        const step = stepToward(spaceIn(sphere, grid), spaceIn(userToken, grid), row.closer, grid);
        lines.push(step.path.length ? `The sphere moves ${step.spent} feet toward ${state.user.name}.` : `The sphere is already against ${state.user.name}.`);
        if (step.path.length) lines.push(...(await moveSphere(sphere, step, step.path.map((place) => ({ ...place, ...sizeOf(sphere, grid) })), plan)));
    }
    return save({ ...state, sphere: found, skill: Number(skill) || 0, status: "applied", results: [...state.results, ...lines].slice(-8) });
}

// The card's buttons, on the presser's client: Roll (its check, the skill picked) and Pick (the space a success directs it to), sent to the
// active GM's client.
function wireSphere(message, html) {
    const state = stateOf(message);
    if (state?.kind !== "sphere") return;
    const root = html?.querySelector?.(".pf2e-air-card");
    if (!root || root.dataset.airWired) return;
    root.dataset.airWired = "true";
    if (state.status !== "open") return;
    if (!mayApply(state)) {
        root.querySelector("footer.aar-controls")?.remove();
        return;
    }
    const button = root.querySelector("[data-air-sphere]");
    button?.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        try {
            const action = button.dataset.airSphere;
            const choices = { action, skill: Number(root.querySelector("[data-air-field='skill']")?.value ?? state.skill ?? 0) };
            if (action === "move") {
                if (!state.sphere?.tokenUuid) throw new Error("The sphere's token isn't known.");
                const destination = await pickTeleportSpace({ item: state.item, user: { name: "the sphere" }, plan: { teleport: { place: true } } }, { moved: state.sphere.tokenUuid });
                if (!destination) {
                    button.disabled = false;
                    return;
                }
                choices.destination = destination;
            }
            if (isActiveGM()) await applySphere(message, choices);
            else if (!game.users.activeGM) throw new Error("No GM is connected.");
            else game.socket.emit(SOCKET, { action: "sphere", messageId: message.id, step: choices.action, skill: choices.skill, destination: choices.destination ?? null, userId: game.user.id });
        } catch (error) {
            ui.notifications.error(`${state.item.name}: ${error.message}`);
            console.error(`${MODULE_ID} |`, error);
            button.disabled = false;
        }
    });
}

export function setUpSphere() {
    Hooks.on("renderChatMessageHTML", (message, html) => wireSphere(message, html));
    for (const element of document.querySelectorAll("[data-message-id]")) {
        const message = game.messages.get(element.dataset.messageId);
        if (message) wireSphere(message, element);
    }
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "sphere" || !isActiveGM()) return;
        const message = game.messages.get(data.messageId);
        const state = stateOf(message);
        const sender = game.users.get(data.userId);
        if (!state || state.kind !== "sphere" || !sender) return;
        const owner = sender.isGM || Boolean(fromUuidSync(state.user.actorUuid)?.testUserPermission?.(sender, "OWNER"));
        if (!owner) return;
        const choices = { action: data.step === "move" ? "move" : "roll", skill: Number(data.skill) || 0, destination: data.destination && Number.isFinite(Number(data.destination.x)) && Number.isFinite(Number(data.destination.y)) ? { x: Number(data.destination.x), y: Number(data.destination.y) } : null };
        applySphere(message, choices).catch((error) => console.error(`${MODULE_ID} | sphere`, error));
    });
    // (A sphere's token placed: its contact Region at once, on the active GM's client.)
    Hooks.on("createToken", (token) => {
        if (isActiveGM() && isSphereToken(token)) ensureContact(token).catch((error) => console.error(`${MODULE_ID} | sphere contact`, error));
    });
}
