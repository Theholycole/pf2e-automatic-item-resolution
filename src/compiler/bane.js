// Ammunition made against one type of creature, the type chosen when it's crafted: Bane Ammunition's capsule "tailored to a particular type of
// creature—aberration, animal, beast, dragon, fey, giant, ooze, or both fungus and plant", whose activated hit on a target "that has a trait
// matching the selected type" adds persistent poison. The ways card's pick of that type (src/compiler/ways.js's builtin, scripts/ways.js),
// each way the ammunition's next Strike (src/compiler/strikes.js) with that damage only against a creature with the trait — PF2e's
// DamageDice with a target-trait predicate on the readied Strike's Effect. Pure.

import { compileStrike } from "./strikes.js";

const TAILORED = /\btailored to a particular type of creature\s*[—–-]\s*([^.]+?)\.\s*Each type requires a different formula\./i;
const MATCHING = /\b(When activated [\w ]+? hits a target) that has a trait matching the selected type(, it takes\b)/i;

// "aberration, animal, …, ooze, or both fungus and plant" → [{ name, traits }].
function typesOf(list) {
    return String(list).split(/,\s*(?:or\s+)?|\s+or\s+/).map((part) => part.trim()).filter(Boolean).map((part) => {
        const both = /^both (\w+) and (\w+)$/i.exec(part);
        const traits = both ? [both[1].toLowerCase(), both[2].toLowerCase()] : [part.toLowerCase()];
        return { name: traits.map((trait) => `${trait.charAt(0).toUpperCase()}${trait.slice(1)}`).join(" and "), traits };
    });
}

// The activation's html, its base, the item (its block as its description) → the ways plan, or null.
export function baneWaysPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const tailored = TAILORED.exec(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!tailored || !MATCHING.test(text)) return null;
    const plain = text.replace(MATCHING, "$1$2");
    const ways = [];
    for (const type of typesOf(tailored[1])) {
        const plan = compileStrike({ ...item, system: { ...(item?.system ?? {}), description: { value: plain } } }, base, options);
        if (!plan?.strike?.damage?.length) return null;
        const predicate = type.traits.length > 1 ? [{ or: type.traits.map((trait) => `target:trait:${trait}`) }] : [`target:trait:${type.traits[0]}`];
        ways.push({ name: type.name, html: plain, plan: { ...plan, strike: { ...plan.strike, damage: plan.strike.damage.map((entry) => ({ ...entry, predicate })) }, notes: [...(plan.notes ?? []), `Only against a creature with the ${type.traits.join(" or ")} trait.`] } });
    }
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways };
}

// An elixir made for one element, its ingredient chosen when it's distilled: Warding Element Draught's "+1 item bonus to AC and saving throws
// against alchemical effects, spells, and magic effects with the listed elemental trait for 10 minutes", its ingredients' elements listed
// after. The ways card's pick of the element, each way its drinker's bonus against effects with that trait (PF2e's item:trait roll option).
const ELEMENTS = ["air", "earth", "fire", "metal", "water", "wood"];
const WARDING = /\bchosen when the elixir is distilled, and grants an? \+(\d+) (item|status|circumstance) bonus to AC and saving throws against [^.]*?\bwith the listed elemental trait for (\d+) (minutes?|hours?)\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
export function elementWaysPlan(item, base) {
    const text = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const warding = WARDING.exec(text);
    if (!warding) return null;
    const listed = text.slice(warding.index + warding[0].length);
    const elements = ELEMENTS.filter((element) => new RegExp(String.raw`\b${element}\b`, "i").test(listed));
    if (elements.length < 2) return null;
    const duration = { mode: "fixed", value: Number(warding[3]), unit: /^hour/i.test(warding[4]) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const ways = elements.map((element) => {
        const predicate = [`item:trait:${element}`];
        const modifiers = ["ac", "saving-throw"].map((selector) => ({ selector, type: warding[2].toLowerCase(), value: Number(warding[1]), predicate, duration }));
        const plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers } } }, item: { category: item?.system?.category ?? null, level: Number(item?.system?.level?.value) || 0, recipient: "drinker", type: item?.type } };
        return { name: `${element.charAt(0).toUpperCase()}${element.slice(1)}`, html: `<p>+${warding[1]} ${warding[2].toLowerCase()} bonus to AC and saves against effects with the ${element} trait for ${warding[3]} ${warding[4]}.</p>`, plan };
    });
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, once: true };
}

