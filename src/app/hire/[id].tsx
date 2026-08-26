import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import {
  getHireListing,
  formatBusType,
  formatCondition,
  formatPrice,
  formatDriverIncluded,
  formatFeature,
  formatSuitableFor,
  type HireListing,
} from "@/lib/hire-listings";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_HEIGHT = (SCREEN_WIDTH * 9) / 16;
const AUTO_ADVANCE_MS = 5000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function HireListingScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [listing, setListing] = useState<HireListing | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const galleryRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    getHireListing(id)
      .then((l) => (l ? setListing(l) : setNotFound(true)))
      .catch(() => setError("Could not load this listing. Pull down to try again."));
  }, [id]);

  const imageCount = listing?.images.length ?? 0;

  function scrollToImage(idx: number) {
    setActiveImage(idx);
    galleryRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  }

  useEffect(() => {
    if (imageCount <= 1) return;
    const timer = setInterval(() => {
      setActiveImage((i) => {
        const next = (i + 1) % imageCount;
        galleryRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [imageCount]);

  const backButton = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle} numberOfLines={1}>
          {listing?.title ?? "Bus listing"}
        </Text>
        <View style={styles.backButton} />
      </View>
    </SafeAreaView>
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {backButton}
        <View style={styles.center}>
          <View style={{ width: "100%", paddingHorizontal: Spacing.four }}>
            <Banner tone="error" message={error} />
          </View>
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {backButton}
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>This listing is no longer available.</Text>
        </View>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {backButton}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  const badgeParts = [
    formatBusType(listing.bus_type) ?? listing.bus_type,
    `${listing.seat_count} seats`,
    listing.is_ac ? "A/C" : "Non-A/C",
    listing.condition ? formatCondition(listing.condition) : null,
    listing.driver_included ? formatDriverIncluded(listing.driver_included) : null,
  ].filter((p): p is string => !!p);

  const detailRows = [
    listing.bus_model ? { label: "Bus Model", value: listing.bus_model } : null,
    listing.manufacturing_year ? { label: "Manufacturing Year", value: String(listing.manufacturing_year) } : null,
    listing.min_hire_duration ? { label: "Minimum Hire Duration", value: listing.min_hire_duration } : null,
    listing.area ? { label: "Service Area", value: listing.area } : null,
  ].filter((r): r is { label: string; value: string } => !!r);

  function callPoster() {
    if (listing) Linking.openURL(`tel:${listing.contact_phone}`);
  }

  function whatsAppPoster() {
    if (listing?.contact_whatsapp) {
      Linking.openURL(`https://wa.me/${listing.contact_whatsapp.replace(/\D/g, "")}`);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {backButton}
      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.six + Spacing.six }}
        showsVerticalScrollIndicator={false}
      >
        {listing.images.length > 0 ? (
          <View>
            <ScrollView
              ref={galleryRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImage(idx);
              }}
            >
              {listing.images.map((uri, idx) => (
                <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.galleryImage} />
              ))}
            </ScrollView>

            {listing.images.length > 1 && (
              <>
                <Pressable
                  onPress={() => scrollToImage((activeImage - 1 + imageCount) % imageCount)}
                  hitSlop={8}
                  style={[styles.galleryNavButton, { left: Spacing.three }]}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => scrollToImage((activeImage + 1) % imageCount)}
                  hitSlop={8}
                  style={[styles.galleryNavButton, { right: Spacing.three }]}
                >
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </Pressable>

                <View style={styles.dotsRow}>
                  {listing.images.map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: idx === activeImage ? "#fff" : "rgba(255,255,255,0.5)",
                        },
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.imageCounter}>
                  <Text style={styles.imageCounterText}>
                    {activeImage + 1} / {listing.images.length}
                  </Text>
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.galleryImage, styles.galleryFallback, { backgroundColor: theme.brand }]}>
            <Ionicons name="bus" size={48} color="rgba(255,255,255,0.5)" />
          </View>
        )}

        <View style={styles.content}>
          <View
            style={[styles.sectionCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          >
            <View style={styles.sectionBlock}>
              <Text style={[styles.priceValue, { color: theme.brand }]}>
                {formatPrice(listing.price_amount, listing.price_type)}
              </Text>
              <Text style={[styles.title, { color: theme.text }]}>{listing.title}</Text>

              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {listing.city}, {listing.district}, {listing.province}
                </Text>
              </View>

              <View style={styles.badgeRow}>
                {badgeParts.map((part) => (
                  <View key={part} style={[styles.badge, { backgroundColor: theme.background }]}>
                    <Text style={[styles.badgeText, { color: theme.text }]}>{part}</Text>
                  </View>
                ))}
              </View>
            </View>

            {detailRows.length > 0 && (
              <View style={[styles.sectionBlock, styles.sectionDivider, { borderTopColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Details</Text>
                {detailRows.map((row, idx) => (
                  <View
                    key={row.label}
                    style={[
                      styles.detailRow,
                      idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {listing.features.length > 0 && (
              <View style={[styles.sectionBlock, styles.sectionDivider, { borderTopColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Features & Facilities</Text>
                <View style={styles.chipWrapRow}>
                  {listing.features.map((f) => (
                    <View key={f} style={[styles.chip, { backgroundColor: theme.background }]}>
                      <Text style={[styles.chipText, { color: theme.text }]}>{formatFeature(f)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {listing.suitable_for.length > 0 && (
              <View style={[styles.sectionBlock, styles.sectionDivider, { borderTopColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Suitable For</Text>
                <View style={styles.chipWrapRow}>
                  {listing.suitable_for.map((s) => (
                    <View key={s} style={[styles.chip, { backgroundColor: theme.background }]}>
                      <Text style={[styles.chipText, { color: theme.text }]}>{formatSuitableFor(s)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {listing.description && (
              <View style={[styles.sectionBlock, styles.sectionDivider, { borderTopColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Description</Text>
                <Text style={[styles.description, { color: theme.text }]}>{listing.description}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.postedDate, { color: theme.textSecondary }]}>
            Posted by {listing.contact_name} · {formatDate(listing.created_at)}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.contactBar,
          { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
        ]}
      >
        <Pressable onPress={callPoster} style={[styles.callButton, { backgroundColor: theme.brand }]}>
          <Ionicons name="call" size={17} color="#fff" />
          <Text style={styles.callButtonText}>Call</Text>
        </Pressable>
        {listing.contact_whatsapp && (
          <Pressable
            onPress={whatsAppPoster}
            style={[styles.whatsAppButton, { borderColor: "#25D366" }]}
          >
            <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
            <Text style={[styles.whatsAppButtonText, { color: "#25D366" }]}>WhatsApp</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  backButton: { width: 32 },
  heroTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  galleryImage: { width: SCREEN_WIDTH, height: GALLERY_HEIGHT },
  galleryFallback: { alignItems: "center", justifyContent: "center" },
  galleryNavButton: {
    position: "absolute",
    top: GALLERY_HEIGHT / 2 - 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  imageCounter: {
    position: "absolute",
    top: Spacing.three,
    right: Spacing.three,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  imageCounterText: { fontFamily: BrandFonts.uiSemiBold, fontSize: 12, fontWeight: "600", color: "#fff" },
  dotsRow: {
    position: "absolute",
    bottom: Spacing.two,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  content: { padding: Spacing.four, gap: Spacing.two },
  sectionCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  sectionBlock: { padding: Spacing.four },
  sectionDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  priceValue: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: Spacing.two },
  metaText: { fontFamily: BrandFonts.uiRegular, fontSize: 14 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.two },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: BrandFonts.uiMedium, fontSize: 12, fontWeight: "500" },
  sectionTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 15,
    fontWeight: "700",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  detailLabel: { fontFamily: BrandFonts.uiRegular, fontSize: 13 },
  detailValue: { fontFamily: BrandFonts.uiSemiBold, fontSize: 13, fontWeight: "600" },
  chipWrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: BrandFonts.uiMedium, fontSize: 12 },
  description: { fontSize: 14, lineHeight: 20, marginTop: Spacing.two },
  postedDate: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 12,
    marginTop: Spacing.three,
  },
  contactBar: {
    flexDirection: "row",
    gap: Spacing.three,
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  callButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  callButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  whatsAppButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
  },
  whatsAppButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    fontWeight: "700",
    fontSize: 15,
  },
});
