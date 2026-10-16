// A stand-in for the parts of Foundry and PF2e that scripts/live.js touches, so
// its flow (PF2e's Use → the item card → Apply) runs in Node. Only what the live
// layer calls: hooks, chat messages and their flags, actors with Hit Points,
// conditions and embedded Effects, tokens, the socket, fromUuid. PF2e's own
// Effect items come from its packs.

import path from "node:path";
import { readDocuments } from "../../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry } from "../../../pf2e-resolution-core/src/index.js";
import * as dying from "../../../pf2e-resolution-core/scripts/dying-recovery.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;

const setProperty = (object, key, value) => {
    const parts = key.split(".");
    let at = object;
    for (const part of parts.slice(0, -1)) at = at[part] ??= {};
    at[parts.at(-1)] = value;
};

export function createFakeFoundry() {
    let madeCount = 0;
    const hooks = new Map();
    const documents = new Map();
    const messages = [];
    const sockets = new Map();
    const emitted = [];
    const applied = [];
    const notifications = [];
    const rerolls = [];
    const actionUses = [];
    const nextOutcome = { value: "success" };

    const register = (document) => {
        documents.set(document.uuid, document);
        return document;
    };

    // PF2e's effect items, by their compendium uuid.
    for (const pack of ["equipment-effects", "spell-effects", "other-effects", "feat-effects"]) {
        for (const doc of readDocuments(path.join(PACKS, pack)).filter((entry) => entry.collection === "items")) {
            register({ uuid: `Compendium.pf2e.${pack}.Item.${doc._id}`, name: doc.name, toObject: () => structuredClone(doc) });
        }
    }

    function makeMessage(data) {
        const message = {
            id: `msg${messages.length + 1}`,
            content: data.content ?? "",
            speaker: data.speaker ?? {},
            whisper: data.whisper ?? [],
            flags: structuredClone(data.flags ?? {}),
            rolls: data.rolls ?? [],
            actor: data.actor ?? null,
            token: data.token ?? null,
            updates: [],
            getFlag(scope, key) {
                return this.flags?.[scope]?.[key];
            },
            async update(changes) {
                this.updates.push(changes);
                for (const [key, value] of Object.entries(changes)) {
                    if (key === "content") this.content = value;
                    else setProperty(this, key, structuredClone(value));
                }
                return this;
            }
        };
        messages.push(message);
        return message;
    }

    function makeActor({ id, name, hp = 20, max = 30, conditions = [], undead = false, owners = [], focus = null }) {
        const actor = register({
            uuid: `Actor.${id}`,
            id,
            name,
            type: "character",
            conditions: new Map(conditions.map((slug) => [slug, 1])),
            created: [],
            healed: [],
            system: { attributes: { hp: { value: hp, max, temp: 0, negativeHealing: undead } }, resources: focus ? { focus: { ...focus } } : {} },
            attributes: { hp: { negativeHealing: undead } },
            flags: {},
            updates: [],
            getFlag(scope, key) {
                return this.flags?.[scope]?.[key];
            },
            async setFlag(scope, key, value) {
                this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: structuredClone(value) };
                return this;
            },
            async unsetFlag(scope, key) {
                if (this.flags[scope]) delete this.flags[scope][key];
                return this;
            },
            async update(changes) {
                this.updates.push(changes);
                for (const [key, value] of Object.entries(changes)) setProperty(this, key, structuredClone(value));
                return this;
            },
            get hitPoints() {
                return this.system.attributes.hp;
            },
            isOfType: (...types) => types.includes("creature") || types.includes("character"),
            hasCondition(slug) {
                return this.conditions.has(slug);
            },
            getCondition(slug) {
                return this.conditions.has(slug) ? { value: this.conditions.get(slug) } : null;
            },
            async decreaseCondition(slug, { forceRemove } = {}) {
                if (forceRemove || this.conditions.get(slug) <= 1) this.conditions.delete(slug);
                else this.conditions.set(slug, this.conditions.get(slug) - 1);
            },
            async increaseCondition(slug) {
                this.conditions.set(slug, (this.conditions.get(slug) ?? 0) + 1);
            },
            async applyDamage({ damage, token }) {
                this.healed.push({ damage: typeof damage === "number" ? damage : damage.formula, token: token?.uuid ?? null });
                const hp = this.system.attributes.hp;
                const amount = typeof damage === "number" ? damage : Number(damage.total) || 0;
                hp.value = Math.max(0, Math.min(hp.max, hp.value - amount));
                return this;
            },
            weapons: [],
            async createEmbeddedDocuments(type, data) {
                const made = data.map((entry) => ({ type, ...entry, id: entry.id ?? `made${++madeCount}` }));
                // (An embedded item's update, as Foundry's: dotted keys; not enumerable, so the item still clones.)
                for (const entry of made) {
                    Object.defineProperty(entry, "update", {
                        value: async (changes) => {
                            for (const [key, value] of Object.entries(changes)) setProperty(entry, key, structuredClone(value));
                            return entry;
                        }
                    });
                }
                this.created.push(...made);
                return made;
            },
            async deleteEmbeddedDocuments(type, ids) {
                this.deleted = [...(this.deleted ?? []), ...ids];
                this.created = this.created.filter((entry) => !ids.includes(entry.id));
                return ids;
            },
            // (Conditions as PF2e's condition items; conditionFlags gives one its grantedBy, as PF2e's GrantItem does.)
            conditionFlags: {},
            // (Persistent damage as PF2e's condition items: givePersistent adds one, its rollRecovery a flat check of nextRoll.)
            persistent: [],
            // (PF2e's toggles set: [{ domain, option, itemId, value, suboption }].)
            toggled: [],
            async toggleRollOption(domain, option, itemId = null, value = true, suboption = null) {
                this.toggled.push({ domain, option, itemId, value, suboption });
            },
            get itemTypes() {
                return {
                    weapon: this.weapons,
                    effect: this.created.filter((entry) => entry.type === "effect"),
                    condition: [...[...this.conditions.entries()].map(([slug, value]) => ({ id: `condition-${slug}`, slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), value, flags: this.conditionFlags[slug] ?? {} })), ...this.persistent],
                    affliction: this.created.filter((entry) => entry.type === "affliction"),
                    action: this.created.filter((entry) => entry.type === "action")
                };
            },
            testUserPermission: (user) => user.isGM || owners.includes(user.id),
            getActiveTokens() {
                return this.token ? [this.token] : [];
            }
        });
        const token = { uuid: `Scene.s.Token.${id}`, id: `t-${id}`, name, actor, document: null };
        token.document = { uuid: token.uuid, name, x: 0, y: 0, width: 1, height: 1, elevation: 0, hidden: false, parent: { id: "s" } };
        token.document.object = token;
        register({ ...token.document, uuid: token.uuid, actor, object: token });
        actor.token = token;
        return actor;
    }

    // A consumable on an actor, as PF2e's item (toObject, delete).
    function giveItem(actor, source) {
        const item = register({
            uuid: `${actor.uuid}.Item.${source._id}`,
            id: source._id,
            type: source.type,
            name: source.name,
            img: source.img ?? null,
            system: source.system,
            actor,
            flags: {},
            getFlag(scope, key) {
                return this.flags?.[scope]?.[key];
            },
            async setFlag(scope, key, value) {
                this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: structuredClone(value) };
                return this;
            },
            toObject: () => ({ ...structuredClone(source), _stats: { compendiumSource: `Compendium.pf2e.equipment-srd.Item.${source._id}` } })
        });
        return item;
    }

    const users = new Map([["gm", { id: "gm", isGM: true }], ["player", { id: "player", isGM: false }]]);
    let current = users.get("gm");
    const core = { registry: createRegistry(), dying };
    for (const family of CORE_FAMILIES) core.registry.registerFamily(family);
    const posted = [];
    const ability = { live: {
        applyChange: async (change, state) => {
            applied.push({ change, state });
            return `ability applied ${change.op}`;
        },
        // The ability module's save card (asked for batch 2): recorded.
        postCard: async (options) => {
            posted.push(options);
            return makeMessage({ content: "ability save card", flags: { "pf2e-automatic-ability-resolution": { card: { plan: options.plan } } } });
        }
    } };
    // The spell module's castFromItem (asked for casts): recorded.
    const casts = [];
    const spell = { castFromItem: async (options) => {
        casts.push(options);
        return { message: makeMessage({ content: "cast" }), rank: options.rank ?? 1 };
    } };
    const modules = new Map([["pf2e-resolution-core", { api: core }], ["pf2e-automatic-ability-resolution", { api: ability }], ["pf2e-automatic-resolution", { api: spell }]]);

    const globals = {
        Hooks: {
            on: (name, handler) => hooks.set(name, [...(hooks.get(name) ?? []), handler]),
            once: (name, handler) => hooks.set(name, [...(hooks.get(name) ?? []), handler])
        },
        game: {
            get user() {
                return current;
            },
            users: { get activeGM() {
                return { isSelf: current.isGM };
            }, get: (id) => users.get(id), filter: (test) => [...users.values()].filter(test) },
            messages: { get: (id) => messages.find((message) => message.id === id), get contents() {
                return messages;
            } },
            // PF2e's reroll (game.pf2e.Check.rerollFromMessage): recorded.
            pf2e: {
                Check: { rerollFromMessage: async (message, options) => {
                    rerolls.push({ message, options });
                } },
                // PF2e's Modifier and its actions (get(slug).use): recorded, the outcome the test sets.
                Modifier: class {
                    constructor(data) {
                        Object.assign(this, data);
                    }
                },
                actions: { get: (slug) => ({ use: async (options) => {
                    actionUses.push({ slug, options });
                    return [{ outcome: nextOutcome.value }];
                } }) }
            },
            modules,
            socket: { on: (name, handler) => sockets.set(name, handler), emit: (name, data) => emitted.push({ name, data }) },
            time: { worldTime: 1000 },
            combat: null
        },
        ChatMessage: { create: async (data) => makeMessage(data), getSpeaker: ({ actor } = {}) => ({ actor: actor?.id ?? null }) },
        fromUuid: async (uuid) => documents.get(uuid) ?? null,
        fromUuidSync: (uuid) => documents.get(uuid) ?? null,
        canvas: { ready: true, scene: { id: "s" }, grid: { size: 100 }, dimensions: { distance: 5 }, tokens: { placeables: [] } },
        Roll: class {
            constructor(formula) {
                this.formula = formula;
            }
            // (A d20 check comes up a natural 10; anything else totals 7.)
            async evaluate() {
                const check = /^1d20\s*\+\s*(-?\d+)\s*$/.exec(this.formula);
                this.dice = check ? [{ total: 10 }] : [];
                this.total = check ? 10 + Number(check[1]) : 7;
                return this;
            }
        },
        // PF2e's DamageRoll, as CONFIG.Dice.rolls lists it: its formula kept, its total the formula's leading number.
        CONFIG: { Dice: { rolls: [class DamageRoll {
            constructor(formula) {
                this.formula = formula;
            }
            async evaluate() {
                this.total = Number(/\d+/.exec(this.formula)?.[0] ?? 0);
                return this;
            }
        }] } },
        ui: { notifications: { error: (text) => notifications.push(text), warn: (text) => notifications.push(text) } },
        document: { querySelectorAll: () => [] }
    };
    Object.assign(globalThis, globals);

    // PF2e's persistent damage condition on an actor: { damageType, dc, nextRoll } — its rollRecovery rolls nextRoll against
    // its DC and removes it on a success (PF2e's decreaseCondition of "persistent-damage-<type>").
    function givePersistent(actor, { damageType, dc = 15, nextRoll = 10, formula = "1d6" }) {
        const condition = {
            id: `persistent-${damageType}-${++madeCount}`,
            slug: "persistent-damage",
            name: `Persistent Damage (${formula} ${damageType})`,
            system: { persistent: { damageType, dc, formula } },
            nextRoll,
            rolled: [],
            async update(changes) {
                for (const [key, value] of Object.entries(changes)) setProperty(condition, key, structuredClone(value));
                return condition;
            },
            async rollRecovery() {
                condition.rolled.push(condition.system.persistent.dc);
                if (condition.nextRoll >= condition.system.persistent.dc) actor.persistent = actor.persistent.filter((entry) => entry !== condition);
            }
        };
        actor.persistent.push(condition);
        return condition;
    }

    return {
        givePersistent,
        hooks,
        messages,
        posted,
        ability,
        casts,
        spell,
        emitted,
        applied,
        notifications,
        rerolls,
        actionUses,
        nextOutcome,
        documents,
        makeActor,
        giveItem,
        makeMessage,
        call: async (name, ...args) => {
            for (const handler of hooks.get(name) ?? []) await handler(...args);
        },
        socket: (name) => sockets.get(name),
        actAs: (id) => {
            current = users.get(id);
        },
        place: (actor, x, y) => {
            actor.token.document.x = x;
            actor.token.document.y = y;
            if (!globals.canvas.tokens.placeables.includes(actor.token)) globals.canvas.tokens.placeables.push(actor.token);
        },
        forget: (uuid) => documents.delete(uuid)
    };
}

// One stand-in per test process (the suites run with --test-isolation=none, and Foundry's globals are global), with
// the live layer set up on it once.
let shared = null;
export async function fakeFoundry() {
    if (shared) return shared;
    shared = createFakeFoundry();
    const [{ setUpLivePlay }, { compileItem, spellEffectIndex, spellIndex }, { compileActivations }] = await Promise.all([import("../../scripts/live.js"), import("../../src/compiler/index.js"), import("../../src/compiler/permanent.js")]);
    const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
    // (PF2e's spells by name, as main.js indexes its spells pack: a cast in words.)
    const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
    // (The ability module's compiled basic actions, as main.js passes them: the rows an item's action applies.)
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    setUpLivePlay({ compileItem: (data) => compileItem(data, { spellEffects, spells, basicActions }), compileActivations: (data) => compileActivations(data, { spellEffects, spells, basicActions }) });
    return shared;
}

// Waits until the hooks' unawaited work settles (the live layer's handlers return nothing).
export const settle = async (times = 30) => {
    for (let index = 0; index < times; index++) await new Promise((resolve) => setImmediate(resolve));
};
