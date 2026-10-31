import { html } from "../../vendor.js";
import { submit, type } from "../actions.js";
import { format } from "../format.js";
import { searchHash } from "../router.js";
import { SEARCH_LIMIT } from "../settings.js";
import { state } from "../state.js";
import { Failure } from "./common.js";
import { Skeleton, Story } from "./story.js";
const Pager = (search) => {
	if (search.page <= 1 && search.page >= search.pages) return null;
	return html`<nav class="morelink" aria-label="Search result pages">${
		search.page > 1
			? html`<a href="${
				searchHash(search.query, search.sort, search.page - 1)
			}" rel="prev">Page ${search.page - 1}</a>`
			: null
	}${
		search.page < search.pages
			? html`<a href="${
				searchHash(search.query, search.sort, search.page + 1)
			}" rel="next">Page ${search.page + 1}</a>`
			: null
	}</nav>`;
};
const Head = (search) => {
	const text = state.searchInput.trim() || search.query;
	const count = search.status === "ready"
		? search.capped
			? html`Showing ${format.format(SEARCH_LIMIT)} of ${
				format.format(search.total)
			} results for <strong>${search.query}</strong>`
			: html`${format.format(search.total)} result${
				search.total === 1 ? "" : "s"
			} for <strong>${search.query}</strong>`
		: search.status === "loading"
		? "Searching…"
		: null;
	return html`<div class="search-head"><p class="search-count" role="status">${count}</p><nav class="search-sort" aria-label="Sort results"><a href="${
		searchHash(text, "relevance")
	}" aria-current="${
		search.sort === "relevance" ? "page" : null
	}">Relevant</a><a href="${
		searchHash(text, "date")
	}" aria-current="${
		search.sort === "date" ? "page" : null
	}">New</a></nav></div>`;
};
const Body = (search) => {
	if (!search.query || search.status === "idle") return null;
	if (search.status === "loading") return Skeleton();
	if (search.status === "error") {
		return Failure(
			"Search unavailable",
			"We couldn't reach Hacker News Search. Check your connection and try again.",
			"search",
		);
	}
	if (!search.items.length) {
		return html`<div class="empty search-empty"><p>No results for “${
			search.query
		}”.</p>${
			search.page > 1
				? html`<p><a href="${
					searchHash(search.query, search.sort, search.page - 1)
				}">Go back a page</a></p>`
				: null
		}</div>`;
	}
	return html`<ol class="stories list">${
		search.items.map((item) => Story(item))
	}</ol>${Pager(search)}`;
};
export const Search = () => {
	const route = state.route.name === "search" ? state.route : null;
	const stored = state.search;
	const query = stored?.query ?? route?.query ?? "";
	const sort = (stored?.sort ?? route?.sort) === "date"
		? "date"
		: "relevance";
	const page = Number(stored?.page ?? route?.page) || 1;
	const status = stored?.status ?? "idle";
	const items = Array.isArray(stored?.items) ? stored.items : [];
	const total = Number(stored?.total) || 0;
	const pages = Number(stored?.pages) || 0;
	const capped = Boolean(stored?.capped) || total > SEARCH_LIMIT;
	const search = { query, sort, page, status, items, total, pages, capped };
	const field = (state.searchInput ?? query).trim();
	return html`<div class="search"><form class="search-form" role="search" on:submit=${submit}><label class="hidden" for="search-input">Search Hacker News</label><input id="search-input" type="search" name="q" value="${
		state.searchInput ?? query
	}" on:input=${type} autocomplete="off" spellcheck="false" placeholder="Search by author, site, or title…" enterkeyhint="search"></form>${
		field && query ? Head(search) : null
	}${field ? Body(search) : null}</div>`;
};
