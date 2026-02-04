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

// src/content.ts
var blockedWords = [];
var settings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 1 };
var PROTECTED_TAGS = new Set([
  "HTML",
  "BODY",
  "HEAD",
  "MAIN",
  "HEADER",
  "FOOTER",
  "NAV"
]);
var SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK"]);
var CONTAINER_TAGS = new Set([
  "DIV",
  "ARTICLE",
  "SECTION",
  "LI",
  "TR",
  "TD",
  "P",
  "SPAN",
  "A",
  "BLOCKQUOTE",
  "ASIDE",
  "FIGURE",
  "FIGCAPTION",
  "CARD",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6"
]);
var YOUTUBE_PREFIXES = ["YTD-", "YT-", "YTM-"];
function isYouTubeElement(tagName) {
  return YOUTUBE_PREFIXES.some((prefix) => tagName.startsWith(prefix));
}
function isContainerElement(element) {
  const tagName = element.tagName;
  if (CONTAINER_TAGS.has(tagName))
    return true;
  if (isYouTubeElement(tagName))
    return true;
  if (tagName.includes("-"))
    return true;
  return false;
}
var TITLE_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
var TITLE_PATTERNS = [
  /title/i,
  /heading/i,
  /header/i,
  /headline/i,
  /name/i
];
async function getBlockedWords() {
  try {
    const response = await runtime.sendMessage({
      action: "getBlockedWords"
    });
    blockedWords = response.words || [];
    return blockedWords;
  } catch (error) {
    console.log("Message failed, trying direct storage access");
    try {
      const result = await storage.local.get("blockedWords");
      blockedWords = result.blockedWords || [];
      return blockedWords;
    } catch (storageError) {
      console.error("Error getting blocked words:", storageError);
      return [];
    }
  }
}
async function getSettings() {
  const defaultSettings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 1 };
  try {
    const response = await runtime.sendMessage({
      action: "getSettings"
    });
    settings = response.settings || defaultSettings;
    return settings;
  } catch (error) {
    console.log("Message failed, trying direct storage access");
    try {
      const result = await storage.local.get("settings");
      settings = result.settings || defaultSettings;
      return settings;
    } catch (storageError) {
      console.error("Error getting settings:", storageError);
      return defaultSettings;
    }
  }
}
function isTitleElement(element) {
  if (TITLE_TAGS.has(element.tagName)) {
    return true;
  }
  const className = element.className || "";
  const role = element.getAttribute("role") || "";
  const id = element.id || "";
  const textToCheck = `${className} ${role} ${id}`;
  return TITLE_PATTERNS.some((pattern) => pattern.test(textToCheck));
}
function getElementSignature(element) {
  const tag = element.tagName;
  const className = element.className || "";
  const sortedClasses = className.split(/\s+/).filter(Boolean).sort().join(" ");
  return `${tag}:${sortedClasses}`;
}
function countSimilarSiblings(element) {
  const parent = element.parentElement;
  if (!parent)
    return 1;
  const signature = getElementSignature(element);
  let count = 0;
  for (const child of parent.children) {
    if (getElementSignature(child) === signature) {
      count++;
    }
  }
  return count;
}
function createWordRegex(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}
function containsBlockedWord(text) {
  if (!text || blockedWords.length === 0)
    return false;
  return blockedWords.some((word) => createWordRegex(word).test(text));
}
function getMatchedWords(text) {
  if (!text || blockedWords.length === 0)
    return [];
  return blockedWords.filter((word) => createWordRegex(word).test(text));
}
function isTooLargeToHide(element) {
  const rect = element.getBoundingClientRect();
  const viewportArea = window.innerWidth * window.innerHeight;
  const elementArea = rect.width * rect.height;
  return elementArea > viewportArea * 0.5;
}
function findElementToHide(startElement) {
  let current = startElement;
  let bestCandidate = null;
  while (current && !PROTECTED_TAGS.has(current.tagName)) {
    if (isTooLargeToHide(current)) {
      break;
    }
    if (isContainerElement(current)) {
      bestCandidate = current;
      break;
    }
    current = current.parentElement;
  }
  return bestCandidate;
}
function findSemanticBlockTarget(startElement) {
  let current = startElement;
  let layerCount = 0;
  let bestCandidate = null;
  while (current && !PROTECTED_TAGS.has(current.tagName) && layerCount <= settings.semanticLayer) {
    if (isTooLargeToHide(current)) {
      break;
    }
    const similarCount = countSimilarSiblings(current);
    if (similarCount >= settings.semanticThreshold) {
      bestCandidate = current;
    }
    current = current.parentElement;
    layerCount++;
  }
  return bestCandidate;
}
function highlightKeywordsInTextNode(textNode, words) {
  const text = textNode.textContent || "";
  const parent = textNode.parentNode;
  if (!parent)
    return;
  const escapedWords = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`\\b(${escapedWords.join("|")})\\b`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1)
    return;
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (words.some((w) => w.toLowerCase() === part.toLowerCase())) {
      const highlight = document.createElement("mark");
      highlight.textContent = part;
      highlight.style.backgroundColor = "yellow";
      highlight.style.color = "black";
      highlight.style.padding = "0 2px";
      highlight.dataset.aiBlockerHighlight = "true";
      fragment.appendChild(highlight);
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
  }
  parent.replaceChild(fragment, textNode);
}
function hideBlockedElements() {
  if (!settings.enabled || blockedWords.length === 0)
    return;
  const elementsToProcess = new Map;
  const semanticElements = new Set;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent && containsBlockedWord(node.textContent)) {
      textNodes.push(node);
    }
  }
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName))
      continue;
    if (settings.semanticBlocking) {
      let foundInTitle = false;
      let titleAncestor = parent;
      while (titleAncestor && !PROTECTED_TAGS.has(titleAncestor.tagName)) {
        if (isTitleElement(titleAncestor)) {
          const target = findSemanticBlockTarget(titleAncestor);
          if (target && !isTooLargeToHide(target)) {
            semanticElements.add(target);
            foundInTitle = true;
            break;
          }
        }
        titleAncestor = titleAncestor.parentElement;
      }
      if (!foundInTitle) {
        const target = findSemanticBlockTarget(parent);
        if (target && !isTooLargeToHide(target)) {
          semanticElements.add(target);
        }
      }
    }
    const elementToProcess = findElementToHide(parent);
    if (elementToProcess && !isTooLargeToHide(elementToProcess)) {
      if (!elementsToProcess.has(elementToProcess)) {
        elementsToProcess.set(elementToProcess, []);
      }
      elementsToProcess.get(elementToProcess).push(textNode);
    }
  }
  const allElements = new Set([...elementsToProcess.keys(), ...semanticElements]);
  const filteredElements = [...allElements].filter((el) => {
    for (const other of allElements) {
      if (other !== el && other.contains(el)) {
        return false;
      }
    }
    return true;
  });
  if (settings.debugMode) {
    for (const element of filteredElements) {
      const htmlEl = element;
      htmlEl.style.filter = "invert(1)";
      htmlEl.style.outline = "3px solid red";
      htmlEl.dataset.aiBlockerDebug = "true";
    }
    for (const textNode of textNodes) {
      if (textNode.parentElement?.dataset?.aiBlockerHighlight)
        continue;
      const matchedWords = getMatchedWords(textNode.textContent || "");
      if (matchedWords.length > 0) {
        highlightKeywordsInTextNode(textNode, matchedWords);
      }
    }
    if (filteredElements.length > 0) {
      console.log(`AI Blocker (Debug): Highlighted ${filteredElements.length} elements`);
    }
  } else {
    for (const element of filteredElements) {
      const htmlEl = element;
      htmlEl.style.display = "none";
      htmlEl.dataset.aiBlockerHidden = "true";
    }
    if (filteredElements.length > 0) {
      console.log(`AI Blocker: Hidden ${filteredElements.length} elements`);
    }
  }
}
function clearAllEffects() {
  document.querySelectorAll("[data-ai-blocker-hidden]").forEach((el) => {
    el.style.display = "";
    delete el.dataset.aiBlockerHidden;
  });
  document.querySelectorAll("[data-ai-blocker-debug]").forEach((el) => {
    el.style.filter = "";
    el.style.outline = "";
    delete el.dataset.aiBlockerDebug;
  });
  document.querySelectorAll("mark[data-ai-blocker-highlight]").forEach((mark) => {
    const text = document.createTextNode(mark.textContent || "");
    mark.parentNode?.replaceChild(text, mark);
  });
}
var debounceTimer = null;
function debounce(fn, delay) {
  if (debounceTimer)
    clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        const isOurMark = [...mutation.addedNodes].every((n) => n.nodeName === "MARK" && n.dataset?.aiBlockerHighlight);
        if (!isOurMark) {
          shouldCheck = true;
          break;
        }
      }
    }
    if (shouldCheck) {
      debounce(hideBlockedElements, 10);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
async function init() {
  await Promise.all([getBlockedWords(), getSettings()]);
  if (settings.enabled && blockedWords.length > 0) {
    hideBlockedElements();
    setTimeout(hideBlockedElements, 50);
    setTimeout(hideBlockedElements, 200);
    setTimeout(hideBlockedElements, 500);
    observeDOM();
  }
}
runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message;
  if (msg.action === "refresh") {
    Promise.all([getBlockedWords(), getSettings()]).then(() => {
      clearAllEffects();
      hideBlockedElements();
      sendResponse({ success: true });
    });
    return true;
  }
  return;
});
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
window.addEventListener("load", () => {
  if (settings.enabled && blockedWords.length > 0) {
    hideBlockedElements();
  }
});
var lastUrl = location.href;
var urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (settings.enabled && blockedWords.length > 0) {
      setTimeout(hideBlockedElements, 100);
      setTimeout(hideBlockedElements, 500);
      setTimeout(hideBlockedElements, 1000);
    }
  }
});
if (document.body) {
  urlObserver.observe(document.body, { childList: true, subtree: true });
}
window.addEventListener("popstate", () => {
  if (settings.enabled && blockedWords.length > 0) {
    setTimeout(hideBlockedElements, 100);
  }
});
