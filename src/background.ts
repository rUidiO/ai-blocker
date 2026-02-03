import browserApi, { storage, runtime, action } from "./browser-api";
import type { Message, WordsResponse, SuccessResponse, Settings, SettingsResponse } from "./types";

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  debugMode: false,
  semanticBlocking: true,
  semanticThreshold: 3,
  semanticLayer: 10,
};

async function loadDefaultBlockedWords(): Promise<string[]> {
  try {
    const url = runtime.getURL("blocked-words.txt");
    const response = await fetch(url);
    const text = await response.text();
    const words = text
      .split("\n")
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 0);
    return words;
  } catch (error) {
    console.error("Error loading default blocked words:", error);
    return [];
  }
}

async function initBlockedWords(): Promise<string[]> {
  // Check if words already exist in storage
  const result = await storage.local.get("blockedWords");
  const existingWords = result.blockedWords as string[] | undefined;

  // If no words in storage, load defaults from txt
  if (!existingWords || existingWords.length === 0) {
    const defaultWords = await loadDefaultBlockedWords();
    await storage.local.set({ blockedWords: defaultWords });
    console.log("Loaded default blocked words:", defaultWords);
    return defaultWords;
  }

  console.log("Using existing blocked words:", existingWords);
  return existingWords;
}

async function getSettings(): Promise<Settings> {
  const result = await storage.local.get("settings");
  return (result.settings as Settings) || DEFAULT_SETTINGS;
}

// Set icon based on color scheme (Chrome only - Firefox uses theme_icons in manifest)
function updateIcon(isDark: boolean) {
  if (browserApi.browserType !== "chrome") return;

  const iconType = isDark ? "light" : "dark";
  action.setIcon({
    path: {
      "16": `icons/icon-${iconType}-16.png`,
      "32": `icons/icon-${iconType}-32.png`,
      "48": `icons/icon-${iconType}-48.png`,
      "128": `icons/icon-${iconType}-128.png`,
    },
  });
}

function setupIconThemeListener() {
  if (browserApi.browserType !== "chrome") return;

  // matchMedia is not available in service workers (Manifest V3)
  // Use a default icon instead - Chrome will handle theme automatically via manifest icons
  try {
    if (typeof matchMedia !== "undefined") {
      const mediaQuery = matchMedia("(prefers-color-scheme: dark)");
      updateIcon(mediaQuery.matches);
      mediaQuery.addEventListener("change", (e) => {
        updateIcon(e.matches);
      });
    } else {
      // Default to light icons in service worker context
      updateIcon(false);
    }
  } catch {
    // Service worker - use default icon
    updateIcon(false);
  }
}

// Initialize words and settings on extension startup
initBlockedWords();

// Initialize default settings if not set
async function initSettings(): Promise<void> {
  const result = await storage.local.get("settings");
  if (!result.settings) {
    await storage.local.set({ settings: DEFAULT_SETTINGS });
    console.log("Initialized default settings");
  }
}
initSettings();

// Setup icon theme switching for Chrome
setupIconThemeListener();

// Listen for messages from content script or popup
runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: WordsResponse | SuccessResponse | SettingsResponse) => void
  ): true | undefined => {
    const msg = message as Message;

    if (msg.action === "getBlockedWords") {
      storage.local.get("blockedWords").then((result) => {
        sendResponse({ words: (result.blockedWords as string[]) || [] });
      });
      return true;
    }

    if (msg.action === "reloadWords") {
      // Force reload from txt file
      loadDefaultBlockedWords().then(async (words) => {
        await storage.local.set({ blockedWords: words });
        sendResponse({ words });
      });
      return true;
    }

    if (msg.action === "updateWords") {
      storage.local.set({ blockedWords: msg.words }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    if (msg.action === "getSettings") {
      getSettings().then((settings) => {
        sendResponse({ settings });
      });
      return true;
    }

    if (msg.action === "updateSettings") {
      storage.local.set({ settings: msg.settings }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    return undefined;
  }
);
