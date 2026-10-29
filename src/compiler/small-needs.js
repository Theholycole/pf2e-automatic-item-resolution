// The small needs' readings of 2026-10-27 (docs/needs.md: information, lasting effects, triggers), run last on a consumable's plan
// (src/compiler/index.js), each returning the plan as it was when it isn't its item's:
// - A bonus to one Recall Knowledge check: Twig of Knowledge and Memory's "When pressed to the temple or lips of a sentient creature, that
//   creature can immediately attempt a check to Recall Knowledge about any subject using a corresponding skill …; they gain a +1 status bonus
//   on this check." The fortune card's readied bonus (builtin "readied-bonus", src/live/fortune-card.js) for the creature its user targets: an
//   Effect with PF2e's FlatModifier to skill checks predicated on action:recall-knowledge, spent by that check (scripts/fortune.js) — waiting
//   for it up to a minute, as every spent bonus's Effect does (src/live/fortune-card.js; the bonus's turn-end the readers' usual, 2026-10-27). The check is the creature's own PF2e Recall Knowledge, and what it learns PF2e's secret roll and the GM's.
// - A reaction for two: Potion of Shared Life's "If another willing creature consumes the remainder of the contents within 1 minute, your
//   vitalities become linked for 1 minute … You both gain the @UUID[…]{Share Life} reaction." Its note Effect for the minute grants PF2e's
//   own action (GrantItem, as src/compiler/granted-action.js does for one drinker), given to each creature its user targets (item.recipient
//   "targets"): both drinkers.
// - A readied bonus's own setup: Psychic Warding Bracelet's 10 minutes to tie on, its strands falling off after the save it's spent by, and
//   untying it with an Interact — its user's own time and hands, lines of the fortune card (which shows plan.notes).
// And on an activation's plan (src/compiler/permanent.js), as its last reading:
// - Damage to whoever touches its user while the activation lasts, src/compiler/touch-retaliation.js.
// - Resistance ignored in part: Awakened Adamantine Shot's "The shot ignores the first 20 resistance a creature has to physical damage, all
//   damage, or piercing or bludgeoning damage. Against a construct or creature who already has a resistance bypassed by adamantine, or a weakness
//   to adamantine, the shot shatters the target's defenses, causing them to become Off-Guard for 1 minute instead." Its Strike card with the
//   shot loaded (strike.ammo); strike.ignoreResistance { value, types } — the resolution core's flag (its ignoreResistance, core 321af5b) on
//   the readied Strike's Effect when the card is applied, predicated on the shot's id (src/live/strike-card.js; since 2026-10-27, not on the
//   shot's whole stack), which the core stamps onto that Strike's damage roll: each of the creature's resistances of those types counts as that
//   much lower. Off-Guard for the minute on a hit at a construct or a creature adamantine gets past
//   (a weakness to it, or a resistance it's an exception to): plan.ifTarget, as Moonlit Spellgun's silver (src/live/if-target.js). Its rarity's
//   sentence a line of the card.
// - A line Strike (2026-10-28): Penetrating Ammunition's "the Strike takes the shape of a 60-foot line originating from you. Roll one attack roll
//   and compare the result to the AC of each target in the line. The ammunition ignores up to 10 of a target's resistance … If your attack roll
//   result is a natural 20, you improve your degree of success only against the first target in the line" — its Strike card with the arrow
//   loaded (strike.ammo), one Strike at each creature targeted in the line (strike.volley.oneRoll, count null: as many as it holds), rolled at
//   the first, its natural 20 only that one's (oneRoll.naturalFirst: the others compared without it, scripts/strikes.js); every resistance 10
//   lower (strike.ignoreResistance types ["*"], the core's). Its 1d6 bleed is PF2e's own rule on the arrow (the damage roll's); the walls it
//   goes through and the bow's critical specialization only at the line's last square, lines of the card.
// Pure.

