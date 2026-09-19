import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { useThemeMode } from "@/lib/theme-mode-context";
import { BrandFonts, Spacing } from "@/constants/theme";
import { formatValidTill, type Offer, type OfferTheme } from "@/lib/offers";

// Approximate solid stand-ins for BusConnect-web's pastel gradients (light)
// and its dark-mode low-opacity tints (dark) — used only when an offer has
// no artwork, so the card still reads as "this offer" rather than blank.
const THEME_FALLBACK_LIGHT: Record<OfferTheme, string> = {
  amber: "#FDE7BC",
  yellow: "#FCE07A",
  pink: "#FCDCEA",
  blue: "#D3E6FE",
  green: "#C9F5DC",
};
const THEME_FALLBACK_DARK: Record<OfferTheme, string> = {
  amber: "#3A2E15",
  yellow: "#3A3212",
  pink: "#3A2430",
  blue: "#132A4A",
  green: "#123625",
};

/** The card's visual content only — no interaction. Used standalone inside
 *  OfferCard's bottom sheet below. Sized the same way as the home screen's
 *  route cards (fixed aspect ratio, w-full, cover crop) so it fills the box
 *  with no letterboxing whether it's in the carousel or the sheet. The
 *  artwork is meant to carry the title/offer messaging itself, so the only
 *  text drawn over it is the code — title and valid-till are shown
 *  separately by the sheet that needs them. */
export function OfferCardVisual({ offer, style }: { offer: Offer; style?: StyleProp<ViewStyle> }) {
  const { resolvedScheme } = useThemeMode();
  const hasImage = Boolean(offer.imageUrl);
  const fallbackColor = (resolvedScheme === "dark" ? THEME_FALLBACK_DARK : THEME_FALLBACK_LIGHT)[offer.theme];

  return (
    <View style={[styles.visual, style]}>
      {hasImage ? (
        <Image source={{ uri: offer.imageUrl! }} style={styles.image} />
      ) : (
        <View style={[styles.image, { backgroundColor: fallbackColor }]} />
      )}
      {hasImage && <View style={styles.scrim} />}

      <View style={styles.codeChip}>
        <Ionicons name="pricetag" size={13} color="#0f172a" />
        <Text style={styles.codeChipText}>{offer.code}</Text>
      </View>
    </View>
  );
}

/** Tapping the card opens its details in a bottom sheet in place, rather
 *  than navigating to a screen — offers are a quick "what's the code"
 *  glance, not worth leaving the current screen for. */
export function OfferCard({ offer, width }: { offer: Offer; width: number }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await Clipboard.setStringAsync(offer.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ width }}>
        <OfferCardVisual offer={offer} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>{offer.title}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
                  Valid till {formatValidTill(offer.validTill)}
                </Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <OfferCardVisual offer={offer} style={{ marginTop: Spacing.four }} />

              {offer.terms.length > 0 && (
                <View style={{ marginTop: Spacing.five }}>
                  <Text style={[styles.sheetSectionTitle, { color: theme.text }]}>Terms &amp; conditions</Text>
                  {offer.terms.map((term, i) => (
                    <View key={i} style={styles.termRow}>
                      <View style={[styles.termDot, { backgroundColor: theme.textSecondary }]} />
                      <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                        {term}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                onPress={copyCode}
                style={[styles.copyButton, { backgroundColor: theme.brand }]}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color="#fff" />
                <Text style={styles.copyButtonText}>{copied ? "Copied!" : "Copy offer code"}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  visual: { borderRadius: 24, overflow: "hidden" },
  image: { width: "100%", aspectRatio: 4 / 3 },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "45%",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  codeChip: {
    position: "absolute",
    left: Spacing.four,
    bottom: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  codeChipText: { fontFamily: BrandFonts.uiSemiBold, color: "#0f172a", fontWeight: "700", fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxHeight: "85%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.five,
  },
  sheetHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.three },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  sheetTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 19, fontWeight: "800" },
  sheetSectionTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 14, fontWeight: "700", marginBottom: Spacing.two },
  termRow: { flexDirection: "row", gap: 8, marginBottom: Spacing.two },
  termDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  copyButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 15 },
});
