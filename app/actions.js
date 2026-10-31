import { fine, media } from "./browser.js";
import { parse, searchHash } from "./router.js";
import { state } from "./state.js";
import { recall, skin } from "./theme.js";
import { fade, render, reveal } from "./render.js";
import { feed, retryStory } from "./data/feed.js";
import { find } from "./data/search.js";
import { open, retry, retryComment, toggle } from "./data/thread.js";
const TYPING = 250;
let typing = 0;
const cycle = () => {
	const order = ["system", "light", "dark"];
	const next = order[(order.indexOf(state.theme) + 1) % order.length];
	state.theme = next;
	skin(next);
	render();
	fade();
};
const runSearch = (query, sort = "relevance") => {
	const hash = searchHash(query, sort);
	if (location.hash !== hash) {
		try {
			history.replaceState(null, "", hash);
		} catch {
			location.hash = hash;
			return;
		}
	}
	state.route = parse();
	state.list = null;
	state.item = null;
	state.comments = null;
	state.collapsed = new Set();
	find(state.route.query, state.route.sort, 1);
	reveal();
	fade();
};
export const type = (event) => {
	state.searchInput = event.target.value;
	if (state.route.name === "search") render();
	if (typing) clearTimeout(typing);
	typing = setTimeout(() => {
		typing = 0;
		if (state.route.name !== "search") return;
		runSearch(state.searchInput.trim(), state.route.sort);
	}, TYPING);
};
export const submit = (event) => {
	event.preventDefault();
	if (typing) {
		clearTimeout(typing);
		typing = 0;
	}
	const query = state.searchInput.trim();
	const sort = state.route.name === "search" ? state.route.sort : "relevance";
	const hash = searchHash(query, sort);
	if (location.hash === hash) {
		state.list = null;
		state.item = null;
		state.comments = null;
		state.collapsed = new Set();
		find(query, sort, 1, { fresh: true });
		reveal();
		fade();
		return;
	}
	location.hash = hash;
};
export const route = () => {
	if (state.route.name === "list") {
		feed(state.route.section, state.route.page);
		return;
	}
	if (state.route.name === "item") {
		open(state.route.id);
		return;
	}
	if (state.route.name === "search") {
		state.searchInput = state.route.query;
		find(state.route.query, state.route.sort, state.route.page);
		return;
	}
	state.token++;
	render();
};
export const navigate = () => {
	if (typing) {
		clearTimeout(typing);
		typing = 0;
	}
	state.controller?.abort();
	state.controller = new AbortController();
	state.route = parse();
	state.search = null;
	state.searchInput = state.route.name === "search" ? state.route.query : "";
	state.list = null;
	state.item = null;
	state.comments = null;
	state.collapsed = new Set();
	window.scrollTo(0, 0);
	render();
	route();
	reveal();
	fade();
};
export const boot = () => {
	state.theme = recall();
	skin(state.theme);
	const sync = () => {
		if (state.theme === "system") {
			skin("system");
			render();
			fade();
		}
	};
	if (media.addEventListener) {
		media.addEventListener("change", sync);
	} else if (media.addListener) {
		media.addListener(sync);
	}
};
const act = (button) => {
	const name = button.dataset.act;
	if (name === "theme") cycle();
	else if (name === "feed") {
		const list = state.list;
		if (list) {
			state.controller?.abort();
			state.controller = new AbortController();
			feed(list.section, list.page, { fresh: true });
		}
	} else if (name === "open") {
		const item = state.item;
		if (item) open(item.id);
	} else if (name === "story") {
		retryStory(Number(button.dataset.id));
	} else if (name === "comment") {
		retryComment(Number(button.dataset.id));
	} else if (name === "search") {
		const search = state.search;
		find(
			search?.query ?? state.route.query,
			search?.sort ?? state.route.sort,
			search?.page ?? state.route.page,
			{ fresh: true },
		);
	} else if (name === "retry") {
		const item = state.item;
		if (item?.story) retry(item.story);
	} else if (name === "toggle") {
		toggle(Number(button.dataset.id));
	}
};
export const press = (event) => {
	if (event.button) return;
	if (
		event.type === "pointerdown"
		&& (!fine.matches || event.pointerType === "touch")
	) return;
	if (
		event.type === "click" && event.detail && fine.matches
		&& event.pointerType !== "touch"
	) return;
	const node = event.target.closest?.("a[href^='#/']");
	if (node) {
		if (
			event.metaKey || event.ctrlKey || event.shiftKey
			|| event.altKey
		) return;
		event.preventDefault();
		const href = node.getAttribute("href");
		if (location.hash !== href) location.hash = href;
		return;
	}
	const button = event.target.closest?.("button[data-act]");
	if (button) act(button);
};
