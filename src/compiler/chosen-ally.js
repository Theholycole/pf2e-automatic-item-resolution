// One willing ally its user chooses, and what it gives them (2026-10-26): the Bewitching Bloom tattoos' "Choose a willing ally you can see
// within 30 feet. …". The item card at the ally its presser targets (plan.item.recipient "targets", src/compiler/consumables.js's "Choose a
// willing ally"), each reading below an Effect of PF2e's own rules on that ally (item.ruleEffects), what's left to do a line of the card:
//   RECOVERY  Cherry Blossom's "For 1 minute, any recovery checks the ally attempts have a DC of 10 instead of 10 + the ally's dying value" —
//             PF2e's recovery DC lowered by the dying value, as PF2e's own Nine Lives Catfolk has it.
//   FLOOR     Amaranth's "The next time they would take damage from a hazard, an enemy's attack, or an effect created by an enemy, that damage
//             can't reduce the ally below 1 HP. This benefit ends if unused before the start of your next turn." — the "hp floor" Effect,
//             held to as PF2e applies that damage (scripts/hp-floor.js: not an ally's or its own).
//   RECOVER   Bellflower's "Until the end of that ally's next turn, they gain a +2 status bonus to rolls to recover from the Confused, frightened,
//             Grabbed, Paralyzed, and Restrained conditions" — PF2e's FlatModifier on an Escape while grabbed or restrained (as PF2e's
//             Escape Fulu), a roll note on its saves while in one of the others; its "When you Activate the bloom, the target can attempt a
//             new save … or … Escape" a card line.
//   RECALL    Lilac's "The ally attempts to Recall Knowledge with a +2 status bonus to the check" — PF2e's FlatModifier on Recall Knowledge,
//             the Effect gone after that roll; the attempt itself a card line.
//   BELOVED   Red Rose's beloved: "While the ally is within 10 feet of this beloved, the ally gains a +1 status bonus to saving throws. If the
//             ally starts their turn within 10 feet of the beloved, the ally gains 5 temporary Hit Points." — a PF2e toggle on its Effect for
//             the beloved being near, the bonus and the turn's temporary Hit Points (PF2e's TempHP, gone with the Effect) only while it's on.
// Not one whose ally gets a spell or a PF2e Effect of its own (Purple Iris, White Poppy, Lotus, Magnolia: read elsewhere). Pure.

import { durationIn, timeIn } from "./rows.js";

const CHOSEN = /^Choose a willing ally you can see within (\d+) feet\.\s*/;
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const listOf = (words) => String(words).split(/,\s*(?:and |or )?|\s+(?:and|or)\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean);
const TYPES = /^(status|circumstance|item)$/i;
const orList = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words.join(""));

