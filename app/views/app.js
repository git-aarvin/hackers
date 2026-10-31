import { html } from "../../vendor.js";
import { state } from "../state.js";
import { Footer } from "./footer.js";
import { Front } from "./front.js";
import { Header } from "./header.js";
import { Search } from "./search.js";
import { Thread } from "./thread.js";
const Missing = () =>
	html`<div class="error"><h1>Page not found</h1><p>That page doesn't exist. <a href="#/top">Return to the front page</a>.</p></div>`;
const Page = () => {
	if (state.route.name === "list") return Front();
	if (state.route.name === "item") return Thread();
	if (state.route.name === "search") return Search();
	return Missing();
};
export const App = () =>
	html`${Header(state)}<main id="inside">${Page()}</main>${Footer()}`;
