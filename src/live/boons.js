// Live play's pure parts for the boons (src/compiler/boons.js plan.boon, 2026-10-29; scripts/boons.js plays them): the stage Effect on the
// creature that took one in (its flag boon: the reading, its stage, when that stage began and ends), its words and PF2e rules, the next
// stage once the world's time passes its end (none while the GM holds it), the item that carries the activation a stage gives, the innate
// spells' entry, what it gets as it rolls initiative, the Hit Points a stage takes, and the chat card's words. Pure.

import { HELD_OPTION } from "../compiler/boons.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const slugOf = (name) => String(name ?? "boon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// (A month is 30 days of the world's time.)
export const BOON_SECONDS = { days: 86_400, weeks: 604_800, months: 2_592_000 };
export const stageSeconds = (lasts) => (lasts ? Number(lasts.value) * (BOON_SECONDS[lasts.unit] ?? 86_400) : null);
export const stageOf = (boon, number) => (boon?.stages ?? []).find((stage) => stage.stage === Number(number)) ?? null;
export const lastStageOf = (boon) => (boon?.stages ?? []).at(-1)?.stage ?? 1;
export const timeText = (lasts) => (lasts ? `${lasts.value} ${Number(lasts.value) === 1 ? String(lasts.unit).replace(/s$/, "") : lasts.unit}` : "for good");
// (How long is left, in the largest whole units: "9 days", "3 hours".)
export function leftText(seconds) {
    const left = Math.max(0, Number(seconds) || 0);
    for (const [unit, size] of [["day", 86_400], ["hour", 3_600], ["minute", 60]]) {
        if (left >= size) {
            const count = Math.floor(left / size);
            return `${count} ${unit}${count === 1 ? "" : "s"}`;
        }
    }
    return "moments";
}

// The flag on the stage Effect, for a stage begun at worldTime.
export function boonFlag(boon, { stage = 1, worldTime = 0, item = {}, user = {} } = {}) {
    const lasts = stageOf(boon, stage)?.lasts ?? null;
    return { name: boon.name, stage: Number(stage), startedAt: Number(worldTime) || 0, endsAt: lasts ? (Number(worldTime) || 0) + stageSeconds(lasts) : null, item: { name: item.name ?? boon.name, uuid: item.uuid ?? null }, user: { actorUuid: user.actorUuid ?? null, tokenUuid: user.tokenUuid ?? null }, boon };
}

// The world's time now (and the time passed since the last look, delta) → { flag, entered: [stages begun] }. Held: its end put off by the
// time passed, nothing begun. Each stage begins when the one before ended, so a long jump of the clock goes through them in turn.
export function boonStep(flag, worldTime, { held = false, delta = 0 } = {}) {
    if (!flag || !Number.isFinite(Number(flag.endsAt))) return { flag, entered: [] };
    if (held) return { flag: { ...flag, endsAt: Number(flag.endsAt) + (Number(delta) || 0) }, entered: [] };
    let next = flag;
    const entered = [];
    while (Number.isFinite(Number(next.endsAt)) && Number(worldTime) >= Number(next.endsAt)) {
        const stage = stageOf(next.boon, next.stage + 1);
        if (!stage) break;
        const startedAt = Number(next.endsAt);
        next = { ...next, stage: stage.stage, startedAt, endsAt: stage.lasts ? startedAt + stageSeconds(stage.lasts) : null };
        entered.push(stage.stage);
    }
    return { flag: next, entered };
}

// The flag moved to a stage by hand (the GM's badge), begun now.
export const boonAt = (flag, stage, worldTime) => ({ ...flag, stage: Number(stage), startedAt: Number(worldTime) || 0, endsAt: stageOf(flag.boon, stage)?.lasts ? (Number(worldTime) || 0) + stageSeconds(stageOf(flag.boon, stage).lasts) : null });

// The GM's hold: PF2e's toggle on the Effect.
export const holdRule = (held = false) => ({ key: "RollOption", domain: "all", option: HELD_OPTION, toggleable: true, value: Boolean(held), label: "Held at this stage (the GM's)" });
export const heldOf = (rules) => (rules ?? []).some((rule) => rule?.key === "RollOption" && rule.option === HELD_OPTION && rule.value === true);

