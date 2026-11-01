export const CONFIG = {
  "CARD_SELECTOR": "[data-marker=\"item\"], [data-item-id], [data-marker=\"bx-recommendations-block-item\"]",
  "LINK_SELECTOR": "a[data-marker=\"item-title\"], a[data-marker=\"title\"], a[itemprop=\"url\"]",
  "HOME_SELECTOR": "[data-marker=\"bx-recommendations-block-item\"]",
  "BADGE_TEXT": "Забронировано",
  "BADGE_TITLE": "Объявление помечено как забронированное",
  "PREFETCH_MARGIN": "1000px 0px",
  "MAX_REQUESTS": 2,
  "REQUEST_DELAY_MS": 600,
  "UPDATE_DELAY_MS": 150,
  "REQUEST_TIMEOUT_MS": 10000,
  "UNKNOWN_TTL_MS": 60000,
  "STATUS_TTL_MS": 300000
} as const;
