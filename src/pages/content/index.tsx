import { createRoot } from "react-dom/client";
import "./style.css";
import "src/vendor/rrweb.min.js";

const div = document.createElement("div");
div.id = "__root";
document.body.appendChild(div);

const rootContainer = document.querySelector("#__root");
if (!rootContainer) throw new Error("Can't find Content root element");
const root = createRoot(rootContainer);

console.log("Imitation Game: Content script initiating.");

function injectScript(filePath: string, tagId: string) {
  // Check if the script tag already exists
  if (document.getElementById(tagId)) {
    console.log(`Script with ID ${tagId} already injected.`);
    return;
  }

  // Create the script element
  const script = document.createElement("script");
  script.setAttribute("type", "text/javascript");
  // Get the extension's URL for the script file
  script.setAttribute("src", chrome.runtime.getURL(filePath));
  script.setAttribute("id", tagId); // Add an ID for checking

  // Append the script to the document's head (or body)
  (document.head || document.documentElement).appendChild(script);

  console.log(`Injecting script: ${filePath}`);

  script.onload = () => {
    console.log(`Script ${filePath} loaded successfully.`);
    // Now rrweb should be available in the PAGE's window scope.
  };

  script.onerror = (e) => {
    console.error(`Error loading script: ${filePath}`, e);
  };
}

// Inject the rrweb library into the page
injectScript("src/vendor/rrweb.min.js", "rrweb-script");

root.render(
  <div className="absolute top-0 left-0 text-lg text-black bg-amber-400 z-50">
    learning...
  </div>
);

try {
  // console.log("content script loaded");
} catch (e) {
  console.error(e);
}
