import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Ionicons } from "@expo/vector-icons";
import { Spacing } from "@/constants/theme";

export type BannerTone = "error" | "warning" | "info";

const TONE: Record<BannerTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  error: { bg: "#fee2e2", fg: "#b91c1c", icon: "alert-circle" },
  warning: { bg: "#fef3c7", fg: "#b45309", icon: "warning" },
  info: { bg: "#dbeafe", fg: "#1d4ed8", icon: "information-circle" },
};

/** Standard inline warning/error surface — a colored card with an icon,
 *  used in place of bare colored <Text> so every screen's error/warning
 *  states look like one consistent system instead of ad-hoc red text. */
export function Banner({ tone, message }: { tone: BannerTone; message: string }) {
  const t = TONE[tone];
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Ionicons name={t.icon} size={17} color={t.fg} />
      <Text style={[styles.text, { color: t.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    borderRadius: 12,
    padding: Spacing.three,
  },
  text: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
});
