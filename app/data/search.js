import {
	SEARCH_CACHE,
	SEARCH_LIMIT,
	SEARCH_ORIGIN,
	SEARCH_TTL,
	SIZE,
} from "../settings.js";
import { json } from "./client.js";
import { state } from "../state.js";
import { render } from "../render.js";
const cache = new Map();
const kind = (hit) => {
	const tags = Array.isArray(hit._tags) ? hit._tags : [];
	if (tags.includes("job")) return "job";
	if (tags.includes("poll")) return "poll";
	return "story";
};
const story = (hit) => ({
	id: Number(hit.objectID),
	by: hit.author ?? null,
	score: Number(hit.points) || 0,
	descendants: Number(hit.num_comments) || 0,
	time: Number(hit.created_at_i) || 0,
	title: hit.title || "Untitled",
	text: hit.story_text || null,
	url: hit.url || null,
	type: kind(hit),
	dead: false,
	deleted: false,
});
export const find = async (
	query,
	sort = "relevance",
	page = 1,
	options = {},
) => {
	state.controller?.abort();
	state.controller = new AbortController();
	const token = ++state.token;
	const signal = state.controller.signal;
	const text = String(query ?? "").trim();
	const order = sort === "date" ? "date" : "relevance";
	const at = Math.max(1, Math.floor(Number(page)) || 1);
	if (!text) {
		state.search = {
			status: "idle",
			query: "",
			sort: order,
			page: 1,
			items: [],
			total: 0,
			pages: 0,
			capped: false,
		};
		render();
		return;
	}
	const key = order + ":" + at + ":" + text.toLowerCase();
	const entry = cache.get(key);
	if (!options.fresh && entry && Date.now() - entry.at < SEARCH_TTL) {
		cache.delete(key);
		cache.set(key, entry);
		state.search = { ...entry.data, status: "ready", query: text };
		render();
		return;
	}
	state.search = {
		status: "loading",
		query: text,
		sort: order,
		page: at,
		items: [],
		total: 0,
		pages: 0,
		capped: false,
	};
	render();
	const endpoint = order === "date" ? "search_by_date" : "search";
	const params = new URLSearchParams({
		query: text,
		tags: "story",
		hitsPerPage: String(SIZE),
		page: String(at - 1),
	});
	const url = SEARCH_ORIGIN + "/" + endpoint + "?" + params;
	try {
		const payload = await json(url, {
			signal,
			label: "Hacker News search",
		});
		if (token !== state.token || signal.aborted) return;
		if (
			!payload || typeof payload !== "object"
			|| !Array.isArray(payload.hits)
		) {
			throw new Error(
				"Hacker News search returned an unexpected response.",
			);
		}
		const items = payload.hits.map(story).filter((item) =>
			Number.isFinite(item.id) && item.id > 0
		);
		const total = Number(payload.nbHits) || 0;
		state.search = {
			status: "ready",
			query: text,
			sort: order,
			page: at,
			items,
			total,
			pages: Number(payload.nbPages) || 0,
			capped: total > SEARCH_LIMIT,
		};
		cache.delete(key);
		cache.set(key, { data: state.search, at: Date.now() });
		if (cache.size > SEARCH_CACHE) {
			cache.delete(cache.keys().next().value);
		}
		render();
	} catch (error) {
		if (token !== state.token || signal.aborted) return;
		console.error(error);
		state.search = {
			status: "error",
			query: text,
			sort: order,
			page: at,
			items: [],
			total: 0,
			pages: 0,
			capped: false,
			error,
		};
		render();
	}
};
