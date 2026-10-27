// Floating off the ground for a while (2026-10-27, docs/needs.md). PF2e has no rule for hovering or for being carried up by a balloon, so each is
// words on an Effect for its time (the user's note-Effect rule), with the one rule PF2e has:
// - Hovering Potion's "You can instead Climb at your full Speed" is a climb Speed equal to its drinker's Speed (PF2e's BaseSpeed, plan.item.speeds)
//   for the 5 minutes, its floating, its Strides up, down and along a ceiling, and its Arrest a Fall the words on that Effect;
// - Feather Token (Balloon)'s balloon carries the creatures holding its handles up 20 feet a round for 3 rounds after the first, floats 2 and comes
//   down again: a note Effect on up to two of them (the presser's targets) for those 9 rounds, the rounds in its words, each token's elevation
//   its user's to set as it goes;
// - Balloon Padding's Inflate lifts its wearer 5 feet off the ground until it's deflated: a note Effect with no end of its own (its 10 minutes to
//   deflate its user's, who removes it then), its height changes, the balloon's AC and Hardness, and the fall when it's damaged in its words.
// Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const LAND = "@actor.system.movement.speeds.land.value";
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const rounds = (value) => ({ mode: "fixed", value, unit: "rounds", expiry: "turn-start", anchor: "effect-start" });
const row = (noteEffects) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects });

const HOVERING = /\bhovering potion enables you to defy gravity for (\d+) minutes\. By default, the potion causes you to float several inches off the ground\. If you take a Stride action, you can move (\d+) feet up or down in the air\. You can instead Climb at your full Speed or Stride to move along a horizontal surface at half your Speed\. The GM determines which surfaces can be climbed or moved across this way\. If you fall while this potion is in effect, you can use the Arrest a Fall reaction as if you had a fly Speed\. If you have a fly Speed, you remain airborne at the end of your turn, even if you didn't use a Fly action this round\./i;
const BALLOON = /\bThis feather can't be activated underwater\. When activated, the feather transforms into a balloon of waxed cloth that is 3 feet in diameter and filled with hot air\. Handles on the bottom of the balloon allow up to (two) creatures sized (Medium) or smaller to hold onto the balloon\. One round after being activated, the balloon rises up into the air at a speed of (\d+) feet per round\. After rising for (\d+) rounds, the balloon floats in place for (two) rounds as the air inside cools, then descends at a speed of (\d+) feet per round\. When the balloon reaches its original elevation, the balloon deflates\./i;
const PADDING = /\bA gas-filled balloon pops out of the back of your armor and begins to inflate\. It takes (\d+) minutes for the balloon to fully inflate and lift you and up to (\d+) additional Bulk (\d+) feet off the ground\. By taking another (\d+) minutes, this balloon can be deflated and properly stowed in the back of your armor\. Once inflated, you can spend an action that has the manipulate and move traits to adjust the height you are hovering up or down by up to (\d+) feet each time\. If the balloon takes damage \(AC (\d+), Hardness (\d+)\), it will quickly deflate and cause you to fall to the ground\. The balloon magically repairs itself at the start of each day\./i;
const WORDS = { two: 2 };
const number = (word) => WORDS[String(word).toLowerCase()] ?? Number(word);

// A consumable's note-only plan and its plain text → its plan, or the same plan.
export function withAloft(plan, text) {
    if (!plan?.noteOnly || plan.resolution?.check?.roll !== "automatic") return plan;
    const plain = String(text ?? "");
    const hovering = HOVERING.exec(plain);
    if (hovering) {
        const time = { mode: "fixed", value: Number(hovering[1]), unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
        const note = `hovering a few inches off the ground: a Stride can take it ${hovering[2]} feet up or down in the air, or along a ceiling or other horizontal surface at half its Speed (the GM says which surfaces); falling, it can Arrest a Fall as if it had a fly Speed, and with a fly Speed it stays aloft at the end of its turn without Flying`;
        const { noteOnly, ...rest } = plan;
        return { ...rest, automation: { ...(plan.automation ?? {}), level: "automatic" }, resolution: { ...plan.resolution, outcomes: { success: row([]) } }, item: { ...(plan.item ?? {}), speeds: [{ type: "climb", value: LAND, duration: time, note }] } };
    }
    const balloon = BALLOON.exec(plain);
    if (balloon) {
        const [up, risen, floats, down] = [Number(balloon[3]), Number(balloon[4]), number(balloon[5]), Number(balloon[6])];
        const height = up * risen;
        const total = 1 + risen + floats + Math.ceil(height / down);
        const text = `Holding a handle of the balloon: a round after it's activated, it rises ${up} feet a round for ${risen} rounds (${height} feet up), floats in place for ${floats} rounds, then comes down ${down} feet a round to where it started, and deflates — ${total} rounds in all (raise or lower each token's elevation as it goes).`;
        const { noteOnly, ...rest } = plan;
        return {
            ...rest,
            automation: { ...(plan.automation ?? {}), level: "automatic" },
            targeting: { target: `up to ${number(balloon[1])} ${balloon[2]} or smaller creatures holding its handles`, range: "touch", area: null },
            notes: [...(plan.notes ?? []), "It can't be activated underwater.", `Up to ${number(balloon[1])} creatures, ${balloon[2]} or smaller, hold on: target them.`],
            resolution: { ...plan.resolution, outcomes: { success: row([{ label: "Balloon", text, duration: rounds(total) }]) } },
            item: { ...(plan.item ?? {}), recipient: "targets" }
        };
    }
    return plan;
}

// An activation's plan (the GM's no-effect), its html, the item and its activation → the plan with its Effect, or the same plan.
export function withInflated(plan, html, { item = null, activation = null } = {}) {
    if (plan?.builtin !== "no-effect") return plan;
    const plain = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const padding = PADDING.exec(plain);
    if (!padding) return plan;
    const [inflate, bulk, lift, deflate, adjust, ac, hardness] = padding.slice(1).map(Number);
    const text = `Its balloon holds its wearer (and up to ${bulk} more Bulk) ${lift} feet off the ground, drifting with the wind or pulled along by another creature or a vehicle. An action with the manipulate and move traits takes it up or down by up to ${adjust} feet. If the balloon takes damage (AC ${ac}, Hardness ${hardness}), it deflates at once and its wearer falls to the ground.`;
    const { builtin, gm, ...rest } = plan;
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${item?.name ?? "The item"}${activation?.name ? `: ${activation.name}` : ""}`, slug: item?.system?.slug ?? null, uuid: item?.uuid ?? null, type: item?.type ?? null },
        rank: 1,
        traits: [...(item?.system?.traits?.value ?? [])],
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] },
        ...rest,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: row([{ label: "Balloon inflated", text, duration: null }]) } },
        notes: [`It takes ${inflate} minutes to inflate; ${deflate} more deflate and stow it (remove its Effect then). The balloon mends itself each day.`]
    };
}
