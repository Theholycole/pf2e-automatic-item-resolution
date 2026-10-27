// A paper guard that keeps watch over an area (2026-10-27, docs/needs.md): Sentry Fulu's "it takes the shape of a Tiny humanoid guard made of
// paper and keeps watch over an area in a 20-foot burst. The guard has a Perception DC of 20, along with precise visual senses and imprecise
// hearing and vibrational sense … If a creature enters the area without giving the password, the sentry creates either an audible or mental
// alarm. An audible alarm … allowing each creature that can hear it to attempt a DC 15 Perception check to wake up if they're asleep. The mental
// alert reaches you if you're within 60 feet of the active guard … The guard remains active for 8 hours, and then the fulu is consumed." → the
// ability module's zone for the 8 hours, a burst where its user sets it down: each creature that enters sends the GM the alarm's note (the
// ability module's note save) — whether it gave the password, Sneaked past the guard's Perception DC, or who wakes, the GM's to tell; the
// patrol, the password and the linked fulus its user's, lines of the card. Pure.

import { plainText } from "./rows.js";

const WATCH = /\bit takes the shape of a Tiny humanoid guard made of paper and keeps watch over an area in an? (\d+)-foot burst\. The guard has a Perception DC of (\d+), along with precise visual senses and imprecise hearing and vibrational sense to detect creatures moving in its area, including through the air\./i;
const PATROL = /\bYou dictate whether the guard remains still in its area or patrols it; if the latter, you also determine the path the guard takes, at a Speed of (\d+) feet\./i;
const ALARM = /\bIf a creature enters the area without giving the password, the sentry creates either an audible or mental alarm\. An audible alarm has the sound and volume of a human shouting, as well as the auditory trait, allowing each creature that can hear it to attempt a (?:@Check\[perception\|dc:(\d+)\]|DC (\d+) Perception) check to wake up if they're asleep\. The mental alert reaches you if you're within (\d+) feet of the active guard\b/i;
const ACTIVE = /\bThe guard remains active for (\d+) hours, and then the fulu is consumed\./i;
const UNIT = /\bIf you have more than one sentry fulu, you can set up several that function as a unit\b/i;

// The item and its plan's base → the zone plan, or null.
export function sentryPlan(item, base) {
    const html = String(item?.system?.description?.value ?? "");
    const plain = plainText(html);
    const watch = WATCH.exec(plain);
    const alarm = ALARM.exec(html) ?? ALARM.exec(plain);
    const active = ACTIVE.exec(plain);
    if (item?.type !== "consumable" || !watch || !alarm || !active) return null;
    const patrol = PATROL.exec(plain);
    const wake = Number(alarm[1] ?? alarm[2]);
    return {
        ...base,
        builtin: "zone",
        actions: null,
        automation: { level: "automatic" },
        trigger: { event: "use" },
        zone: {
            area: { type: "burst", value: Number(watch[1]) },
            centre: "placed",
            range: 5,
            lasts: { mode: "fixed", value: Number(active[1]), unit: "hours", expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], note: `A creature entered the sentry's area: unless it gave the password (or slipped past the guard's Perception DC ${watch[2]} unseen), the sentry sounds its alarm — audible, a human's shout (auditory: each sleeping creature that hears it attempts a DC ${wake} Perception check to wake), or mental, reaching its user within ${alarm[3]} feet.` }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `A Tiny paper guard watches the ${watch[1]}-foot burst for ${active[1]} hours (Perception DC ${watch[2]}; precise vision, imprecise hearing and vibration, through the air too); then the fulu is consumed.`,
                `Its user says whether it stays still or patrols the area${patrol ? ` along a path they set, at a Speed of ${patrol[1]} feet` : ""}, the password that lets others by, and whether its alarm is audible or mental.`,
                ...(UNIT.test(plain) ? ["Several sentry fulus whose areas touch or overlap work as one: an alarm, a password given, or a guard destroyed in one counts for all of them."] : [])
            ]
        }
    };
}
