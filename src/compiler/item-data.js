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

export function withItemData(html, item) {
    // (A save link written without its "dc:" — a third-party module's "@Check[will|23]": the DC it means.)
    let text = String(html ?? "").replace(/@Check\[(fortitude|reflex|will)\|(\d+)\]/gi, "@Check[$1|dc:$2]");
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
