// An item's own data in its text, filled in before it's read (Magic+'s dragonbreath weapons: a damage formula built on
// @item.system.runes.striking with a @Check save, and a save DC that rises with the weapon's potency rune): its runes and
// level as numbers, simple arithmetic in a dice count worked out, the DC its potency rune gives. The text read is then the
// item's as it is. Pure.

const PATHS = {
    "@item.system.runes.striking": (item) => Number(item?.system?.runes?.striking) || 0,
    "@item.system.runes.potency": (item) => Number(item?.system?.runes?.potency) || 0,
    "@item.level": (item) => Number(item?.system?.level?.value) || 0,
    "@item.system.level.value": (item) => Number(item?.system?.level?.value) || 0
};

// "((1 + 1) * 2)" → 4: digits, + - * / and parentheses only.
function arithmetic(expression) {
    if (!/^[\d\s+\-*/()]+$/.test(expression)) return null;
    try {
        const value = Function(`"use strict"; return (${expression});`)();
        return Number.isFinite(value) ? Math.floor(value) : null;
    } catch {
        return null;
    }
}

// The owner's own DC (PF2e's "@Check[reflex|against:class-spell]": a harrow card's "against your class DC or spell DC", Lung
// Bloodstone's class DC): read with a number standing in for it, which ownerDCs(plan) then makes the core's
// against { dc: "owner", statistic: "class" | "spell" | "class-spell" }. Live play fills in the owner's DC (fillOwnerDCs);
// without it, the core's save family takes the caster's spell DC.
export const OWNER_DCS = Object.freeze({ 9001: "class", 9002: "spell", 9003: "class-spell" });
const STAND_IN = Object.freeze({ class: 9001, spell: 9002, "class-spell": 9003 });
const OWNER_WORDS = Object.freeze({ class: "your class DC", spell: "your spell DC", "class-spell": "your class DC or spell DC" });

const FRIGHTENED = "@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]";
const IMMOBILIZED = "@UUID[Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe]";

