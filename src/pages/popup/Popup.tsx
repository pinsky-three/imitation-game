import React, { useState, useRef, useEffect } from "react";
import "./index.css"; // Assuming your Tailwind/popup styles are here
import "../../assets/styles/rrweb.css"; // Use relative path

// Placeholder type - you might want more specific types later
type RRWebEvent = object;

const Popup = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [events, setEvents] = useState<RRWebEvent[]>([]);
  const [canReplay, setCanReplay] = useState<boolean>(false);
  const replayContainerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null); // To hold the rrweb replayer instance

  // Effect to listen for events from content script
  useEffect(() => {
    const messageListener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === "RRWEB_EVENT") {
        console.log("Popup received event:", message.payload);
        setEvents((prevEvents) => [...prevEvents, message.payload]);
      } else if (message.type === "RECORDING_STARTED") {
        console.log("Popup notified: Recording started");
        setIsRecording(true);
        setCanReplay(false); // Cannot replay while recording
        setEvents([]); // Clear events on new recording start
      } else if (message.type === "RECORDING_STOPPED") {
        console.log("Popup notified: Recording stopped");
        setIsRecording(false);
        // Enable replay only if events were actually captured (check length later)
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on component unmount
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []); // Empty dependency array means this runs once on mount

  // Effect to update canReplay based on events length after recording stops
  useEffect(() => {
    if (!isRecording && events.length > 1) {
      setCanReplay(true);
    } else {
      setCanReplay(false);
    }
  }, [isRecording, events]);

  const sendMessageToContentScript = (message: any) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending message:",
              chrome.runtime.lastError.message
            );
            // Handle error, e.g., content script not injected or page not supported
            alert(
              `Could not communicate with the page. Ensure it's not a protected page (e.g., chrome://) and try reloading the page. Error: ${chrome.runtime.lastError.message}`
            );
            // Reset state if communication fails
            setIsRecording(false);
            setCanReplay(false);
          } else {
            console.log("Message sent, response:", response);
          }
        });
      } else {
        console.error("Could not find active tab ID.");
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

    console.log("Popup sending START_RECORDING...");
    setEvents([]); // Clear events before starting
    setIsRecording(true); // Optimistically set recording state
    setCanReplay(false);
    sendMessageToContentScript({ type: "START_RECORDING" });
  };

  const handleStop = () => {
    console.log("Popup sending STOP_RECORDING...");
    // State update (isRecording=false, canReplay=true/false) will be triggered
    // by 'RECORDING_STOPPED' message from content script based on actual stop
    sendMessageToContentScript({ type: "STOP_RECORDING" });
  };

  const handleReplay = async () => {
    if (events.length < 2 || !replayContainerRef.current) {
      alert(
        "Not enough events recorded to replay, or replay container not ready."
      );
      console.log(
        `Cannot replay: events=${events.length}, container=${replayContainerRef.current}`
      );
      return;
    }

    // Ensure rrweb is available in the popup context
    // @ts-expect-error: Assume rrweb is loaded globally in popup via script or import
    if (typeof window.rrweb === "undefined") {
      // Attempt to dynamically load if not present (requires manifest permission)
      // Or ensure it's imported/bundled with the popup chunk
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
      // @ts-expect-error: Assume rrweb is loaded globally
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

  // Dynamically load rrweb into the popup context if not already present
  // This requires the library to be bundled or accessible to the popup.
  // An alternative is importing it directly if using a bundler.
  useEffect(() => {
    // @ts-expect-error
    if (typeof window.rrweb === "undefined") {
      console.log("Attempting to load rrweb into popup...");
      const script = document.createElement("script");
      // IMPORTANT: This assumes rrweb.min.js is accessible to the popup.
      // It might need to be added to web_accessible_resources OR
      // preferably imported/bundled directly into the popup's code.
      // Let's assume it's bundled for now. We need to import it.
      script.src = chrome.runtime.getURL("src/vendor/rrweb.min.js"); // Adjust path if needed
      script.onload = () => console.log("rrweb loaded into popup context.");
      script.onerror = () =>
        console.error("Failed to load rrweb into popup context.");
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      }; // Cleanup
    }
  }, []);

  return (
    <div className="popup-container p-4 w-80">
      <h1 className="text-xl font-bold mb-4">Session Recorder</h1>
      <div className="controls space-x-2 mb-4">
        <button
          id="start-button"
          onClick={handleStart}
          disabled={isRecording}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Start Recording
        </button>
        <button
          id="stop-button"
          onClick={handleStop}
          disabled={!isRecording}
          className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
        >
          Stop Recording
        </button>
        <button
          id="replay-button"
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
