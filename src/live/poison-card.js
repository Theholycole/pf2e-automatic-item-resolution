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
    // (No roll: what it does, "2d6 fire damage", "grabbed", outright.)
    if (check.roll === "automatic") return `no save: ${outrightText(plan)}`;
    // (A check with the item's own modifier: "Athletics +13 against the target's Fortitude DC", "attack +14 against AC".)
    if (check.roll === "skill") {
        const words = (name) => (name === "ac" ? "AC" : `${String(name ?? "").charAt(0).toUpperCase()}${String(name ?? "").slice(1)}`);
        return `${words([].concat(check.statistic)[0])}${Number.isFinite(check.modifier) ? ` +${check.modifier}` : ""} against ${check.against?.statistic === "ac" ? "AC" : `${words(check.against?.statistic)} DC`}`;
    }
    const statistic = String(check.statistic ?? "fortitude");
    return `DC ${check.against?.value ?? "?"} ${statistic.charAt(0).toUpperCase()}${statistic.slice(1)} save`;
}

// An automatic row in words: its damage ("2d6 fire damage", "1d6 persistent bleed damage") and conditions.
export function outrightText(plan) {
    const row = plan?.resolution?.outcomes?.success ?? {};
    const components = plan?.resolution?.sharedDamage?.components ?? [];
    const ids = new Set(row.damage?.sourceComponentIds ?? []);
    const damage = components.filter((component) => ids.has(component.id)).map((component) => {
        const typed = /^(.+?)\[(?:(persistent),)?(\w+)\]$/.exec(component.formula ?? "");
        return typed ? `${typed[1]} ${typed[2] ? "persistent " : ""}${typed[3]} damage` : `${component.formula}${component.category ? ` ${component.category}` : ""}${component.type ? ` ${component.type}` : ""} damage`;
    });
    const conditions = (row.effects ?? []).filter((effect) => effect.kind === "condition").map((effect) => `${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}`);
    // (And what an ally buff gives: "15 temporary Hit Points", "+1 status to attack-roll".)
    const temp = (row.effects ?? []).filter((effect) => effect.kind === "temp-hp").map((effect) => `${effect.amount ?? effect.formula} temporary Hit Points`);
    const modifiers = (row.modifiers ?? []).map((modifier) => `${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} ${modifier.type} to ${String(modifier.selector).replace(/-/g, " ")}`);
    return [...damage, ...conditions, ...temp, ...modifiers].join(", ") || "its effect";
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
// later ("grants you the Energy Breath action for 1 hour", "you can use a 2-action activity to exhale"), nor an aura or a snare.
const LATER = /\b(?:(?:grants? you|you (?:also )?gain) (?:the|a|an) [\w' -]+? (?:action|activity|reaction|ability)|gives? you access to (?:[\w-]+ ){0,3}activations?|while you(?:'re| are) chewing|you can (?:use|exhale|breathe|spit|release|expel|unleash) |gain (?:a|an) [\d-]+-foot aura|(?:once|twice) (?:during|within|before)|aura\b)/i;
// (An item with no Activate line — "You can toss sneezing powder at an adjacent creature", a fulu "Upon affixing" — reads as
// passive; it's still used. Not a save something else sets off: a turn in the area, entering a square, passing a door,
// reading the words, each Stride.)
const TRIGGERED = /\b(?:starts? (?:its|their) turn|ends? (?:its|their) turn|passes? through|enters? (?:the|its|that|a|this) (?:square|area|space)|first creature to (?:enter|step)|steps? (?:on|into)|moves? (?:adjacent|into)|is activated when|completes? a|if you are|anyone reading|whenever|each time|every round)\b/i;
// The sentence that asks for the save ("… must attempt a DC 15 Fortitude save …"), where a trigger would be named.
const saveSentence = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).find((sentence) => /\b(?:must (?:attempt|succeed)|saving throw|save)\b/i.test(sentence)) ?? "";
// (Never a snare: it's placed, and set off by the first creature to enter its square — Regions, later.)
// (A delivery trait with a plain save, no affliction — Sneezing Powder, inhaled — is one too.)
const useSave = (plan, text) => plan?.resolution?.kind === "save" && ["use", "passive"].includes(plan.trigger?.event) && plan.resolution.check?.against?.dc === "fixed"
    && (!plan.item?.delivery || !plan.resolution.afflictionHandoff) && plan.item?.category !== "snare" && !/\bsnare\b/i.test(plan.source?.name ?? "") && !TRIGGERED.test(saveSentence(text));
