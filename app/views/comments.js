import { html } from "../../vendor.js";
import { format, label } from "../format.js";
import { markup } from "../markup.js";
import { state } from "../state.js";
import { Failure, Gap, Loading, Time } from "./common.js";
const Comment = (node, submitter) => {
	if (node.failed) {
		const retry = state.comments?.status === "ready" && !node.missing;
		return html`<li class="subtree" id="comment-${node.id}"><div class="comment bad"><div class="details"><div class="byline"><span class="gone">${
			node.missing ? "deleted" : "unavailable"
		}</span>${Gap()}<span class="summary">${
			node.missing
				? "This comment is no longer available."
				: "This comment could not be loaded."
		}</span>${
			retry
				? html`${Gap()}<button type="button" class="plain" data-act="comment" data-id="${node.id}">Retry</button>`
				: null
		}</div></div></div></li>`;
	}
	const item = node.item;
	const children = node.children;
	const collapsed = state.collapsed.has(item.id);
	const author = item.by || null;
	const same = !!author && author === submitter;
	const replies = collapsed ? node.size - 1 : 0;
	const action = collapsed ? "Expand" : "Collapse";
	const cache = state.comments?.views;
	const epoch = state.comments?.epoch || 0;
	const hit = cache?.get(item.id);
	const clipped = !!node.clipped;
	const stamp = clipped ? state.comments?.epoch || 0 : 0;
	if (
		hit && hit.collapsed === collapsed && hit.size === node.size
		&& hit.submitter === submitter && hit.clipped === clipped
		&& hit.stamp === stamp && hit.epoch === epoch
	) return hit.view;
	const view = html`<li class="subtree" id="comment-${item.id}"><div class="comment ${
		item.dead ? "bad" : ""
	}"><div class="voters"><button type="button" class="folder" data-act="toggle" data-id="${item.id}" aria-expanded="${
		collapsed ? "false" : "true"
	}" aria-label="${action} comment${
		author ? " by " + author : ""
	}" title="${action} comment"></button></div><div class="details"><div class="byline">${
		author
			? html`<a class="${
				same ? "author submitter" : ""
			}" href="https://news.ycombinator.com/user?id=${
				encodeURIComponent(author)
			}" target="_blank" rel="noreferrer">${author}</a>`
			: html`<span class="gone">deleted</span>`
	}${
		item.time
			? html`${Gap()}<a href="https://news.ycombinator.com/item?id=${item.id}" target="_blank" rel="noreferrer">${
				Time(item.time)
			}</a>`
			: null
	}${
		collapsed && replies
			? html`<span class="summary"> | ${
				format.format(replies)
			} ${replies === 1 ? "reply" : "replies"} hidden</span>`
			: null
	}</div> ${
		!collapsed
			? html`<div role="heading" aria-level="3" class="text">${
				item.deleted
					? html`<p><span class="gone">[deleted]</span></p>`
					: item.text
					? markup(item.text)
					: html`<p><span class="gone">[no text]</span></p>`
			}</div>`
			: null
	} </div></div> ${
		!collapsed && children.length
			? html`<ol class="comments">${
				children.map((child) => Comment(child, submitter))
			}</ol>`
			: null
	} </li>`;
	cache?.set(item.id, {
		collapsed,
		size: node.size,
		submitter,
		clipped,
		stamp,
		epoch,
		view,
	});
	return view;
};
export const Comments = (story) => {
	const comments = state.comments;
	if (!comments) {
		return html`<section id="comments"><h2 class="hidden">Comments</h2>${
			Loading(`Loading ${label(Number(story.descendants) || 0)}`)
		}</section>`;
	}
	if (comments.status === "error") {
		return html`<section id="comments"><h2 class="hidden">Comments</h2>${
			Failure(
				"Comments unavailable",
				"We couldn't load this discussion. Check your connection and try again.",
				"retry",
			)
		}</section>`;
	}
	if (!comments.nodes.length) {
		if (comments.status === "loading") {
			const progress = comments.loaded
				? ` — ${format.format(comments.loaded)} loaded`
				: "";
			return html`<section id="comments"><h2 class="hidden">Comments</h2>${
				Loading(`Loading ${label(comments.total)}${progress}`)
			}</section>`;
		}
		return html`<section id="comments"><h2 class="hidden">Comments</h2><p class="empty">No comments yet. <a href="https://news.ycombinator.com/item?id=${story.id}" target="_blank" rel="noreferrer">Join the discussion on Hacker News</a>.</p></section>`;
	}
	return html`<section id="comments"><h2 class="hidden">Comments</h2> ${
		comments.status === "ready" && comments.clipped
			? html`<p class="notice">Showing ${
				format.format(comments.loaded)
			} of ${
				format.format(comments.total)
			} comments. <a href="https://news.ycombinator.com/item?id=${story.id}" target="_blank" rel="noreferrer">Continue on Hacker News →</a></p>`
			: null
	} ${
		comments.status === "ready" && comments.failures
			? html`<p class="notice">Some comments could not be loaded. <button type="button" class="plain" data-act="retry">Retry all</button></p>`
			: null
	} <ol class="comments">${
		comments.nodes.map((node) => Comment(node, story.by))
	}</ol>${
		comments.status === "loading"
			? Loading(
				`Loading ${label(comments.total)} — ${
					format.format(comments.loaded)
				} loaded`,
			)
			: null
	}</section>`;
};
