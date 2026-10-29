// A third-party alchemical plant used as part of its user's own action (2026-10-28, docs/needs.md "actions"), its leftover words read here:
// - Ravenous Flytrap (Lesser): its Grapple at the plant's Athletics modifier when that's higher (the item-action card's action.minimum, read
//   by src/compiler/item-actions.js). What's left is its user's to do — Grappling with it again until the end of their next turn, Releasing
//   it to anchor the creature at a lower Escape DC — and the Escape DC it gives (10 + its modifier, if higher than its user's): the action
//   card's lines (action.after), in our words, done.
// - Conker Flail (Lesser), which nothing read: its Force Open at the chestnut's Athletics modifier when higher (the same card), and its
//   user's Effect until the end of their next turn (plan.userEffects kind "rules"): no penalty for lacking a crowbar (PF2e's AdjustModifier
//   on the no-crowbar modifier, as the module's own Effect for the higher grades has it), the flail as a simple flail-group Strike for an
//   object (PF2e's Strike rule, its piercing die and the razing trait), and the chestnut's detonation a toggle on that Effect giving +2
//   circumstance to the Force Open or the attack roll (after which the flail is gone: its Effect removed, a line). Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const NEXT_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const done = (plan) => {
    const next = { ...plan, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    return next;
};

// (The flytrap's two sentences after its Grapple: again until the end of the next turn, and its Release.)
const AGAIN = /^You can continue to Grapple\s+using the flytrap until the end\s+of your next turn\.$/;
const RELEASE = /^You can Release the flytrap without\s+ending your Grapple, reducing the DC\s+to Escape the Grapple by (\d+) and\s+anchoring the target\b[^.]*\bwithers and dies\.$/;
function withFlytrap(plan) {
    const action = plan?.action;
    if (plan?.builtin !== "item-action" || !plan.partial || action?.slug !== "grapple" || !action.minimum || action.within) return plan;
    const sentences = sentencesOf(action.after);
    const release = sentences.map((sentence) => RELEASE.exec(sentence)).find(Boolean);
    if (sentences.length !== 2 || !sentences.some((sentence) => AGAIN.test(sentence)) || !release) return plan;
    const dc = 10 + Number(action.minimum.value);
    const after = [
        `Its Escape DC is at least ${dc} (the flytrap's Athletics DC, when it's higher than its user's).`,
        "Until the end of its user's next turn they can Grapple with the flytrap again, at its modifier.",
        `Released without ending the Grapple, the flytrap anchors the creature where it is and its Escape DC is ${release[1]} lower; once the creature is free, the plant withers.`
    ].join(" ");
    return done({ ...plan, action: { ...action, after } });
}

// (The flail's words, each one read: every sentence of its Effect must be one of these.)
const CONKER = {
    look: /^A thorny shell grows around\b[^.]*\.$/,
    uses: /^You can Activate the item as part\s+of your attempt to Force Open or\s+to make a Strike against an object\.$/,
    again: /^You can continue to use a\s+[\w' -]+? to take these actions\s+until the end of your next turn\.$/,
    modifier: /^When you attempt to Force Open\s+with a [\w' -]+?, you can use a\s+\+(\d+) Athletics modifier instead of\s+your Athletics modifier if it is\s+higher than your own\.$/,
    tools: /^You do not take penalties\s+to checks to Force Open\s+for not having the appropriate tools\b[^.]*\.$/,
    weapon: /^When used to make a Strike\s+against an object, the [\w' -]+? is treated as a\s+(simple|martial) weapon in the (\w+) group\s+that deals (\d+)d(\d+) (piercing|bludgeoning|slashing)(?: damage)?\b[^.]*?(?:and has the (\w+) trait)?\.$/,
    detonate: /^You can choose to cause the\s+chestnut to detonate when you\s+Force Open or Strike, giving\s+yourself an? \+(\d+) (circumstance|status|item) bonus\b[^.]*\.$/,
    gone: /^After the chestnut is detonated,\s+the [\w' -]+? deteriorates immediately\.$/
};
function withConker(plan, { kind, text, base, info, item }) {
    if (kind !== "consumable" || plan || !/^\s*Activate\s+(?:\[\w+\]\s*)?Force Open or (?:\[\w+\]\s*)?Strike\b/.test(text)) return plan;
    const body = String(text).replace(/^\s*Activate\s+(?:\[\w+\]\s*)?Force Open or (?:\[\w+\]\s*)?Strike\s*/, "").replace(/\s*Craft Requirements\b.*$/s, "");
    const found = {};
    for (const sentence of sentencesOf(body)) {
        const entry = Object.entries(CONKER).find(([, pattern]) => pattern.test(sentence));
        if (!entry) return plan;
        found[entry[0]] = entry[1].exec(sentence);
    }
    if (!found.uses || !found.modifier || !found.tools || !found.weapon || !found.detonate) return plan;
    const [, category, group, dice, die, type, trait] = found.weapon;
    const toggle = "conker-flail-detonated";
    const bonus = { value: Number(found.detonate[1]), type: found.detonate[2].toLowerCase() };
    const name = item?.name ?? "Conker flail";
    const rules = [
        { key: "AdjustModifier", selector: "athletics", slug: "no-crowbar", suppress: true, predicate: ["action:force-open"] },
        { key: "Strike", label: name, slug: "conker-flail", category, group, damage: { base: { damageType: type, dice: Number(dice), die: `d${die}` } }, traits: trait ? [trait] : [] },
        { key: "RollOption", domain: "all", option: toggle, toggleable: true, label: "Detonate the chestnut" },
        { key: "FlatModifier", selector: "athletics", type: bonus.type, value: bonus.value, label: "Detonated chestnut", predicate: [toggle, "action:force-open"] },
        { key: "FlatModifier", selector: "strike-attack-roll", type: bonus.type, value: bonus.value, label: "Detonated chestnut", predicate: [toggle, "item:slug:conker-flail"] }
    ];
    return {
        ...base,
        builtin: "item-action",
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        action: {
            slug: "force-open",
            name: "Force Open",
            bonus: null,
            minimum: { value: Number(found.modifier[1]), skill: "athletics" },
            targeted: false,
            after: `Until the end of its user's next turn its Effect takes off the penalty for lacking a crowbar and gives the flail's Strike against an object (${dice}d${die} ${type}${trait ? `, ${trait}` : ""}). Its toggle "Detonate the chestnut" gives +${bonus.value} ${bonus.type} to that Force Open or attack roll; then the flail is gone (remove its Effect).`
        },
        userEffects: [{ kind: "rules", name, words: `Conker flail in hand until the end of the next turn`, rules, duration: NEXT_TURN }],
        item: { ...(info ?? {}) }
    };
}

export function withPlantActions(plan, context) {
    if (context.kind !== "consumable") return plan;
    return withConker(withFlytrap(plan), context);
}
