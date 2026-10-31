import { SECTIONS } from "./settings.js";
export const searchHash = (query, sort = "relevance", page = 1) => {
	const params = new URLSearchParams();
	const text = String(query ?? "").trim();
	const at = Number.parseInt(page, 10);
	if (text) params.set("q", text);
	if (sort === "date") params.set("sort", "date");
	if (Number.isFinite(at) && at > 1) params.set("page", String(at));
	const suffix = params.toString();
	return "#/search" + (suffix ? "?" + suffix : "");
};
export function parse() {
	const raw = location.hash.replace(/^#/, "");
	const split = raw.indexOf("?");
	const pathname = split < 0 ? raw : raw.slice(0, split);
	const search = split < 0 ? "" : raw.slice(split + 1);
	const path = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
	const params = new URLSearchParams(search);
	if (!path) return { name: "list", section: "top", page: 1 };
	const parts = path.split("/");
	if (parts[0] === "item" && /^\d+$/.test(parts[1] || "")) {
		return { name: "item", id: Number(parts[1]) };
	}
	if (parts[0] === "search") {
		const page = Number.parseInt(params.get("page") || "1", 10);
		return {
			name: "search",
			query: (params.get("q") || "").trim(),
			sort: params.get("sort") === "date" ? "date" : "relevance",
			page: Number.isFinite(page) && page > 0 ? page : 1,
		};
	}
	if (SECTIONS[parts[0]]) {
		const page = Number.parseInt(parts[1] || "1", 10);
		return {
			name: "list",
			section: parts[0],
			page: Number.isFinite(page) && page > 0 ? page : 1,
		};
	}
	return { name: "missing" };
}