// The stage's lines for the card and the Effect: its rules' words, its innate spells, its activation and what it gets at initiative.
export function stageLines(boon, number) {
    const stage = stageOf(boon, number);
    if (!stage) return [];
    if (stage.dies) return ["It dies."];
    const spells = stage.spells ?? [];
    const byDay = spells.filter((spell) => spell.perDay);
    const atWill = spells.filter((spell) => !spell.perDay);
    const named = (spell) => `${spell.name}${spell.rank ? ` (rank ${spell.rank})` : ""}`;
    const initiative = stage.initiative;
    const atInitiative = !initiative ? null : initiative.byDie
        ? `As it rolls initiative: ${initiative.byDie.slice().reverse().map((entry, index) => (index === 0 ? `${cap(initiative.slug)} ${entry.value}` : `${cap(initiative.slug)} ${entry.value} on a d20 of ${entry.atMost === 1 ? "1" : `${entry.atMost} or lower`}`)).join(", ")} (for the encounter; the GM may end it sooner)`
        : `As it rolls initiative: ${cap(initiative.slug)}${initiative.value ? ` ${initiative.value}` : ""} for up to ${initiative.rounds} rounds (rolled)`;
    const activation = stage.activation;
    return [
        ...(stage.lines ?? []),
        ...(byDay.length ? [`${cap(byDay[0].tradition)} innate spells, once a day each: ${byDay.map(named).join(", ")}`] : []),
        ...(atWill.length ? [`${cap(atWill[0].tradition)} innate spell${atWill.length === 1 ? "" : "s"}: ${atWill.map(named).join(", ")}`] : []),
        ...(activation ? [`Its activation once per ${activation.per}, on the item "${boon.name} (boon)" on its sheet${activation.kind === "flames" ? `: wreathed in flame for a minute, ${activation.formula} ${activation.type} to those that hit it in melee or touch it${activation.dismiss === false ? " (it can't be Dismissed now)" : ""}` : `: a teleport of up to ${activation.within} feet, ${activation.farther} with 2 actions${activation.arrive ? "; then Strange Geometry where it arrives (by hand)" : ""}`}`] : []),
        ...(atInitiative ? [atInitiative] : [])
    ];
}
const cap = (word) => `${String(word ?? "").charAt(0).toUpperCase()}${String(word ?? "").slice(1)}`;

