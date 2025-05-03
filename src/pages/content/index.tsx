import { createRoot } from "react-dom/client";
import "./style.css";
import { injectScript } from "./utils";
// import "src/vendor/rrweb.min.js";

const div = document.createElement("div");
div.id = "__root";
document.body.appendChild(div);

const rootContainer = document.querySelector("#__root");
if (!rootContainer) throw new Error("Can't find Content root element");
const root = createRoot(rootContainer);

console.log("Imitation Game: Content script initiating.");

injectScript("src/vendor/rrweb.min.js", "rrweb-script");

root.render(
  <div className="absolute top-0 left-0 text-lg text-black bg-amber-400 z-50">
    AI Worker
  </div>
);

try {
  // console.log("content script loaded");
} catch (e) {
  console.error(e);
}
