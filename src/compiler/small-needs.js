// The small needs' readings of 2026-10-27 (docs/needs.md: information, lasting effects, triggers), run last on a consumable's plan
// (src/compiler/index.js), each returning the plan as it was when it isn't its item's:
// - A bonus to one Recall Knowledge check: Twig of Knowledge and Memory's "When pressed to the temple or lips of a sentient creature, that
//   creature can immediately attempt a check to Recall Knowledge about any subject using a corresponding skill …; they gain a +1 status bonus
//   on this check." The fortune card's readied bonus (builtin "readied-bonus", src/live/fortune-card.js) for the creature its user targets: an
//   Effect with PF2e's FlatModifier to skill checks predicated on action:recall-knowledge, to the end of the turn, spent by that check
//   (scripts/fortune.js). The check is the creature's own PF2e Recall Knowledge, and what it learns PF2e's secret roll and the GM's.
// - A reaction for two: Potion of Shared Life's "If another willing creature consumes the remainder of the contents within 1 minute, your
//   vitalities become linked for 1 minute … You both gain the @UUID[…]{Share Life} reaction." Its note Effect for the minute grants PF2e's
//   own action (GrantItem, as src/compiler/granted-action.js does for one drinker), given to each creature its user targets (item.recipient
//   "targets"): both drinkers.
// - A readied bonus's own setup: Psychic Warding Bracelet's 10 minutes to tie on, its strands falling off after the save it's spent by, and
//   untying it with an Interact — its user's own time and hands, lines of the fortune card (which shows plan.notes).
// Pure.

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
    const note = { ...notes[0], label: `${plan.source?.name ?? "Item"}: ${granted[2]}`, rules: [...(notes[0].rules ?? []), { key: "GrantItem", uuid: granted[1], allowDuplicate: false }] };
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
