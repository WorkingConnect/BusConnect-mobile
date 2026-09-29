import type { ImageSourcePropType } from "react-native";

// Metro's require() needs static, literal paths — can't build this from a
// template string per icon, so each is spelled out explicitly. Mirrors
// BusConnect-web's nav icon set (search / ticket / bus).
export const NAV_ICONS = {
  search: {
    light: require("../../assets/images/nav/search-light.png"),
    dark: require("../../assets/images/nav/search-dark.png"),
  },
  ticket: {
    light: require("../../assets/images/nav/ticket-light.png"),
    dark: require("../../assets/images/nav/ticket-dark.png"),
  },
  bus: {
    light: require("../../assets/images/nav/bus-icon-light.png"),
    dark: require("../../assets/images/nav/bus-icon-dark.png"),
  },
  date: {
    light: require("../../assets/images/nav/date-light.png"),
    dark: require("../../assets/images/nav/date-dark.png"),
  },
  liveTracking: {
    light: require("../../assets/images/nav/live-tracking-light.png"),
    dark: require("../../assets/images/nav/live-tracking-dark.png"),
  },
} satisfies Record<string, { light: ImageSourcePropType; dark: ImageSourcePropType }>;

export type NavIconName = keyof typeof NAV_ICONS;
