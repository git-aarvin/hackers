export const format = new Intl.NumberFormat();
export const ago = (seconds) => {
	const span = Math.floor(Date.now() / 1000 - Number(seconds));
	if (!Number.isFinite(span) || span < 60) return "just now";
	const units = [
		[31536000, "year"],
		[2592000, "month"],
		[86400, "day"],
		[3600, "hour"],
		[60, "minute"],
	];
	for (const [size, unit] of units) {
		const count = Math.floor(span / size);
		if (count >= 1) {
			return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
		}
	}
	return "just now";
};
export const iso = (seconds) => new Date(seconds * 1000).toISOString();
export const label = (count) => {
	const total = Number(count) || 0;
	if (!total) return "no comments";
	return format.format(total) + (total === 1 ? " comment" : " comments");
};
export const link = (raw) => {
	if (!raw) return null;
	try {
		const url = new URL(raw, "https://news.ycombinator.com/");
		if (url.protocol === "http:" || url.protocol === "https:") {
			return url.href;
		}
	} catch {}
	return null;
};
export const anchor = (raw) => {
	if (!raw) return null;
	try {
		const url = new URL(raw, "https://news.ycombinator.com/");
		if (
			url.protocol === "http:" || url.protocol === "https:"
			|| url.protocol === "mailto:"
		) return url.href;
	} catch {}
	return null;
};
export const domain = (raw) => {
	const url = link(raw);
	if (!url) return "";
	try {
		return new URL(url).hostname.replace(/^www\./i, "");
	} catch {
		return "";
	}
};
