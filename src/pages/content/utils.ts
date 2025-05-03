export function injectScript(filePath: string, tagId: string) {
  if (document.getElementById(tagId)) {
    console.log(`Script with ID ${tagId} already injected.`);
    return;
  }

  const script = document.createElement("script");

  script.setAttribute("type", "text/javascript");
  script.setAttribute("src", chrome.runtime.getURL(filePath));
  script.setAttribute("id", tagId); // Add an ID for checking

  (document.head || document.documentElement).appendChild(script);

  console.log(`Injecting script: ${filePath}`);

  script.onload = () => {
    console.log(`Script ${filePath} loaded successfully.`);
  };

  script.onerror = (e) => {
    console.error(`Error loading script: ${filePath}`, e);
  };
}
