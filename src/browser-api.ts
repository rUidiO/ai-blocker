declare const chrome: {
  runtime: typeof browser.runtime;
  storage: typeof browser.storage;
  tabs: typeof browser.tabs;
};

const getBrowserType = (): "firefox" | "chrome" | "safari" => {
  if (typeof browser !== "undefined" && browser.runtime?.id) {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (ua.includes("Safari") && !ua.includes("Chrome")) {
        return "safari";
      }
    } catch {
    }
    return "firefox";
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return "chrome";
  }
  return "chrome";
};

const browserType = getBrowserType();

const getRawApi = () => {
  if (typeof browser !== "undefined") {
    return browser;
  }
  if (typeof chrome !== "undefined") {
    return chrome as unknown as typeof browser;
  }
  throw new Error("No browser extension API found");
};

const api = getRawApi();

export const storage = {
  local: {
    get(keys: string | string[]): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        if (browserType === "chrome") {
          api.storage.local.get(keys, (result: Record<string, unknown>) => {
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
    set(items: Record<string, unknown>): Promise<void> {
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
    },
  },
};

export const runtime = {
  getURL(path: string): string {
    return api.runtime.getURL(path);
  },

  sendMessage<T>(message: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.runtime.sendMessage(message, (response: T) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } else {
        api.runtime.sendMessage(message).then((response) => {
          resolve(response as T);
        }).catch(reject);
      }
    });
  },

  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: browser.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => boolean | undefined | void | Promise<unknown>
    ): void {
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
    },
  },

  get lastError() {
    return api.runtime.lastError;
  },
};

export const action = {
  setIcon(details: { path: Record<string, string> }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        const chromeApi = api as unknown as { action: { setIcon: (details: { path: Record<string, string> }, callback: () => void) => void } };
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
  },
};

export const i18n = {
  getMessage(messageName: string, substitutions?: string | string[]): string {
    try {
      return api.i18n.getMessage(messageName, substitutions) || "";
    } catch {
      return "";
    }
  },
  getUILanguage(): string {
    try {
      return api.i18n.getUILanguage();
    } catch {
      return "en";
    }
  },
};

export const tabs = {
  query(queryInfo: browser.tabs.QueryQueryInfoType): Promise<browser.tabs.Tab[]> {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.tabs.query(queryInfo, (tabs: browser.tabs.Tab[]) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(tabs);
          }
        });
      } else {
        api.tabs.query(queryInfo).then(resolve).catch(reject);
      }
    });
  },

  sendMessage<T>(tabId: number, message: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (browserType === "chrome") {
        api.tabs.sendMessage(tabId, message, (response: T) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } else {
        api.tabs.sendMessage(tabId, message).then((response) => {
          resolve(response as T);
        }).catch(reject);
      }
    });
  },
};

export default {
  storage,
  runtime,
  action,
  tabs,
  i18n,
  browserType,
};