const RECOVERY = /^For ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)), any recovery checks the ally attempts have a DC of (\d+) instead of \2 \+ the ally's dying value\.$/i;
// (Whom it can be used on, not what it does: Cherry Blossom's "The cherry blossom's activation can target an Unconscious or dying ally".)
const CAN_TARGET = /^The [\w' ]+?'s activation can target an? [\w ]+? ally\.$/i;
const FLOOR = /^The next time they would take damage from a hazard, an enemy's attack, or an effect created by an enemy, that damage can't reduce the ally below 1 HP\.$/i;
const FLOOR_ENDS = /^This benefit ends if unused before the start of your next turn\.$/i;
const RECOVER = /^Until the end of that ally's next turn, they gain an? \+(\d+) (\w+) bonus to rolls to recover from the (.+?) conditions\.$/i;
const RECOVER_NOW = /^When you Activate the [\w' ]+?, the target can attempt a new save against a condition the bonus applies to, or they can use a reaction to attempt to Escape being (.+?), provided such an attempt is allowed\.$/i;
const RECALL = /^The ally attempts to Recall Knowledge with an? \+(\d+) (\w+) bonus to the check\b[^.]*\.$/i;
const BELOVED_PICK = /^They choose a creature that the ally has [\w ]+? toward as beloved\.$/i;
const BELOVED_SAVES = /^While the ally is within (\d+) feet of this beloved, the ally gains an? \+(\d+) (\w+) bonus to saving throws\.$/i;
const BELOVED_TEMP = /^If the ally starts their turn within (\d+) feet of the beloved, the ally gains (\d+) temporary Hit Points\.$/i;
const BELOVED_TIME = /^These benefits last for ((?:\d+|one|an?) (?:rounds?|minutes?|hours?)), and temporary HP remaining from this effect at the end of that time disappear\.$/i;
// (Its traits, said of the effect: nothing to do.)
const TRAITS = /^This effect has the [\w, ]+? traits?\.$/i;
// (What it says more that a card can't leave out.)
const MECHANICAL = /\b(?:bonus|penalty|damage|Hit Points?|HP|saves?|saving throws?|checks?|DC|conditions?|Speed|actions?|reactions?|Strikes?|attacks?|immune|resistance)\b/i;

// (The floor's Effect name, which scripts/hp-floor.js looks for.)
export const HP_FLOOR = "hp floor";
const UNTIL_NEXT_START = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const ESCAPE_SELECTORS = ["acrobatics", "athletics", "unarmed-attack-roll"];
const ESCAPED_FROM = new Set(["grabbed", "restrained", "immobilized"]);

// The activation's html and the plan's base → the item card's plan for the ally, or null when its text isn't one ally's or says more than
// these readings hold.
export function chosenAllyPlan(html, base) {
    const effect = plain(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const chosen = CHOSEN.exec(effect);
    if (!chosen) return null;
    const sentences = SENTENCES(effect.slice(chosen[0].length));
    const ruleEffects = [];
    const notes = [];
    const used = new Set();
    const take = (pattern) => {
        const index = sentences.findIndex((sentence, at) => !used.has(at) && pattern.test(sentence));
        if (index < 0) return null;
        used.add(index);
        return pattern.exec(sentences[index]);
    };
    const recovery = take(RECOVERY);
    if (recovery) {
        take(CAN_TARGET);
        ruleEffects.push({ name: "recovery DC", words: `Its recovery checks are DC ${recovery[2]}, whatever its dying value`, rules: [{ key: "ActiveEffectLike", mode: "subtract", path: "system.attributes.dying.recoveryDC", predicate: ["self:condition:dying"], value: "@actor.conditions.dying.badge.value" }], duration: durationIn(`for ${recovery[1]}`, null) });
    }
    if (take(FLOOR)) {
        const ends = take(FLOOR_ENDS);
        ruleEffects.push({ name: HP_FLOOR, words: "The next damage it takes from a hazard or an enemy can't reduce it below 1 Hit Point", rules: [], duration: ends ? UNTIL_NEXT_START : null });
    }
    const recover = take(RECOVER);
    if (recover && TYPES.test(recover[2])) {
        const type = recover[2].toLowerCase();
        const value = Number(recover[1]);
        const conditions = listOf(recover[3]);
        const escaped = conditions.filter((slug) => ESCAPED_FROM.has(slug));
        const saved = conditions.filter((slug) => !ESCAPED_FROM.has(slug));
        const rules = [
            ...(escaped.length ? [{ key: "FlatModifier", selector: ESCAPE_SELECTORS, type, value, predicate: ["action:escape", { or: escaped.map((slug) => `self:condition:${slug}`) }] }] : []),
            ...(saved.length ? [{ key: "Note", selector: "saving-throw", title: `+${value} ${type} bonus`, text: `+${value} ${type} bonus when this roll is to recover from being ${orList(saved)}.`, predicate: [{ or: saved.map((slug) => `self:condition:${slug}`) }] }] : [])
        ];
        ruleEffects.push({ name: "recovery bonus", words: `+${value} ${type} bonus to rolls to recover from being ${orList(conditions)}`, rules, duration: timeIn("until the end of your next turn", null) });
        const now = take(RECOVER_NOW);
        if (now) notes.push(`Now it can attempt a new save against one of those conditions, or use a reaction to Escape being ${orList(listOf(now[1]))} (where that's allowed).`);
    }
    const recall = take(RECALL);
    if (recall && TYPES.test(recall[2])) {
        const type = recall[2].toLowerCase();
        ruleEffects.push({ name: "Recall Knowledge bonus", words: `+${recall[1]} ${type} bonus to its Recall Knowledge now`, rules: [{ key: "FlatModifier", selector: "skill-check", type, value: Number(recall[1]), predicate: ["action:recall-knowledge"], removeAfterRoll: "if-enabled" }], duration: THIS_TURN });
        notes.push("It attempts to Recall Knowledge now, with the bonus on its Effect.");
    }
    const saves = take(BELOVED_SAVES);
    const temp = take(BELOVED_TEMP);
    if (saves && TYPES.test(saves[3])) {
        take(BELOVED_PICK);
        const time = take(BELOVED_TIME);
        const option = `beloved-within-${saves[1]}-feet`;
        const type = saves[3].toLowerCase();
        ruleEffects.push({
            name: "beloved",
            words: `+${saves[2]} ${type} bonus to saving throws within ${saves[1]} feet of its beloved${temp ? `, and ${temp[2]} temporary Hit Points when it starts a turn there` : ""} (its toggle on while the beloved is that near)`,
            rules: [
                { key: "RollOption", domain: "all", option, toggleable: true, label: `Beloved within ${saves[1]} feet` },
                { key: "FlatModifier", selector: "saving-throw", type, value: Number(saves[2]), predicate: [option] },
                ...(temp && temp[1] === saves[1] ? [{ key: "TempHP", value: Number(temp[2]), events: { onCreate: false, onTurnStart: true }, predicate: [option] }] : [])
            ],
            duration: time ? durationIn(`for ${time[1]}`, null) : null
        });
        notes.push("Its beloved: a creature it chooses; its Effect's toggle on while that creature is near.");
    }
    if (!ruleEffects.length) return null;
    take(TRAITS);
    // (Any other sentence that says something to do: not this reading's to claim.)
    if (sentences.some((sentence, index) => !used.has(index) && MECHANICAL.test(sentence))) return null;
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "1 ally", range: `${chosen[1]} feet`, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        ruleEffects,
        ...(notes.length ? { notes } : {})
    };
}

// The ally's own linked PF2e Effect, then a save it makes later (Magnolia's "They gain a +1 status bonus to Diplomacy checks for 10 minutes.
// Once on their next turn, the ally can attempt to draw a creature's attention. … The target must succeed at a Will save or be Fascinated
// …"): the item card gives the ally the Effect, then the save card follows for later, the ally its user (plan.again). The save plan the
// ability compiler read, the activation's html, the item's own plan (its linked Effect, src/compiler/consumables.js ownPlan) → that plan,
// or the save plan as it was.
const LATER_ATTEMPT = /\bOnce on their next turn, the ally can attempt\b/i;
export function withAllyEffectThenCard(plan, html, own) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || plan.again) return plan;
    const effect = plain(html).replace(/^.*?\bEffect\b\s*/s, "");
    if (!CHOSEN.test(effect) || !LATER_ATTEMPT.test(effect)) return plan;
    if (own?.resolution?.kind !== "effect" || own.resolution.applications?.length !== 1 || own.partial || own.builtin) return plan;
    // (What the save card leaves the GM keeps the item partial.)
    const partial = plan.partial ? { partial: true, automation: { ...(own.automation ?? {}), level: "guided" }, ...(plan.notes?.length ? { notes: [...(own.notes ?? []), ...plan.notes] } : {}) } : {};
    // ("Fascinated with your ally until the end of that ally's next turn": the save card's user is that ally, so its next turn's end.)
    const until = /\buntil the end of that ally's next turn\b/i.test(effect) ? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } : null;
    const timed = (row) => (row && until ? { ...row, effects: (row.effects ?? []).map((entry) => (entry.kind === "condition" && !entry.duration ? { ...entry, duration: until } : entry)) } : row);
    const save = until ? { ...plan, resolution: { ...plan.resolution, outcomes: Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => [degree, timed(row)])) } } : plan;
    return { ...own, ...partial, again: { plan: save, later: true } };
}
