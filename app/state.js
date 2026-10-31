import { parse } from "./router.js";
import { recall } from "./theme.js";
const route = parse();
export const state = {
	theme: recall(),
	route,
	search: null,
	searchInput: route.name === "search" ? route.query : "",
	list: null,
	item: null,
	comments: null,
	collapsed: new Set(),
	token: 0,
	controller: new AbortController(),
};
