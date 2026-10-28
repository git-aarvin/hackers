import { html, make } from "./vendor.js";
const ORIGIN = "https://hacker-news.firebaseio.com/v0";
const SIZE = 25;
const LIMIT = 500;
const WORKERS = 8;
const COMMENT_WORKERS = 8;
const ITEM_TTL = 5 * 60 * 1000;
const PAGE_TTL = 5 * 60 * 1000;
const LIST_TTL = 60 * 1000;
const ITEM_CACHE = 2000;
const TIMEOUT = 15 * 1000;
const RETRIES = 2;
const KEY = "hackers:theme";
const mount = document.getElementById("app");
const media = window.matchMedia("(prefers-color-scheme: dark)");
const fine = window.matchMedia("(pointer: fine)");
const SECTIONS = {
	top: { label: "Top", endpoint: "topstories" },
	new: { label: "New", endpoint: "newstories" },
	best: { label: "Best", endpoint: "beststories" },
	ask: { label: "Ask", endpoint: "askstories" },
	show: { label: "Show", endpoint: "showstories" },
	jobs: { label: "Jobs", endpoint: "jobstories" },
};
const stories = new Map();
const lists = new Map();
const pages = new Map();
const texts = new Map();
const state = {
	theme: recall(),
	route: parse(),
	list: null,
	item: null,
	comments: null,
	collapsed: new Set(),
	token: 0,
	controller: new AbortController(),
};
const format = new Intl.NumberFormat();
let shown = null;
function recall() {
	try {
		const stored = localStorage.getItem(KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored;
		}
	} catch {}
	return "system";
}
const skin = (mode) => {
	const dark = mode === "dark" || (mode === "system" && media.matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	document.documentElement.dataset.mode = mode;
	const meta = document.querySelector("meta[name=\"theme-color\"]");
	if (meta) meta.setAttribute("content", dark ? "#0c0c0c" : "#fb651e");
	try {
		localStorage.setItem(KEY, mode);
	} catch {}
};
const cycle = () => {
	const order = ["system", "light", "dark"];
	const next = order[(order.indexOf(state.theme) + 1) % order.length];
	state.theme = next;
	skin(next);
	render();
	fade();
};
function parse() {
	const raw = location.hash.replace(/^#/, "");
	const path = raw.split("?")[0].replace(/^\/+/, "").replace(/\/+$/, "");
	if (!path) return { name: "list", section: "top", page: 1 };
	const parts = path.split("/");
	if (parts[0] === "item" && /^\d+$/.test(parts[1] || "")) {
		return { name: "item", id: Number(parts[1]) };
	}
	if (SECTIONS[parts[0]]) {
		const page = Number.parseInt(parts[1] || "1", 10);
		return {
			name: "list",
			section: parts[0],
			page: Number.isFinite(page) && page > 0 ? page : 1,
		};
	}
	return { name: "missing" };
}
const ago = (seconds) => {
	const span = Math.floor(Date.now() / 1000 - Number(seconds));
	if (!Number.isFinite(span) || span < 60) return "just now";
	const units = [
		[31536000, "year"],
		[2592000, "month"],
		[86400, "day"],
		[3600, "hour"],
		[60, "minute"],
	];
	for (const [size, unit] of units) {
		const count = Math.floor(span / size);
		if (count >= 1) {
			return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
		}
	}
	return "just now";
};
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const label = (count) => {
	const total = Number(count) || 0;
	if (!total) return "no comments";
	return format.format(total) + (total === 1 ? " comment" : " comments");
};
const link = (raw) => {
	if (!raw) return null;
	try {
		const url = new URL(raw, "https://news.ycombinator.com/");
		if (url.protocol === "http:" || url.protocol === "https:") {
			return url.href;
		}
	} catch {}
	return null;
};
const anchor = (raw) => {
	if (!raw) return null;
	try {
		const url = new URL(raw, "https://news.ycombinator.com/");
		if (
			url.protocol === "http:" || url.protocol === "https:"
			|| url.protocol === "mailto:"
		) return url.href;
	} catch {}
	return null;
};
const domain = (raw) => {
	const url = link(raw);
	if (!url) return "";
	try {
		return new URL(url).hostname.replace(/^www\./i, "");
	} catch {
		return "";
	}
};
const convert = (node) => {
	if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
	if (node.nodeType !== Node.ELEMENT_NODE) return null;
	const children = () =>
		[...node.childNodes].map(convert).filter((child) => child != null);
	switch (node.tagName.toLowerCase()) {
		case "p":
			return html`<p>${children()}</p>`;
		case "br":
			return html`<br>`;
		case "a": {
			const href = anchor(node.getAttribute("href"));
			return href
				? html`<a href="${href}" rel="nofollow noreferrer">${children()}</a>`
				: html`<span>${children()}</span>`;
		}
		case "i":
		case "em":
			return html`<em>${children()}</em>`;
		case "b":
		case "strong":
			return html`<strong>${children()}</strong>`;
		case "code":
			return html`<code>${children()}</code>`;
		case "pre":
			return html`<pre>${children()}</pre>`;
		case "blockquote":
			return html`<blockquote>${children()}</blockquote>`;
		case "ul":
			return html`<ul>${children()}</ul>`;
		case "ol":
			return html`<ol>${children()}</ol>`;
		case "li":
			return html`<li>${children()}</li>`;
		case "script":
		case "style":
		case "iframe":
		case "object":
		case "embed":
			return null;
		default:
			return html`<span>${children()}</span>`;
	}
};
const markup = (value) => {
	if (!value) return null;
	if (texts.has(value)) return texts.get(value);
	const page = new DOMParser().parseFromString(
		`<div id="content">${value}</div>`,
		"text/html",
	);
	const root = page.getElementById("content");
	const view = root
		? [...root.childNodes].map(convert).filter((node) => node != null)
		: null;
	if (texts.size > 2000) texts.clear();
	texts.set(value, view);
	return view;
};
const Sun = () =>
	html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
const Moon = () =>
	html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>`;
const System = () =>
	html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>`;
const Logo = () =>
	html`<svg class="mark" viewBox="0 0 256 256" role="img" aria-hidden="true" focusable="false"><rect width="256" height="256" fill="#FB651E"></rect><path fill="#FFFFFF" d="M119.373653,144.745813 L75.43296,62.4315733 L95.5144533,62.4315733 L121.36192,114.52416 C121.759575,115.452022 122.2235,116.413008 122.753707,117.407147 C123.283914,118.401285 123.747838,119.428546 124.145493,120.48896 C124.410597,120.886615 124.609422,121.251127 124.741973,121.582507 C124.874525,121.913886 125.007075,122.212123 125.139627,122.477227 C125.802386,123.802744 126.39886,125.095105 126.929067,126.354347 C127.459274,127.613589 127.923198,128.773399 128.320853,129.833813 C129.381268,127.580433 130.541078,125.1614 131.80032,122.57664 C133.059562,119.99188 134.351922,117.307747 135.67744,114.52416 L161.92256,62.4315733 L180.612267,62.4315733 L136.27392,145.739947 L136.27392,198.826667 L119.373653,198.826667 L119.373653,144.745813 Z"></path></svg>`;
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
	return html`<button type="button" class="toggle" data-act="theme" title="Theme: ${text} (click to change)" aria-label="Theme: ${text}. Change theme">${icon}<span class="label">${text}</span></button>`;
};
const Header = (current) => {
	const active = (section) =>
		current.route.name === "list"
		&& current.route.section === section;
	return html`<header id="header"><div><h1 id="logo"><a href="#/top" title="Hackers — Hacker News" aria-label="Hackers home">${Logo()}</a></h1><nav aria-label="Menu"><ul> ${
		Object.entries(SECTIONS).map(([key, section]) =>
			html`<li><a href="#/${key}" aria-current="${
				active(key) ? "page" : null
			}">${section.label}</a></li>`
		)
	} </ul></nav> ${Switch(current.theme)} </div></header>`;
};
const Footer = () =>
	html`<footer><nav aria-label="Footer"><a href="https://news.ycombinator.com/newsguidelines.html" target="_blank" rel="noreferrer">Guidelines</a> <a href="https://github.com/HackerNews/API" target="_blank" rel="noreferrer">API</a> <a href="https://github.com/git-aarvin/view" target="_blank" rel="noreferrer">View</a> <a href="https://github.com/git-aarvin/hackers" target="_blank" rel="noreferrer">Source</a> <a href="https://news.ycombinator.com" target="_blank" rel="noreferrer">Hacker News</a></nav></footer>`;
const Time = (seconds) => {
	if (!Number.isFinite(Number(seconds))) return null;
	const date = new Date(Number(seconds) * 1000);
	return html`<time title="${date.toLocaleString()}" datetime="${
		iso(Number(seconds))
	}">${ago(Number(seconds))}</time>`;
};
const Gap = () => html`<span class="gap">&ensp;</span>`;
const labels = (item) => {
	const tags = [];
	const title = item.title || "";
	if (/^ask hn\s*:/i.test(title)) {
		tags.push({
			label: "ask",
			style: "ask",
			href: "#/ask",
			title: "Ask Hacker News",
		});
	} else if (/^show hn\s*:/i.test(title)) {
		tags.push({
			label: "show",
			style: "show",
			href: "#/show",
			title: "Show Hacker News",
		});
	} else if (item.type === "job") {
		tags.push({
			label: "job",
			style: "job",
			href: "#/jobs",
			title: "Hacker News job",
		});
	} else if (item.type === "poll") {
		tags.push({
			label: "poll",
			style: "poll",
			title: "Hacker News poll",
		});
	}
	const source = link(item.url);
	if (source) {
		try {
			const url = new URL(source);
			const host = url.hostname.replace(/^www\./i, "");
			if (/\.pdf$/i.test(url.pathname)) {
				tags.push({
					label: "pdf",
					style: "media",
					title: "PDF document",
				});
			} else if (
				host === "youtube.com" || host === "youtu.be"
				|| host === "vimeo.com"
			) {
				tags.push({
					label: "video",
					style: "media",
					title: "Video",
				});
			} else if (host === "github.com") {
				tags.push({
					label: "github",
					style: "meta",
					title: "GitHub",
				});
			}
		} catch {}
	}
	return tags;
};
const Tags = (item) => {
	const tags = labels(item);
	if (!tags.length) return null;
	return html`${Gap()}<ul class="tags" aria-label="Tags">${
		tags.map((tag) =>
			html`<li>${
				tag.href
					? html`<a class="tag ${tag.style}" href="${tag.href}" title="${tag.title}">${tag.label}</a>`
					: html`<span class="tag ${tag.style}" title="${tag.title}">${tag.label}</span>`
			}</li>`
		)
	}</ul>`;
};
const StoryFailure = (item) =>
	html`<li class="story failed"><div class="liner"><div class="details"><span class="gone">${
		item.deleted ? "Story deleted." : "Story unavailable."
	}</span>${Gap()}${
		item.deleted
			? null
			: html`<button type="button" class="plain" data-act="story" data-id="${item.id}">Retry</button>`
	}</div></div></li>`;
