import { html } from "../../vendor.js";
import { markup } from "../markup.js";
import { state } from "../state.js";
import { Comments } from "./comments.js";
import { Failure, Loading } from "./common.js";
import { Story } from "./story.js";
export const Thread = () => {
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