// A tattoo of one animal, chosen when it's received: Tooth and Claw Tattoo's "choose the animal from among the following: ape, bear, bull, …"
// for its activation's "You gain an unarmed attack matching the tattoo for 1 minute. It has the same damage as your best unarmed attack and
// has the same traits. Its damage type is bludgeoning for a fist or frog's jaws; piercing for an antler, fangs, horns, or most jaws; or
// slashing for claws". The ways card's pick of the animal, each way that attack (plan.item.attacks, copyBest: live play copies its user's
// best unarmed attack's die and traits into PF2e's Strike rule).
const ANIMAL_ATTACKS = { ape: ["fist", "bludgeoning"], bear: ["claw", "slashing"], bull: ["horn", "piercing"], canine: ["jaws", "piercing"], cat: ["claw", "slashing"], deer: ["antler", "piercing"], frog: ["jaws", "bludgeoning"], shark: ["jaws", "piercing"], snake: ["fangs", "piercing"] };
const ANIMALS = /\bchoose the animal from among the following: ([^.]+)\./i;
const MATCHING_ATTACK = /\bYou gain an unarmed attack matching the tattoo for (\d+) (minutes?|rounds?|hours?)\.\s*It has the same damage as your best unarmed attack and has the same traits\./i;
export function tattooWaysPlan(html, base, item) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const whole = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const attack = MATCHING_ATTACK.exec(text);
    const animals = ANIMALS.exec(whole);
    if (!attack || !animals) return null;
    const duration = { mode: "fixed", value: Number(attack[1]), unit: /^hour/i.test(attack[2]) ? "hours" : /^round/i.test(attack[2]) ? "rounds" : "minutes", expiry: "turn-start" };
    const ways = animals[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((name) => name.trim().toLowerCase()).filter((name) => ANIMAL_ATTACKS[name]).map((animal) => {
        const [name, type] = ANIMAL_ATTACKS[animal];
        const plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, item: { type: item?.type, level: Number(item?.system?.level?.value) || 0, recipient: "user", attacks: [{ name, dice: null, die: null, type, traits: ["unarmed"], copyBest: true, duration }] } };
        return { name: `${animal.charAt(0).toUpperCase()}${animal.slice(1)}`, html: `<p>A ${name} unarmed attack (${type}), with the damage and traits of your best unarmed attack, for ${attack[1]} ${attack[2]}.</p>`, plan };
    });
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, once: true };
}

// Armor recalling a victory, the creature's trait giving the resistance: Victory Plate's "for 1 minute, you gain resistance 5 to a damage type
// based on the creature's trait (…)", its list "Aberration or Fey — mental, Celestial — good, Construct — poison, Dragon or Elemental — one
// energy type that matches one of the dragon's or elemental's traits, Fiend — evil, Ooze — precision, and the resistance is 10, Undead — void".
// The ways card's pick of the trait (each energy type its own way for a dragon or an elemental), each way the item card's resistance
// (plan.item.resist); good and evil are PF2e's holy and unholy.
const RECALLED = /\bfor (\d+) (minutes?|rounds?|hours?), you gain resistance (\d+) to a damage type based on the creature's trait\b/i;
const VICTORY_ROW = /<li>\s*<strong>([^<]+)<\/strong>\s*([^<]+?)\s*<\/li>/gi;
const ENERGY = ["acid", "cold", "electricity", "fire", "sonic"];
const VICTORY_TYPES = { good: "holy", evil: "unholy", mental: "mental", poison: "poison", precision: "precision", void: "void", vitality: "vitality" };
export function victoryWaysPlan(html, base, item) {
    const text = String(html ?? "");
    const recalled = RECALLED.exec(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!recalled) return null;
    const unit = /^hour/i.test(recalled[2]) ? "hours" : /^round/i.test(recalled[2]) ? "rounds" : "minutes";
    const duration = { mode: "fixed", value: Number(recalled[1]), unit, expiry: "turn-start", anchor: "effect-start" };
    const way = (name, type, value) => ({
        name,
        html: `<p>Resistance ${value} to ${type} damage for ${recalled[1]} ${recalled[2]}.</p>`,
        plan: { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, item: { type: item?.type, level: Number(item?.system?.level?.value) || 0, recipient: "user", resist: [{ type, value, duration }] } }
    });
    const ways = [];
    for (const [, names, words] of text.matchAll(VICTORY_ROW)) {
        const label = names.trim();
        const value = Number(/\bthe resistance is (\d+)\b/i.exec(words)?.[1] ?? recalled[3]);
        if (/\bone energy type\b/i.test(words)) {
            for (const type of ENERGY) ways.push(way(`${label}: ${type}`, type, value));
            continue;
        }
        const type = VICTORY_TYPES[/^\s*(\w+)/.exec(words)?.[1]?.toLowerCase()];
        if (!type) return null;
        ways.push(way(`${label}: ${type}`, type, value));
    }
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, once: true };
}

