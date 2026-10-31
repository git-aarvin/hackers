import { PAGE_TTL, SIZE, WORKERS } from "../settings.js";
import { pace } from "../tasks.js";
import { state } from "../state.js";
import { render } from "../render.js";
import { keys, pageCache, read } from "./client.js";
export const feed = async (section, page, options = {}) => {
	const token = ++state.token;
	const key = section + ":" + page;
	const cached = pageCache.get(key);
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
			pageCache.set(key, { data, at: Date.now() });
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
		pageCache.set(key, { data, at: Date.now() });
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
export const retryStory = async (id) => {
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
		const entry = pageCache.get(list.section + ":" + list.page);
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
