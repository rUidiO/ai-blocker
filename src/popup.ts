import { storage, runtime, tabs, i18n } from "./browser-api";
import type { SettingsResponse, Settings } from "./types";

const wordsTextarea = document.getElementById("words") as HTMLTextAreaElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const debugModeToggle = document.getElementById("debugMode") as HTMLInputElement;
const semanticBlockingToggle = document.getElementById("semanticBlocking") as HTMLInputElement;
const semanticThresholdInput = document.getElementById("semanticThreshold") as HTMLInputElement;
const semanticLayerInput = document.getElementById("semanticLayer") as HTMLInputElement;
const enableToggle = document.getElementById("enableToggle") as HTMLInputElement;
const toggleStatus = document.getElementById("toggleStatus") as HTMLSpanElement;
const loadingIcon = document.getElementById("loadingIcon") as HTMLDivElement;

// Initialize i18n
function initI18n(): void {
  // Translate elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      const message = i18n.getMessage(key);
      if (message) el.textContent = message;
    }
  });

  // Translate placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      const message = i18n.getMessage(key);
      if (message) (el as HTMLInputElement | HTMLTextAreaElement).placeholder = message;
    }
  });
}

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
  const onKey = toggleStatus.getAttribute("data-i18n-on") || "toggleOn";
  const offKey = toggleStatus.getAttribute("data-i18n-off") || "toggleOff";
  const message = i18n.getMessage(enabled ? onKey : offKey);
  toggleStatus.textContent = message || (enabled ? "on" : "off");
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

function showStatus(messageKey: string, isError = false, substitutions?: string[]): void {
  const message = i18n.getMessage(messageKey, substitutions) || messageKey;
  statusDiv.textContent = message;
  statusDiv.className = isError ? "error" : "";
  setTimeout(() => {
    statusDiv.textContent = "";
  }, 2000);
}

let loadingStartTime = 0;

function showLoading(): void {
  loadingStartTime = Date.now();
  loadingIcon.classList.add("active");
}

async function hideLoading(): Promise<void> {
  const elapsed = Date.now() - loadingStartTime;
  const minDuration = 1000;
  if (elapsed < minDuration) {
    await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
  }
  loadingIcon.classList.remove("active");
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

  showLoading();
  try {
    await storage.local.set({ blockedWords: words });
    try {
      await runtime.sendMessage({ action: "updateWords", words });
    } catch (e) {
      // Ignore message error
    }
    await saveSettings();
    showStatus("statusSaved", false, [words.length.toString()]);
  } catch (error) {
    showStatus("statusErrorSaving", true);
    console.error("Error saving:", error);
  } finally {
    hideLoading();
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
  showLoading();
  try {
    await saveSettings();
    const tabList = await tabs.query({ active: true, currentWindow: true });
    if (tabList[0]?.id) {
      await tabs.sendMessage(tabList[0].id, { action: "refresh" });
      showStatus("statusRefreshed");
    }
  } catch (error) {
    showStatus("statusErrorRefreshing", true);
    console.error("Error refreshing:", error);
  } finally {
    hideLoading();
  }
});

// Initialize
initI18n();
loadWords();
loadSettings();