import { withTouchRetaliation } from "./touch-retaliation.js";

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const RECALL = /\bthat creature can immediately attempt a check to Recall Knowledge about any subject using a corresponding skill\b[^;.]*; they gain an? \+(\d+) (status|circumstance|item) bonus on this check\./i;
const THREE_USES = /\bcan be used (two|three|four|five) times before it loses its power\b/i;
const COUNT = { two: 2, three: 3, four: 4, five: 5 };
function withRecallBonus(plan, item, base) {
    if (plan) return plan;
    const text = plain(item?.system?.description?.value);
    const found = RECALL.exec(text);
    if (!found) return plan;
    const uses = THREE_USES.exec(text);
    const max = uses ? COUNT[uses[1].toLowerCase()] : null;
    const pf2eUses = Number(item?.system?.uses?.max) || 1;
    return {
        ...base(),
        builtin: "readied-bonus",
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: "touch", area: null },
        trigger: { event: "use" },
        bonus: {
            modifiers: [{ selector: "skill-check", type: found[2].toLowerCase(), value: Number(found[1]), predicate: ["action:recall-knowledge"] }],
            resistance: null,
            duration: { value: 0, unit: "rounds", expiry: "turn-end" },
            spend: ["skill-check"],
            recipient: "target"
        },
        notes: [
            "The creature touched rolls PF2e's own Recall Knowledge now, about any subject, with the skill that fits it: the bonus goes with that check.",
            ...(max && max > pf2eUses ? [`It's used ${max} times before it's a plain twig: PF2e's item counts ${pf2eUses}, so its user sets its uses to ${max}.`] : [])
        ]
    };
}

const BOTH_GAIN = /\bYou both gain the @UUID\[(Compendium\.pf2e\.actionspf2e\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\} (?:reaction|action)\./i;
const SECOND_DRINKER = /\bIf another willing creature consumes the remainder of the contents within (\d+) minutes?\b/i;
function withSharedReaction(plan, item) {
    const html = String(item?.system?.description?.value ?? "");
    const granted = BOTH_GAIN.exec(html);
    const row = plan?.resolution?.outcomes?.success;
    const notes = row?.noteEffects ?? [];
    if (!granted || !plan.noteOnly || !SECOND_DRINKER.test(plain(html)) || notes.length !== 1 || !notes[0].duration || (plan.unread ?? []).length || (plan.notes ?? []).length || (row.manualInstructions ?? []).length) return plan;
    // (Named for the action alone, as granted-action.js's: the ability module puts the item's name before it — 2026-10-27.)
    const note = { ...notes[0], label: granted[2], rules: [...(notes[0].rules ?? []), { key: "GrantItem", uuid: granted[1], allowDuplicate: false }] };
    delete note.reminder;
    const { noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        targeting: { target: "both drinkers", range: null, area: null },
        item: { ...plan.item, recipient: "targets" },
        notes: [`Target both drinkers: its user and the willing creature that drinks the rest within ${SECOND_DRINKER.exec(plain(html))[1]} minute — the minute runs from the second drink.`],
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [note] } } }
    };
}