export function withItemData(html, item) {
    // (A save link written without its "dc:" — a third-party module's "@Check[will|23]": the DC it means.)
    let text = String(html ?? "").replace(/@Check\[(fortitude|reflex|will)\|(\d+)\]/gi, "@Check[$1|dc:$2]");
    // (Its DC first, its type named: a third-party module's "@Check[dc:28|type:fortitude]" — PF2e's order.)
    text = text.replace(/@Check\[dc:(\d+)\|type:(\w+)((?:\|[^\]]*)?)\]/gi, "@Check[$2|dc:$1$3]");
    // (A save link without the word: Life's Last Breath's "The target must succeed at a @Check[fortitude|dc:38] or take 4d6 void
    // damage" — the target's, not a passive one's: Dawnlight's "Creatures with darkvision … must succeed at a @Check[…] or be …".)
    text = text.replace(/(\b[Tt]he target must succeed at an? @Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) or (be|become|take)\b/gi, "$1 save or $2");
    // (A frightful presence by name, Dragonscale Amulet's "an aura that terrifies all foes in a 60-foot radius, as the frightful
    // presence ability with a @Check[will|dc:34] save": that ability's rows.)
    text = text.replace(/\bYou exude an aura that terrifies all foes in a (\d+)-foot radius, as the frightful presence ability with a (@Check\[will\|[^\]]*\])(?:\{[^}]*\})? save\.\s*<\/p>/i, (whole, feet, check) => `Each foe in a @Template[type:emanation|distance:${feet}] must attempt a ${check} save. A creature that succeeds is temporarily immune for 1 minute.</p><p><strong>Critical Success</strong> The creature is unaffected.</p><p><strong>Success</strong> The creature is ${FRIGHTENED}{Frightened 1}.</p><p><strong>Failure</strong> The creature is ${FRIGHTENED}{Frightened 2}.</p><p><strong>Critical Failure</strong> The creature is ${FRIGHTENED}{Frightened 4}.</p>`);
    // (A bow's critical specialization by name, Antler Arrow's "save or become stuck to the surface, taking the critical
    // specialization effects of a bow": Immobilized, until it pulls free.)
    text = text.replace(/\bor become stuck to the surface, taking the critical specialization effects of a bow\./i, `or become ${IMMOBILIZED}{Immobilized}. It's stuck to the surface until it pulls the missile free: an Interact action and a DC 10 Athletics check.`);
    // (A condition for its user's next turn, Bloodline Robe's "You're Quickened on your next turn": until that turn's end.)
    text = text.replace(/\b(You're|You are) (@UUID\[[^\]]+\]\{[^}]+\}) on your next turn\b/g, "$1 $2 until the end of your next turn");
    // (Its damage or healing for its owner's level: the Harrow Court's "The damage increases to … if you're at least 15th level".)
    text = byOwnerLevel(text, item?.ownerLevel);
    // (Its owner's own numbers, when live play gives them: Wolf Fang's "@Damage[(@actor.abilities.str.mod)[bludgeoning]] damage equal
    // to your Strength modifier", Pact of the Herald and Host's "(@actor.level)d6".)
    text = withOwnerNumbers(text, item);
    // (Dice per weapon damage die — Unholy Bloodshed's: one die where no weapon says more, src/compiler/runes.js giving its weapon's.)
    text = perWeaponDie(text, item?.type === "weapon" ? weaponDice(item) : 1, item?.type === "weapon" ? item.system?.damage?.damageType ?? null : null);
    // (A condition that "increases to" a value on a failed save, as the ability compiler reads one: Putrescent Glob's "the creature
    // you damaged must succeed at a … save or its sickened condition increases to Sickened 2" — "The target must succeed at a
    // … save or be Sickened 2".)
    // (Its "and it can't reduce its sickened condition until …" as the reader takes it: "its sickened value can't be reduced below 2 …".)
    text = text.replace(/\b(?:When you activate [^,.<]+, )?[Tt]he (?:creature you damaged|creature you hit|target) must succeed at an? (@Check\[[^\]]*\](?:\{[^}]*\})?) save or its (\w+) condition increases to (@UUID\[[^\]]*\]\{[^}]*?(\d+)\})(?:, and it can't reduce its \w+ condition( until [^.]+)?)?/g, (whole, check, slug, link, value, until) => `The target must succeed at a ${check} save or be ${link}${until !== undefined || /can't reduce/.test(whole) ? `, and its ${slug} value can't be reduced below ${value}${until ?? ""}` : ""}`);
    // (A save against the owner's own DC: its stand-in.)
    text = text.replace(/@Check\[((?:type:)?(?:fortitude|reflex|will))\|([^\]]*?)\bagainst:(class-spell|class|spell)\b/gi, (whole, statistic, before, kind) => `@Check[${statistic}|${before}dc:${STAND_IN[kind.toLowerCase()]}`);
    if (!/@item\./.test(text) && !/\bpotency rune\b/i.test(text) && !DAMAGE_SAVE.test(text)) return text;
    for (const [path, read] of Object.entries(PATHS)) text = text.split(path).join(String(read(item)));
    // (A dice count that's now arithmetic: "((1 + 1) * 2)d6" → "4d6".)
    text = text.replace(/\(([\d\s+\-*/()]+)\)d(\d+)/g, (whole, expression, faces) => {
        const count = arithmetic(expression);
        return count === null ? whole : `${count}d${faces}`;
    });
    text = basicDamageSaves(text);
    // (A higher save DC with a +2 potency rune, another with a +3: the DC for its rune.)
    const raised = /\bThe save DC increases to (\d+) if [^.]*?\+(\d) potency rune(?:, or to (\d+) with a \+(\d) potency rune)?/i.exec(text);
    if (raised) {
        const potency = Number(item?.system?.runes?.potency) || 0;
        const dc = raised[3] && potency >= Number(raised[4]) ? raised[3] : potency >= Number(raised[2]) ? raised[1] : null;
        if (dc) text = text.replace(/(@Check\[(?:type:)?(?:fortitude|reflex|will)\|dc:)\d+/gi, `$1${dc}`);
    }
    return text;
}

// "… that does @Damage[4d6[force]] damage with a @Check[reflex|dc:23] save." — damage with a save and no degree rows of its
// own reads only one way, a basic save (PF2e's own text always says so; some third-party text leaves the word out). And
// Lacquered Waist Drum's "This deals @Damage[5d8[vitality]] damage (@Check[fortitude|dc:28] save) to that creature".
const DAMAGE_SAVE = /@Damage\[(?:[^\[\]]|\[[^\]]*\])+\] damage (?:with a |\()@Check\[(?:type:)?(?:fortitude|reflex|will)\|(?![^\]]*\bbasic\b)[^\]]*\] save\b/i;
function basicDamageSaves(text) {
    // (Not where its own activation has degree rows: up to the next one.)
    return text.replace(new RegExp(DAMAGE_SAVE.source, "gi"), (sentence, at) => {
        const next = text.slice(at).search(/<strong>\s*Activate\b/i);
        const own = next < 0 ? text.slice(at) : text.slice(at, at + next);
        if (/\bCritical (?:Success|Failure)\b/.test(own) || /\bCritical (?:Success|Failure)\b/.test(text.slice(text.lastIndexOf("Activate", at) < 0 ? 0 : text.lastIndexOf("Activate", at), at))) return sentence;
        return sentence.replace(/(@Check\[(?:type:)?(?:fortitude|reflex|will)\|[^\]]*)\]/i, "$1|basic]");
    });
}

// Each stand-in of the owner's DC in a plan as the core's { dc: "owner", statistic }; a cast's DC number (The Cyclone's) as
// dc null and ownerDC, for live play to fill in; and in its words as "your class DC".
export function ownerDCs(plan) {
    if (!plan || !JSON.stringify(plan).match(/\b900[123]\b/)) return plan;
    const walk = (value) => {
        if (typeof value === "string") return value.replace(/\bDC (900[123])\b/g, (whole, number) => OWNER_WORDS[OWNER_DCS[number]]).replace(/\bdc:(900[123])\b/g, (whole, number) => `against:${OWNER_DCS[number]}`);
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== "object") return value;
        if (value.dc === "fixed" && OWNER_DCS[value.value]) {
            const { value: _, ...rest } = value;
            return { ...rest, dc: "owner", statistic: OWNER_DCS[value.value] };
        }
        const walked = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
        return typeof value.dc === "number" && OWNER_DCS[value.dc] ? { ...walked, dc: null, ownerDC: OWNER_DCS[value.dc] } : walked;
    };
    return walk(plan);
}

// The plan with each owner's DC filled in from dcs ({ class, spell }: numbers or null): "class-spell" the higher one. The
// checks it can't fill stay as they are; filled reports whether any was left.
export function fillOwnerDCs(plan, dcs = {}) {
    let missing = false;
    const of = (statistic) => {
        const values = (statistic === "class-spell" ? [dcs.class, dcs.spell] : [dcs[statistic]]).map(Number).filter((value) => Number.isFinite(value) && value > 0);
        return values.length ? Math.max(...values) : null;
    };
    const walk = (value) => {
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== "object") return value;
        if (value.dc === "owner") {
            const dc = of(value.statistic);
            if (dc === null) {
                missing = true;
                return value;
            }
            const { statistic: _, ...rest } = value;
            return { ...rest, dc: "fixed", value: dc };
        }
        const walked = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
        // (A cast's DC: with none of the owner's, the spell module's own.)
        if (value.ownerDC && value.dc == null) {
            const { ownerDC, ...rest } = walked;
            return { ...rest, dc: of(ownerDC) };
        }
        return walked;
    };
    const filled = plan && /"owner"|"ownerDC"/.test(JSON.stringify(plan)) ? walk(plan) : plan;
    return { plan: filled, missing };
}

export const hasOwnerDC = (plan) => Boolean(plan) && /"dc":"owner"|"ownerDC"/.test(JSON.stringify(plan));

// "The damage increases to @Damage[8d6[…]] if you're at least 15th level, to @Damage[9d6[…]] if you're at least 17th level …"
// (The Desert, The Trumpet; The Midwife's healing): with its owner's level known (live play passes item.ownerLevel), the
// step for that level in place of the damage before it, and the sentence gone; unknown, as it was.
const LINK = String.raw`@Damage\[(?:[^\[\]]|\[[^\]]*\])+\](?:\{[^}]*\})?`;
const SCALING = new RegExp(String.raw`\s*The (?:damage|amount of healing granted|healing) increases to ${LINK}[^.]*? if you're at least \d+(?:st|nd|rd|th) level(?:,? (?:and )?(?:to )?${LINK}[^.]*? if you're at least \d+(?:st|nd|rd|th) level)*\.`, "i");
export function byOwnerLevel(html, level) {
    const text = String(html ?? "");
    const scaling = SCALING.exec(text);
    if (!scaling || !Number.isFinite(Number(level)) || level === null) return text;
    const steps = [...scaling[0].matchAll(new RegExp(String.raw`(${LINK})[^@]*? if you're at least (\d+)(?:st|nd|rd|th) level`, "gi"))].map((match) => ({ link: match[1], level: Number(match[2]) }));
    const step = steps.filter((entry) => entry.level <= Number(level)).sort((a, b) => b.level - a.level)[0];
    const before = text.slice(0, scaling.index);
    const base = [...before.matchAll(new RegExp(LINK, "gi"))].at(-1);
    if (step && !base) return text;
    const raised = step ? `${before.slice(0, base.index)}${step.link.replace(/\{[^}]*\}$/, "")}${before.slice(base.index + base[0].length)}` : before;
    return `${raised}${text.slice(scaling.index + scaling[0].length)}`;
}

