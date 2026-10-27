// What holds a creature or a way in place, and what its user's own moves on the map ride on (2026-10-27, docs/needs.md "Moving creatures and
// the user"): rules no PF2e rule plays, words on its user's note Effect for their time (the user's ruling 1), and the map's or its user's own
// lines of the card (ruling 2).
//   MAGNETIZED  Magnetizing's "If you or the target attempt to move away from one another, treat each square as difficult terrain … This effect
//               ends once either of you is no longer adjacent to the other at the end of an action": words on its user's Effect; whether a creature
//               partly of metal counts, the GM's, a line.
//   ANCHORED    Immovable Arm's "anchoring your prosthetic arm in place … the arm can be moved only if 8,000 pounds of pressure is placed upon it or
//               if a creature succeeds at a DC 40 Athletics check to Force Open your arm": words on its user's Effect until the button's pressed
//               again (a line).
//   DOOR        Warding Escutcheon's "The shield becomes a locked door in an empty, adjacent space … The door has the same Hardness, HP, and Broken
//               Threshold as the shield, with DC 25 Athletics and Thievery checks to open. The door remains in place for 1 hour …": words on its
//               user's Effect for the hour, the shield's numbers from its text; the door drawn on the map a line.
//   STONES      Stepping Stone Shot's line of stone discs "that creatures can walk on as if solid ground": lines of the card, the map's.
//   BALANCE     Oil of Skating's "treat the results of any Acrobatics checks made to Balance as one degree worse": PF2e's AdjustDegreeOfSuccess
//               on its Balance (item.ruleEffects), the bonus lost on rough ground and uphill's difficult terrain the words its reminder holds.
//   HOOVES      Guangu of the Steppe's Hammer of Hooves, "mounted allies within a 60-foot emanation gain a +10-foot status bonus to their mount's
//               Speeds. They also gain a +1 status bonus to Nature checks to Command an Animal …" with PF2e's two Effects: the ways card, its
//               riders' Effect (10 minutes, not PF2e's unlimited) and their mounts' (Mount Speed), each at the creatures its presser targets; the
//               automatic success a line. Pure.

const plainOf = (html) => String(html ?? "").replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/g, (_all, skill, dc) => `DC ${dc} ${skill.charAt(0).toUpperCase()}${skill.slice(1)}`).replace(/@Template\[[^\]]*?distance:(\d+)[^\]]*\](?:\{[^}]*\})?/g, "$1-foot emanation").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const HOUR = { mode: "fixed", value: 1, unit: "hours", expiry: "turn-start", anchor: "effect-start" };
const bodyOf = (html) => SENTENCES(plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
// (A card of its own: its user's note Effect, or nothing to apply, and its lines.)
const card = (base, { note = null, notes = [] } = {}) => ({ ...base, builtin: undefined, noteOnly: undefined, partial: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(note ? { noteEffects: [note] } : {}) } } }, ...(notes.length ? { notes } : {}) });
const all = (sentences, patterns) => sentences.length === patterns.length && patterns.every((pattern, index) => pattern.test(sentences[index]));