// (Its own setup, its user's: "This set of reflective metal wires takes 10 minutes to properly tie …", "After this save, the metal strands
// tarnish and fall off …", "You can remove the bracelet with an Interact action, but …" — said again as the card's lines.)
const SETUP = [
    [/^This set of [\w ]+? takes (\d+) minutes to properly tie along the wrist\b[^.]*\.$/i, (minutes) => `Tying it on takes its user ${minutes} minutes, before the bonus is given.`],
    [/^After this save, the metal strands tarnish and fall off\b[^.]*\.$/i, () => "The save it's spent by leaves it tarnished: it falls off (and may show that a mind was tampered with)."],
    [/^You can remove the bracelet with an Interact action, but doing so breaks the bracelet's alignment and requires you to spend another (\d+) minutes\b[^.]*\.$/i, (minutes) => `Taken off with an Interact, it needs another ${minutes} minutes to tie on again.`]
];
function withSetupLines(plan) {
    if (plan?.builtin !== "readied-bonus" || !plan.partial || (plan.unread ?? []).length || !(plan.notes ?? []).length) return plan;
    const lines = plan.notes.map((note) => {
        for (const [pattern, line] of SETUP) {
            const found = pattern.exec(said(note));
            if (found) return line(...found.slice(1));
        }
        return null;
    });
    if (lines.some((line) => !line)) return plan;
    const { partial, ...rest } = plan;
    return { ...rest, notes: lines, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}

// A consumable's plan, the item and its base (a plan maker, for one nothing read) → the plan as these read it.
export function withSmallNeeds(plan, item, base) {
    return withSetupLines(withSharedReaction(withRecallBonus(plan, item, base), item));
}

const IGNORES = /\bThe shot ignores the first (\d+) resistance a creature has to ((?:[a-z]+ damage, )*[a-z]+ damage,? or [a-z]+(?: or [a-z]+)?) damage\./i;
const SHATTERS = /\bAgainst a construct or creature who already has a resistance bypassed by (\w+), or a weakness to \1, the shot [^.]*?\bOff-Guard for (\d+) (minutes?|rounds?) instead\./i;
const RESIST_TYPES = { all: "all-damage" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
function withAwakenedShot(plan, html) {
    if (!plan?.noteOnly || plan.item?.type !== "ammo") return plan;
    const text = plain(html);
    const ignores = IGNORES.exec(text);
    const shatters = SHATTERS.exec(text);
    if (!ignores || !shatters) return plan;
    const types = ignores[2].split(/,\s*(?:or\s+)?|\s+or\s+/).map((words) => words.replace(/\s*damage$/i, "").trim().toLowerCase()).filter(Boolean).map((type) => RESIST_TYPES[type] ?? type);
    const material = shatters[1].toLowerCase();
    const offGuard = { kind: "condition", slug: "off-guard", value: null, duration: { mode: "fixed", value: Number(shatters[2]), unit: /^min/i.test(shatters[3]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" } };
    const hit = ["success", "criticalSuccess"];
    const { noteOnly, resolution, ...rest } = plan;
    return {
        ...rest,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: hit, cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: {
            range: "ranged", save: null, ammo: true, notes: [],
            ignoreResistance: { value: Number(ignores[1]), types },
            lines: [
                `Its damage counts the target's ${types.slice(0, -1).join(", ")} or ${types.at(-1)} resistance as ${ignores[1]} lower (the resolution core).`,
                `A construct, or a creature ${material} gets past (a weakness to it, or a resistance it's an exception to), is Off-Guard for ${shatters[2]} ${Number(shatters[2]) === 1 ? offGuard.duration.unit.replace(/s$/, "") : offGuard.duration.unit} on a hit instead.`,
                ...(/\bthis version of awakened metal shot is uncommon\b/i.test(text) ? ["It's uncommon, as adamantine is."] : [])
            ]
        },
        ifTarget: [...hit.map((degree) => ({ material, degree, effects: [offGuard] })), ...hit.map((degree) => ({ traits: ["construct"], degree, effects: [offGuard] }))]
    };
}

const LINE_STRIKE = [
    /^This ammunition has a slender shape and a viciously pointed tip\.$/,
    /^When you activate and shoot [\w' -]+?, the Strike takes the shape of a @Template\[(?:type:)?line\|distance:(\d+)\] originating from you\.$/,
    /^Roll one attack roll and compare the result to the AC of each target in the line\.$/,
    /^The ammunition ignores up to (\d+) of a target's resistance, and it can penetrate walls up to (\d+) foot thick with Hardness (\d+) or less\.$/,
    /^Each target that takes damage from this ammunition also takes @Damage\[(\d+d\d+)\[bleed\]\]\.$/,
    /^If your attack roll result is a natural 20, you improve your degree of success only against the first target in the line, but you can still score a critical hit on other targets if your result exceeds their AC by 10 or more\.$/,
    /^If you have access to your bow's critical specialization effect, [\w' -]+? applies that effect only against a target in the last square of the line\.$/
];
function withLineStrike(plan, html) {
    if (plan?.builtin !== "pf2e-rules" || plan.item?.type !== "ammo" || !(plan.rules ?? []).includes("DamageDice")) return plan;
    const sentences = plain(html).replace(/^Activate\b.*?\)\s*/, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    if (sentences.length !== LINE_STRIKE.length || !LINE_STRIKE.every((pattern, at) => pattern.test(sentences[at]))) return plan;
    const [, line, , ignores, bleed] = LINE_STRIKE.map((pattern, at) => pattern.exec(sentences[at]));
    const { builtin, rules, notes, partial, ...rest } = plan;
    const hit = ["success", "criticalSuccess"];
    return {
        ...rest,
        automation: { level: "automatic" },
        targeting: { target: `each creature in the ${line[1]}-foot line`, range: null, area: { type: "line", value: Number(line[1]) } },
        trigger: { event: "strike", on: hit, cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: {
            range: "ranged", save: null, ammo: true, notes: [],
            ignoreResistance: { value: Number(ignores[1]), types: ["*"] },
            volley: { each: "creature", area: `${line[1]}-foot line`, oneRoll: { count: null, naturalFirst: true } },
            lines: [
                `Its ${line[1]}-foot line from its user: roll the Strike at the first creature in it.`,
                `A natural 20 raises the degree only against that first one; the others are critical hits only at 10 or more over their AC (the card compares them so).`,
                `Its damage counts each of a target's resistances as ${ignores[1]} lower (the resolution core).`,
                `PF2e's own rule on it adds ${bleed[1]} bleed to the damage at each one it hits.`,
                `It passes through walls up to ${ignores[2]} foot thick with Hardness ${ignores[3]} or less (the map's).`,
                "The bow's critical specialization effect, its user's if they have it, only at the creature in the line's last square."
            ]
        }
    };
}

// An activation's plan and its html → the plan as these read it.
export function withActivationNeeds(plan, html) {
    return withLineStrike(withAwakenedShot(withTouchRetaliation(plan, html), html), html);
}