// The Effect's words: this stage's lines and the GM's lines of every stage so far, its time, what follows its death, its stages' own text
// and its purging.
export function boonDescription(flag, { worldTime = null } = {}) {
    const { boon } = flag;
    const stage = stageOf(boon, flag.stage);
    const last = lastStageOf(boon);
    const notes = boon.stages.filter((entry) => entry.stage <= flag.stage).flatMap((entry) => entry.notes ?? []);
    const time = stage?.dies ? "its last stage" : Number.isFinite(Number(flag.endsAt)) ? `${timeText(stage?.lasts)}; stage ${flag.stage + 1} begins on its own${worldTime !== null ? ` in ${leftText(Number(flag.endsAt) - Number(worldTime))}` : ""}, unless the GM holds it (the "Held" toggle)` : "until the GM ends it";
    const texts = boon.stages.filter((entry) => entry.stage <= flag.stage).reverse().map((entry) => `<p><em>Stage ${entry.stage}${entry.lasts ? ` (${escape(timeText(entry.lasts))})` : ""}:</em> ${escape(entry.text)}</p>`).join("");
    return [
        `<p><strong>${escape(boon.name)}, stage ${flag.stage} of ${last}</strong> (${escape(time)}).</p>`,
        `<ul>${stageLines(boon, flag.stage).map((line) => `<li>${escape(line)}</li>`).join("")}</ul>`,
        notes.length ? `<p>By hand:</p><ul>${notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "",
        stage?.death ? `<p>If it dies now: ${escape(stage.death)}</p>` : "",
        texts,
        boon.purging ? `<p><em>Purging:</em> ${escape(boon.purging)} (The GM ends it by deleting this Effect.)</p>` : "",
        "<p>The GM moves it to another stage with this Effect's badge, or ends it by deleting this Effect.</p>"
    ].join("");
}

// The stage Effect's source. held: the GM's hold kept from the stage before.
export function boonEffectSource(flag, { held = false, worldTime = 0, initiative = null, img = "icons/svg/aura.svg", moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const stage = stageOf(flag.boon, flag.stage);
    const rules = stage?.dies ? [] : [holdRule(held), ...(stage?.rules ?? []).map((rule) => structuredClone(rule))];
    return {
        name: `${flag.boon.name}: stage ${flag.stage}`,
        type: "effect",
        img,
        flags: { [moduleId]: { boon: flag } },
        system: {
            slug: `air-boon-${slugOf(flag.boon.name)}`,
            description: { value: boonDescription(flag, { worldTime }) },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            badge: { type: "counter", value: flag.stage, min: 1, max: lastStageOf(flag.boon) },
            context: { origin: { actor: flag.user?.actorUuid ?? null, token: flag.user?.tokenUuid ?? null, item: flag.item?.uuid ?? null } },
            rules
        }
    };
}

// Its current and maximum Hit Points lower as a stage begins: the stage's loss per level less the one before's (Heartblood Ring's 2 × its
// level at stage 2, 2 more at stage 3) → Hit Points to take off now.
export function hpLossOf(boon, from, to, level) {
    const loss = (number) => Number(stageOf(boon, number)?.hpLoss) || 0;
    return Math.max(0, (loss(to) - (Number(from) > 0 ? loss(from) : 0)) * Math.max(0, Number(level) || 0));
}

// The item that carries a stage's activation, its sheet's Activate button the module's (src/compiler/boons.js withBoonActivation reads its
// flag): the activation's own block, its Frequency the stage's, without "You can Dismiss the activation" once it can't be. Or null.
export function boonActivationSource(flag, { effectId = null, img = "icons/svg/fire.svg", moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const activation = stageOf(flag.boon, flag.stage)?.activation;
    if (!activation?.html) return null;
    const framed = activation.html.replace(/(<strong>\s*Frequency\s*<\/strong>\s*)once per \w+/i, `$1once per ${activation.per}`);
    const html = activation.dismiss === false ? framed.replace(/\s*You can Dismiss the activation\./, "") : framed;
    return {
        name: `${flag.boon.name} (boon)`,
        type: "equipment",
        img,
        flags: { [moduleId]: { boonActivation: { name: flag.boon.name, stage: flag.stage, activation: { ...activation, html: undefined }, effectId } } },
        system: {
            description: { value: html },
            level: { value: Number(flag.boon.level) || 0 },
            quantity: 1,
            bulk: { value: 0 },
            price: { value: {} },
            traits: { value: ["magical"], rarity: "rare" },
            usage: { value: "worn" },
            equipped: { carryType: "worn" }
        }
    };
}

// The innate spells' entry: one for the stage's tradition, flagged as the boon's.
export function boonSpellEntrySource(flag, tradition, { moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: `${flag.boon.name} (boon): innate spells`,
        type: "spellcastingEntry",
        flags: { [moduleId]: { boonSpells: { name: flag.boon.name } } },
        system: { tradition: { value: tradition }, prepared: { value: "innate" }, ability: { value: "cha" }, proficiency: { value: 1 }, showSlotlessLevels: { value: false } }
    };
}
// Where a spell goes in it: its rank as the stage says (Elder Seed's Enlarge at 4th), its uses a day.
export const innateLocation = (spell, entryId) => ({ value: entryId, ...(spell.rank ? { heightenedLevel: spell.rank } : {}), ...(spell.perDay ? { uses: { value: spell.perDay, max: spell.perDay } } : {}) });

// What it gets as it rolls initiative, by its d20 → { slug, uuid, value, rounds (a formula), encounter } or null.
export function initiativeCondition(initiative, natural) {
    if (!initiative) return null;
    if (initiative.byDie) {
        const die = Number(natural);
        const entry = Number.isFinite(die) ? initiative.byDie.find((one) => die <= one.atMost) : initiative.byDie.at(-1);
        return { slug: initiative.slug, uuid: initiative.uuid, value: (entry ?? initiative.byDie.at(-1)).value, encounter: true };
    }
    return { slug: initiative.slug, uuid: initiative.uuid, value: initiative.value ?? null, rounds: initiative.rounds };
}
// Its Effect: the condition granted, for the encounter or the rounds rolled.
export function initiativeEffectSource(given, { name, rounds = null, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const words = `${cap(given.slug)}${given.value ? ` ${given.value}` : ""}`;
    return {
        name: `${name}: ${words} (initiative)`,
        type: "effect",
        img: "icons/svg/downgrade.svg",
        flags: { [moduleId]: { boonInitiative: { name, slug: given.slug } } },
        system: {
            description: { value: `<p>${escape(words)} as it rolled initiative, from <strong>${escape(name)}</strong>${given.encounter ? " (for the encounter; the GM may end it sooner)" : ` for up to ${rounds} round${rounds === 1 ? "" : "s"}`}.</p>` },
            duration: given.encounter ? { value: -1, unit: "encounter", expiry: null, sustained: false } : { value: Math.max(1, Number(rounds) || 1), unit: "rounds", expiry: "turn-end", sustained: false },
            start: { value: worldTime, initiative },
            rules: [{ key: "GrantItem", uuid: given.uuid, onDeleteActions: { grantee: "restrict" }, ...(given.value ? { alterations: [{ mode: "override", property: "badge-value", value: given.value }] } : {}) }]
        }
    };
}

// A rider of its first stage on an Effect of its own: fire immunity for days (Phoenix Cinder), a note for days (Void Fragment's truespeech).
export function riderEffectSource(rider, { name, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const duration = { value: Number(rider.days) || 1, unit: "days", expiry: "turn-start", sustained: false };
    if (rider.kind === "immunity") return { name: `${name}: immune to ${rider.type}`, type: "effect", img: "icons/svg/fire-shield.svg", flags: { [moduleId]: { boonRider: { name } } }, system: { description: { value: `<p>Immune to ${escape(rider.type)} for ${duration.value} days after taking in <strong>${escape(name)}</strong>.</p>` }, duration, start: { value: worldTime, initiative }, rules: [{ key: "Immunity", type: rider.type }] } };
    if (rider.kind === "note") return { name: `${name}: ${rider.label}`, type: "effect", img: "icons/svg/book.svg", flags: { [moduleId]: { boonRider: { name } } }, system: { description: { value: `<p>${escape(rider.words)}, for ${duration.value} days, from <strong>${escape(name)}</strong>.</p>` }, duration, start: { value: worldTime, initiative }, rules: [] } };
    return null;
}

// Heartblood Ring's counteract each round its Regenerate lasts: the counteract card's numbers (src/live/counteract-card.js) — its user's
// class DC less 10, the item's rank (half its level, rounded up), one disease or poison on its user.
export const boonCounteract = (rider, level) => ({ modifier: 0, rank: Math.max(1, Math.ceil((Number(level) || 0) / 2)), fromUser: { modifier: "class-dc" }, conditions: [], traits: [], afflictions: [...rider.afflictions], pick: "one", self: true, notes: ["Again at the start of each of its turns while its Regenerate lasts."] });

// The chat card's words as stages begin (entered: the stages begun, in order), or as it's taken in.
export function stageCardHTML(flag, { actorName = "It", entered = [flag.stage], begun = false, worldTime = null, lines = [] } = {}) {
    const { boon } = flag;
    const stage = stageOf(boon, flag.stage);
    const passed = entered.length > 1 ? ` (through stage${entered.length > 2 ? "s" : ""} ${entered.slice(0, -1).join(", ")})` : "";
    const head = begun ? `${escape(actorName)} takes in the boon: stage ${flag.stage}${stage?.lasts ? `, for ${escape(timeText(stage.lasts))}` : ""}.` : stage?.dies ? `${escape(actorName)}'s boon reaches its last stage${passed}: ${escape(actorName)} dies.` : `${escape(actorName)}'s boon moves on to stage ${flag.stage}${passed}${stage?.lasts ? `, for ${escape(timeText(stage.lasts))}` : ""}.`;
    const next = !stage?.dies && Number.isFinite(Number(flag.endsAt)) && worldTime !== null ? `<p>Stage ${flag.stage + 1} begins on its own in ${escape(leftText(Number(flag.endsAt) - Number(worldTime)))}, unless the GM holds it.</p>` : "";
    return `<section class="pf2e-air-card"><header><strong>${escape(boon.name)}</strong><span class="aar-check">Boon</span></header><p>${head}</p><ul>${[...stageLines(boon, flag.stage), ...lines].map((line) => `<li>${escape(line)}</li>`).join("")}</ul>${stage?.death && !stage?.dies ? `<p>If it dies now: ${escape(stage.death)}</p>` : stage?.dies && stage.death ? `<p>${escape(stage.death)}</p>` : ""}${next}</section>`;
}
