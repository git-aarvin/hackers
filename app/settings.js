export const ORIGIN = "https://hacker-news.firebaseio.com/v0";
export const SIZE = 25;
export const LIMIT = 500;
export const WORKERS = 8;
export const COMMENT_WORKERS = 8;
export const ITEM_TTL = 5 * 60 * 1000;
export const PAGE_TTL = 5 * 60 * 1000;
export const LIST_TTL = 60 * 1000;
export const ITEM_CACHE = 2000;
export const SEARCH_ORIGIN = "https://hn.algolia.com/api/v1";
export const SEARCH_TTL = 5 * 60 * 1000;
export const SEARCH_CACHE = 50;
export const SEARCH_LIMIT = 1000;
export const TIMEOUT = 15 * 1000;
export const RETRIES = 2;
export const KEY = "hackers:theme";
export const SECTIONS = {
	top: { label: "Top", endpoint: "topstories" },
	new: { label: "New", endpoint: "newstories" },
	best: { label: "Best", endpoint: "beststories" },
	ask: { label: "Ask", endpoint: "askstories" },
	show: { label: "Show", endpoint: "showstories" },
	jobs: { label: "Jobs", endpoint: "jobstories" },
};
