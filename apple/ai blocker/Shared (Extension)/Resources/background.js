// src/browser-api.ts
var getBrowserType = () => {
  if (typeof browser !== "undefined" && browser.runtime?.id) {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (ua.includes("Safari") && !ua.includes("Chrome")) {
        return "safari";
      }
    } catch {}
    return "firefox";
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return "chrome";
  }
  return "chrome";
};
var browserType = getBrowserType();
var getRawApi = () => {
  if (typeof browser !== "undefined") {
    return browser;
  }
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  throw new Error("No browser extension API found");
};
var api = getRawApi();
var storage = {
  local: {
    get(keys) {
      return new Promise((resolve, reject) => {
        if (browserType === "chrome") {
          api.storage.local.get(keys, (result) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        } else {
          api.storage.local.get(keys).then(resolve).catch(reject);
        }
      });
    },
    set(items) {
      return new Promise((resolve, reject) => {
        if (browserType === "chrome") {
          api.storage.local.set(items, () => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        } else {
          api.storage.local.set(items).then(resolve).catch(reject);
        }
      });
    }
  }
};
var runtime = {
  getURL(path) {
    return api.runtime.getURL(path);
  },
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.runtime.sendMessage(message, (response) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } else {
        api.runtime.sendMessage(message).then((response) => {
          resolve(response);
        }).catch(reject);
      }
    });
  },
  onMessage: {
    addListener(callback) {
      api.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const result = callback(message, sender, sendResponse);
        if (result === true) {
          return true;
        }
        if (result instanceof Promise) {
          result.then(sendResponse);
          return true;
        }
        return false;
      });
    }
  },
  get lastError() {
    return api.runtime.lastError;
  }
};
var action = {
  setIcon(details) {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        const chromeApi = api;
        chromeApi.action.setIcon(details, () => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
};
var i18n = {
  getMessage(messageName, substitutions) {
    try {
      return api.i18n.getMessage(messageName, substitutions) || "";
    } catch {
      return "";
    }
  },
  getUILanguage() {
    try {
      return api.i18n.getUILanguage();
    } catch {
      return "en";
    }
  }
};
var tabs = {
  query(queryInfo) {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.tabs.query(queryInfo, (tabs2) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(tabs2);
          }
        });
      } else {
        api.tabs.query(queryInfo).then(resolve).catch(reject);
      }
    });
  },
  sendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.tabs.sendMessage(tabId, message, (response) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } else {
        api.tabs.sendMessage(tabId, message).then((response) => {
          resolve(response);
        }).catch(reject);
      }
    });
  }
};
var browser_api_default = {
  storage,
  runtime,
  action,
  tabs,
  i18n,
  browserType
};

// src/background.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  debugMode: false,
  semanticBlocking: true,
  semanticThreshold: 3,
  semanticLayer: 10
};
async function loadDefaultBlockedWords() {
  try {
    const url = runtime.getURL("blocked-words.txt");
    const response = await fetch(url);
    const text = await response.text();
    const words = text.split(`
`).map((word) => word.trim().toLowerCase()).filter((word) => word.length > 0);
    return words;
  } catch (error) {
    console.error("Error loading default blocked words:", error);
    return [];
  }
}
async function initBlockedWords() {
  const result = await storage.local.get("blockedWords");
  const existingWords = result.blockedWords;
  if (!existingWords || existingWords.length === 0) {
    const defaultWords = await loadDefaultBlockedWords();
    await storage.local.set({ blockedWords: defaultWords });
    console.log("Loaded default blocked words:", defaultWords);
    return defaultWords;
  }
  console.log("Using existing blocked words:", existingWords);
  return existingWords;
}
async function getSettings() {
  const result = await storage.local.get("settings");
  return result.settings || DEFAULT_SETTINGS;
}
function updateIcon(isDark) {
  if (browser_api_default.browserType !== "chrome")
    return;
  const iconType = isDark ? "light" : "dark";
  action.setIcon({
    path: {
      "16": `icons/icon-${iconType}-16.png`,
      "32": `icons/icon-${iconType}-32.png`,
      "48": `icons/icon-${iconType}-48.png`,
      "128": `icons/icon-${iconType}-128.png`
    }
  });
}
function setupIconThemeListener() {
  if (browser_api_default.browserType !== "chrome")
    return;
  try {
    if (typeof matchMedia !== "undefined") {
      const mediaQuery = matchMedia("(prefers-color-scheme: dark)");
      updateIcon(mediaQuery.matches);
      mediaQuery.addEventListener("change", (e) => {
        updateIcon(e.matches);
      });
    } else {
      updateIcon(false);
    }
  } catch {
    updateIcon(false);
  }
}
initBlockedWords();
async function initSettings() {
  const result = await storage.local.get("settings");
  if (!result.settings) {
    await storage.local.set({ settings: DEFAULT_SETTINGS });
    console.log("Initialized default settings");
  }
}
initSettings();
setupIconThemeListener();
runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message;
  if (msg.action === "getBlockedWords") {
    storage.local.get("blockedWords").then((result) => {
      sendResponse({ words: result.blockedWords || [] });
    });
    return true;
  }
  if (msg.action === "reloadWords") {
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
  return;
});
