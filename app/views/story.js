import { html } from "../../vendor.js";
import { domain, label, link } from "../format.js";
import { Gap, Time } from "./common.js";
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
const Placeholder = () =>
	html`<li class="story skeleton"><div class="liner"><div class="voters"><span class="bar"></span></div><div class="details"><div class="bar"></div><div class="bar"></div></div></div></li>`;
export const Story = (item, showComments = true) => {
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
export const Skeleton = () =>
	html`<span class="hidden" role="status">Loading stories…</span><ol class="stories list ghosts" aria-hidden="true">${
		Array.from({ length: 8 }, Placeholder)
	}</ol>`;
