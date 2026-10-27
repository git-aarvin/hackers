(() => {
	"use strict";
	const salt = "v" + Math.random().toString(36).slice(2);
	const pattern = new RegExp(salt + "(\\d+);");
	const cache = new WeakMap();
	const roots = new WeakMap();
	const html = (strings, ...values) => ({ strings, values });
	const nodes = (root) => {
		const walker = document.createTreeWalker(root, 129);
		const found = [];
		while (walker.nextNode()) found.push(walker.currentNode);
		return found;
	};
	const compile = (strings) => {
		let entry = cache.get(strings);
		if (entry) return entry;
		let source = "", inside = false;
		strings.forEach((piece, index) => {
			source += piece;
			const open = piece.lastIndexOf("<"),
				close = piece.lastIndexOf(">");
			if (open + close > -2) inside = open > close;
			if (index < strings.length - 1) {
				source += inside
					? `${salt}${index};`
					: `<!--${salt}${index}-->`;
			}
		});
		const template = document.createElement("template");
		template.innerHTML = source;
		const children = [], attributes = [];
		nodes(template.content).forEach((node, index) => {
			if (node.nodeType === 8) {
				if (node.data.startsWith(salt)) {
					children.push({
						index,
						which: +node.data.slice(salt.length),
					});
				}
			} else {for (const { name, value } of [...node.attributes]) {
					if (!value.includes(salt)) continue;
					node.removeAttribute(name);
					attributes.push({
						index,
						name,
						pieces: value.split(pattern),
					});
				}}
		});
		cache.set(
			strings,
			entry = { template, parts: [...children, ...attributes] },
		);
		return entry;
	};
	const mark = (anchor) =>
		anchor.parentNode.insertBefore(new Comment(), anchor);
	const slot = (end) => ({ end, start: mark(end) });
	const cut = (from, until) => {
		const range = new Range();
		range.setStartBefore(from);
		range.setEndBefore(until);
		range.deleteContents();
	};
	const clear = (target) => {
		cut(target.start.nextSibling, target.end);
		target.strings =
			target.update =
			target.items =
			target.text =
				null;
	};
	const fill = (target, value) => {
		if (value?.strings) {
			if (target.strings === value.strings) {
				target.update(value.values);
			} else {(clear(target),
					(target.strings = value.strings),
					(target.update = build(target.end, value, target)));}
		} else if (Array.isArray(value)) {
			if (!target.items) (clear(target), (target.items = []));
			value.forEach((item, index) =>
				fill(target.items[index] ??= slot(mark(target.end)), item)
			);
			const extra = target.items.splice(value.length);
			if (extra.length) cut(extra[0].start, target.end);
		} else if (value == null || typeof value === "boolean") {
			clear(target);
		} else {
			const text = "" + value;
			if (target.text) target.text.data = text;
			else {(clear(target),
					target.end.before(target.text = new Text(text)));}
		}
	};
	const bind = (node, { name, pieces, which }, owner) => {
		if (!pieces) {
			const target = slot(node);
			return (values) => fill(target, values[which]);
		}
		const kind = name.match(/^on:?(.+)/);
		if (kind) {
			let handler;
			node.addEventListener(kind[1], (event) => {
				const output = handler?.call(node, event);
				if (output?.strings) fill(owner, output);
			});
			return (values) => void (handler = values[pieces[1]]);
		}
		const solo = pieces.length === 3 && !pieces[0] && !pieces[2];
		let previous;
		return (values) => {
			const value = solo
				? values[pieces[1]]
				: pieces.map((piece, index) =>
					index % 2 ? (values[piece] ?? "") : piece
				).join("");
			if (name === "value") {
				const text = value == null ? "" : "" + value;
				if (node.value !== text) node.value = text;
			} else if (name === "checked" || name === "selected") {
				node[name] = !!value;
			} else if (value !== previous) {
				previous = value;
				if (value == null || value === false) {
					node.removeAttribute(name);
				} else node.setAttribute(name, value === true ? "" : value);
			}
		};
	};
	const build = (anchor, view, owner) => {
		const { template, parts } = compile(view.strings);
		const root = template.content.cloneNode(true);
		const found = nodes(root);
		const binds = parts.map((part) =>
			bind(found[part.index], part, owner)
		);
		const update = (values) => binds.forEach((apply) => apply(values));
		update(view.values);
		anchor.before(root);
		return update;
	};
	const make = (host, view) => {
		let root = roots.get(host);
		if (!root) {
			host.replaceChildren(new Comment());
			roots.set(host, root = slot(host.firstChild));
		}
		fill(root, view);
		return host;
	};
	const API_ROOT = "https://hacker-news.firebaseio.com/v0";
	const PAGE_SIZE = 25;
	const COMMENT_LIMIT = 500;
	const COMMENT_CONCURRENCY = 14;
	const THEME_KEY = "hackers:theme";
	const appRoot = document.getElementById("app");
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const SECTIONS = {
		top: { label: "Top", endpoint: "topstories" },
		new: { label: "New", endpoint: "newstories" },
		best: { label: "Best", endpoint: "beststories" },
		ask: { label: "Ask", endpoint: "askstories" },
		show: { label: "Show", endpoint: "showstories" },
		jobs: { label: "Jobs", endpoint: "jobstories" },
	};
	const itemCache = new Map();
	const listIdsCache = new Map();
	const pageCache = new Map();
	const textCache = new Map();
	const state = {
		theme: readTheme(),
		route: parseRoute(),
		list: null,
		item: null,
		comments: null,
		collapsed: new Set(),
		requestId: 0,
	};
	const numberFormat = new Intl.NumberFormat();
	function readTheme() {
		try {
			const stored = localStorage.getItem(THEME_KEY);
			if (
				stored === "light" || stored === "dark" || stored === "system"
			) return stored;
		} catch {}
		return "system";
	}
	function applyTheme(mode) {
		const dark = mode === "dark"
			|| (mode === "system" && mediaQuery.matches);
		document.documentElement.dataset.theme = dark ? "dark" : "light";
		document.documentElement.dataset.themeMode = mode;
		const meta = document.querySelector("meta[name=\"theme-color\"]");
		if (meta) {
			meta.setAttribute("content", dark ? "#0c0c0c" : "#fb651e");
		}
		try {
			localStorage.setItem(THEME_KEY, mode);
		} catch {}
	}
	function cycleTheme() {
		const order = ["system", "light", "dark"];
		const next = order[(order.indexOf(state.theme) + 1) % order.length];
		state.theme = next;
		applyTheme(next);
		render();
	}
	function parseRoute() {
		const raw = location.hash.replace(/^#/, "");
		const path = raw.split("?")[0].replace(/^\/+/, "").replace(
			/\/+$/,
			"",
		);
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
		return { name: "notfound" };
	}
	function relativeTime(unixSeconds) {
		const seconds = Math.floor(Date.now() / 1000 - Number(unixSeconds));
		if (!Number.isFinite(seconds) || seconds < 60) return "just now";
		const units = [
			[31536000, "year"],
			[2592000, "month"],
			[86400, "day"],
			[3600, "hour"],
			[60, "minute"],
		];
		for (const [size, unit] of units) {
			const count = Math.floor(seconds / size);
			if (count >= 1) {
				return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
			}
		}
		return "just now";
	}
	function isoDate(unixSeconds) {
		return new Date(unixSeconds * 1000).toISOString();
	}
	function commentLabel(count) {
		const n = Number(count) || 0;
		if (!n) return "no comments";
		return numberFormat.format(n)
			+ (n === 1 ? " comment" : " comments");
	}
	function externalUrl(raw) {
		if (!raw) return null;
		try {
			const url = new URL(raw, "https://news.ycombinator.com/");
			if (url.protocol === "http:" || url.protocol === "https:") {
				return url.href;
			}
		} catch {}
		return null;
	}
	function commentUrl(raw) {
		if (!raw) return null;
		try {
			const url = new URL(raw, "https://news.ycombinator.com/");
			if (
				url.protocol === "http:" || url.protocol === "https:"
				|| url.protocol === "mailto:"
			) return url.href;
		} catch {}
		return null;
	}
	function domainOf(raw) {
		const url = externalUrl(raw);
		if (!url) return "";
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return "";
		}
	}
	function renderHnNode(node) {
		if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
		if (node.nodeType !== Node.ELEMENT_NODE) return null;
		const children = () =>
			[...node.childNodes].map(renderHnNode).filter((child) =>
				child != null
			);
		switch (node.tagName.toLowerCase()) {
			case "p":
				return html`<p>${children()}</p>`;
			case "br":
				return html`<br>`;
			case "a": {
				const href = commentUrl(node.getAttribute("href"));
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
	}
	function HnText(value) {
		if (!value) return null;
		if (textCache.has(value)) return textCache.get(value);
		const documentNode = new DOMParser().parseFromString(
			`<div id="hn-root">${value}</div>`,
			"text/html",
		);
		const root = documentNode.getElementById("hn-root");
		const view = root
			? [...root.childNodes].map(renderHnNode).filter((node) =>
				node != null
			)
			: null;
		if (textCache.size > 2000) textCache.clear();
		textCache.set(value, view);
		return view;
	}
	const SunIcon = () =>
		html`<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
	const MoonIcon = () =>
		html`<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>`;
	const SystemIcon = () =>
		html`<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>`;
	const YcMark = () =>
		html`<svg class="yc-mark" viewBox="0 0 256 256" role="img" aria-hidden="true" focusable="false"><rect width="256" height="256" fill="#FB651E"></rect><path fill="#FFFFFF" d="M119.373653,144.745813 L75.43296,62.4315733 L95.5144533,62.4315733 L121.36192,114.52416 C121.759575,115.452022 122.2235,116.413008 122.753707,117.407147 C123.283914,118.401285 123.747838,119.428546 124.145493,120.48896 C124.410597,120.886615 124.609422,121.251127 124.741973,121.582507 C124.874525,121.913886 125.007075,122.212123 125.139627,122.477227 C125.802386,123.802744 126.39886,125.095105 126.929067,126.354347 C127.459274,127.613589 127.923198,128.773399 128.320853,129.833813 C129.381268,127.580433 130.541078,125.1614 131.80032,122.57664 C133.059562,119.99188 134.351922,117.307747 135.67744,114.52416 L161.92256,62.4315733 L180.612267,62.4315733 L136.27392,145.739947 L136.27392,198.826667 L119.373653,198.826667 L119.373653,144.745813 Z"></path></svg>`;
	const ThemeToggle = (mode) => {
		const label = mode === "light"
			? "Light"
			: mode === "dark"
			? "Dark"
			: "Auto";
		const icon = mode === "light"
			? SunIcon()
			: mode === "dark"
			? MoonIcon()
			: SystemIcon();
		return html`<button type="button" class="theme-toggle" title="Theme: ${label} (click to change)" aria-label="Theme: ${label}. Change theme" onclick="${() =>
			cycleTheme()}">${icon}<span class="theme-label">${label}</span></button>`;
	};
	const Header = (current) => {
		const active = (section) =>
			current.route.name === "list"
			&& current.route.section === section;
		return html`<header id="header"><div id="header-top"><h1 id="logo"><a href="#/top" title="Hackers — Hacker News" aria-label="Hackers home">${YcMark()}</a></h1><nav aria-label="Menu"><ul> ${
			Object.entries(SECTIONS).map(([key, section]) =>
				html`<li><a href="#/${key}" aria-current="${
					active(key) ? "page" : null
				}">${section.label}</a></li>`
			)
		} </ul></nav> ${ThemeToggle(current.theme)} </div></header>`;
	};
	const Footer = () =>
		html`<footer><nav aria-label="Footer"><a href="https://news.ycombinator.com/newsguidelines.html" target="_blank" rel="noreferrer">Guidelines</a> <a href="https://github.com/HackerNews/API" target="_blank" rel="noreferrer">API</a> <a href="https://github.com/git-aarvin/view" target="_blank" rel="noreferrer">View</a> <a href="https://github.com/git-aarvin/hackers" target="_blank" rel="noreferrer">Source</a> <a href="https://news.ycombinator.com" target="_blank" rel="noreferrer">Hacker News</a></nav></footer>`;
	const Time = (unixSeconds) => {
		if (!Number.isFinite(Number(unixSeconds))) return null;
		const date = new Date(Number(unixSeconds) * 1000);
		return html`<time title="${date.toLocaleString()}" datetime="${
			isoDate(Number(unixSeconds))
		}">${relativeTime(Number(unixSeconds))}</time>`;
	};
	const Caches = (url) =>
		html`<span aria-hidden="true"> | </span><details class="caches" name="caches"><summary>caches</summary><ul><li><a href="https://web.archive.org/web/2/${
			encodeURIComponent(url)
		}" target="_blank" rel="noreferrer">Archive.org</a></li><li><a href="https://ghostarchive.org/search?term=${
			encodeURIComponent(url)
		}" target="_blank" rel="noreferrer">Ghostarchive</a></li></ul></details>`;
	function storyTags(item) {
		const tags = [];
		const title = item.title || "";
		if (/^ask hn\s*:/i.test(title)) {
			tags.push({
				label: "ask",
				className: "tag_ask",
				href: "#/ask",
				title: "Ask Hacker News",
			});
		} else if (/^show hn\s*:/i.test(title)) {
			tags.push({
				label: "show",
				className: "tag_show",
				href: "#/show",
				title: "Show Hacker News",
			});
		} else if (item.type === "job") {
			tags.push({
				label: "job",
				className: "tag_job",
				href: "#/jobs",
				title: "Hacker News job",
			});
		} else if (item.type === "poll") {
			tags.push({
				label: "poll",
				className: "tag_poll",
				title: "Hacker News poll",
			});
		}
		const source = externalUrl(item.url);
		if (source) {
			try {
				const parsed = new URL(source);
				const host = parsed.hostname.replace(/^www\./i, "");
				if (/\.pdf$/i.test(parsed.pathname)) {
					tags.push({
						label: "pdf",
						className: "tag_is_media",
						title: "PDF document",
					});
				} else if (
					host === "youtube.com" || host === "youtu.be"
					|| host === "vimeo.com"
				) {
					tags.push({
						label: "video",
						className: "tag_is_media",
						title: "Video",
					});
				} else if (host === "github.com") {
					tags.push({
						label: "github",
						className: "tag_meta",
						title: "GitHub",
					});
				}
			} catch {}
		}
		return tags;
	}
	const StoryTags = (item) => {
		const tags = storyTags(item);
		if (!tags.length) return null;
		return html`<ul class="tags" aria-label="Tags">${
			tags.map((tag) =>
				html`<li>${
					tag.href
						? html`<a class="tag ${tag.className}" href="${tag.href}" title="${tag.title}">${tag.label}</a>`
						: html`<span class="tag ${tag.className}" title="${tag.title}">${tag.label}</span>`
				}</li>`
			)
		}</ul>`;
	};
	const StoryItem = (item) => {
		if (!item) return null;
		const external = externalUrl(item.url);
		const href = external || `#/item/${item.id}`;
		const domain = domainOf(item.url);
		const comments = Number(item.descendants) || 0;
		const isJob = item.type === "job";
		return html`<li class="story ${
			item.dead ? "deleted" : ""
		}"><div class="story_liner h-entry"><div class="voters"> ${
			isJob
				? html`<span class="upvoter disabled" title="Voting is not available for job posts" aria-disabled="true">${
					item.score ?? 0
				}</span>`
				: html`<a class="upvoter" href="https://news.ycombinator.com/item?id=${item.id}" target="_blank" rel="noreferrer" title="Score on Hacker News">${
					item.score ?? 0
				}</a>`
		} </div><div class="details"><span role="heading" aria-level="1" class="link h-cite u-repost-of"> <a class="u-url" href="${href}" rel="${
			external ? "ugc noreferrer" : null
		}">${item.title || "Untitled"}</a> </span> ${
			item.text
				? html`<a class="description_present" href="#/item/${item.id}" title="This story has text" aria-label="This story has text">☶</a>`
				: null
		} ${StoryTags(item)} ${
			domain
				? html`<a class="domain" href="https://news.ycombinator.com/from?site=${
					encodeURIComponent(domain)
				}" target="_blank" rel="noreferrer">${domain}</a>`
				: null
		} <div class="byline"><span>by </span> ${
			item.by
				? html`<a class="u-author h-card" href="https://news.ycombinator.com/user?id=${
					encodeURIComponent(item.by)
				}" target="_blank" rel="noreferrer">${item.by}</a>`
				: html`<span class="na">unknown</span>`
		} ${item.time ? Time(item.time) : null} ${
			external ? Caches(external) : null
		} <span class="comments_label"><span aria-hidden="true"> | </span><a role="heading" aria-level="2" href="#/item/${item.id}">${
			commentLabel(comments)
		}</a></span></div></div></div><a href="#/item/${item.id}" class="mobile_comments ${
			comments ? "" : "zero"
		}" aria-label="${
			commentLabel(comments)
		}"><span>${comments}</span></a></li>`;
	};
	const SkeletonList = () =>
		html`<span class="sr-only" role="status">Loading stories…</span><ol class="stories list skeleton-list" aria-hidden="true">${
			Array.from({ length: 8 }, () =>
				html`<li class="story skeleton"><div class="story_liner"><div class="voters"><span class="skeleton-box score-skeleton"></span></div><div class="details"><div class="skeleton-box title-skeleton"></div><div class="skeleton-box byline-skeleton"></div></div></div></li>`)
		}</ol>`;
	const LoadingBlock = (message) =>
		html`<div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
	const ErrorBox = (title, message, retry) =>
		html`<div class="error-box" role="alert"><h1>${title}</h1><p>${message}</p>${
			retry
				? html`<button type="button" onclick="${retry}">Try again</button>`
				: null
		}</div>`;
	const Pager = (list) => {
		if (list.page <= 1 && !list.hasMore) return null;
		return html`<nav class="morelink" aria-label="Pagination"> ${
			list.page > 1
				? html`<a href="#/${list.section}/${
					list.page - 1
				}" rel="prev">Page ${list.page - 1}</a>`
				: null
		} ${
			list.hasMore
				? html`<a href="#/${list.section}/${
					list.page + 1
				}" rel="next">Page ${list.page + 1}</a>`
				: null
		} </nav>`;
	};
	const CommentNode = (node, storyAuthor) => {
		const item = node.item;
		const children = node.children;
		const collapsed = state.collapsed.has(item.id);
		const author = item.by || null;
		const isOp = !!author && author === storyAuthor;
		const replyCount = collapsed ? countTree(children) : 0;
		const action = collapsed ? "Expand" : "Collapse";
		return html`<li class="comments_subtree" id="c_${item.id}"><div class="comment ${
			item.dead ? "bad" : ""
		}"><div class="voters"><button type="button" class="comment_folder" aria-expanded="${
			collapsed ? "false" : "true"
		}" aria-label="${action} comment${
			author ? " by " + author : ""
		}" title="${action} comment" onclick="${() =>
			toggleComment(
				item.id,
			)}"></button></div><div class="details"><div class="byline"> ${
			author
				? html`<a class="${
					isOp ? "user_is_author user_is_submitter" : ""
				}" href="https://news.ycombinator.com/user?id=${
					encodeURIComponent(author)
				}" target="_blank" rel="noreferrer">${author}</a>`
				: html`<span class="na">deleted</span>`
		} ${
			item.time
				? html`<a href="https://news.ycombinator.com/item?id=${item.id}" target="_blank" rel="noreferrer">${
					Time(item.time)
				}</a>`
				: null
		} <span aria-hidden="true"> | </span> <a href="https://news.ycombinator.com/reply?id=${item.id}" target="_blank" rel="noreferrer">reply</a> ${
			collapsed && replyCount
				? html`<span class="thread_summary"> | ${
					numberFormat.format(replyCount)
				} ${replyCount === 1 ? "reply" : "replies"} hidden</span>`
				: null
		} </div> ${
			!collapsed
				? html`<div role="heading" aria-level="3" class="comment_text">${
					item.deleted
						? html`<p><span class="na">[deleted]</span></p>`
						: item.text
						? HnText(item.text)
						: html`<p><span class="na">[no text]</span></p>`
				}</div>`
				: null
		} </div></div> ${
			!collapsed && children.length
				? html`<ol class="comments">${
					children.map((child) => CommentNode(child, storyAuthor))
				}</ol>`
				: null
		} </li>`;
	};
	function countTree(nodes) {
		return nodes.reduce(
			(total, node) => total + 1 + countTree(node.children),
			0,
		);
	}
	function toggleComment(id) {
		if (state.collapsed.has(id)) state.collapsed.delete(id);
		else state.collapsed.add(id);
		render();
	}
	const CommentsSection = (story) => {
		const comments = state.comments;
		if (!comments || comments.status === "loading") {
			const total = story.descendants || comments?.total || 0;
			const progress = comments?.loaded
				? ` — ${numberFormat.format(comments.loaded)} loaded`
				: "";
			return html`<section id="comments" class="comments-section"><h2 class="sr-only">Comments</h2>${
				LoadingBlock(`Loading ${commentLabel(total)}${progress}`)
			}</section>`;
		}
		if (comments.status === "error") {
			return html`<section id="comments" class="comments-section"><h2 class="sr-only">Comments</h2>${
				ErrorBox(
					"Comments unavailable",
					"We couldn't load this discussion. Check your connection and try again.",
					() => retryComments(story),
				)
			}</section>`;
		}
		if (!comments.tree.length) {
			if (comments.failures) {
				return html`<section id="comments" class="comments-section"><h2 class="sr-only">Comments</h2>${
					ErrorBox(
						"Comments unavailable",
						"We couldn't load this discussion. Check your connection and try again.",
						() => retryComments(story),
					)
				}</section>`;
			}
			return html`<section id="comments" class="comments-section"><h2 class="sr-only">Comments</h2><p class="empty-state">No comments yet. <a href="https://news.ycombinator.com/item?id=${story.id}" target="_blank" rel="noreferrer">Join the discussion on Hacker News</a>.</p></section>`;
		}
		return html`<section id="comments" class="comments-section"><h2 class="sr-only">Comments</h2> ${
			comments.truncated
				? html`<p class="notice">Showing the first ${
					numberFormat.format(comments.loaded)
				} comments. <a href="https://news.ycombinator.com/item?id=${story.id}" target="_blank" rel="noreferrer">Continue on Hacker News →</a></p>`
				: null
		} ${
			comments.failures
				? html`<p class="notice">Some comments could not be loaded. <button type="button" class="link-button" onclick="${() =>
					retryComments(story)}">Retry</button></p>`
				: null
		} <ol class="comments comments1">${
			comments.tree.map((node) => CommentNode(node, story.by))
		}</ol></section>`;
	};
	const ListPage = () => {
		const list = state.list;
		if (list?.status === "error") {
			return ErrorBox(
				"Stories unavailable",
				"We couldn't reach the Hacker News API. Check your connection and try again.",
				() => loadList(list.section, list.page),
			);
		}
		if (!list || list.status === "loading") return SkeletonList();
		if (!list.items.length) {
			return html`<div class="empty-state"><p>No stories found on this page.</p><p>${
				list.page > 1
					? html`<a href="#/${list.section}/${
						list.page - 1
					}">Go back a page</a>`
					: html`<a href="#/top">Return to the front page</a>`
			}</p></div>`;
		}
		return html`<ol class="stories list">${
			list.items.map(StoryItem)
		}</ol>${Pager(list)}`;
	};
	const ItemPage = () => {
		const item = state.item;
		if (!item || item.status === "loading") {
			return LoadingBlock("Loading story…");
		}
		if (item.status === "error") {
			return ErrorBox(
				"Story unavailable",
				"That story could not be found. It may have been deleted, or the Hacker News API may be unavailable.",
				() => loadItem(item.id),
			);
		}
		const story = item.story;
		return html`<ol class="stories">${StoryItem(story)}</ol>${
			story.text
				? html`<div class="story_content"><div class="story_text">${
					HnText(story.text)
				}</div></div>`
				: null
		}${CommentsSection(story)}`;
	};
	const NotFoundPage = () =>
		html`<div class="error-box"><h1>Page not found</h1><p>That page doesn't exist. <a href="#/top">Return to the front page</a>.</p></div>`;
	const Page = () => {
		if (state.route.name === "list") return ListPage();
		if (state.route.name === "item") return ItemPage();
		return NotFoundPage();
	};
	const App = () =>
		html`${Header(state)}<main id="inside">${Page()}</main>${Footer()}`;
	function updateDocumentTitle() {
		let title = "Hackers";
		if (state.route.name === "list") {
			title = SECTIONS[state.route.section].label;
		} else if (
			state.route.name === "item" && state.item?.status === "ready"
		) title = state.item.story.title || "Story";
		else if (state.route.name === "notfound") title = "Page not found";
		document.title = title;
	}
	let lastNavRoute = null;
	function revealActiveNav() {
		const route = state.route;
		const key = route.name === "list"
			? "list:" + route.section
			: route.name;
		if (key === lastNavRoute) return;
		lastNavRoute = key;
		const nav = appRoot.querySelector("#header-top nav");
		const list = nav?.querySelector("ul");
		const active = list?.querySelector("[aria-current=\"page\"]");
		if (!nav || !list || !active) return;
		const navRect = nav.getBoundingClientRect();
		const activeRect = active.getBoundingClientRect();
		const padding = 20;
		if (activeRect.left < navRect.left + padding) {
			list.scrollLeft -= navRect.left + padding - activeRect.left;
		} else if (activeRect.right > navRect.right - padding) {
			list.scrollLeft += activeRect.right - (navRect.right - padding);
		}
	}
	function updateNavFade() {
		const list = appRoot.querySelector("#header-top nav > ul");
		if (!list) return;
		const maxScroll = list.scrollWidth - list.clientWidth;
		const scrollable = maxScroll > 1;
		list.classList.toggle(
			"can-scroll-left",
			scrollable && list.scrollLeft > 1,
		);
		list.classList.toggle(
			"can-scroll-right",
			scrollable && list.scrollLeft < maxScroll - 1,
		);
	}
	function render() {
		updateDocumentTitle();
		make(appRoot, App());
		revealActiveNav();
		updateNavFade();
	}
	async function fetchJson(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				"Hacker News API request failed (" + response.status + ")",
			);
		}
		return response.json();
	}
	function getItem(id) {
		const key = String(id);
		if (!itemCache.has(key)) {
			const request = fetchJson(`${API_ROOT}/item/${key}.json`).catch(
				(error) => {
					itemCache.delete(key);
					throw error;
				},
			);
			itemCache.set(key, request);
		}
		return itemCache.get(key);
	}
	function getListIds(section) {
		if (!listIdsCache.has(section)) {
			const request = fetchJson(
				`${API_ROOT}/${SECTIONS[section].endpoint}.json`,
			).then((ids) => {
				if (!Array.isArray(ids)) {
					throw new Error("Hacker News returned an unexpected list.");
				}
				return ids;
			}).catch((error) => {
				listIdsCache.delete(section);
				throw error;
			});
			listIdsCache.set(section, request);
		}
		return listIdsCache.get(section);
	}
	async function loadList(section, page) {
		const token = ++state.requestId;
		const cacheKey = section + ":" + page;
		if (pageCache.has(cacheKey)) {
			state.list = {
				status: "ready",
				section,
				page,
				...pageCache.get(cacheKey),
			};
			render();
			return;
		}
		state.list = { status: "loading", section, page };
		render();
		try {
			const ids = await getListIds(section);
			if (token !== state.requestId) return;
			const start = (page - 1) * PAGE_SIZE;
			const pageIds = ids.slice(start, start + PAGE_SIZE);
			if (!pageIds.length) {
				const data = {
					items: [],
					hasMore: false,
					total: ids.length,
					failures: 0,
				};
				pageCache.set(cacheKey, data);
				state.list = { status: "ready", section, page, ...data };
				render();
				return;
			}
			const results = await Promise.allSettled(pageIds.map(getItem));
			if (token !== state.requestId) return;
			const items = [];
			let failures = 0;
			for (const result of results) {
				if (result.status === "fulfilled") {
					if (result.value && !result.value.deleted) {
						items.push(result.value);
					}
				} else failures++;
			}
			if (!items.length && failures) {
				throw new Error("The stories could not be loaded.");
			}
			const data = {
				items,
				hasMore: start + PAGE_SIZE < ids.length,
				total: ids.length,
				failures,
			};
			pageCache.set(cacheKey, data);
			state.list = { status: "ready", section, page, ...data };
			render();
		} catch (error) {
			if (token !== state.requestId) return;
			console.error(error);
			state.list = { status: "error", section, page, error };
			render();
		}
	}
	async function loadItem(id) {
		const token = ++state.requestId;
		state.item = { status: "loading", id };
		state.comments = null;
		state.collapsed = new Set();
		render();
		try {
			const story = await getItem(id);
			if (token !== state.requestId) return;
			if (!story || (!story.title && !story.text)) {
				throw new Error("Story not found");
			}
			state.item = { status: "ready", story };
			state.comments = {
				status: "loading",
				loaded: 0,
				total: Number(story.descendants) || 0,
			};
			render();
			await loadComments(story, token);
		} catch (error) {
			if (token !== state.requestId) return;
			console.error(error);
			state.item = { status: "error", id, error };
			render();
		}
	}
	function buildCommentTree(ids, items, counter, limit) {
		const tree = [];
		for (const id of ids) {
			if (counter.n >= limit) break;
			const item = items.get(id);
			if (!item) continue;
			counter.n++;
			tree.push({
				item,
				children: buildCommentTree(
					Array.isArray(item.kids) ? item.kids : [],
					items,
					counter,
					limit,
				),
			});
		}
		return tree;
	}
	async function loadComments(story, token) {
		const total = Number(story.descendants) || 0;
		const rootKids = Array.isArray(story.kids) ? story.kids : [];
		if (!rootKids.length) {
			if (token === state.requestId) {
				state.comments = {
					status: "ready",
					tree: [],
					loaded: 0,
					total: 0,
					failures: 0,
					truncated: false,
				};
				render();
			}
			return;
		}
		const queue = rootKids.slice();
		const seen = new Set(queue);
		const items = new Map();
		let loaded = 0;
		let failures = 0;
		let lastPaint = 0;
		let stopped = false;
		const paintProgress = () => {
			if (token !== state.requestId) return;
			if (!state.comments || state.comments.status !== "loading") {
				return;
			}
			const now = performance.now();
			if (now - lastPaint < 150) return;
			lastPaint = now;
			state.comments.loaded = loaded;
			render();
		};
		const worker = async () => {
			while (!stopped && queue.length && loaded < COMMENT_LIMIT) {
				if (token !== state.requestId) return;
				const id = queue.shift();
				try {
					const item = await getItem(id);
					if (token !== state.requestId) {
						stopped = true;
						return;
					}
					if (!item) continue;
					items.set(item.id, item);
					loaded++;
					if (Array.isArray(item.kids)) {
						for (const kid of item.kids) {
							if (!seen.has(kid)) {
								seen.add(kid);
								queue.push(kid);
							}
						}
					}
					if (loaded % 20 === 0) paintProgress();
				} catch (error) {
					failures++;
					console.warn("Could not load comment " + id, error);
				}
			}
		};
		try {
			await Promise.all(
				Array.from({ length: COMMENT_CONCURRENCY }, () => worker()),
			);
		} catch (error) {
			console.error(error);
		}
		if (token !== state.requestId) return;
		const counter = { n: 0 };
		const tree = buildCommentTree(
			rootKids,
			items,
			counter,
			COMMENT_LIMIT,
		);
		state.comments = {
			status: "ready",
			tree,
			loaded: counter.n,
			total,
			failures,
			truncated: total > counter.n,
		};
		render();
	}
	function retryComments(story) {
		const token = ++state.requestId;
		state.comments = {
			status: "loading",
			loaded: 0,
			total: Number(story.descendants) || 0,
		};
		render();
		loadComments(story, token);
	}
	function loadRoute() {
		if (state.route.name === "list") {
			loadList(state.route.section, state.route.page);
			return;
		}
		if (state.route.name === "item") {
			loadItem(state.route.id);
			return;
		}
		state.requestId++;
		render();
	}
	function onRouteChange() {
		state.route = parseRoute();
		state.list = null;
		state.item = null;
		state.comments = null;
		state.collapsed = new Set();
		window.scrollTo(0, 0);
		render();
		loadRoute();
	}
	function initTheme() {
		state.theme = readTheme();
		applyTheme(state.theme);
		const onMediaChange = () => {
			if (state.theme === "system") {
				applyTheme("system");
				render();
			}
		};
		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener("change", onMediaChange);
		} else if (mediaQuery.addListener) {
			mediaQuery.addListener(onMediaChange);
		}
	}
	initTheme();
	window.addEventListener("hashchange", onRouteChange);
	window.addEventListener("resize", updateNavFade, { passive: true });
	document.addEventListener("scroll", updateNavFade, {
		capture: true,
		passive: true,
	});
	render();
	loadRoute();
})();
