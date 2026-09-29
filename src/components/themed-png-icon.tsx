import { Image } from "expo-image";
import { useThemeMode } from "@/lib/theme-mode-context";
import { NAV_ICONS, type NavIconName } from "@/lib/nav-icons";

/** Same flat single-color PNG icon set used in the tab bar, reused inline
 *  (e.g. ticket-card meta rows) wherever a themed glyph is needed. */
export function ThemedPngIcon({
  icon,
  size = 14,
  color,
}: {
  icon: NavIconName;
  size?: number;
  color: string;
}) {
  const { resolvedScheme } = useThemeMode();
  return (
    <Image
      source={NAV_ICONS[icon][resolvedScheme]}
      tintColor={color}
      style={{ width: size, height: size }}
    />
  );
}
