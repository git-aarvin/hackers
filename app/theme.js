import { KEY } from "./settings.js";
import { media } from "./browser.js";
export function recall() {
	try {
		const stored = localStorage.getItem(KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored;
		}
	} catch {}
	return "system";
}
export const skin = (mode) => {
	const dark = mode === "dark" || (mode === "system" && media.matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	document.documentElement.dataset.mode = mode;
	const meta = document.querySelector("meta[name=\"theme-color\"]");
	if (meta) meta.setAttribute("content", dark ? "#0c0c0c" : "#fb651e");
	try {
		localStorage.setItem(KEY, mode);
	} catch {}
};
