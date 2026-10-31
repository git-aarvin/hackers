import { COMMENT_WORKERS, LIMIT } from "../settings.js";
import { limiter } from "../tasks.js";
import { state } from "../state.js";
import { render } from "../render.js";
import { peek, read } from "./client.js";
const commentGate = limiter(COMMENT_WORKERS);
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
export const open = async (id) => {
	state.controller?.abort();
	state.controller = new AbortController();
	const token = ++state.token;
	const signal = state.controller.signal;
	const prior = peek(id);
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
export const toggle = (id) => {
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
export const retry = async (story) => {
	state.controller?.abort();
	state.controller = new AbortController();
	const token = ++state.token;
	state.comments = initialComments(Number(story.descendants) || 0);
	render();
	await discuss(story, token);
};
export const retryComment = async (id) => {
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
