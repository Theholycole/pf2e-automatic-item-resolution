// An item a staff for a while (src/compiler/staff-form.js, scripts/staff-form.js; Sorshen's Sinuous Guisarme's Arcane Shift, 2026-10-29): the
// staff's spells read from its description, the item's weapon made the staff's (its own kept to put back), the form's Effect with its
// charges on its badge, and the staff card. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const STAFF_FORM = "staffForm";

// A staff's spells by rank, as its description lists them ("Cantrip @UUID[…]{Daze}", "1st @UUID[…]{Charm}, @UUID[…]{Command}") →
// [{ rank (0 a cantrip), uuid, name }].
const RANK_ROW = /<(li|p)>\s*<strong>\s*(Cantrips?|\d+(?:st|nd|rd|th))\s*<\/strong>([\s\S]*?)<\/\1>/g;
export function staffSpellsOf(html) {
    const spells = [];
    for (const [, , label, row] of String(html ?? "").matchAll(RANK_ROW)) {
        const rank = /^cantrip/i.test(label) ? 0 : Number.parseInt(label, 10);
        for (const [, uuid, name] of row.matchAll(/@UUID\[([^\]]+)\]\{([^}]+)\}/g)) spells.push({ rank, uuid, name });
    }
    return spells;
}

// The weapon traits that are its build, not its magic: the staff's replace the item's own.
const BUILD = /^(?:two-hand-d\d+|monk|parry|trip|reach|shove|sweep|backswing|disarm|finesse|agile|forceful|deadly-d\d+|fatal(?:-aim)?-d\d+|versatile-[a-z]+|thrown(?:-\d+)?|twin|nonlethal|propulsive|volley-\d+|jousting-d\d+|brace|ranged-trip|razing|hampering|free-hand|grapple|concealable|climbing|backstabber|combination|capacity-\d+|concussive|kickback|scatter-\d+|repeating|modular)$/;
const WEAPON = ["damage", "group", "baseItem", "category", "usage", "bulk", "range", "reload"];

// The item's source and the staff's → { update, kept }: its weapon the staff's (its damage, group, base, category, hands, Bulk and build
// traits), its runes off when the form says so; kept, its own, put back by revertUpdate. Not the staff trait: the spell module claims an item
// with it as a staff of its own (found live 2026-10-29), and the item's activations would be gone with it.
export function staffWeaponUpdate(item, staff, { runesOff = true } = {}) {
    const own = item?.system ?? {};
    const theirs = staff?.system ?? {};
    const kept = { ...Object.fromEntries(WEAPON.map((key) => [key, structuredClone(own[key] ?? null)])), traits: [...(own.traits?.value ?? [])], runes: structuredClone(own.runes ?? null) };
    const traits = [...new Set([...(own.traits?.value ?? []).filter((trait) => !BUILD.test(trait)), ...(theirs.traits?.value ?? []).filter((trait) => BUILD.test(trait))])].sort();
    const update = { ...Object.fromEntries(WEAPON.filter((key) => theirs[key] !== undefined).map((key) => [`system.${key}`, structuredClone(theirs[key])])), "system.traits.value": traits };
    if (runesOff) update["system.runes"] = { potency: 0, striking: 0, property: [] };
    return { update, kept };
}

// Its own weapon back from what was kept.
export function revertUpdate(kept) {
    const update = Object.fromEntries(WEAPON.filter((key) => kept?.[key] !== undefined && kept[key] !== null).map((key) => [`system.${key}`, structuredClone(kept[key])]));
    if (kept?.traits) update["system.traits.value"] = [...kept.traits];
    if (kept?.runes) update["system.runes"] = structuredClone(kept.runes);
    return update;
}

// The form's Effect on its user: its badge the charges (gone at the last, PF2e's counter), the staff's own rules (its Diplomacy bonus to Request).
export function staffFormEffectSource(form, { item = {}, user = {}, staff = {}, spells = [], rules = [], worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const itemId = /\.Item\.([A-Za-z0-9]+)$/.exec(String(item.uuid ?? ""))?.[1] ?? null;
    return {
        name: `${item.name}: ${staff.name}`,
        type: "effect",
        img: staff.img ?? item.img ?? "icons/svg/item-bag.svg",
        flags: { [moduleId]: { [STAFF_FORM]: { itemId, itemUuid: item.uuid ?? null, itemName: item.name ?? null, staff: { uuid: staff.uuid ?? form.staff.uuid, name: staff.name ?? form.staff.name }, spells, mythic: form.mythic ?? null, max: form.charges } } },
        system: {
            description: { value: `<p><strong>${escape(item.name)}</strong> is a ${escape(staff.name)} with ${form.charges} charges (this Effect's badge); it's its own form again once they're spent, or once this Effect is deleted.</p>` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            badge: { type: "counter", value: form.charges, min: 1, max: form.charges },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules: structuredClone(rules ?? [])
        }
    };
}

// What a cast costs in charges: the mythic heightening's, 1 with a spell slot, else the spell's rank (a cantrip none).
export const chargesFor = (spell, { mythic = false, slot = false } = {}, form = {}) => (mythic ? Number(form.mythic?.charges) || 0 : spell.rank === 0 ? 0 : slot ? 1 : spell.rank);

// A DC at mythic proficiency: its proficiency bonus the creature's level + 10 in place of its own — the better of the two.
export const mythicDC = ({ dc, proficiency = 0, level = 0 }) => Math.max(Number(dc) || 0, (Number(dc) || 0) - (Number(proficiency) || 0) + (Number(level) || 0) + 10);

export function createStaffCard({ plan, item, user, form }) {
    return { kind: "staff-form", status: "open", plan, item, user, form, pick: 0, results: [] };
}

const rankWords = (spell) => (spell.rank === 0 ? "cantrip" : `rank ${spell.rank}`);
const costWords = (spell) => (spell.rank === 0 ? "free" : `${spell.rank} charge${spell.rank === 1 ? "" : "s"}`);

export function staffCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const form = state.form;
    const mythic = form.mythic;
    const options = (form.spells ?? []).map((spell, index) => `<option value="${index}"${index === state.pick ? " selected" : ""}>${escape(rankWords(spell))}: ${escape(spell.name)} (${escape(costWords(spell))})</option>`).join("");
    const revert = `<option value="-1">Revert it to its own form</option>`;
    const fields = open && canApply
        ? `<p><select data-air-field="pick">${options}${revert}</select></p>${mythic ? `<p><label><input type="checkbox" data-air-field="mythic" /> Rank ${mythic.rank} at mythic proficiency: ${mythic.charges} charges and 1 Mythic Point</label></p>` : ""}<p><label><input type="checkbox" data-air-field="slot" /> A spontaneous caster's slot of its rank and 1 charge</label></p>`
        : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Cast from the staff</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(form.staff.name)}: ${escape(form.charges)} charge${form.charges === 1 ? "" : "s"} left</span></header>${open ? `<ul class="aar-notes">${(state.plan.notes ?? []).map((note) => `<li>${escape(note)}</li>`).join("")}<li>Target the creatures it's cast at first.</li></ul>` : ""}${fields}${results}${controls}</section>`;
}
