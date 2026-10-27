// What an item does that's the table's, as lines of its card or words on its Effect (2026-10-27, docs/needs.md), for items nothing read:
// - Ghost Courier Fulu: a dictated message that "arriv[es] at the assigned ghost delivery fulu in 2d10 hours, provided that fulu is within 500
//   miles" — a message (the user's ruling for speech) and a journey's hours (out of combat), lines of its card.
// - Obfuscation Oil: "spread this blue-gray gel on a single item with a Bulk of 3 or less … It becomes immune to divination magic of 8th rank
//   or lower" — an object's immunity, kept by the GM: lines of its card.
// - Spiritsight Crossbow's Ethereal Vision: "imprecise vision onto the Ethereal Plane with a range of 60 feet … until the end of your turn" —
//   no PF2e sense sees the Ethereal Plane: words on its user's Effect to the end of the turn (item.ruleEffects, as water breathing's).
// - Holy Steam Ball's first "Activate 1 (manipulate)": its description under a repeated Activate line, the item's use the activation after it —
//   a line saying so, and its refill before the next use.
// base(): the plan's base and item part, for one nothing read. Pure.

const flat = (html) => String(html ?? "").replace(/\[\[\/\w+ [^\]]*\]\]\{([^}]*)\}/g, "$1").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const lined = (base, notes, extra = {}) => ({ ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes, ...extra, item: { ...(base.item ?? {}), ...(extra.item ?? {}) } });

const COURIER = /\bWhen you Activate this fulu, you dictate a message up to (\d+) words long that then magically appears on the paper in the language you spoke\. The fulu then disappears into the Ethereal Plane, arriving at the assigned ghost delivery fulu in (\d+d\d+ hours), provided that fulu is within (\d+) miles\. There, the fulu's magic dissipates, but the message remains\. If the fulu takes any damage in transit, it has a 50% chance to drop back into the Universe, intact but bereft of magic\.$/;
const WARDED = /\bYou can spread this blue-gray gel on a single item with a Bulk of (\d+) or less to ward it against magical detection\. It becomes immune to divination magic of (\d+)(?:st|nd|rd|th) rank or lower \(such as Locate\)\. This oil is permanent, but it can be removed with acid\. Removing the oil in this way usually takes 1 minute for objects with Bulk of 1 or less, or a number of minutes equal to the item's Bulk\.$/;

// A consumable's plan, the item and its base → the plan of its card's lines, or the same plan.
export function withTableLines(plan, item, base) {
    if (plan) return plan;
    const text = flat(item?.system?.description?.value);
    const courier = COURIER.exec(text);
    if (courier) {
        const [, words, hours, miles] = courier;
        return lined(base(), [
            `You dictate a message of up to ${words} words, which appears on the fulu in the language you spoke.`,
            `The fulu vanishes into the Ethereal Plane and arrives at its ghost delivery fulu in ${hours} (the GM rolls), if that fulu is within ${miles} miles; the message stays there once its magic is gone.`,
            "If it takes any damage on the way, a 50% chance it drops back into the Universe, intact but no longer magical (the GM's)."
        ]);
    }
    const warded = WARDED.exec(text);
    if (warded) {
        const [, bulk, rank] = warded;
        return lined(base(), [
            `Spread on one item of ${bulk} Bulk or less, that item is immune to divination magic of rank ${rank} or lower (such as Locate), for good (the GM's to keep).`,
            "Acid removes it: 1 minute for an item of 1 Bulk or less, else a minute for each Bulk."
        ]);
    }
    return plan;
}

const ETHEREAL = /^You aim through the crossbow's crystalline lenses, gaining imprecise vision onto the Ethereal Plane with a range of (\d+) feet in addition to your normal senses until the end of your turn\. You can sense through objects in the Universe this way, and the sense is precise for detecting creatures\. Because this sense detects spiritual energy, a creature that's immune to spirit can't be detected in this way\.$/;
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const HEADED = /<strong>\s*(?:Effect|Trigger|Requirements?|Frequency)\s*<\/strong>/i;