const Story = (item, showComments = true) => {
	if (item === false) return null;
	if (item?.failed) return StoryFailure(item);
	if (!item) return Placeholder();
	const source = link(item.url);
	const href = source || `#/item/${item.id}`;
	const host = domain(item.url);
	const comments = Number(item.descendants) || 0;
	const job = item.type === "job";
	return html`<li class="story ${
		item.dead ? "deleted" : ""
	}"><div class="liner h-entry"><div class="voters"><span class="upvoter disabled${
		job ? " job" : ""
	}" title="${
		job ? "Voting is not available for job posts" : "Voting is not available"
	}" aria-disabled="true">${item.score ?? 0}</span></div><div class="details"><span role="heading" aria-level="1" class="link h-cite u-repost-of"><a class="u-url" href="${href}" rel="${
		source ? "ugc noreferrer" : null
	}">${item.title || "Untitled"}</a></span>${
		item.text
			? html`<a class="note" href="#/item/${item.id}" title="This story has text" aria-label="This story has text">☶</a>`
			: null
	}${Tags(item)}${
		host
			? html`${Gap()}<a class="domain" href="https://news.ycombinator.com/from?site=${
				encodeURIComponent(host)
			}" target="_blank" rel="noreferrer">${host}</a>`
			: null
	}<div class="byline">${
		item.by
			? html`<a class="u-author h-card" href="https://news.ycombinator.com/user?id=${
				encodeURIComponent(item.by)
			}" target="_blank" rel="noreferrer">${item.by}</a>`
			: html`<span class="gone">unknown</span>`
	}${
		item.time
			? html`${Gap()}<a href="https://news.ycombinator.com/item?id=${item.id}" target="_blank" rel="noreferrer">${
				Time(item.time)
			}</a>`
			: null
	}${
		showComments
			? html`<span class="count">${Gap()}<a role="heading" aria-level="2" href="#/item/${item.id}">${
				label(comments)
			}</a></span>`
			: null
	}</div></div></div>${
		showComments
			? html`<a href="#/item/${item.id}" class="bubble ${
				comments ? "" : "zero"
			}" aria-label="${
				label(comments)
			}"><span>${comments}</span></a>`
			: null
	}</li>`;
};
const Placeholder = () =>
	html`<li class="story skeleton"><div class="liner"><div class="voters"><span class="bar"></span></div><div class="details"><div class="bar"></div><div class="bar"></div></div></div></li>`;
const Skeleton = () =>
	html`<span class="hidden" role="status">Loading stories…</span><ol class="stories list ghosts" aria-hidden="true">${
		Array.from({ length: 8 }, Placeholder)
	}</ol>`;
const Loading = (message) =>
	html`<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
