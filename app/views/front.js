import { html } from "../../vendor.js";
import { state } from "../state.js";
import { Failure, Pager } from "./common.js";
import { Skeleton, Story } from "./story.js";
export const Front = () => {
	const list = state.list;
	if (list?.status === "error") {
		return Failure(
			"Stories unavailable",
			"We couldn't reach the Hacker News API. Check your connection and try again.",
			"feed",
		);
	}
	if (!list || (list.status === "loading" && !list.items.length)) {
		return Skeleton();
	}
	if (!list.items.length) {
		return html`<div class="empty"><p>No stories found on this page.</p><p>${
			list.page > 1
				? html`<a href="#/${list.section}/${
					list.page - 1
				}">Go back a page</a>`
				: html`<a href="#/top">Return to the front page</a>`
		}</p></div>`;
	}
	return html`${
		list.failures
			? html`<p class="notice">Some stories could not be loaded. <button type="button" class="plain" data-act="feed">Retry</button></p>`
			: null
	}<ol class="stories list">${
		list.items.map((item) => Story(item))
	}</ol>${Pager(list)}`;
};