// An activation's plan, its entry ({ activation }), the item and its base → the plan of its Effect's words or card's lines, or the same plan.
export function withActivationLines(plan, { activation } = {}, item, base) {
    if (plan) return plan;
    const html = String(activation?.html ?? "");
    const effect = /<strong>\s*Effect\s*<\/strong>([\s\S]*)$/i.exec(html);
    const ethereal = effect ? ETHEREAL.exec(flat(effect[1])) : null;
    if (ethereal) {
        return lined(base(), [], { item: { ruleEffects: [{ name: "ethereal vision", words: `Imprecise vision onto the Ethereal Plane within ${ethereal[1]} feet, beside its normal senses, through objects in the Universe, and precise for detecting creatures (not one immune to spirit)`, rules: [], duration: THIS_TURN }] } });
    }
    // (The item's description under an Activate line its next activation repeats, with that one's Effect: Holy Steam Ball's.)
    const whole = String(item?.system?.description?.value ?? "");
    const HEAD = /^\s*(?:<p>\s*)?<strong>\s*Activate\s*<\/strong>[^<]*(?:<span class="action-glyph">[^<]*<\/span>)?[^<]*<\/p>/i;
    const head = HEAD.exec(html)?.[0];
    const at = head ? whole.indexOf(html) : -1;
    const after = at >= 0 ? whole.slice(at + html.length).replace(/^\s*<strong>/i, "<p><strong>") : "";
    const next = HEAD.exec(after.replace(/^\s*<p>/i, ""))?.[0];
    if (head && next && flat(head) === flat(next) && !HEADED.test(html) && HEADED.test(after)) {
        const refill = /\bAfter using an? [\w ]+?, you must refill it before the next use in a process that takes (\w+) minutes to complete\./i.exec(flat(html));
        return lined(base(), [
            "This is the item's description, under its Activate line again: its use is the activation after it.",
            ...(refill ? [`After each use, refill it before the next (${refill[1]} minutes, its user's to do).`] : [])
        ]);
    }
    return plan;
}

