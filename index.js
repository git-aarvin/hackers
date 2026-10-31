import { boot, navigate, press, route } from "./app/actions.js";
import { mount } from "./app/browser.js";
import { fade, render, resize, reveal } from "./app/render.js";
boot();
mount.addEventListener("pointerdown", press);
mount.addEventListener("click", press);
window.addEventListener("hashchange", navigate);
window.addEventListener("resize", resize);
mount.addEventListener("scroll", fade, {
	capture: true,
	passive: true,
});
render();
route();
reveal();
fade();
