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

// src/popup.ts
var wordsTextarea = document.getElementById("words");
var saveButton = document.getElementById("save");
var refreshButton = document.getElementById("refresh");
var statusDiv = document.getElementById("status");
var debugModeToggle = document.getElementById("debugMode");
var semanticBlockingToggle = document.getElementById("semanticBlocking");
var semanticThresholdInput = document.getElementById("semanticThreshold");
var semanticLayerInput = document.getElementById("semanticLayer");
var enableToggle = document.getElementById("enableToggle");
var toggleStatus = document.getElementById("toggleStatus");
var loadingIcon = document.getElementById("loadingIcon");
function initI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      const message = i18n.getMessage(key);
      if (message)
        el.textContent = message;
    }
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      const message = i18n.getMessage(key);
      if (message)
        el.placeholder = message;
    }
  });
}
async function loadWords() {
  try {
    const result = await storage.local.get("blockedWords");
    const words = result.blockedWords || [];
    wordsTextarea.value = words.join(`
`);
  } catch (error) {
    console.error("Error loading words:", error);
  }
}
function updateToggleStatus(enabled) {
  const onKey = toggleStatus.getAttribute("data-i18n-on") || "toggleOn";
  const offKey = toggleStatus.getAttribute("data-i18n-off") || "toggleOff";
  const message = i18n.getMessage(enabled ? onKey : offKey);
  toggleStatus.textContent = message || (enabled ? "on" : "off");
}
async function loadSettings() {
  const defaultSettings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 10 };
  try {
    const response = await runtime.sendMessage({
      action: "getSettings"
    });
    const settings = response.settings || defaultSettings;
    enableToggle.checked = settings.enabled ?? true;
    updateToggleStatus(enableToggle.checked);
    debugModeToggle.checked = settings.debugMode;
    semanticBlockingToggle.checked = settings.semanticBlocking;
    semanticThresholdInput.value = String(settings.semanticThreshold);
    semanticLayerInput.value = String(settings.semanticLayer);
  } catch (error) {
    try {
      const result = await storage.local.get("settings");
      const settings = result.settings || defaultSettings;
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
function showStatus(messageKey, isError = false, substitutions) {
  const message = i18n.getMessage(messageKey, substitutions) || messageKey;
  statusDiv.textContent = message;
  statusDiv.className = isError ? "error" : "";
  setTimeout(() => {
    statusDiv.textContent = "";
  }, 2000);
}
var loadingStartTime = 0;
function showLoading() {
  loadingStartTime = Date.now();
  loadingIcon.classList.add("active");
}
async function hideLoading() {
  const elapsed = Date.now() - loadingStartTime;
  const minDuration = 1000;
  if (elapsed < minDuration) {
    await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
  }
  loadingIcon.classList.remove("active");
}
async function saveSettings() {
  const settings = {
    enabled: enableToggle.checked,
    debugMode: debugModeToggle.checked,
    semanticBlocking: semanticBlockingToggle.checked,
    semanticThreshold: Math.max(2, Math.min(10, parseInt(semanticThresholdInput.value) || 3)),
    semanticLayer: Math.max(1, Math.min(10, parseInt(semanticLayerInput.value) || 10))
  };
  try {
    await storage.local.set({ settings });
    try {
      await runtime.sendMessage({ action: "updateSettings", settings });
    } catch (e) {}
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}
saveButton.addEventListener("click", async () => {
  const text = wordsTextarea.value;
  const words = text.split(`
`).map((word) => word.trim().toLowerCase()).filter((word) => word.length > 0);
  showLoading();
  try {
    await storage.local.set({ blockedWords: words });
    try {
      await runtime.sendMessage({ action: "updateWords", words });
    } catch (e) {}
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
  try {
    const tabList = await tabs.query({ active: true, currentWindow: true });
    if (tabList[0]?.id) {
      await tabs.sendMessage(tabList[0].id, { action: "refresh" });
    }
  } catch (e) {}
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
initI18n();
loadWords();
loadSettings();
