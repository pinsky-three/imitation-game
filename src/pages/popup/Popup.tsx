import React, { useState, useRef, useEffect } from "react";
import "./index.css"; // Assuming your Tailwind/popup styles are here
import "../../assets/styles/rrweb.css"; // Use relative path

// Placeholder type - you might want more specific types later
type RRWebEvent = object;

// --- Functions to Execute in Page Context ---
// These are defined here so they can be passed to executeScript
// They will run in the MAIN world of the target page.

function pageStartRecording() {
  // Access window properties directly as this runs in the page context
  if (typeof window.rrweb === "undefined") {
    console.error("[Page] window.rrweb not found!");
    return; // Exit if rrweb isn't loaded
  }
  if (window.rrwebStopFn) {
    console.warn("[Page] Recording seems to be already in progress.");
    return; // Avoid starting multiple recordings
  }
  window.rrwebEvents = []; // Reset page-level event store
  console.log("[Page] Starting rrweb recording via executeScript...");
  try {
    window.rrwebStopFn = window.rrweb.record({
      emit(event: any) {
        // Send event back to content script immediately via postMessage
        window.postMessage(
          { type: "RRWEB_EVENT_FROM_PAGE", payload: event },
          "*"
        );
      },
    });
    console.log("[Page] rrweb recording started.");
    // Send confirmation back via postMessage
    window.postMessage({ type: "RECORDING_STARTED_FROM_PAGE" }, "*");
  } catch (error) {
    console.error("[Page] Failed to start rrweb recording:", error);
  }
}

function pageStopRecording() {
  if (window.rrwebStopFn) {
    console.log("[Page] Stopping rrweb recording via executeScript...");
    window.rrwebStopFn(); // Call the stop function
    window.rrwebStopFn = undefined; // Clear the stop function reference
    console.log("[Page] rrweb recording stopped.");
    // Send confirmation and events back via postMessage
    window.postMessage(
      { type: "RECORDING_STOPPED_FROM_PAGE", payload: window.rrwebEvents },
      "*"
    );
  } else {
    console.warn("[Page] Stop function not found. Cannot stop.");
  }
}

// --- Popup Component ---
const Popup = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [events, setEvents] = useState<RRWebEvent[]>([]);
  const [canReplay, setCanReplay] = useState<boolean>(false);
  const replayContainerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null); // To hold the rrweb replayer instance

  // Listener for status/events relayed from content script
  useEffect(() => {
    const messageListener = (
      message: any,
      sender: chrome.runtime.MessageSender
    ) => {
      if (message.type === "RRWEB_EVENT") {
        console.log("Popup received relayed event:", message.payload);
        setEvents((prevEvents) => [...prevEvents, message.payload]);
      } else if (message.type === "RECORDING_STARTED") {
        console.log("Popup notified: Recording started");
        setIsRecording(true);
        setCanReplay(false);
        setEvents([]);
      } else if (message.type === "RECORDING_STOPPED") {
        console.log("Popup notified: Recording stopped");
        setIsRecording(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Effect to update canReplay based on events length
  useEffect(() => {
    setCanReplay(!isRecording && events.length > 1);
  }, [isRecording, events]);

  const executeScriptInPage = (funcToExecute: (...args: any[]) => any) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        const tabId = tabs[0].id;
        chrome.scripting
          .executeScript({
            target: { tabId: tabId },
            func: funcToExecute,
            world: "MAIN", // Execute in the page's context
          })
          .then(() => {
            console.log(
              `Popup executed script for ${funcToExecute.name} in tab ${tabId}`
            );
          })
          .catch((err) => {
            console.error(
              `Popup failed to execute script for ${funcToExecute.name} in tab ${tabId}:`,
              err
            );
            alert(
              `Failed to execute script in the page. Error: ${err.message}. Ensure the page is not protected (e.g., chrome://) and try reloading.`
            );
            // Potentially reset state if execution fails fundamentally
            setIsRecording(false);
          });
      } else {
        console.error("Popup could not find active tab ID.");
        alert("Could not find the active tab. Please try again.");
      }
    });
  };

  const handleStart = () => {
    // Clear previous replay instance if exists
    if (replayerRef.current) {
      try {
        replayerRef.current.pause();
      } catch (e) {
        /* ignore */
      }
      replayerRef.current = null;
    }
    if (replayContainerRef.current) {
      replayContainerRef.current.innerHTML = ""; // Clear visual replay
    }

    console.log("Popup triggering START recording via executeScript...");
    setEvents([]); // Clear events before starting
    // State updates will be triggered by messages from the page/content script
    executeScriptInPage(pageStartRecording);
  };

  const handleStop = () => {
    console.log("Popup triggering STOP recording via executeScript...");
    // State updates will be triggered by messages from the page/content script
    executeScriptInPage(pageStopRecording);
  };

  const handleReplay = async () => {
    if (events.length < 2 || !replayContainerRef.current) {
      alert("Not enough events recorded or replay container missing.");
      return;
    }
    if (typeof window.rrweb === "undefined") {
      console.error("rrweb not found in popup context!");
      alert("Replay library (rrweb) not loaded in the popup.");
      return;
    }
    // Clear previous replay if any
    if (replayerRef.current) {
      try {
        replayerRef.current.pause();
      } catch (e) {
        /* ignore */
      }
    }
    replayContainerRef.current.innerHTML = ""; // Clear the container visually

    console.log(`Replaying ${events.length} events.`);

    try {
      const Replayer = window.rrweb.Replayer;
      replayerRef.current = new Replayer(events, {
        root: replayContainerRef.current,
        skipInactive: true,
      });

      replayerRef.current.on("finish", () => {
        console.log("Replay finished.");
        // Optionally re-enable the replay button or provide feedback
      });

      replayerRef.current.play();
    } catch (error) {
      console.error("Error initializing or playing replay:", error);
      alert(`Replay failed: ${error}`);
    }
  };

  return (
    <div className="popup-container p-4 w-80">
      <h1 className="text-xl font-bold mb-4">Session Recorder</h1>
      <div className="controls space-x-2 mb-4">
        <button
          onClick={handleStart}
          disabled={isRecording}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Start Recording
        </button>
        <button
          onClick={handleStop}
          disabled={!isRecording}
          className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
        >
          Stop Recording
        </button>
        <button
          onClick={handleReplay}
          disabled={isRecording || !canReplay}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Replay Recording
        </button>
      </div>

      <p className="text-sm mb-1">
        Status: {isRecording ? "Recording..." : "Stopped"}
      </p>
      <p className="text-sm mb-2">Events captured: {events.length}</p>

      <div
        id="replay-container"
        ref={replayContainerRef}
        className="w-full h-64 border border-gray-300 bg-gray-100 overflow-auto"
      >
        {/* rrweb replayer will attach here */}
      </div>
    </div>
  );
};

export default Popup;
