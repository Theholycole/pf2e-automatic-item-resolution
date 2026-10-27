// An item that moves or changes another item of its user's, or itself (2026-10-25, docs/needs.md "Objects and the item itself"): the objects
// card (builtin "objects", src/live/objects-card.js, scripts/objects.js) — what it does to which of its user's items, picked on the card:
// - store: Retrieval Belt's "One item you're holding with a Bulk of 1 or less vanishes into the belt's extradimensional space" (the belt a
//   PF2e container: the item in it);
// - retrieve: "The item stored in the belt appears in your hand" (out of it, held);
// - hand: an item to its user's hand — itself (Lady's Knife's "The lady's knife instantly teleports to your hand", Blackaxe's "appears in your
//   hands"), or one picked (Retrieval Prism's attuned item "of 1 Bulk or less", Called's item);
// - don: Crushing Coils' "The armor wraps around you, allowing you to don it" (itself worn);
// - repair: The Forge's "restore the object to its full Hit Point total, removing the broken condition" (one of its user's of up to 4 Bulk),
//   or by an amount, Rust Scrub's "restore 2d4 Hit Points to an item that has been damaged by rust" (rolled, up to its maximum; the rust's
//   share of its damage the GM's, as the text says);
// - create: a weapon it makes in its user's hand — Boots of the Secret Blade's "draw a +1 striking dagger from it, and make a ranged or
//   melee Strike with it … The dagger remains a physical object until the next time you use Draw Secret Blade" (PF2e's dagger with those
//   runes, the last one made gone; the Strike its user's own, with it), Necklace of Knives' "it grows into a normal stone, steel, or wooden
//   dagger for as long as you hold it" (gone once it's out of the hand: scripts/objects.js).
// - reload: Autoload Leathers' "You reload a weapon with reload 1" (2026-10-26) — one of its user's weapons with that reload and room for a
//   round, loaded with one of its user's ammunition for it (PF2e's own attach, as its reload button does).
// Its other rule sentences are notes. Pure.

import { readStoredSpell } from "./stored-spell.js";

