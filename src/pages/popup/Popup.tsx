import React, { useState, useRef, useEffect } from "react";
import "./index.css"; // Keep local popup styles
// import "../../assets/styles/rrweb.css"; // Remove rrweb CSS import for now

type RRWebEvent = object; // Keep for type hint if background sends events

// REMOVE page context functions

// --- Popup Component ---
const Popup = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  // const [events, setEvents] = useState<RRWebEvent[]>([]); // Remove local events state
  const [eventCount, setEventCount] = useState<number>(0);
  const [canExport, setCanExport] = useState<boolean>(false); // State for export button
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  // const replayContainerRef = useRef<HTMLDivElement>(null); // Remove replay ref
  // const replayerRef = useRef<any>(null); // Remove replay ref

  // Get current Tab ID and request initial state
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        setCurrentTabId(tabId);
        console.log(`Popup requesting state for tab ${tabId}`);
        chrome.runtime.sendMessage(
          { type: "REQUEST_STATE", tabId: tabId },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error requesting state:",
                chrome.runtime.lastError.message
              );
              return;
            }
            console.log("Popup received initial state:", response);
            if (response) {
              setIsRecording(response.isRecording);
              const count = response.eventCount || 0;
              setEventCount(count);
              setCanExport(!response.isRecording && count > 0); // Can export if stopped and events exist
            }
          }
        );
      } else {
        console.error("Popup could not get active tab ID on load.");
      }
    });
  }, []);

  // Simpler Listener for pushed state updates from background (if implemented)
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.tabId && message.tabId !== currentTabId) return;
      if (message.type === "RECORDING_STATE_UPDATED") {
        console.log("Popup received pushed state:", message);
        setIsRecording(message.isRecording);
        const count = message.eventCount || 0;
        setEventCount(count);
        setCanExport(!message.isRecording && count > 0);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [currentTabId]);

  // Effect to update canExport whenever isRecording or eventCount changes
  useEffect(() => {
    setCanExport(!isRecording && eventCount > 0);
  }, [isRecording, eventCount]);

  const handleStart = () => {
    if (!currentTabId) {
      alert("Cannot find active tab.");
      return;
    }
    console.log(
      `Popup sending START_RECORDING to background for tab ${currentTabId}`
    );
    chrome.runtime.sendMessage(
      { type: "START_RECORDING", tabId: currentTabId },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          console.error(
            "Start command failed:",
            response?.error || chrome.runtime.lastError?.message
          );
          alert(
            `Failed to start recording: ${response?.error || "Unknown error"}`
          );
        } else {
          console.log("Start command acknowledged by background.");
          setIsRecording(true);
          setEventCount(0);
          setCanExport(false);
        }
      }
    );
  };

  const handleStop = () => {
    if (!currentTabId) {
      alert("Cannot find active tab.");
      return;
    }
    console.log(
      `Popup sending STOP_RECORDING to background for tab ${currentTabId}`
    );
    chrome.runtime.sendMessage(
      { type: "STOP_RECORDING", tabId: currentTabId },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          console.error(
            "Stop command failed:",
            response?.error || chrome.runtime.lastError?.message
          );
          alert(
            `Failed to stop recording: ${response?.error || "Unknown error"}`
          );
        } else {
          console.log("Stop command acknowledged by background.");
          setIsRecording(false);
          // We don't know event count yet, background will update it
          // setCanExport will update via useEffect
        }
      }
    );
  };

  // REMOVED handleReplay function

  // Function to trigger JSON download
  function downloadJson(data: any, filename: string) {
    const jsonStr = JSON.stringify(data, null, 2); // Pretty print JSON
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Required for Firefox
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const handleExport = () => {
    if (!currentTabId) {
      alert("Cannot find active tab for export.");
      return;
    }
    if (isRecording) {
      alert("Please stop recording before exporting.");
      return;
    }

    console.log(`Popup requesting events for export for tab ${currentTabId}`);
    chrome.runtime.sendMessage(
      { type: "REQUEST_EVENTS_FOR_EXPORT", tabId: currentTabId },
      (response) => {
        if (chrome.runtime.lastError || !response?.events) {
          console.error(
            "Failed to get events for export:",
            response?.error || chrome.runtime.lastError?.message
          );
          alert(
            `Could not retrieve events for export: ${
              response?.error || "Unknown error"
            }`
          );
          return;
        }
        if (response.events.length === 0) {
          alert("No events recorded to export.");
          return;
        }
        const filename = `rrweb-recording-${currentTabId}-${new Date().toISOString()}.json`;
        downloadJson(response.events, filename);
      }
    );
  };

  return (
    <div className="popup-container p-4 w-80 text-black">
      <h1 className="text-xl font-bold mb-4">Session Recorder</h1>
      <div className="controls flex space-x-2 mb-4">
        <button
          onClick={handleStart}
          disabled={isRecording}
          className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Start
        </button>
        <button
          onClick={handleStop}
          disabled={!isRecording}
          className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
        >
          Stop
        </button>
        <button
          onClick={handleExport}
          disabled={isRecording || !canExport}
          className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Export JSON
        </button>
      </div>
      <p className="text-sm">
        Status: {isRecording ? "Recording..." : "Stopped"}
      </p>
      <p className="text-sm">Events captured: {eventCount}</p>
      {/* Remove replay container */}
      {/* <div id="replay-container" ref={replayContainerRef} className="w-full h-64 border border-gray-300 bg-gray-100 overflow-auto"></div> */}
    </div>
  );
};

export default Popup;

// Remove global declarations if no longer needed for replay
/*
declare global {
  interface Window { ... }
}
*/
