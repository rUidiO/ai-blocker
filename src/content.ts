import { runtime, storage } from "./browser-api";
import type { RefreshMessage, WordsResponse, SuccessResponse, Settings, SettingsResponse } from "./types";

let blockedWords: string[] = [];
let settings: Settings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 1 };

const PROTECTED_TAGS = new Set([
  "HTML",
  "BODY",
  "HEAD",
  "MAIN",
  "HEADER",
  "FOOTER",
  "NAV",
]);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK"]);

const CONTAINER_TAGS = new Set([
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
  "H6",
]);

const YOUTUBE_PREFIXES = ["YTD-", "YT-", "YTM-"];

function isYouTubeElement(tagName: string): boolean {
  return YOUTUBE_PREFIXES.some(prefix => tagName.startsWith(prefix));
}

function isContainerElement(element: Element): boolean {
  const tagName = element.tagName;
  if (CONTAINER_TAGS.has(tagName)) return true;
  if (isYouTubeElement(tagName)) return true;
  if (tagName.includes("-")) return true;
  return false;
}

const TITLE_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

const TITLE_PATTERNS = [
  /title/i,
  /heading/i,
  /header/i,
  /headline/i,
  /name/i,
];

async function getBlockedWords(): Promise<string[]> {
  try {
    const response = await runtime.sendMessage<WordsResponse>({
      action: "getBlockedWords",
    });
    blockedWords = response.words || [];
    return blockedWords;
  } catch (error) {
    console.log("Message failed, trying direct storage access");
    try {
      const result = await storage.local.get("blockedWords");
      blockedWords = (result.blockedWords as string[]) || [];
      return blockedWords;
    } catch (storageError) {
      console.error("Error getting blocked words:", storageError);
      return [];
    }
  }
}

async function getSettings(): Promise<Settings> {
  const defaultSettings: Settings = { enabled: true, debugMode: false, semanticBlocking: true, semanticThreshold: 3, semanticLayer: 1 };
  try {
    const response = await runtime.sendMessage<SettingsResponse>({
      action: "getSettings",
    });
    settings = response.settings || defaultSettings;
    return settings;
  } catch (error) {
    console.log("Message failed, trying direct storage access");
    try {
      const result = await storage.local.get("settings");
      settings = (result.settings as Settings) || defaultSettings;
      return settings;
    } catch (storageError) {
      console.error("Error getting settings:", storageError);
      return defaultSettings;
    }
  }
}

function isTitleElement(element: Element): boolean {
  if (TITLE_TAGS.has(element.tagName)) {
    return true;
  }

  const className = element.className || "";
  const role = element.getAttribute("role") || "";
  const id = element.id || "";

  const textToCheck = `${className} ${role} ${id}`;
  return TITLE_PATTERNS.some((pattern) => pattern.test(textToCheck));
}

function getElementSignature(element: Element): string {
  const tag = element.tagName;
  const className = element.className || "";
  const sortedClasses = className.split(/\s+/).filter(Boolean).sort().join(" ");
  return `${tag}:${sortedClasses}`;
}

function countSimilarSiblings(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  const signature = getElementSignature(element);
  let count = 0;

  for (const child of parent.children) {
    if (getElementSignature(child) === signature) {
      count++;
    }
  }

  return count;
}

