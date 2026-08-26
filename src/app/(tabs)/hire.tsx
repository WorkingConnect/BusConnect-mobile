import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { listHireListings, formatBusType, formatPrice, type HireListing } from "@/lib/hire-listings";
import { Spacing, BottomTabInset, BrandFonts } from "@/constants/theme";

function goToPost() {
  router.push("/hire/post");
}
function goToMyAds() {
  router.push("/hire/my-ads");
}

export default function HireScreen() {
  const theme = useTheme();
  const [listings, setListings] = useState<HireListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listHireListings()
      .then(setListings)
      .catch(() => setError("Could not load listings. Pull down to try again."));
  }, []);

  // useFocusEffect already fires on initial mount (first focus), so this
  // also covers the load-on-mount case without a separate effect.
  useFocusEffect(load);

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Hire a Bus</Text>
          <Text style={styles.heroSubtitle}>Browse busses for trips and tours</Text>
        </View>
        <Pressable onPress={goToMyAds} hitSlop={8} style={styles.myAdsButton}>
          <Ionicons name="reader-outline" size={16} color="#fff" />
          <Text style={styles.myAdsButtonText}>My Ads</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}

      {error ? (
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary, textAlign: "center", paddingHorizontal: Spacing.four }}>
            {error}
          </Text>
        </View>
      ) : listings === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.textSecondary }}>No listings yet.</Text>
            </View>
          }
          renderItem={({ item }) => <ListingCard listing={item} theme={theme} />}
        />
      )}

      <Pressable
        onPress={goToPost}
        style={[styles.postButton, { backgroundColor: theme.brand }]}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.postButtonText}>Post an ad</Text>
      </Pressable>
    </View>
  );
}

function ListingCard({
  listing,
  theme,
}: {
  listing: HireListing;
  theme: ReturnType<typeof useTheme>;
}) {
  const thumb = listing.images[0];
  const metaParts: string[] = [
    formatBusType(listing.bus_type) ?? listing.bus_type,
    `${listing.seat_count} seats`,
    listing.is_ac ? "A/C" : "Non-A/C",
  ];

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/hire/[id]", params: { id: listing.id } })}
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.brand }]}>
          <Ionicons name="bus" size={24} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
          {listing.title}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
            {listing.city}, {listing.district}
          </Text>
        </View>
        <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
          {metaParts.join(" · ")}
        </Text>
        <Text style={[styles.priceText, { color: theme.brand }]} numberOfLines={1}>
          {formatPrice(listing.price_amount, listing.price_type)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
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
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  myAdsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  myAdsButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  listContent: {
    flexGrow: 1,
    padding: Spacing.four,
    paddingBottom: Spacing.six + BottomTabInset,
    gap: Spacing.three,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 15,
    fontWeight: "700",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: BrandFonts.uiRegular, fontSize: 12 },
  priceText: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  postButton: {
    position: "absolute",
    right: Spacing.four,
    bottom: BottomTabInset - Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  postButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