const Failure = (title, message, action) =>
	html`<div class="error" role="alert"><h1>${title}</h1><p>${message}</p>${
		action
			? html`<button type="button" data-act="${action}">Try again</button>`
			: null
	}</div>`;
const Pager = (list) => {
	if (list.page <= 1 && !list.more) return null;
	return html`<nav class="morelink" aria-label="Pagination"> ${
		list.page > 1
			? html`<a href="#/${list.section}/${
				list.page - 1
			}" rel="prev">Page ${list.page - 1}</a>`
			: null
	} ${
		list.more
			? html`<a href="#/${list.section}/${
				list.page + 1
			}" rel="next">Page ${list.page + 1}</a>`
			: null
	} </nav>`;
};
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
const Comments = (story) => {
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
const Front = () => {
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
const Thread = () => {
	const item = state.item;
	if (!item || item.status === "loading") {
		return Loading("Loading story…");
	}
	if (item.status === "error") {
		return Failure(
			"Story unavailable",
			"That story could not be found. It may have been deleted, or the Hacker News API may be unavailable.",
			"open",
		);
	}
	const story = item.story;
	return html`<ol class="stories">${Story(story, false)}</ol>${
		story.text
			? html`<div class="content"><div class="prose">${
				markup(story.text)
			}</div></div>`
			: null
	}${Comments(story)}`;
};
const Missing = () =>
	html`<div class="error"><h1>Page not found</h1><p>That page doesn't exist. <a href="#/top">Return to the front page</a>.</p></div>`;
