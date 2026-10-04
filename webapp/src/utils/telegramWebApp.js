/**
 * Helpers alignés sur la doc officielle Mini Apps :
 * https://core.telegram.org/bots/webapps
 */

export function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** themeParams côté client : snake_case (doc) ou camelCase selon versions. */
export function getThemeParam(themeParams, snakeKey) {
  if (!themeParams || !snakeKey) return "";
  const camel = snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const v = themeParams[snakeKey] ?? themeParams[camel];
  return v && typeof v === "string" ? v : "";
}

/** Applique couleurs chrome Telegram (header / fond / barre du bas si dispo). */
export function applyTelegramChrome(tg, { headerColor, backgroundColor, bottomBarColor }) {
  if (!tg) return;
  try {
    if (backgroundColor && typeof tg.setBackgroundColor === "function") {
      tg.setBackgroundColor(backgroundColor);
    }
    if (headerColor && typeof tg.setHeaderColor === "function") {
      tg.setHeaderColor(headerColor);
    }
    if (
      bottomBarColor &&
      typeof tg.isVersionAtLeast === "function" &&
      tg.isVersionAtLeast("7.10") &&
      typeof tg.setBottomBarColor === "function"
    ) {
      tg.setBottomBarColor(bottomBarColor);
    }
  } catch {
    /* ignore */
  }
}

/** Expose les ThemeParams comme variables CSS (--tg-app-*) pour usage optionnel. */
export function syncTelegramThemeCssVars(tg) {
  const tp = tg?.themeParams;
  const root = document.documentElement;
  if (!tp) return;
  const map = [
    ["bg_color", "--tg-app-bg"],
    ["text_color", "--tg-app-text"],
    ["hint_color", "--tg-app-hint"],
    ["link_color", "--tg-app-link"],
    ["button_color", "--tg-app-button"],
    ["button_text_color", "--tg-app-button-text"],
    ["secondary_bg_color", "--tg-app-secondary-bg"],
    ["header_bg_color", "--tg-app-header-bg"],
    ["bottom_bar_bg_color", "--tg-app-bottom-bar-bg"],
  ];
  for (const [key, cssVar] of map) {
    const v = getThemeParam(tp, key);
    if (v) root.style.setProperty(cssVar, v);
  }
}
