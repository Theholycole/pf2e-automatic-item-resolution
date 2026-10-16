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

export function withItemData(html, item) {
    // (A save link written without its "dc:" — a third-party module's "@Check[will|23]": the DC it means.)
    let text = String(html ?? "").replace(/@Check\[(fortitude|reflex|will)\|(\d+)\]/gi, "@Check[$1|dc:$2]");
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
// own reads only one way, a basic save (PF2e's own text always says so; some third-party text leaves the word out).
const DAMAGE_SAVE = /@Damage\[(?:[^\[\]]|\[[^\]]*\])+\] damage with a @Check\[(?:type:)?(?:fortitude|reflex|will)\|(?![^\]]*\bbasic\b)[^\]]*\] save\b/i;
function basicDamageSaves(text) {
    if (/\bCritical (?:Success|Failure)\b/.test(text)) return text;
    return text.replace(new RegExp(DAMAGE_SAVE.source, "gi"), (sentence) => sentence.replace(/(@Check\[(?:type:)?(?:fortitude|reflex|will)\|[^\]]*)\]/i, "$1|basic]"));
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
