import { make } from "../vendor.js";
import { SECTIONS } from "./settings.js";
import { mount } from "./browser.js";
import { state } from "./state.js";
import { App } from "./views/app.js";
let shown = null;
export const entitle = () => {
	let title = "Hackers";
	if (state.route.name === "list") {
		title = SECTIONS[state.route.section].label;
	} else if (state.route.name === "search") {
		title = state.route.query ? state.route.query + " — Search" : "Search";
	} else if (
		state.route.name === "item" && state.item?.status === "ready"
	) title = state.item.story.title || "Story";
	else if (state.route.name === "missing") title = "Page not found";
	if (document.title !== title) document.title = title;
};
export const reveal = () => {
	const path = state.route;
	const key = path.name === "list" ? "list:" + path.section : path.name;
	if (key === shown) return;
	shown = key;
	const nav = mount.querySelector("#header nav");
	const list = nav?.querySelector("ul");
	const active = list?.querySelector("[aria-current=\"page\"]");
	if (!nav || !list || !active) return;
	const area = nav.getBoundingClientRect();
	const spot = active.getBoundingClientRect();
	const padding = 20;
	if (spot.left < area.left + padding) {
		list.scrollLeft -= area.left + padding - spot.left;
	} else if (spot.right > area.right - padding) {
		list.scrollLeft += spot.right - (area.right - padding);
	}
};
export const fade = (event) => {
	if (event) {
		if (event.target === event.currentTarget) return;
		if (!event.target.matches?.("#header nav > ul")) return;
	}
	const list = mount.querySelector("#header nav > ul");
	if (!list) return;
	const max = list.scrollWidth - list.clientWidth;
	const scrollable = max > 1;
	list.classList.toggle("start", scrollable && list.scrollLeft > 1);
	list.classList.toggle(
		"end",
		scrollable && list.scrollLeft < max - 1,
	);
};
let queued = 0;
export const resize = () => {
	if (queued) return;
	queued = requestAnimationFrame(() => {
		queued = 0;
		fade();
	});
};
export const render = () => {
	entitle();
	make(mount, App());
};
