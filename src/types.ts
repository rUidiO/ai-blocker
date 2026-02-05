export interface BlockedWordsMessage {
  action: "getBlockedWords";
}

export interface ReloadWordsMessage {
  action: "reloadWords";
}

export interface UpdateWordsMessage {
  action: "updateWords";
  words: string[];
}

export interface RefreshMessage {
  action: "refresh";
}

export interface GetSettingsMessage {
  action: "getSettings";
}

export interface UpdateSettingsMessage {
  action: "updateSettings";
  settings: Settings;
}

export type Message =
  | BlockedWordsMessage
  | ReloadWordsMessage
  | UpdateWordsMessage
  | RefreshMessage
  | GetSettingsMessage
  | UpdateSettingsMessage;

export interface WordsResponse {
  words: string[];
}

export interface SuccessResponse {
  success: boolean;
}

export interface Settings {
  enabled: boolean;
  debugMode: boolean;
  semanticBlocking: boolean;
  semanticThreshold: number;
  semanticLayer: number;
}

export interface SettingsResponse {
  settings: Settings;
}

export interface StorageData {
  blockedWords?: string[];
  settings?: Settings;
}