// (Set off by a creature attacking its user while it lasts — Oil of Repulsion's "For 1 minute after you apply this oil to
// armor, any creature that hits you with a melee Strike must attempt …", Vermin Repellent Agent's "… when attempting to attack
// you": a card kept open for the item's time, used each time.)
export const ATTACKER = /\b(?:any|each|a) creature (?:that|who) (?:hits|attacks|Strikes|damages|grapples|swallows) you\b|\bwhen attempting to attack you\b/i;
// (The drinker's own save: Truth Potion's "Upon drinking the potion, attempt a @Check[will|dc:19] save", Matsuki's Medicinal
// Wine's "When you drink a dose of this wine you must succeed at a @Check…", Energy Toxin Bottle's "You drink from the bottle
// and must succeed at a @Check…".)
const OWN_SAVE = /^(?:Upon (?:drinking|consuming|eating|imbibing)[^,]*,\s*(?:you )?attempt an? @Check|When you (?:drink|consume|eat|imbibe)[^,.]*?,? you must (?:succeed at|attempt) an? @Check)|\bYou (?:drink|consume|eat|imbibe)\b[^.]*? and must (?:succeed at|attempt) an? @Check/;
export const isOwnSave = (plan, text = "") => useSave(plan, text) && String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).some((sentence) => OWN_SAVE.test(sentence.replace(/^(?:Activate\b[^.]*?\)\s*|Effect\s+)/, "")));
export const isUseSave = (plan, text = "") => useSave(plan, text) && !LATER.test(text) && !ATTACKER.test(text);
// One for later (a breath potion's "grants you the Energy Breath action for 1 hour"; not an aura): the same card, kept
// open until the drinker uses it — then the presser targets the creatures and presses it.
export const isLaterSave = (plan, text = "") => useSave(plan, text) && ((LATER.test(text) && !/\baura\b/i.test(text)) || ATTACKER.test(text));

export const AREA_WORDS = (area) => (area?.value ? `the creatures in its ${area.value}-foot ${area.type}` : "the creature it targets");

// One used again for the item's time ("After you use Energy Breath, you can't do so again for 1d4 rounds", Roaring
// Potion's "Frequency once every 1d4 rounds"): its later card stays open until then (Frost Breath's one exhale doesn't).
const AGAIN = /\bcan't (?:do so|use (?:it|this|that)(?: [\w' -]+?)?) again for\b|\bFrequency once (?:per|every)\b/i;
export const repeatsLater = (text = "") => AGAIN.test(text) || ATTACKER.test(text);

// later: kept for an action the item gives; repeat and until (world time in seconds): used again until then.
// own: the drinker's own save (no targets: the user's own token); attacker: set off by a creature attacking the user.
// attackChoices: a spellgun's attack modifiers its user has, [{ kind, label, modifier }] (scripts/poisons.js).
export function createExposureCard({ plan, item, user, later = false, repeat = false, until = null, own = false, attacker = false, attackChoices = null }) {
    return { kind: "expose", status: "open", plan, item, user, delivery: deliveryOf(plan) ?? null, later, ...(later && repeat ? { repeat: true, until, uses: 0 } : {}), ...(own ? { own: true } : {}), ...(attacker ? { attacker: true } : {}), ...(attackChoices ? { attackChoices, attackChoice: 0 } : {}), results: [] };
}