const Page = () => {
	if (state.route.name === "list") return Front();
	if (state.route.name === "item") return Thread();
	return Missing();
};
const App = () =>
	html`${Header(state)}<main id="inside">${Page()}</main>${Footer()}`;
const entitle = () => {
	let title = "Hackers";
	if (state.route.name === "list") {
		title = SECTIONS[state.route.section].label;
	} else if (
		state.route.name === "item" && state.item?.status === "ready"
	) title = state.item.story.title || "Story";
	else if (state.route.name === "missing") title = "Page not found";
	if (document.title !== title) document.title = title;
};
const reveal = () => {
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
const fade = (event) => {
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
const resize = () => {
	if (queued) return;
	queued = requestAnimationFrame(() => {
		queued = 0;
		fade();
	});
};
const render = () => {
	entitle();
	make(mount, App());
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => 300 * 2 ** attempt + Math.random() * 250;
const pace = (size) => {
	let gate = null;
	let done = 0;
	return async () => {
		done++;
		if (!(done % size)) {
			gate = pause().then(() => {
				gate = null;
			});
		}
		if (gate) await gate;
	};
};
const limiter = (size) => {
	let active = 0;
	const queue = [];
	const next = () => {
		active--;
		queue.shift()?.();
	};
	return (task) =>
		new Promise((resolve, reject) => {
			const run = () => {
				active++;
				task().then(resolve, reject).finally(next);
			};
			if (active < size) run();
			else queue.push(run);
		});
};
const commentGate = limiter(COMMENT_WORKERS);
const request = async (url, signal) => {
	const controller = new AbortController();
	const timer = setTimeout(
		() =>
			controller.abort(
				new DOMException("Request timed out", "TimeoutError"),
			),
		TIMEOUT,
	);
	const abort = () => controller.abort(signal.reason);
	if (signal) {
		if (signal.aborted) controller.abort(signal.reason);
		else signal.addEventListener("abort", abort, { once: true });
	}
	try {
		return await fetch(url, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener("abort", abort);
	}
};
const json = async (url, options = {}) => {
	const signal = options.signal;
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await request(url, signal);
			if (!response.ok) {
				const error = new Error(
					"Hacker News API request failed (" + response.status + ")",
				);
				error.status = response.status;
				if (
					(response.status === 429 || response.status >= 500)
					&& attempt < RETRIES
				) {
					if (signal?.aborted) throw error;
					const after = Number(response.headers.get("retry-after"));
					await wait(
						Number.isFinite(after) && after > 0
							? after * 1000
							: backoff(attempt),
					);
					continue;
				}
				throw error;
			}
			return await response.json();
		} catch (error) {
			if (signal?.aborted) throw error;
			const retryable = error.status === 429 || error.status >= 500
				|| error.name === "TimeoutError"
				|| error.name === "AbortError"
				|| error.name === "TypeError";
			if (!retryable || attempt >= RETRIES) throw error;
			await wait(backoff(attempt));
		}
	}
};
const clearPages = (section) => {
	const prefix = section + ":";
	for (const key of pages.keys()) {
		if (key.startsWith(prefix)) pages.delete(key);
	}
};
const read = (id, options = {}) => {
	const key = String(id);
	const entry = stories.get(key);
	const now = Date.now();
	const signal = options.signal ?? state.controller?.signal;
	if (
		!options.fresh && entry && now - entry.at < ITEM_TTL
		&& (entry.settled || !entry.signal?.aborted)
	) {
		stories.delete(key);
		stories.set(key, entry);
		return entry.promise;
	}
	const next = {
		promise: null,
		at: now,
		signal,
		settled: false,
	};
	const task = json(`${ORIGIN}/item/${key}.json`, { signal })
		.then((value) => {
			next.settled = true;
			return value;
		})
		.catch((error) => {
			if (stories.get(key) === next) stories.delete(key);
			throw error;
		});
	next.promise = task;
	stories.set(key, next);
	if (stories.size > ITEM_CACHE) {
		for (const [oldKey, old] of stories) {
			if (stories.size <= ITEM_CACHE) break;
			if (old === next) continue;
			stories.delete(oldKey);
		}
	}
	return task;
};
const keys = (section, options = {}) => {
	const entry = lists.get(section);
	const now = Date.now();
	const signal = options.signal ?? state.controller?.signal;
	if (
		!options.fresh && entry && now - entry.at < LIST_TTL
		&& (entry.settled || !entry.signal?.aborted)
	) {
		return entry.promise;
	}
	const next = {
		promise: null,
		at: now,
		signal,
		settled: false,
	};
	const task = json(
		`${ORIGIN}/${SECTIONS[section].endpoint}.json`,
		{ signal },
	).then((ids) => {
		if (!Array.isArray(ids)) {
			throw new Error("Hacker News returned an unexpected list.");
		}
		next.settled = true;
		return ids;
	}).catch((error) => {
		if (lists.get(section) === next) lists.delete(section);
		throw error;
	});
	next.promise = task;
	lists.set(section, next);
	if (entry) clearPages(section);
	return task;
};
const feed = async (section, page, options = {}) => {
	const token = ++state.token;
	const key = section + ":" + page;
	const cached = pages.get(key);
	if (!options.fresh && cached && Date.now() - cached.at < PAGE_TTL) {
		state.list = {
			status: "ready",
			section,
			page,
			...cached.data,
		};
		render();
		return;
	}
	state.list = {
		status: "loading",
		section,
		page,
		items: [],
		more: false,
		total: 0,
		failures: 0,
	};
	render();
	const signal = state.controller?.signal;
	try {
		const ids = await keys(section, { signal, fresh: options.fresh });
		if (token !== state.token) return;
		const start = (page - 1) * SIZE;
		const slice = ids.slice(start, start + SIZE);
		if (!slice.length) {
			const data = {
				items: [],
				more: false,
				total: ids.length,
				failures: 0,
			};
			pages.set(key, { data, at: Date.now() });
			state.list = { status: "ready", section, page, ...data };
			render();
			return;
		}
		const items = new Array(slice.length).fill(null);
		const list = state.list;
		list.items = items;
		list.more = start + SIZE < ids.length;
		list.total = ids.length;
		list.status = "streaming";
		render();
		let failures = 0;
		let next = 0;
		let frame = 0;
		const tick = pace(8);
		const paint = () => {
			frame = 0;
			if (token === state.token) render();
		};
		const flush = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const worker = async () => {
			while (next < slice.length) {
				const index = next++;
				try {
					const story = await read(slice[index], {
						signal,
						fresh: options.fresh,
					});
					if (token !== state.token) return;
					if (story && !story.deleted) {
						items[index] = story;
					} else if (story?.deleted) {
						items[index] = {
							failed: true,
							id: slice[index],
							deleted: true,
						};
					} else {
						failures++;
						list.failures = failures;
						items[index] = {
							failed: true,
							id: slice[index],
						};
					}
				} catch (error) {
					if (token !== state.token || signal?.aborted) return;
					failures++;
					list.failures = failures;
					items[index] = { failed: true, id: slice[index] };
				}
				flush();
				await tick();
			}
		};
		await Promise.all(
			Array.from(
				{ length: Math.min(WORKERS, slice.length) },
				() => worker(),
			),
		);
		if (token !== state.token) return;
		if (frame) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
		const final = items.filter((item) => item !== null);
		const data = {
			items: final,
			more: list.more,
			total: list.total,
			failures,
		};
		pages.set(key, { data, at: Date.now() });
		state.list = { status: "ready", section, page, ...data };
		render();
	} catch (error) {
		if (token !== state.token || signal?.aborted) return;
		console.error(error);
		state.list = {
			status: "error",
			section,
			page,
			items: [],
			more: false,
			total: 0,
			failures: 0,
			error,
		};
		render();
	}
};
const retryStory = async (id) => {
	const list = state.list;
	if (!list || !Array.isArray(list.items)) return;
	const index = list.items.findIndex((item) =>
		item?.failed && item.id === id
	);
	if (index < 0) return;
	const token = state.token;
	const signal = state.controller?.signal;
	try {
		const story = await read(id, { fresh: true, signal });
		if (token !== state.token) return;
		if (story && !story.deleted) {
			list.items[index] = story;
		} else {
			list.items[index] = {
				failed: true,
				id,
				deleted: !!story?.deleted,
			};
		}
		list.failures = list.items.filter((item) =>
			item?.failed && !item.deleted
		).length;
		const entry = pages.get(list.section + ":" + list.page);
		if (entry) {
			entry.data.items = list.items;
			entry.data.failures = list.failures;
			entry.at = Date.now();
		}
		render();
	} catch (error) {
		if (signal?.aborted) return;
		console.error(error);
	}
};
const initialComments = (total) => ({
	status: "loading",
	nodes: [],
	loaded: 0,
	count: 0,
	total,
	failures: 0,
	clipped: false,
	views: new Map(),
	epoch: 0,
});
const makeReader = (token, options = {}) => {
	const signal = state.controller?.signal;
	return async (id) => {
		try {
			const item = await commentGate(() =>
				read(id, { signal, fresh: options.fresh })
			);
			if (token !== state.token || signal?.aborted) return null;
			if (!item) {
				return {
					id,
					failed: true,
					missing: true,
					children: [],
					size: 0,
					clipped: false,
				};
			}
			return {
				id,
				item,
				children: [],
				size: 1,
				clipped: false,
			};
		} catch (error) {
			if (token !== state.token || signal?.aborted) return null;
			console.warn("Could not load comment " + id, error);
			return {
				id,
				failed: true,
				missing: false,
				children: [],
				size: 0,
				clipped: false,
			};
		}
	};
};
const open = async (id) => {
	state.controller?.abort();
	state.controller = new AbortController();
	const token = ++state.token;
	const signal = state.controller.signal;
	const prior = stories.get(String(id));
	state.item = { status: "loading", id };
	state.comments = null;
	state.collapsed = new Set();
	render();
	let story = null;
	try {
		story = await read(id, { fresh: true, signal });
	} catch (error) {
		if (token !== state.token || signal.aborted) return;
		story = prior?.settled
			? await prior.promise.catch(() => null)
			: null;
		if (!story) {
			console.error(error);
			state.item = { status: "error", id, error };
			render();
			return;
		}
	}
	if (token !== state.token) return;
	if (!story || (!story.title && !story.text)) {
		console.error(new Error("Story not found"));
		state.item = { status: "error", id };
		render();
		return;
	}
	state.item = { status: "ready", story };
	state.comments = initialComments(Number(story.descendants) || 0);
	render();
	try {
		await discuss(story, token);
	} catch (error) {
		if (token !== state.token || signal.aborted) return;
		console.error(error);
		if (state.comments) {
			state.comments.status = "error";
			render();
		}
	}
};
const makeFlusher = (comments, token, stats) => {
	let timer = 0;
	let last = 0;
	const paint = () => {
		timer = 0;
		if (token !== state.token || state.comments !== comments) return;
		comments.epoch++;
		comments.count = stats.count;
		comments.loaded = stats.loaded;
		comments.failures = stats.failures;
		comments.clipped = stats.clipped;
		render();
		last = performance.now();
	};
	const flush = () => {
		if (timer || token !== state.token) return;
		const delay = Math.max(0, 150 - (performance.now() - last));
		timer = setTimeout(paint, delay);
	};
	const stop = () => {
		if (!timer) return;
		clearTimeout(timer);
		timer = 0;
	};
	return { flush, stop };
};
const walkComments = async (ids, parent, context) => {
	const { token, reader, stats } = context;
	const pending = [];
	let next = 0;
	let clipped = false;
	const stop = () => stats.count >= LIMIT;
	const start = () => {
		while (
			pending.length < COMMENT_WORKERS && next < ids.length && !stop()
		) {
			const id = ids[next++];
			pending.push({ id, task: reader(id) });
		}
	};
	for (;;) {
		if (token !== state.token) return false;
		if (stop()) {
			if (pending.length || next < ids.length) clipped = true;
			break;
		}
		start();
		if (!pending.length) break;
		const { task } = pending.shift();
		const node = await task;
		if (token !== state.token) return false;
		if (!node) return false;
		stats.count++;
		if (node.failed) {
			if (!node.missing) stats.failures++;
		} else {
			stats.loaded++;
		}
		parent.push(node);
		context.flush();
		if (!node.failed) {
			const kids = Array.isArray(node.item.kids) ? node.item.kids : [];
			if (kids.length) {
				const done = await walkComments(
					kids,
					node.children,
					context,
				);
				if (!done) return false;
			}
		}
		node.size = 1
			+ node.children.reduce((sum, child) => sum + child.size, 0);
		context.flush();
	}
	if (clipped) stats.clipped = true;
	return true;
};
const discuss = async (story, token) => {
	const comments = state.comments;
	if (!comments || token !== state.token) return;
	comments.total = Number(story.descendants) || 0;
	const kids = Array.isArray(story.kids) ? story.kids : [];
	const stats = {
		count: 0,
		loaded: 0,
		failures: 0,
		clipped: false,
	};
	const { flush, stop } = makeFlusher(comments, token, stats);
	try {
		if (kids.length) {
			const done = await walkComments(kids, comments.nodes, {
				token,
				reader: makeReader(token),
				stats,
				flush,
			});
			if (!done) return;
		}
		if (token !== state.token || state.comments !== comments) return;
		stop();
		if (stats.count >= LIMIT && comments.total > stats.count) {
			stats.clipped = true;
		}
		comments.status = "ready";
		comments.count = stats.count;
		comments.loaded = stats.loaded;
		comments.failures = stats.failures;
		comments.clipped = stats.clipped;
		comments.epoch++;
		render();
	} catch (error) {
		if (token !== state.token || state.comments !== comments) return;
		stop();
		console.error(error);
		comments.status = "error";
		render();
	}
};
const locate = (nodes, id, chain = []) => {
	for (const node of nodes) {
		chain.push(node);
		if (node.id === id) return chain;
		if (node.children.length) {
			const found = locate(node.children, id, chain);
			if (found) return found;
		}
		chain.pop();
	}
	return null;
};
const measure = (node) => {
	node.size = 1
		+ node.children.reduce((sum, child) => sum + child.size, 0);
};
const toggle = (id) => {
	const comments = state.comments;
	if (comments?.views) {
		const chain = locate(comments.nodes, id);
		if (chain) {
			for (const node of chain) comments.views.delete(node.id);
		}
	}
	if (state.collapsed.has(id)) state.collapsed.delete(id);
	else state.collapsed.add(id);
	render();
};
const retry = async (story) => {
	state.controller?.abort();
	state.controller = new AbortController();
	const token = ++state.token;
	state.comments = initialComments(Number(story.descendants) || 0);
	render();
	await discuss(story, token);
};
const retryComment = async (id) => {
	const comments = state.comments;
	if (!comments || comments.status !== "ready") return;
	const chain = locate(comments.nodes, id);
	if (!chain) return;
	const node = chain[chain.length - 1];
	if (!node.failed || node.missing) return;
	const token = state.token;
	const fresh = await makeReader(token, { fresh: true })(id);
	if (token !== state.token || !fresh || fresh.failed) return;
	const parent = chain.length > 1
		? chain[chain.length - 2].children
		: comments.nodes;
	const index = parent.indexOf(node);
	if (index < 0) return;
	parent[index] = fresh;
	for (const item of chain) comments.views.delete(item.id);
	const stats = {
		count: comments.count,
		loaded: comments.loaded + 1,
		failures: Math.max(0, comments.failures - 1),
		clipped: comments.clipped,
	};
	const { flush, stop } = makeFlusher(comments, token, stats);
	const kids = Array.isArray(fresh.item.kids) ? fresh.item.kids : [];
	try {
		if (kids.length) {
			if (stats.count >= LIMIT) {
				stats.clipped = true;
				fresh.clipped = true;
			} else {
				const done = await walkComments(kids, fresh.children, {
					token,
					reader: makeReader(token),
					stats,
					flush,
				});
				if (!done) return;
			}
		}
	} catch (error) {
		if (token !== state.token) return;
		console.error(error);
	}
	if (token !== state.token || state.comments !== comments) return;
	stop();
	measure(fresh);
	for (let i = chain.length - 2; i >= 0; i--) measure(chain[i]);
	comments.count = stats.count;
	comments.loaded = stats.loaded;
	comments.failures = stats.failures;
	comments.clipped = stats.clipped;
	comments.epoch++;
	render();
};
const route = () => {
	if (state.route.name === "list") {
		feed(state.route.section, state.route.page);
		return;
	}
	if (state.route.name === "item") {
		open(state.route.id);
		return;
	}
	state.token++;
	render();
};
const navigate = () => {
	state.controller?.abort();
	state.controller = new AbortController();
	state.route = parse();
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
const boot = () => {
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
	} else if (name === "retry") {
		const item = state.item;
		if (item?.story) retry(item.story);
	} else if (name === "toggle") {
		toggle(Number(button.dataset.id));
	}
};
const press = (event) => {
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
boot();
mount.addEventListener("pointerdown", press);
mount.addEventListener("click", press);
window.addEventListener("hashchange", navigate);
window.addEventListener("resize", resize);
mount.addEventListener("scroll", fade, {
	capture: true,
	passive: true,
});
render();
route();
reveal();
fade();