const BULK = (words) => (/^light$/i.test(words) ? 0.1 : /^negligible$/i.test(words) ? 0 : Number(words));
const STORE = /\bOne item you(?:'re| are) holding with a Bulk of (\d+|light) or less vanishes into the [\w' -]+?(?:'s)? extradimensional space\b/i;
const RETRIEVE = /\bThe item stored in the [\w' -]+? appears in your hand\b/i;
const SELF_HAND = (name) => new RegExp(String.raw`\b(?:The )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s*\([^)]*\)$/, "")} (?:instantly )?(?:teleports to your hand|appears in your hands?)\b`, "i");
const PICKED_HAND = /\b(?:the attuned item|any item in your possession of (\d+|light) Bulk or less) (?:immediately |instantly )?teleports into your hand\b|\bThe item teleports to a free hand\b/i;
const DRAW_ATTACHED = /\bYou draw (and load )?the attached weapon\b/i;
// (A weapon that takes another weapon's shape, its runes kept: Anchor Spear's "The anchor spear extends into a +2 greater striking longspear or back to its
// original form as a +2 greater striking spear" — its two forms; the Shifting rune's "The weapon takes the shape of another melee weapon that requires
// the same number of hands to wield" — any such, picked. op "reshape", scripts/objects.js. 2026-10-26.)
const RESHAPE_TWO = /\bThe [\w' -]+? extends into an? (?:\+\d (?:(?:greater|major) )?striking )?([a-z-]+(?: [a-z-]+)?) or back to its original form as an? (?:\+\d (?:(?:greater|major) )?striking )?([a-z-]+(?: [a-z-]+)?)\./i;
// (A weapon of its user's choice from a charm's group, Armory Bracelet's: "You pull one charm from the bracelet. The charm transforms into a common
// weapon of your choice from the charm's weapon group. If the weapon requires ammunition, it appears with … 20 pieces of ammunition … The weapon
// is a +2 striking weapon of the type you chose. After 1 minute, the weapon transforms into a +1 striking weapon and remains until your next daily
// preparations. At that point, the weapon and any remaining ammunition crumble to dust" — op "create" with choose { groups } (PF2e's common base
// weapons of those groups, picked on the card), its runes, then { after, potency, striking }, untilRest, ammo. 2026-10-26.)
const CHARM = /\bYou pull one charm from the [\w' -]+?\. The charm transforms into a common weapon of your choice from the charm's weapon group\./i;
const CHARM_RUNES = /\bThe weapon is a \+(\d)((?: (?:greater|major))? striking)? weapon of the type you chose\./i;
const CHARM_AFTER = /\bAfter 1 minute, the weapon transforms into (?:a non-magical version|a \+(\d)((?: (?:greater|major))? striking)? weapon) and remains until your next daily preparations\./i;
const CHARM_GROUPS = /\bone charm each for the groups ([a-z]+(?:, [a-z]+)*),? and ([a-z]+)\./i;
const CHARM_AMMO = /\bIf the weapon requires ammunition, it appears with a quiver or pouch with (\d+) pieces of ammunition for the weapon\./i;
const strikingOf = (words) => (!words ? 0 : /major/i.test(words) ? 3 : /greater/i.test(words) ? 2 : 1);
const RESHAPE_ANY = /\bThe weapon takes the shape of another melee weapon that requires the same number of hands to wield\./i;
const ATTUNED_BULK = /\battune it to a single item of (\d+|light) Bulk or less\b/i;
const DON = /\bThe armor wraps around you, allowing you to don it\b/i;
const REPAIR = /\brestore the object to its full Hit Point total, removing the broken condition\b/i;
const REPAIR_BY = /\brestore (\d+d\d+(?:\s*\+\s*\d+)?|\d+) Hit Points to an item\b(?: that has been damaged by (\w+))?/i;
const REPAIR_BULK = /\bobject \([^)]*\) of up to (\d+) Bulk\b|\bobject[^.]*?of up to (\d+) Bulk\b/i;
// (A dagger made in its user's hand: its runes, and whether the last one made goes — or it goes once it's not held.)
const BLADE = /\bdraw an? (?:\+(\d) (?:(greater|major) )?striking )?(dagger) from it, and make a ranged or melee Strike with it\b/i;
const BLADE_REPLACED = /\bremains a physical object until the next time you use [\w' -]+?, and it disappears as a new blade is created\b/i;
const KNIFE = /\bYou pluck a miniature knife from the [\w' -]+?, and it grows into a normal (?:stone, steel, or wooden )?(dagger) for as long as you hold it\b/i;
const STRIKING = { undefined: 0, "": 1, greater: 2, major: 3 };
const RELOAD = /\bYou reload a weapon with reload (\d+)\b/i;
// (Weapons made for Strikes from where its hit landed, Chain of Stars': "three +1 striking shuriken made from magical force materialize in the target's
// space and split off to attack other creatures. Attempt up to three shuriken Strikes that must each target a different creature and can't target the
// creature you hit to trigger this talisman. These Strikes use your attack modifier but originate from the hit creature's space. These attacks count
// toward your multiple attack penalty, but the penalty doesn't increase until after all three attacks have been made. The shuriken deal force damage
// instead of their normal type, and each shuriken vanishes after its attack" — op "create": PF2e's shuriken, that many, those runes, force damage,
// each gone after its attack roll (scripts/objects.js); whom and from where they Strike, and the multiple attack penalty, lines of the card. 2026-10-27.)
const MATERIALIZE = /\b(three|two|four) \+(\d) (?:(greater|major) )?striking (shuriken|daggers?|darts?) made from magical (force) materialize in the target's space and split off to attack other creatures\b/i;
const MADE_STRIKES = [/^Attempt up to (?:three|two|four) [\w-]+ Strikes that must each target a different creature and can't target the creature you hit to trigger this talisman\.$/i, /^These Strikes use your attack modifier but originate from the hit creature's space\.$/i, /^These attacks count toward your multiple attack penalty, but the penalty doesn't increase until after all (?:three|two|four) attacks have been made\.$/i, /^The [\w-]+ deal (\w+) damage instead of their normal type, and each [\w-]+ vanishes after its attack\.$/i];
const RECALLED = /\bthe ammunition from your missed shot is immediately recalled to your firearm, allowing you to fire again without reloading\b/i;
// (Damage to another creature's item, ignoring its Hardness, 2026-10-27: Rustbringer's Rusting Disarm, "Flakes of acid-laden rust are deposited on
// the disarmed weapon. The weapon takes @Damage[2d6[untyped]] damage, ignoring the weapon's Hardness" — op "damage" { formula, type, of, whose:
// "target", ignoresHardness }: the targeted creature's weapon, picked when it has several, its Hit Points lowered by the roll (scripts/objects.js).)
const ITEM_DAMAGE = /\bThe (weapon|armor|shield) takes (?:@Damage\[(\d+d\d+(?:\+\d+)?)\[(\w+)\]\]|(\d+d\d+(?:\+\d+)?)(?: (\w+))?) damage, ignoring the \1's Hardness\b/i;
const DISARMED = /^Flakes of [\w-]+ rust are deposited on the disarmed weapon\.$/i;
// (The affixed item negated and mended, Mending Lattice's "it negates the damage and instantly and completely repairs the affixed item"; or 10 of
// its damage taken back, Fortifying Pebble's "the affixed object takes 10 less damage" — op "repair" of its user's damaged items, the one it's
// affixed to picked once the damage lands, 2026-10-27.)
const MENDED = /\bit negates the damage and instantly and completely repairs the affixed item\b/i;
const LESS = /\bthe affixed object takes (\d+) less damage\b/i;
// (Itself mended by what its trigger dealt, Sanguine Klar's "The sanguine klar regains a number of Hit Points equal to the bleed damage, up to an amount
// equal to its Hardness" — op "repair", self, typed: the amount typed on the card, at most its Hardness, 2026-10-27.)
const SELF_REGAIN = /\bThe [\w' -]+? regains a number of Hit Points equal to the (\w+) damage, up to an amount equal to its Hardness\b/i;
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|damage|condition|can't be activated again|can be activated again|can't Retrieve Item again)\b/i;
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// The activation's plain text (from its Effect on), the item's name and type, the item's whole text → { op, maxBulk?, self?, said } or null.
export function readObjects(body, { name = "", type = null, whole = "" } = {}) {
    const text = String(body ?? "");
    // (A spell it holds for later, cast or let go: src/compiler/stored-spell.js, 2026-10-26 — not Spell Reservoir's, whose spell the spell module
    // keeps and casts itself.)
    const stored = /^Spell Reservoir\b/.test(name) ? null : readStoredSpell(text, whole);
    if (stored) return { ...stored, self: stored.op !== "cast-stored", said: stored.said[0], also: stored.said[1] ?? null };
    const store = STORE.exec(text);
    if (store && type === "backpack") return { op: "store", maxBulk: BULK(store[1]), said: store[0] };
    if (RETRIEVE.test(text) && type === "backpack") return { op: "retrieve", said: RETRIEVE.exec(text)[0] };
    if (name && SELF_HAND(name).test(text)) return { op: "hand", self: true, said: SELF_HAND(name).exec(text)[0] };
    const charm = CHARM.exec(text);
    const charmRunes = CHARM_RUNES.exec(text);
    const groups = CHARM_GROUPS.exec(String(whole ?? ""));
    if (charm && charmRunes && groups) {
        const after = CHARM_AFTER.exec(text);
        const ammo = CHARM_AMMO.exec(text);
        return { op: "create", self: true, choose: { groups: [...groups[1].split(/,\s*/), groups[2]].map((group) => group.toLowerCase()), common: true }, potency: Number(charmRunes[1]), striking: strikingOf(charmRunes[2]), ...(after ? { then: { after: { value: 1, unit: "minutes" }, potency: Number(after[1] ?? 0), striking: strikingOf(after[2]) }, untilRest: true } : {}), ...(ammo ? { ammo: Number(ammo[1]) } : {}), said: charm[0] };
    }
    const two = RESHAPE_TWO.exec(text);
    if (two) return { op: "reshape", self: true, forms: [two[1].toLowerCase(), two[2].toLowerCase()], said: two[0] };
    if (RESHAPE_ANY.test(text)) return { op: "reshape", self: true, sameHands: true, said: RESHAPE_ANY.exec(text)[0] };
    // (The weapon its talisman is fastened to, drawn — and loaded too — Liquid Gold's "You draw (and load) the attached weapon as a free action":
    // one of its user's weapons not in hand, picked on the card, 2026-10-26.)
    const attached = DRAW_ATTACHED.exec(text);
    if (attached) return { op: "hand", weapon: true, ...(attached[1] ? { load: true } : {}), said: attached[0] };
    const picked = PICKED_HAND.exec(text);
    if (picked) {
        const bulk = picked[1] ?? ATTUNED_BULK.exec(String(whole ?? ""))?.[1] ?? null;
        return { op: "hand", ...(bulk !== null ? { maxBulk: BULK(bulk) } : {}), said: picked[0] };
    }
    if (DON.test(text)) return { op: "don", self: true, said: DON.exec(text)[0] };
    const blade = BLADE.exec(text);
    if (blade) return { op: "create", self: true, weapon: blade[3].toLowerCase(), potency: Number(blade[1] ?? 0), striking: blade[1] ? STRIKING[(blade[2] ?? "").toLowerCase()] : 0, ...(BLADE_REPLACED.test(text) ? { replaces: true } : {}), said: blade[0], also: BLADE_REPLACED.exec(text)?.[0] ?? null };
    const knife = KNIFE.exec(text);
    if (knife) return { op: "create", self: true, weapon: knife[1].toLowerCase(), potency: 0, striking: 0, whileHeld: true, said: knife[0], also: null };
    const made = MATERIALIZE.exec(text);
    if (made && MADE_STRIKES.every((pattern) => SENTENCES(text).some((sentence) => pattern.test(sentence)))) {
        const count = { two: 2, three: 3, four: 4 }[made[1].toLowerCase()];
        const kind = made[4].toLowerCase().replace(/s$/, "");
        return { op: "create", self: true, weapon: kind, potency: Number(made[2]), striking: STRIKING[(made[3] ?? "").toLowerCase()], quantity: count, damageType: made[5].toLowerCase(), vanishAfterAttack: true, strikes: { count, different: true, notHit: true, fromHit: true, mapHeld: true }, said: made[0], also: MADE_STRIKES.map((pattern) => SENTENCES(text).find((sentence) => pattern.test(sentence))).join(" ") };
    }
    const reload = RELOAD.exec(text);
    if (reload) return { op: "reload", reload: reload[1], said: reload[0] };
    // (The missed round back in the firearm, Persistent Lodestone's "the ammunition from your missed shot is immediately recalled to your firearm, allowing
    // you to fire again without reloading" — its Usage "affixed to a firearm with a reload of 1": op "reload", recalled — that round given back to its
    // user's ammunition and loaded, no other spent (scripts/objects.js), 2026-10-27.)
    const recalled = RECALLED.exec(text);
    const usage = /\baffixed to a firearm with a reload of (\d+)\b/i.exec(String(whole ?? ""));
    if (recalled && usage) return { op: "reload", reload: usage[1], recalled: true, said: recalled[0] };
    const damaged = ITEM_DAMAGE.exec(text);
    if (damaged) return { op: "damage", of: damaged[1].toLowerCase(), formula: damaged[2] ?? damaged[4], type: (damaged[3] ?? damaged[5] ?? "untyped").toLowerCase(), whose: "target", ignoresHardness: true, said: damaged[0], also: SENTENCES(text).find((sentence) => DISARMED.test(sentence)) ?? null };
    if (MENDED.test(text)) return { op: "repair", affixed: true, negates: true, said: MENDED.exec(text)[0] };
    const regain = SELF_REGAIN.exec(text);
    if (regain) return { op: "repair", self: true, typed: `the ${regain[1].toLowerCase()} damage`, upTo: "hardness", said: regain[0] };
    const less = LESS.exec(text);
    if (less) return { op: "repair", amount: less[1], affixed: true, less: true, said: less[0] };
    const by = REPAIR_BY.exec(text);
    if (by) return { op: "repair", amount: by[1].replace(/\s+/g, ""), ...(by[2] ? { damagedBy: by[2].toLowerCase() } : {}), said: by[0] };
    if (REPAIR.test(text)) {
        const bulk = REPAIR_BULK.exec(text);
        return { op: "repair", ...(bulk ? { maxBulk: Number(bulk[1] ?? bulk[2]) } : {}), said: REPAIR.exec(text)[0] };
    }
    return null;
}

// The activation's (or the item's) html, its base, the item → the objects card's plan, or null.
export function objectsPlan(html, base, item = {}) {
    // (An inline roll as its formula, Rust Scrub's "[[/r 2d4 #Hit Points]]".)
    const plain = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[\/r ([^\]#]+?)(?:\s*#[^\]]*)?\]\](?:\{[^}]*\})?/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const whole = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const read = readObjects(body, { name: item?.name ?? "", type: item?.type ?? null, whole });
    if (!read) return null;
    const notes = SENTENCES(body).filter((sentence) => !sentence.includes(read.said) && !(read.also && (sentence.includes(read.also) || read.also.includes(sentence))) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence));
    const { said, also, ...objects } = read;
    // (The GM's share of a number the card applies — Rust Scrub's "The GM determines what portion of damage to an item was caused by rust if
    // that value isn't known": your ruling for numbers left to the GM, the text's applied and the GM may change it — a card line.)
    const share = /^The GM determines what portion of damage to an item was caused by (\w+) if that value isn't known\.$/i;
    const lines = notes.filter((note) => share.test(note)).map((note) => `The GM may lower it to what the ${share.exec(note)[1]} did, when that isn't known.`);
    const rules = notes.filter((note) => !share.test(note));
    return {
        ...base,
        builtin: "objects",
        automation: { level: rules.length ? "guided" : "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        objects,
        ...(rules.length || lines.length ? { notes: [...rules, ...lines] } : {}),
        ...(rules.length ? { partial: true } : {})
    };
}