// The plan with the attack modifier picked: a spellgun's check at its user's spell or firearm attack modifier.
export function withAttackChoice(plan, state) {
    const choice = state?.attackChoices?.[state.attackChoice ?? 0];
    if (!plan?.ownCheck?.choose || !choice) return plan;
    return { ...plan, resolution: { ...plan.resolution, check: { ...plan.resolution.check, statistic: `${choice.kind} attack`, modifier: choice.modifier } } };
}

// After a use: still open for a repeatable later card within its time, else done.
export function afterExposure(state, lines, worldTime) {
    const uses = (state.uses ?? 0) + 1;
    const keep = Boolean(state.later && state.repeat) && (state.until === null || state.until === undefined || worldTime < state.until);
    return { ...state, status: keep ? "open" : "applied", ...(state.repeat ? { uses } : {}), results: [...(state.results ?? []), ...lines].slice(-6) };
}

export function exposureCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const automatic = state.plan?.resolution?.check?.roll === "automatic";
    const checked = state.plan?.resolution?.check?.roll === "skill";
    const who = EXPOSED_BY[state.delivery] ?? AREA_WORDS(state.plan?.targeting?.area);
    const again = state.repeat ? ` It can be used again${state.uses ? ` (used ${state.uses} time${state.uses === 1 ? "" : "s"})` : ""} until its time is up, after each recharge.` : "";
    const hint = !open ? "" : state.own
        ? `<p class="aar-hint">${escape(state.user.name)}'s own save (${escape(saveText(state.plan))}).</p>`
        : state.attacker
        ? `<p class="aar-hint">Each time a creature attacks ${escape(state.user.name)} while it lasts, target that creature (${escape(saveText(state.plan))}) and press the button.${escape(again)}</p>`
        : state.later
        ? `<p class="aar-hint">Kept for later: when ${escape(state.user.name)} uses it, target ${escape(who)} (${escape(saveText(state.plan))}) and press the button.${escape(again)}</p>`
        : `<p class="aar-hint">${state.delivery ? "Exposes" : automatic ? "For" : checked ? "A check at" : "A save for"} ${escape(who)} (${escape(saveText(state.plan))}). Target them, then press the button.</p>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${state.own ? "Roll the save" : state.delivery ? "Expose my targets" : state.later ? "Use it: my targets" : automatic ? "Apply to my targets" : checked ? "Check: my targets" : "Save: my targets"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    const notes = open && (state.plan?.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    // (A damage to pick — Necklace of Fireballs' bead: a picker.)
    const pick = open && canApply && (state.plan?.damageChoices?.length ?? 0) > 1
        ? `<p class="aar-actions">Damage: <select data-air-field="damageChoice">${state.plan.damageChoices.map((choice, index) => `<option value="${index}"${index === (state.damageChoice ?? 0) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select></p>`
        : "";
    // (A spellgun's attack: the user's spell or firearm attack, a picker; none, the GM's roll.)
    const attack = !open || !state.plan?.ownCheck?.choose ? ""
        : (state.attackChoices ?? []).length > 1 && canApply
            ? `<p class="aar-actions">Attack: <select data-air-field="attackChoice">${state.attackChoices.map((choice, index) => `<option value="${index}"${index === (state.attackChoice ?? 0) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select></p>`
            : (state.attackChoices ?? []).length ? `<p class="aar-actions">Attack: ${escape(state.attackChoices[0].label)}</p>`
                : `<p class="aar-hint">${escape(state.user.name)} has no spell attack or firearm Strike: the GM rolls the attack.</p>`;
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${state.delivery ? `${escape(state.delivery)} poison` : automatic ? "No save" : checked ? "Check" : escape(saveText(state.plan))}</span></header>${hint}${attack}${pick}${notes}${results}${controls}</section>`;
}

