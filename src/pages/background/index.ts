console.log("background script loaded");

console.log("Background service worker started.");

type TabID = number;
type RRWebEvent = object;

// State stored in memory (will reset when service worker becomes inactive)
// For persistence across browser restarts, use chrome.storage.local
const recordingState: Record<
  TabID,
  { isRecording: boolean; events: RRWebEvent[] }
> = {};

// --- Functions to Execute in Page Context ---
// These need to be defined globally or passed carefully to executeScript
// Defining them here for clarity, but they execute in the PAGE context.
function pageStartRecording() {
  // Same function as before in Popup.tsx
  if (typeof window.rrweb === "undefined") {
    console.error("[Page] window.rrweb not found!");
    return;
  }
  if (window.rrwebStopFn) {
    console.warn("[Page] Recording already in progress.");
    return;
  }
  window.rrwebEvents = [];
  console.log(
    "[Page] Starting rrweb recording via Background with sampling..."
  );
  try {
    window.rrwebStopFn = window.rrweb.record({
      emit(event: any) {
        window.postMessage(
          { type: "RRWEB_EVENT_FROM_PAGE", payload: event },
          "*"
        );
      },
      sampling: {
        mousemove: 100,
        scroll: 150,
      },
    });
    window.postMessage({ type: "RECORDING_STARTED_FROM_PAGE" }, "*");
  } catch (error) {
    console.error("[Page] Failed to start rrweb recording:", error);
  }
}

function pageStopRecording() {
  // Same function as before in Popup.tsx
  if (window.rrwebStopFn) {
    console.log("[Page] Stopping rrweb recording via Background...");
    window.rrwebStopFn();
    window.rrwebStopFn = undefined;
    window.postMessage(
      { type: "RECORDING_STOPPED_FROM_PAGE", payload: window.rrwebEvents },
      "*"
    );
    console.log("[Page] rrweb recording stopped.");
  } else {
    console.warn("[Page] Stop function not found.");
  }
}

// --- Background Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message, "from sender:", sender);

  // --- Messages from Popup ---
  if (message.type === "START_RECORDING") {
    const tabId = message.tabId; // Popup should send the target tabId
    if (!tabId) {
      console.error("Start command received without tabId");
      sendResponse({ success: false, error: "Missing tabId" });
      return true;
    }
    if (recordingState[tabId]?.isRecording) {
      console.warn(`Already recording tab ${tabId}`);
      sendResponse({ success: false, error: "Already recording" });
      return true;
    }

    console.log(`Background starting recording for tab ${tabId}`);
    // Initialize state for the tab
    recordingState[tabId] = { isRecording: true, events: [] };

    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: pageStartRecording,
        world: "MAIN",
      })
      .then(() => {
        console.log(`Background executed start script in tab ${tabId}`);
        // Confirmation will come via RECORDING_STARTED_FROM_PAGE
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error(
          `Background failed to execute start script in tab ${tabId}:`,
          err
        );
        recordingState[tabId].isRecording = false; // Revert state on error
        sendResponse({ success: false, error: err.message });
      });
    return true; // Indicate async response
  } else if (message.type === "STOP_RECORDING") {
    const tabId = message.tabId;
    if (!tabId) {
      console.error("Stop command received without tabId");
      sendResponse({ success: false, error: "Missing tabId" });
      return true;
    }
    if (!recordingState[tabId]?.isRecording) {
      console.warn(`Not recording tab ${tabId}`);
      sendResponse({ success: false, error: "Not recording" });
      return true;
    }

    console.log(`Background stopping recording for tab ${tabId}`);
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: pageStopRecording,
        world: "MAIN",
      })
      .then(() => {
        console.log(`Background executed stop script in tab ${tabId}`);
        // State update (isRecording=false) happens when RECORDING_STOPPED message received
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error(
          `Background failed to execute stop script in tab ${tabId}:`,
          err
        );
        // Should we revert state? Maybe not, let RECORDING_STOPPED confirm.
        sendResponse({ success: false, error: err.message });
      });
    return true; // Indicate async response
  } else if (message.type === "REQUEST_STATE") {
    const tabId = message.tabId;
    if (!tabId) {
      console.error("State request without tabId");
      return true;
    }
    const state = recordingState[tabId] || { isRecording: false, events: [] };
    console.log(`Background sending state for tab ${tabId}:`, state);
    sendResponse({
      isRecording: state.isRecording,
      eventCount: state.events.length,
    });
    return true; // Indicate sync response (can be async if reading storage)
  } else if (message.type === "REQUEST_EVENTS_FOR_EXPORT") {
    const tabId = message.tabId;
    if (!tabId) {
      console.error("Export request without tabId");
      sendResponse({ events: [], error: "Missing tabId" });
      return true;
    }
    const state = recordingState[tabId] || { isRecording: false, events: [] };
    console.log(
      `Background sending ${state.events.length} events for export for tab ${tabId}`
    );
    sendResponse({ events: state.events });
    return true;
  } else if (message.type === "RRWEB_EVENT") {
    const tabId = sender.tab?.id; // Events come from content script in a tab
    if (tabId && recordingState[tabId]?.isRecording) {
      // console.log(`Background storing event for tab ${tabId}`);
      recordingState[tabId].events.push(message.payload);
    }
    // No response needed
  } else if (message.type === "RECORDING_STARTED") {
    // Relayed from content script
    const tabId = sender.tab?.id;
    if (tabId && recordingState[tabId]) {
      console.log(`Background confirmed recording started for tab ${tabId}`);
      recordingState[tabId].isRecording = true; // Ensure state matches page
      // Optionally notify popup(s) if needed, but popup should update from its own request
    } else {
      console.warn(
        "Background received RECORDING_STARTED without active tab state"
      );
    }
    // No response needed
  } else if (message.type === "RECORDING_STOPPED") {
    // Relayed from content script
    const tabId = sender.tab?.id;
    if (tabId && recordingState[tabId]) {
      console.log(`Background confirmed recording stopped for tab ${tabId}`);
      recordingState[tabId].isRecording = false; // Update state
      // Optionally notify popup(s)
    } else {
      console.warn(
        "Background received RECORDING_STOPPED without active tab state"
      );
    }
    // Optionally save events from payload if needed, though they are already stored
    // No response needed
  }

  // Return true if you intend to use sendResponse asynchronously (like for executeScript)
  // Return false or undefined otherwise.
});

console.log("Background script listeners attached.");