// "@actor.level" and "@actor.abilities.str.mod" as the owner's (item.ownerLevel, item.ownerAbilities { str: 4, … }), and the
// words saying so ("equal to your Strength modifier") gone with them; unknown, as written.
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export function withOwnerNumbers(html, item) {
    let text = String(html ?? "");
    if (!/@actor\./.test(text)) return text;
    const level = Number(item?.ownerLevel);
    const abilities = item?.ownerAbilities ?? null;
    let used = [];
    text = text.replace(/@actor\.level\b/g, (whole) => (Number.isFinite(level) && item?.ownerLevel !== null && item?.ownerLevel !== undefined ? String(level) : whole));
    text = text.replace(/@actor\.abilities\.(str|dex|con|int|wis|cha)\.mod\b/g, (whole, key) => {
        if (!Number.isFinite(Number(abilities?.[key]))) return whole;
        used.push(ABILITY_NAMES[key]);
        return String(Number(abilities[key]));
    });
    // (A number in brackets: "(4)[bludgeoning]" → "4[bludgeoning]", "(15)d6" → "15d6".)
    text = text.replace(/\((-?\d+)\)(?=\[|d\d)/g, "$1");
    for (const name of new Set(used)) text = text.replace(new RegExp(String.raw`\s+equal to your ${name} modifier\b`, "g"), "");
    return text;
}

// A weapon's damage dice: its own (1) and its striking rune's.
export const weaponDice = (weapon) => (Number(weapon?.system?.damage?.dice) || 1) + (Number(weapon?.system?.runes?.striking) || 0);

// "takes Persistent Bleed Damage equal to 1d8 per weapon damage die of the etched weapon" → "takes 3d8 persistent bleed damage"
// (dice: the weapon's); "1d6 per weapon damage die" → "3d6"; Swarming's "take damage equal to double the weapon's number of
// damage dice" → "take 6 piercing damage" (type: the weapon's damage type, untyped without one).
export function perWeaponDie(html, dice, type = null) {
    const per = String.raw`(\d+)d(\d+) per (?:weapon )?damage die(?: of the (?:etched |affixed )?weapon)?`;
    return String(html ?? "")
        .replace(/\btake damage equal to (double|twice|triple) the weapon's number of damage dice\b/gi, (whole, times) => `take @Damage[${({ double: 2, twice: 2, triple: 3 })[times.toLowerCase()] * dice}[${type ?? "untyped"}]] damage`)
        .replace(new RegExp(String.raw`\btakes (?:@UUID\[[^\]]*\]\{)?Persistent (\w+) Damage\}? equal to ${per}`, "gi"), (whole, type, count, faces) => `takes ${Number(count) * dice}d${faces} persistent ${type.toLowerCase()} damage`)
        .replace(new RegExp(String.raw`\b${per}`, "gi"), (whole, count, faces) => `${Number(count) * dice}d${faces}`);
}
