import type { ImageSourcePropType } from "react-native";
import type { TravelMode } from "./api";

// Metro's require() needs static, literal paths — can't build this from a
// template string per mode, so each icon is spelled out explicitly.
export const TRAVEL_MODE_ICONS: Record<TravelMode, { light: ImageSourcePropType; dark: ImageSourcePropType }> = {
  bike: {
    light: require("../../assets/images/travel-modes/bike-light.png"),
    dark: require("../../assets/images/travel-modes/bike-dark.png"),
  },
  three_wheeler: {
    light: require("../../assets/images/travel-modes/three-wheel-car-light.png"),
    dark: require("../../assets/images/travel-modes/three-wheel-car-dark.png"),
  },
  car: {
    light: require("../../assets/images/travel-modes/car-light.png"),
    dark: require("../../assets/images/travel-modes/car-dark.png"),
  },
  van: {
    light: require("../../assets/images/travel-modes/van-light.png"),
    dark: require("../../assets/images/travel-modes/van-dark.png"),
  },
};

export const TRAVEL_MODE_OPTIONS: { value: TravelMode; label: string }[] = [
  { value: "bike", label: "Bike" },
  { value: "three_wheeler", label: "Tuk tuk" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
];
