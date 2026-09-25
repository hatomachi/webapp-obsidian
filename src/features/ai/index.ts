/**
 * AI Remote Feature Module for webapp-obsidian
 */

import {
  AiRemoteSettings,
  DEFAULT_AI_REMOTE_SETTINGS,
  AI_REMOTE_STORAGE_KEYS,
} from './aiRemoteTypes';

export * from './aiRemoteTypes';
export * from './obsidianAiAdapter';
export * from './useAiRemoteClient';
export * from './ErrorBoundary';
export * from './ContextAttachmentModal';
export * from './AiRemoteChatDrawer';

/**
 * Load AI Remote settings from LocalStorage or URL parameters
 */
export function loadAiRemoteSettings(): AiRemoteSettings {
  const settings: AiRemoteSettings = { ...DEFAULT_AI_REMOTE_SETTINGS };

  if (typeof window === 'undefined') {
    return settings;
  }

  try {
    const raw = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.hubUrl) settings.hubUrl = parsed.hubUrl;
        if (parsed.authToken) settings.authToken = parsed.authToken;
        if (parsed.engine) settings.engine = parsed.engine;
        if (parsed.model) settings.model = parsed.model;
        if (parsed.transportMode) settings.transportMode = parsed.transportMode;
      }
    }
  } catch (e) {
    console.error('Failed to load ai remote settings from localStorage', e);
  }

  // URL query parameter support (?ai_token=... / ?ai_hub=...)
  try {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('ai_token') || params.get('ai_key');
    const urlHub = params.get('ai_hub');
    let hasUrlUpdate = false;

    if (urlToken && urlToken.trim()) {
      settings.authToken = urlToken.trim();
      hasUrlUpdate = true;
    }
    if (urlHub && urlHub.trim()) {
      settings.hubUrl = urlHub.trim();
      hasUrlUpdate = true;
    }
    if (hasUrlUpdate) {
      saveAiRemoteSettings(settings);
    }
  } catch (e) {
    console.error('Failed to parse URL params for ai remote', e);
  }

  return settings;
}

/**
 * Save AI Remote settings to LocalStorage
 */
export function saveAiRemoteSettings(settings: AiRemoteSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save ai remote settings to localStorage', e);
  }
}
