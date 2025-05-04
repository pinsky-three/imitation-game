import { createRoot } from "react-dom/client";
import "./style.css";
import "src/vendor/rrweb.min.js"; // Keep this to ensure rrweb is included in the build

// --- Augment Window interface for custom properties ---
declare global {
  interface Window {
    rrweb?: any; // Assuming rrweb library attaches itself here
    rrwebStopFn?: () => void; // Function to stop recording
    rrwebEvents?: any[]; // Array to hold events in page context
  }
}

console.log("Imitation Game: Content script initiating.");

// --- Script Injection for rrweb library ---
function injectScript(filePath: string, tagId: string) {
  // ... (keep existing injectScript function as is) ...
  // Check if the script tag already exists
  if (document.getElementById(tagId)) {
    console.log(`Script with ID ${tagId} already injected.`);
    // Even if already injected, ensure the listener below is attached
    return;
  }

  // Create the script element
  const script = document.createElement("script");
  script.setAttribute("type", "text/javascript");
  script.setAttribute("src", chrome.runtime.getURL(filePath));
  script.setAttribute("id", tagId);

  (document.head || document.documentElement).appendChild(script);
  console.log(`Injecting script: ${filePath}`);
  script.onload = () => {
    console.log(`Script ${filePath} loaded successfully.`);
  };
  script.onerror = (e) => {
    console.error(`Error loading script: ${filePath}`, e);
  };
}

// Inject the rrweb library itself into the page
injectScript("src/vendor/rrweb.min.js", "rrweb-library-script");

// --- Communication & Recording Logic ---

// Variable to hold the stop function from rrweb.record in the page context
// We can't store the actual function here, so we manage state
let isPageRecording = false;

// Function to be executed in the main world (page context)
function pageStartRecording() {
  if (typeof window.rrweb === "undefined") {
    console.error("[Page] window.rrweb not found!");
    return;
  }
  if (window.rrwebStopFn) {
    console.warn(
      "[Page] Recording seems to be already in progress (stopFn exists)."
    );
    return;
  }
  window.rrwebEvents = [];
  console.log("[Page] Starting rrweb recording...");
  try {
    window.rrwebStopFn = window.rrweb.record({
      emit(event: any) {
        window.rrwebEvents?.push(event);
        window.postMessage(
          { type: "RRWEB_EVENT_FROM_PAGE", payload: event },
          "*"
        );
      },
    });
    console.log("[Page] rrweb recording started.");
    window.postMessage({ type: "RECORDING_STARTED_FROM_PAGE" }, "*");
  } catch (error) {
    console.error("[Page] Failed to start rrweb recording:", error);
  }
}

// Function to be executed in the main world (page context)
function pageStopRecording() {
  if (window.rrwebStopFn) {
    console.log("[Page] Stopping rrweb recording...");
    window.rrwebStopFn();
    window.rrwebStopFn = undefined;
    console.log("[Page] rrweb recording stopped.");
    window.postMessage(
      { type: "RECORDING_STOPPED_FROM_PAGE", payload: window.rrwebEvents },
      "*"
    );
  } else {
    console.warn("[Page] Stop function not found. Cannot stop.");
  }
}

// --- Listener for messages FROM the page context ---
window.addEventListener("message", (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) {
    return;
  }
  const message = event.data;

  // Relay messages to the BACKGROUND script
  if (message && message.type === "RRWEB_EVENT_FROM_PAGE") {
    // console.log('Content script relaying event to background');
    chrome.runtime.sendMessage({
      type: "RRWEB_EVENT",
      payload: message.payload,
    });
  } else if (message && message.type === "RECORDING_STARTED_FROM_PAGE") {
    console.log("Content script relaying: Recording started to background.");
    chrome.runtime.sendMessage({ type: "RECORDING_STARTED" });
  } else if (message && message.type === "RECORDING_STOPPED_FROM_PAGE") {
    console.log("Content script relaying: Recording stopped to background.");
    chrome.runtime.sendMessage({
      type: "RECORDING_STOPPED",
      payload: message.payload,
    });
  }
});

// --- Remove React rendering logic or keep minimal ---
// This component doesn't need to render much anymore
const div = document.createElement("div");
div.id = "__root_recorder_content"; // Use a unique ID
div.style.display = "none"; // Make it hidden
document.body.appendChild(div);
// Optional: Add a console log to confirm content script is running
console.log("Imitation Game: Content script active and relaying messages.");

// Remove the previous root.render call if it's not needed
/*
const rootContainer = document.querySelector("#__root");
if (!rootContainer) throw new Error("Can't find Content root element");
const root = createRoot(rootContainer);
root.render(
  <div className="absolute top-0 left-0 text-lg text-black bg-amber-400 z-50 opacity-50 pointer-events-none">
    recorder active
  </div>
);
*/