// (Cloth of Nullification's Nullify Magic and Rod of Cancellation: the counteract card's row for "the magical effect or item", and what its
// text says after the check — deactivated "for the same amount of time" as the item's own wait, its magic drained for good instead, most
// artifacts beyond it, the Sphere of Annihilation's explosion — the GM's at the table, as a free counteract's end is: lines of its card,
// each the GM's call. Its wait is its recharge already, src/compiler/cooldown.js.)
const NULLIFY = [
    /\bOn a success, the effect or item is deactivated for the same amount of time, and its duration, if any, continues to expire during that time\./,
    /\bWith a successful counteract check, you can instead choose to completely absorb the magic from the effect or item into the [\w ]+?\. If you do, both become completely non-magical and their magic can't be recovered, even by the remake spell\./,
    /\bIf you choose, you can instead completely drain the [\w ]+?'s magic on a success in order to completely drain the magic from the effect or item\. If you do, both become completely non-magical and their magic can't be recovered, even by the Remake spell\./,
    /\bThe [\w ]+? automatically fails to counteract most artifacts and similarly powerful items(?:, but it reacts explosively when activated against a Sphere of Annihilation without a counteract check)?\.?/
];
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
export function withNullifyLines(plan, html) {
    const counteract = plan?.item?.counteract;
    if (plan?.builtin !== "counteract" || counteract?.free?.name !== "the magical effect or item") return plan;
    const text = flat(html);
    const lines = NULLIFY.map((words) => words.exec(text)?.[0]).filter(Boolean).map((line) => `${line.replace(/\.$/, "")} (the GM's call).`);
    if (lines.length < 2) return plan;
    // (Its notes those lines now, with its wait gone — the recharge's — and its modifier's line kept.)
    const kept = (counteract.notes ?? []).filter((note) => /^Its counteract modifier \+\d+: .*\(the GM's call\)\.$/.test(said(note)));
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length;
    return { ...plan, item: { ...plan.item, counteract: { ...counteract, notes: [...kept, ...lines] } }, ...(plan.partial && !left && plan.trigger?.recharge ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// (Flying Broomstick's Lift Off: "You name a destination on the same plane, and the broom speeds toward it at a fly Speed of 40 feet …" — the
// broom's own journey with its rider carried or none, lasting up to 4 hours (16 miles), then its hour's wait from when it lands: travel off the
// map, lines of its card; the wait starts when it ends, which the item's recharge can't hold (src/compiler/cooldown.js), the GM's to keep.)
const BROOM = /^You name a destination on the same plane, and the broom speeds toward it at a fly Speed of (\d+) feet\. You must either clutch the broom with two hands in order to ride it, or you need to release the broom to send it off with no rider\. If you don't have a good idea of the location, layout, and general direction of the destination, or if your named destination is on another plane, the broom wanders aimlessly, circling back to its starting location after (\d+) minutes\. If the broom carries a rider, this activation lasts until (\d+) hours pass \(typically (\d+) miles of travel\), the broom reaches its destination, or you Dismiss the activation\. If the broom doesn't have a rider, the activation lasts until the broom reaches its destination\. When the activation ends, the broom floats to the ground and can't be activated again for (\d+) hours?\.$/;
export function withBroomFlight(plan, html) {
    const effect = /<strong>\s*Effect\s*<\/strong>([\s\S]*)$/i.exec(String(html ?? ""));
    const read = effect && plan?.noteOnly ? BROOM.exec(flat(effect[1])) : null;
    if (!read) return plan;
    const [, speed, wander, hours, miles, wait] = read;
    return {
        ...lined({ ...plan, noteOnly: undefined }, [
            `Name a destination on the same plane: the broom flies toward it at a fly Speed of ${speed} feet, its rider clutching it with two hands, or sent off with none.`,
            `Without a good idea of the destination's location, layout and direction, or with one on another plane, it wanders and circles back to where it started after ${wander} minutes.`,
            `With a rider it lasts until ${hours} hours pass (about ${miles} miles), it arrives, or you Dismiss it; with none, until it arrives.`,
            `Then it floats to the ground and can't be activated again for ${wait} hour${Number(wait) === 1 ? "" : "s"} (the GM's to keep, from when it lands).`
        ]),
        trigger: plan.trigger
    };
}

// (Hodag Leather's Hodag Toss, a one-off (src/compiler/one-offs.js): its card's lines all of what its rows don't play — the Stride and Strike
// before the check, the throw's 10 feet and its collision, the toss straight up — in place of the two the reader left, which said neither.)
const TOSS = /^You Stride up to your Speed and make a Strike at the end of your movement\. If you succeed at your Strike, attempt an @Check\[athletics\|defense:fortitude\] check against the creature's Fortitude DC\. On a success, the creature is thrown (\d+) feet in a straight line in the direction of your choice and lands Prone\. If the creature is knocked into a solid object, it takes @Damage\[(\d+d\d+)\[bludgeoning\]\] damage before landing prone\. You can instead toss the creature straight up into the air\. The creature lands in the same square it occupied, and takes \d+d\d+ bludgeoning damage as it lands prone\./;
export function withTossLines(plan, html) {
    const effect = /<strong>\s*Effect\s*<\/strong>([\s\S]*)$/i.exec(String(html ?? ""));
    const read = effect && plan?.decided === "one-off" ? TOSS.exec(String(effect[1]).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : null;
    if (!read) return plan;
    const [, feet, damage] = read;
    return {
        ...plan,
        notes: [
            "Then Stride up to its Speed and make a Strike at the end of that movement (its own actions); only after a hit, the Athletics check.",
            `On a success, either: it's thrown ${feet} feet in a straight line its user picks, and lands Prone (move it by hand), taking ${damage} bludgeoning damage first if knocked into a solid object (roll it by hand); or it's tossed straight up and lands in its own square, taking ${damage} bludgeoning damage (roll it by hand) as it lands Prone.`
        ]
    };
}
