import { html } from "../../vendor.js";
import { SECTIONS } from "../settings.js";
import { Logo, Moon, Sun, System } from "./icons.js";
const Switch = (mode) => {
	const text = mode === "light"
		? "Light"
		: mode === "dark"
		? "Dark"
		: "Auto";
	const icon = mode === "light"
		? Sun()
		: mode === "dark"
		? Moon()
		: System();
	return html`<button type="button" class="toggle theme-toggle" data-act="theme" title="Theme: ${text} (click to change)" aria-label="Theme: ${text}. Change theme">${icon}<span class="label">${text}</span></button>`;
};
export const Header = (current) => {
	const active = (section) =>
		current.route.name === "list"
		&& current.route.section === section;
	return html`<header id="header"><div><h1 id="logo"><a href="#/top" title="Hackers — Hacker News" aria-label="Hackers home">${Logo()}</a></h1><nav aria-label="Menu"><ul> ${
		Object.entries(SECTIONS).map(([key, section]) =>
			html`<li><a href="#/${key}" aria-current="${
				active(key) ? "page" : null
			}">${section.label}</a></li>`
		)
	}<li><a href="#/search" aria-current="${
		current.route.name === "search" ? "page" : null
	}">Search</a></li></ul></nav>${Switch(current.theme)} </div></header>`;
};
