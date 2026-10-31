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