// A talisman made from a dragon, its damage type the dragon's: Dragontooth Trophy's "On the triggering Strike and until the end of your next
// turn, the damage type of the affixed weapon changes to the type matching the dragon the claw came from", Dragonclaw Scutcheon's "you and
// all of your carried, wielded, or worn items gain immunity to all damage of that type until the end of your next turn". The ways card's
// pick of the dragon's damage type: each way the triggering Strike's damage of that type (src/compiler/strikes.js, its later Strikes a
// note), or that immunity (the item card's, PF2e's Immunity rule).
const DRAGON_DAMAGE = ["acid", "cold", "electricity", "fire", "poison", "sonic", "force", "mental", "spirit", "void", "vitality"];
const TROPHY = /\bOn the triggering Strike and until the end of your next turn, the damage type of the affixed weapon changes to the type matching the dragon the claw came from\./i;
const SCUTCHEON = /\bWhen you Activate the scutcheon, you and all of your carried, wielded, or worn items gain immunity to all damage of that type until the end of your next turn\./i;
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
export function dragonWaysPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const ways = [];
    if (TROPHY.test(text)) {
        for (const type of DRAGON_DAMAGE) {
            const plain = text.replace(TROPHY, `All damage from this Strike is ${type} damage.`);
            const plan = compileStrike({ ...item, system: { ...(item?.system ?? {}), description: { value: plain } } }, base, options);
            if (plan?.strike?.alteration !== type) return null;
            ways.push({ name: capital(type), html: `<p>The triggering Strike's damage is ${type}.</p>`, plan: { ...plan, notes: [...(plan.notes ?? []), `Until the end of your next turn, the affixed weapon's other Strikes deal ${type} damage too (by hand).`], partial: true } });
        }
    } else if (SCUTCHEON.test(text)) {
        const duration = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
        for (const type of DRAGON_DAMAGE) {
            const plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, item: { type: item?.type, level: Number(item?.system?.level?.value) || 0, recipient: "user", resist: [{ type, value: null, immune: true, duration }] } };
            ways.push({ name: capital(type), html: `<p>Immunity to ${type} damage until the end of your next turn.</p>`, plan });
        }
    }
    if (ways.length < 2) return null;
    // (The three talismans of one dragon together: their Dragon Breath — a one-off, its words a line of the card.)
    const set = /\bIf you have a dragonclaw scutcheon, dragonscale cameo, and dragontooth trophy\b[^.]*\.[^.]*\./i.exec(text.replace(/<[^>]+>/g, " ").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\(@Check\[(\w+)\|dc:(\d+)\|basic\]\)/g, (all, save, dc) => `(DC ${dc} basic ${save.charAt(0).toUpperCase()}${save.slice(1)} save)`));
    // (A one-off since 2026-10-27, src/compiler/one-offs.js: the set's words a line of each way's card, which shows its plan's notes.)
    const lined = set ? ways.map((way) => ({ ...way, plan: { ...way.plan, notes: [...(way.plan.notes ?? []), set[0].trim()] } })) : ways;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways: lined, once: true };
}

// A shot whose rider depends on the gun's modular configuration: Hydrocannon's Tinker Shot, "A successful attack has an additional effect
// depending on which modular configuration the hydrocannon is currently in", then Bludgeoning's push, Piercing's Speed penalty, Slashing's
// bleed. The ways card's pick of the configuration (the one the gun is in), each way the readied Strike with that rider on a hit.
const MODULAR = /\s*A successful attack has an additional effect depending on which modular configuration the (?:<em>)?[\w' -]+?(?:<\/em>)? is currently in\.\s*/i;
const CONFIGURATION = /<li>\s*(?:<p>)?\s*<strong>(Bludgeoning|Piercing|Slashing)<\/strong>\s*([\s\S]*?)(?:<\/p>)?\s*<\/li>/gi;
function onHit(words) {
    const said = words.trim();
    // ("The target is pushed 5 feet away from you; this forced movement is increased to 10 feet on a critical hit.")
    const push = /^The target is pushed (\d+) feet away from you; this forced movement is increased to (\d+) feet on a critical hit\.$/i.exec(said);
    if (push) return `On a hit, the target is pushed ${push[1]} feet away. On a critical hit, the target is pushed ${push[2]} feet away.`;
    // ("The target takes 1d6 bleed damage": the Strike's extra persistent bleed, which PF2e deals on a hit.)
    const bleed = /^The target takes @Damage\[(\d+d\d+)\[bleed\]\] damage\.$/i.exec(said);
    if (bleed) return `This Strike deals an additional ${bleed[1]} persistent bleed damage.`;
    return `On a hit, ${said.charAt(0).toLowerCase()}${said.slice(1)}`;
}
export function modularWaysPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const modular = MODULAR.exec(text);
    if (!modular) return null;
    const before = text.slice(0, modular.index);
    const ways = [];
    for (const [, name, words] of text.matchAll(CONFIGURATION)) {
        const plain = `${before}</p><p>${onHit(words)}</p>`;
        const plan = compileStrike({ ...item, system: { ...(item?.system ?? {}), description: { value: plain } } }, base, options);
        if (!plan?.strike) return null;
        ways.push({ name, html: `<p>${onHit(words)}</p>`, plan });
    }
    if (ways.length < 2) return null;
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways };
}