function createWordRegex(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function containsBlockedWord(text: string): boolean {
  if (!text || blockedWords.length === 0) return false;
  return blockedWords.some((word) => createWordRegex(word).test(text));
}

function getMatchedWords(text: string): string[] {
  if (!text || blockedWords.length === 0) return [];
  return blockedWords.filter((word) => createWordRegex(word).test(text));
}

function isTooLargeToHide(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const viewportArea = window.innerWidth * window.innerHeight;
  const elementArea = rect.width * rect.height;
  return elementArea > viewportArea * 0.5;
}

function findElementToHide(startElement: Element): Element | null {
  let current: Element | null = startElement;
  let bestCandidate: Element | null = null;

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

function findSemanticBlockTarget(startElement: Element): Element | null {
  let current: Element | null = startElement;
  let layerCount = 0;
  let bestCandidate: Element | null = null;

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

function highlightKeywordsInTextNode(textNode: Text, words: string[]): void {
  const text = textNode.textContent || "";
  const parent = textNode.parentNode;
  if (!parent) return;

  const escapedWords = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`\\b(${escapedWords.join("|")})\\b`, "gi");

  const parts = text.split(regex);
  if (parts.length === 1) return;

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

function hideBlockedElements(): void {
  if (!settings.enabled || blockedWords.length === 0) return;

  const elementsToProcess = new Map<Element, Text[]>();
  const semanticElements = new Set<Element>();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && containsBlockedWord(node.textContent)) {
      textNodes.push(node);
    }
  }

  const images = document.querySelectorAll<HTMLImageElement>("img[alt]");
  for (const img of images) {
    const alt = img.getAttribute("alt");
    if (alt && containsBlockedWord(alt)) {
      const elementToHide = findElementToHide(img);
      if (elementToHide && !isTooLargeToHide(elementToHide)) {
        if (!elementsToProcess.has(elementToHide)) {
          elementsToProcess.set(elementToHide, []);
        }
      }

      if (settings.semanticBlocking) {
        const target = findSemanticBlockTarget(img);
        if (target && !isTooLargeToHide(target)) {
          semanticElements.add(target);
        }
      }
    }
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) continue;

    if (settings.semanticBlocking) {
      let foundInTitle = false;
      let titleAncestor: Element | null = parent;
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
      elementsToProcess.get(elementToProcess)!.push(textNode);
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
      const htmlEl = element as HTMLElement;
      htmlEl.style.filter = "invert(1)";
      htmlEl.style.outline = "3px solid red";
      htmlEl.dataset.aiBlockerDebug = "true";
    }

    for (const textNode of textNodes) {
      if ((textNode.parentElement as HTMLElement)?.dataset?.aiBlockerHighlight) continue;
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
      const htmlEl = element as HTMLElement;
      htmlEl.style.display = "none";
      htmlEl.dataset.aiBlockerHidden = "true";
    }

    if (filteredElements.length > 0) {
      console.log(`AI Blocker: Hidden ${filteredElements.length} elements`);
    }
  }
}

function clearAllEffects(): void {
  document
    .querySelectorAll<HTMLElement>("[data-ai-blocker-hidden]")
    .forEach((el) => {
      el.style.display = "";
      delete el.dataset.aiBlockerHidden;
    });

  document
    .querySelectorAll<HTMLElement>("[data-ai-blocker-debug]")
    .forEach((el) => {
      el.style.filter = "";
      el.style.outline = "";
      delete el.dataset.aiBlockerDebug;
    });

  document
    .querySelectorAll<HTMLElement>("mark[data-ai-blocker-highlight]")
    .forEach((mark) => {
      const text = document.createTextNode(mark.textContent || "");
      mark.parentNode?.replaceChild(text, mark);
    });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debounce(fn: () => void, delay: number): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

function observeDOM(): void {
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        const isOurMark = [...mutation.addedNodes].every(
          (n) => n.nodeName === "MARK" && (n as HTMLElement).dataset?.aiBlockerHighlight
        );
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
    subtree: true,
  });
}

async function init(): Promise<void> {
  await Promise.all([getBlockedWords(), getSettings()]);
  if (settings.enabled && blockedWords.length > 0) {
    hideBlockedElements();

    setTimeout(hideBlockedElements, 50);
    setTimeout(hideBlockedElements, 200);
    setTimeout(hideBlockedElements, 500);

    observeDOM();
  }
}

runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: SuccessResponse) => void
  ): true | undefined => {
    const msg = message as RefreshMessage;
    if (msg.action === "refresh") {
      Promise.all([getBlockedWords(), getSettings()]).then(() => {
        clearAllEffects();
        hideBlockedElements();
        sendResponse({ success: true });
      });
      return true;
    }
    return undefined;
  }
);

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

let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
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
