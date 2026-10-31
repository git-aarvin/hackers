import { html } from "../../vendor.js";
import { ago, iso } from "../format.js";
export const Time = (seconds) => {
	if (!Number.isFinite(Number(seconds))) return null;
	const date = new Date(Number(seconds) * 1000);
	return html`<time title="${date.toLocaleString()}" datetime="${
		iso(Number(seconds))
	}">${ago(Number(seconds))}</time>`;
};
export const Gap = () => html`<span class="gap">&ensp;</span>`;
export const Loading = (message) =>
	html`<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
export const Failure = (title, message, action) =>
	html`<div class="error" role="alert"><h1>${title}</h1><p>${message}</p>${
		action
			? html`<button type="button" data-act="${action}">Try again</button>`
			: null
	}</div>`;
export const Pager = (list) => {
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
