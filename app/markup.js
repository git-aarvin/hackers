import { html } from "../vendor.js";
import { anchor } from "./format.js";
const texts = new Map();
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
export const markup = (value) => {
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
