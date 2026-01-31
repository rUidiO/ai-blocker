import { storage, runtime, tabs } from "./browser-api";
import type { SettingsResponse, Settings } from "./types";

const wordsTextarea = document.getElementById("words") as HTMLTextAreaElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const importButton = document.getElementById("import") as HTMLButtonElement;
const exportButton = document.getElementById("export") as HTMLButtonElement;
const importFile = document.getElementById("importFile") as HTMLInputElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const debugModeToggle = document.getElementById("debugMode") as HTMLInputElement;
const semanticBlockingToggle = document.getElementById("semanticBlocking") as HTMLInputElement;
const semanticThresholdInput = document.getElementById("semanticThreshold") as HTMLInputElement;
const semanticLayerInput = document.getElementById("semanticLayer") as HTMLInputElement;
const enableToggle = document.getElementById("enableToggle") as HTMLInputElement;
const toggleStatus = document.getElementById("toggleStatus") as HTMLSpanElement;

async function loadWords(): Promise<void> {
  try {
    const result = await storage.local.get("blockedWords");
    const words = (result.blockedWords as string[]) || [];
    wordsTextarea.value = words.join("\n");
  } catch (error) {
    console.error("Error loading words:", error);
  }
}

function updateToggleStatus(enabled: boolean): void {
  toggleStatus.textContent = enabled ? "on" : "off";
}

async function loadSettings(): Promise<void> {
  const defaultSettings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 10 };
  try {
    const response = await runtime.sendMessage<SettingsResponse>({
      action: "getSettings",
    });
    const settings = response.settings || defaultSettings;
    enableToggle.checked = settings.enabled ?? true;
    updateToggleStatus(enableToggle.checked);
    debugModeToggle.checked = settings.debugMode;
    semanticBlockingToggle.checked = settings.semanticBlocking;
    semanticThresholdInput.value = String(settings.semanticThreshold);
    semanticLayerInput.value = String(settings.semanticLayer);
  } catch (error) {
    // Fallback to storage
    try {
      const result = await storage.local.get("settings");
      const settings = (result.settings as Settings) || defaultSettings;
      enableToggle.checked = settings.enabled ?? true;
      updateToggleStatus(enableToggle.checked);
      debugModeToggle.checked = settings.debugMode;
      semanticBlockingToggle.checked = settings.semanticBlocking;
      semanticThresholdInput.value = String(settings.semanticThreshold);
      semanticLayerInput.value = String(settings.semanticLayer);
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }
}

function showStatus(message: string, isError = false): void {
  statusDiv.textContent = message;
  statusDiv.className = isError ? "error" : "";
  setTimeout(() => {
    statusDiv.textContent = "";
  }, 2000);
}

async function saveSettings(): Promise<void> {
  const settings: Settings = {
    enabled: enableToggle.checked,
    debugMode: debugModeToggle.checked,
    semanticBlocking: semanticBlockingToggle.checked,
    semanticThreshold: Math.max(2, Math.min(10, parseInt(semanticThresholdInput.value) || 3)),
    semanticLayer: Math.max(1, Math.min(10, parseInt(semanticLayerInput.value) || 10)),
  };

  try {
    await storage.local.set({ settings });
    try {
      await runtime.sendMessage({ action: "updateSettings", settings });
    } catch (e) {
      // Ignore message error
    }
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

saveButton.addEventListener("click", async () => {
  const text = wordsTextarea.value;
  const words = text
    .split("\n")
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0);

  try {
    await storage.local.set({ blockedWords: words });
    try {
      await runtime.sendMessage({ action: "updateWords", words });
    } catch (e) {
      // Ignore message error
    }
    await saveSettings();
    showStatus(`Saved ${words.length} words`);
  } catch (error) {
    showStatus("Error saving", true);
    console.error("Error saving:", error);
  }
});

enableToggle.addEventListener("change", async () => {
  updateToggleStatus(enableToggle.checked);
  await saveSettings();
  // Refresh current tab to apply changes
  try {
    const tabList = await tabs.query({ active: true, currentWindow: true });
    if (tabList[0]?.id) {
      await tabs.sendMessage(tabList[0].id, { action: "refresh" });
    }
  } catch (e) {
    // Ignore
  }
});
debugModeToggle.addEventListener("change", saveSettings);
semanticBlockingToggle.addEventListener("change", saveSettings);
semanticThresholdInput.addEventListener("change", saveSettings);
semanticLayerInput.addEventListener("change", saveSettings);

refreshButton.addEventListener("click", async () => {
  try {
    await saveSettings();
    const tabList = await tabs.query({ active: true, currentWindow: true });
    if (tabList[0]?.id) {
      await tabs.sendMessage(tabList[0].id, { action: "refresh" });
      showStatus("Page refreshed");
    }
  } catch (error) {
    showStatus("Error refreshing", true);
    console.error("Error refreshing:", error);
  }
});

importButton.addEventListener("click", () => {
  importFile.click();
});

exportButton.addEventListener("click", () => {
  const text = wordsTextarea.value;
  const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `blocked-words-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  showStatus("Exported");
});

importFile.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const text = await file.text();
  wordsTextarea.value = text;
  showStatus("Imported");
  importFile.value = "";
});

// Load on popup open
loadWords();
loadSettings();
