import {
	ITEM_CACHE,
	ITEM_TTL,
	LIST_TTL,
	ORIGIN,
	RETRIES,
	SECTIONS,
	TIMEOUT,
} from "../settings.js";
import { backoff, wait } from "../tasks.js";
import { state } from "../state.js";
const stories = new Map();
const lists = new Map();
export const pageCache = new Map();
export const peek = (id) => stories.get(String(id));
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
export const json = async (url, options = {}) => {
	const signal = options.signal;
	const label = options.label ?? "Hacker News API";
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await request(url, signal);
			if (!response.ok) {
				const error = new Error(
					label + " request failed (" + response.status + ")",
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
	for (const key of pageCache.keys()) {
		if (key.startsWith(prefix)) pageCache.delete(key);
	}
};
export const read = (id, options = {}) => {
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
export const keys = (section, options = {}) => {
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
