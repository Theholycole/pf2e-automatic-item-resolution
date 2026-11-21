// A plain Strike with a drake rifle: PF2e's Drake Shot notes off its damage roll (src/live/drake-shot.js). On the roller's client, as
// the message is created, so no one sees them; with Drake Shot readied (its card's Apply) they stay.

import { activationReadied, plainStrikeNotes, weaponIdOf } from "../src/live/drake-shot.js";
import { MODULE_KEY } from "../src/live/strike-card.js";
import { MODULE_ID } from "./foundry.js";

const textOf = (html) => {
    const element = document.createElement("div");
    element.innerHTML = String(html ?? "");
    return element.textContent.replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").trim();
};

export function withoutActivationNotes(document, data) {
    try {
        const context = data?.flags?.pf2e?.context;
        if (context?.type !== "damage-roll" || !Array.isArray(context.notes)) return;
        const { notes, dropped } = plainStrikeNotes(context.notes);
        if (!dropped.length) return;
        const actor = document.actor;
        const weaponId = weaponIdOf(context, data.flags.pf2e.origin);
        const riders = (actor?.itemTypes?.effect ?? []).map((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]).filter(Boolean);
        if (activationReadied(riders, weaponId)) return;
        // Its lines in the flavor: PF2e's <li class="roll-note" data-item-id="…">, by their words.
        const words = dropped.map((note) => textOf(game.i18n.localize(note.text)));
        const holder = window.document.createElement("div");
        holder.innerHTML = String(document.flavor ?? data.flavor ?? "");
        for (const line of holder.querySelectorAll("li.roll-note")) {
            if (weaponId && line.dataset.itemId && line.dataset.itemId !== weaponId) continue;
            const said = textOf(line.innerHTML);
            if (words.some((text) => text && said.includes(text))) line.remove();
        }
        for (const list of holder.querySelectorAll("ul.notes")) if (!list.querySelector("li")) list.remove();
        document.updateSource({ flavor: holder.innerHTML, "flags.pf2e.context.notes": notes });
    } catch (error) {
        console.warn(`${MODULE_ID} | Leaving Drake Shot's notes off a plain Strike failed.`, error);
    }
}

export function setUpActivationNotes() {
    Hooks.on("preCreateChatMessage", (document, data) => withoutActivationNotes(document, data));
}
