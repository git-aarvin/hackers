export const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const backoff = (attempt) => 300 * 2 ** attempt + Math.random() * 250;
export const pace = (size) => {
	let gate = null;
	let done = 0;
	return async () => {
		done++;
		if (!(done % size)) {
			gate = pause().then(() => {
				gate = null;
			});
		}
		if (gate) await gate;
	};
};
export const limiter = (size) => {
	let active = 0;
	const queue = [];
	const next = () => {
		active--;
		queue.shift()?.();
	};
	return (task) =>
		new Promise((resolve, reject) => {
			const run = () => {
				active++;
				task().then(resolve, reject).finally(next);
			};
			if (active < size) run();
			else queue.push(run);
		});
};