const MAGNETIZED = [/^You magnetize your armor\.$/i, /^If you or the target attempt to move away from one another, treat each square as difficult terrain\.$/i, /^This doesn't affect movement that keeps you the same distance from one another, so you could still Step if you remained adjacent to the target\.$/i, /^This effect ends once either of you is no longer adjacent to the other at the end of an action\.$/i, /^This Activation might work on some creatures partially made of metal, such as those with metal scales, as determined by the GM\.$/i, /^Likewise, the GM might determine some metal creatures are non-magnetic, depending on the metal they're made of\.$/i];
const ANCHORED = [/^You curl your fingers inward to press the button on the heel of your hand, anchoring your prosthetic arm in place\.$/i, /^Your arm no longer moves, defying gravity if necessary\.$/i, /^You can still move the fingers of this hand and your elbow, shoulder, and rest of your body while the magic is in effect, but you can't move your wrist\.$/i, /^If you press the button again, the rod inside your arm is deactivated, ending the magic that anchors it in place\.$/i, /^While anchored, the arm can be moved only if ([\d,]+) pounds of pressure is placed upon it or if a creature succeeds at a DC (\d+) Athletics check to Force Open your arm\.$/i, /^A creature can notice the button hidden in the hand of the prosthesis with a successful DC (\d+) Perception check to Seek\.$/i];
const DOOR = [/^The shield becomes a locked door in an empty, adjacent space no wider than 5 feet, becoming flush with the surrounding structure so it blocks all passage\.$/i, /^The door has the same Hardness, HP, and Broken Threshold as the shield, with DC (\d+) Athletics and DC (\d+) Thievery to open\.+$/i, /^The door remains in place for 1 hour, until it's opened or broken, or until you spend an action to end this effect, at which point the shield returns to your hand \(or falls to the ground in your space if your hands are full\)\.$/i];
const STONES = [/^When you fire an activated stepping stone shot, whether you hit or miss your target, the shot creates a series of supports in a line that creatures can walk on as if solid ground\.$/i, /^The line can ascend or descend at a 45-degree angle\.$/i, /^The discs support any amount of weight, but don't otherwise pose any sort of obstacle; creatures and attacks can move through them if they wish\.$/i, /^They crumble to dust if anything attempts to move or otherwise manipulate them\.$/i, /^A creature can use a two-action activity, which has the manipulate trait, to Stride up to its speed on the stones while causing them to crumble behind it\.$/i, /^This ammunition does not work in firearms with the scatter trait\.$/i, /^The maximum length of the line depends on the type of ammunition\.$/i, /^However, the line also can't extend beyond the maximum distance for a Strike from your firearm \(usually six times the firearm's range increment\)\.$/i, /^The stones reach up to (\d+) feet, and they last up to (the end of your next turn|1 minute) if no one collapses them\.$/i];
// (Its flavor first, a consumable's or an ammunition's opening: "A series of small stone discs pressed into a single round make up this ammunition.")
const FLAVOR = /^(?:Ammunition \w+ )?(?:Activate [^.]*?\)\s*)?A series of small stone discs pressed into a single round make up this ammunition\.$/i;

// The activation's html, its base, the item → its card, or null.
export function movingNotesPlan(html, base, item = null) {
    const sentences = bodyOf(html).filter((sentence) => !FLAVOR.test(sentence));
    if (all(sentences, MAGNETIZED)) {
        return card(base, { note: { label: "Magnetized", text: "Its armor is magnetized to the adjacent metal creature (or one in metal armor) it picked: while it or that creature moves away from the other, each square is difficult terrain — not a move that keeps them as far apart, a Step that stays beside it. It ends once they're no longer adjacent at the end of an action.", duration: null }, notes: ["The GM decides whether a creature partly of metal (metal scales) counts, and whether a metal creature is non-magnetic."] });
    }
    if (all(sentences, ANCHORED)) {
        const [, , , , moved, seek] = ANCHORED.map((pattern, index) => pattern.exec(sentences[index]));
        return card(base, { note: { label: "Anchored arm", text: `Its prosthetic arm is anchored in place, defying gravity: its fingers, elbow, shoulder and body still move, its wrist doesn't. Only ${moved[1]} pounds of pressure or a DC ${moved[2]} Athletics check to Force Open it moves the arm; a DC ${seek[1]} Perception check to Seek notices the button.`, duration: null }, notes: ["Pressing the button again ends it: remove the Effect."] });
    }
    if (all(sentences, DOOR)) {
        const dcs = DOOR[1].exec(sentences[1]);
        const shield = /\(Hardness (\d+), HP (\d+), BT (\d+)\)/i.exec(plainOf(item?.system?.description?.value));
        const stats = shield ? `Hardness ${shield[1]}, HP ${shield[2]}, BT ${shield[3]}` : "the shield's Hardness, HP and BT";
        return card(base, { note: { label: "Warding door", text: `Its shield is a locked door in an empty adjacent space no wider than 5 feet, flush with what's around it and blocking all passage: ${stats}; a DC ${dcs[1]} Athletics check to Force Open or DC ${dcs[2]} Thievery to Pick the Lock opens it. For 1 hour, until it's opened or broken, or until its user spends an action to end it: then the shield is back in its user's hand (or on the ground in its space if its hands are full).`, duration: HOUR }, notes: ["Draw the locked door in that space on the map (the shield's numbers on it)."] });
    }
    if (all(sentences, STONES)) {
        const [, feet, lasts] = STONES.at(-1).exec(sentences.at(-1));
        return card(base, { notes: [`Fired, hit or miss, it leaves a line of stone discs up to ${feet} feet long (never past its firearm's farthest Strike), up or down at up to 45 degrees: creatures walk on them as on solid ground, and creatures and attacks pass through them; anything that moves or handles them crumbles them, and a creature can Stride up to its Speed on them as a 2-action manipulate activity, crumbling them behind it. They last until ${/^the end/i.test(lasts) ? "the end of its user's next turn" : "1 minute"} unless collapsed (the map's). Not in a firearm with the scatter trait.`] });
    }
    return null;
}

// Oil of Skating's Balance one degree worse, beside its Speed bonus: PF2e's rule on its user's Effect for the hour, the unread sentences gone
// — their terrain words on its reminder already.
const LOSE = /^You lose this bonus if moving on difficult terrain, greater difficult terrain, or uneven ground\.$/i;
const UPHILL = /^Also, you treat any uphill movement as moving on difficult terrain while your feet are oiled and treat the results of any Acrobatics checks made to Balance as one degree worse\.$/i;
export function withOiledFeet(plan) {
    const unread = plan?.unread ?? [];
    const row = plan?.resolution?.outcomes?.success;
    if (!unread.some((sentence) => UPHILL.test(String(sentence).trim())) || !(row?.noteEffects ?? []).some((note) => note.reminder)) return plan;
    const time = (row.modifiers ?? []).find((modifier) => modifier.duration)?.duration ?? HOUR;
    const worse = "one-degree-worse";
    const balance = { name: "oiled feet", words: "Its Speed bonus doubles downhill and is lost on difficult or greater difficult terrain and uneven ground; uphill is difficult terrain for it; its Balance results are one degree worse", rules: [{ key: "AdjustDegreeOfSuccess", selector: "acrobatics", predicate: ["action:balance"], adjustment: { criticalSuccess: worse, success: worse, failure: worse } }], duration: time };
    const left = unread.filter((sentence) => !UPHILL.test(String(sentence).trim()) && !LOSE.test(String(sentence).trim()));
    const next = { ...plan, unread: left.length ? left : undefined, ruleEffects: [...(plan.ruleEffects ?? []), balance] };
    if (next.partial && !left.length && !(plan.notes ?? []).length && !(row.manualInstructions ?? []).length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// Guangu of the Steppe's Hammer of Hooves: the ways card's two Effects, each at the creatures its presser targets. own: the activation's
// { index, name, time, frequency, trigger }; level and type the item's.
const HOOVES = [/^You hammer a thundering beat on the [\w' -]+?\.$/i, /^For (\d+) minutes, mounted allies within a (\d+)-foot emanation gain a \+(\d+)-foot status bonus to their mount's Speeds\.$/i, /^They also gain a \+(\d+) status bonus to Nature checks to Command an Animal and automatically succeed when they Command an Animal they're mounted on to take a move action \(such as Stride\)\.$/i];
const EFFECT_LINKS = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}/g;
export function hoovesPlan(html, base, { own = null, level = 0, type = null } = {}) {
    const sentences = bodyOf(html).filter((sentence) => !/^Effect: /.test(sentence));
    if (!all(sentences, HOOVES)) return null;
    const links = [...String(html ?? "").matchAll(EFFECT_LINKS)].map(([, uuid, label]) => ({ uuid, label }));
    const riders = links.find((link) => !/\(Mount Speed\)$/.test(link.label));
    const mounts = links.find((link) => /\(Mount Speed\)$/.test(link.label));
    if (!riders || !mounts) return null;
    const [, time, radius, feet] = HOOVES[1].exec(sentences[1]);
    const bonus = HOOVES[2].exec(sentences[2])[1];
    const duration = { value: Number(time), unit: "minutes" };
    const way = (name, link, notes) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...base, automation: { level: "automatic" }, targeting: { target: "creatures you target", range: null, area: { type: "emanation", value: Number(radius) } }, trigger: { event: "use" }, resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: link.uuid, label: link.label, recipients: "targets", duration }] }, ...(notes.length ? { notes } : {}), item: { type, level, recipient: "targets", activation: own, links: 1 } } });
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways: [
        way(`Its mounted allies within ${radius} feet: +${bonus} to Command an Animal`, riders, [`When one Commands an Animal it's mounted on to take a move action (such as Stride), it succeeds automatically (its own roll).`, `For ${time} minutes; then use the card's other way for their mounts.`]),
        way(`Their mounts: +${feet} feet to their Speeds`, mounts, [`For ${time} minutes: the mounts of the allies it helped.`])
    ] };
}
