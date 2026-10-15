// Injury poisons on a weapon (PF2e leaves it to the table). Using the poison
// posts a card: which piercing or slashing weapon to coat. Apply puts an Effect
// on the user that marks the weapon. That weapon's next Strike that hits exposes
// the target (the poison's save card, the ability module's); a critical miss
// spends it; a miss keeps it ("expend it as normal for an injury poison by
// either hitting a target or critically failing an attack roll"). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "poison";

// An injury poison's plan: a save against a fixed DC on the creature a Strike hits (the ability compiler's reading).
// (Not a drug with the injury trait, Zerk: that one is injected into a creature, an exposure.)
export const isInjuryPoison = (plan) => plan?.item?.delivery === "injury" && plan.item.category !== "drug" && plan?.resolution?.kind === "save" && plan.trigger?.event === "strike" && plan.resolution.check?.against?.dc === "fixed";

// The weapons a poison can coat: piercing or slashing (or versatile P or S), held ones first.
export function poisonableWeapons(weapons) {
    const deals = (weapon) => {
        const type = weapon?.system?.damage?.damageType;
        const traits = weapon?.system?.traits?.value ?? [];
        return ["piercing", "slashing"].includes(type) || traits.includes("versatile-p") || traits.includes("versatile-s");
    };
    return (weapons ?? [])
        .filter(deals)
        .map((weapon) => ({ id: weapon.id ?? weapon._id, name: weapon.name, held: weapon.system?.equipped?.carryType === "held" }))
        .sort((a, b) => Number(b.held) - Number(a.held));
}

export function createPoisonCard({ plan, item, user, weapons }) {
    return { kind: "poison", status: "open", plan, item, user, weapons, weapon: weapons.length ? 0 : null, results: [] };
}

// "DC 18 Fortitude save", from the poison's plan.
export function saveText(plan) {
    const check = plan?.resolution?.check ?? {};
    const statistic = String(check.statistic ?? "fortitude");
    return `DC ${check.against?.value ?? "?"} ${statistic.charAt(0).toUpperCase()}${statistic.slice(1)} save`;
}

export function poisonCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const weapon = state.weapons[state.weapon];
    const choice = !state.weapons.length ? `<p class="aar-warning">${escape(state.user.name)} has no piercing or slashing weapon to coat.</p>`
        : open && canApply && state.weapons.length > 1
            ? `<p class="aar-actions">Coat: <select data-air-field="weapon">${state.weapons.map((entry, index) => `<option value="${index}"${index === state.weapon ? " selected" : ""}>${escape(entry.name)}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Coat: ${escape(weapon?.name ?? "")}</p>`;
    const hint = open ? `<p class="aar-hint">Its next Strike that hits exposes the target (${escape(saveText(state.plan))}); a critical miss wastes it.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.weapons.length ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Coat the weapon</button></footer>` : open && state.weapons.length ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to coat it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">injury poison</span></header>${choice}${hint}${results}${controls}</section>`;
}

// The Effect on the user that marks the coated weapon; it lasts until the poison is spent.
export function poisonEffectSource({ state, weapon, description = "", img = null, worldTime = 0, moduleId }) {
    return {
        name: `${state.item.name} (on ${weapon.name})`,
        type: "effect",
        img: img ?? "icons/svg/poison.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { weaponId: weapon.id, weaponName: weapon.name, item: state.item, plan: state.plan } } },
        system: {
            description: { value: `<p>${escape(saveText(state.plan))} on the next creature ${escape(weapon.name)} hits; a critical miss wastes it.</p>${description}` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative: null },
            rules: []
        }
    };
}

// What a Strike with the coated weapon does to the poison: "expose" the target, "spend" it unused, or "keep" it.
export function poisonStrike(outcome) {
    if (outcome === "success" || outcome === "criticalSuccess") return "expose";
    if (outcome === "criticalFailure") return "spend";
    return "keep";
}

// Contact, inhaled and ingested poisons: exposure to the creatures the presser targets (PF2e's trait rules: contact,
// "the creature must attempt a saving throw immediately when the poison touches its skin" or the first to touch the
// coated item; inhaled, a 10-foot cube cloud for 1 minute, "every creature entering this cloud is exposed"; ingested,
// the creature that eats or drinks it). The save card is the ability module's, as for injury poisons.
export const EXPOSED_BY = Object.freeze({
    contact: "the creature it touches (applied to its skin), or later the first creature to touch the coated item",
    inhaled: "the creatures in the 10-foot cube cloud; for 1 minute, each creature entering it is exposed too (the GM's to call)",
    ingested: "the creature that eats or drinks it",
    injected: "the creature it's injected into"
});

const deliveryOf = (plan) => (plan?.item?.delivery === "injury" && plan.item.category === "drug" ? "injected" : plan?.item?.delivery);

export const isExposurePoison = (plan) => Boolean(EXPOSED_BY[deliveryOf(plan)]) && plan?.resolution?.kind === "save" && plan.resolution.check?.against?.dc === "fixed" && Boolean(plan.resolution.afflictionHandoff);

// Any other item whose save comes on its Use, at creatures other than its user ("Spark Wafer … 5-foot burst", Pyronite,
// a flare beacon): the same card, for the creatures the presser targets. Not one that gives an action or a time to use
// later ("grants you the Energy Breath action for 1 hour", "For 1 hour after you drink …"), nor an aura or a snare.
const LATER = /\b(?:grants? you (?:the|a|an) [\w' -]+? (?:action|activity|reaction)|for (?:\d+|one|an?) (?:rounds?|minutes?|hours?) after you (?:drink|imbibe|consume|eat|inhale|chew)|while you(?:'re| are) chewing|you can (?:use|exhale|breathe|spit|release|expel) |gain (?:a|an) [\d-]+-foot aura|(?:once|twice) (?:during|within|before)|aura\b)/i;
export const isUseSave = (plan, text = "") => plan?.resolution?.kind === "save" && plan.trigger?.event === "use" && plan.resolution.check?.against?.dc === "fixed" && !plan.item?.delivery && !LATER.test(text);

export const AREA_WORDS = (area) => (area?.value ? `the creatures in its ${area.value}-foot ${area.type}` : "the creature it targets");

export function createExposureCard({ plan, item, user }) {
    return { kind: "expose", status: "open", plan, item, user, delivery: deliveryOf(plan) ?? null, results: [] };
}

export function exposureCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const who = EXPOSED_BY[state.delivery] ?? AREA_WORDS(state.plan?.targeting?.area);
    const hint = open ? `<p class="aar-hint">${state.delivery ? "Exposes" : "A save for"} ${escape(who)} (${escape(saveText(state.plan))}). Target them, then press the button.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${state.delivery ? "Expose my targets" : "Save: my targets"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${state.delivery ? `${escape(state.delivery)} poison` : escape(saveText(state.plan))}</span></header>${hint}${results}${controls}</section>`;
}

