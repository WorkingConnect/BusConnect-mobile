import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { listMyHireListings, formatBusType, formatPrice, type HireListing } from "@/lib/hire-listings";
import { archiveHireListing, deleteHireListing, ApiError } from "@/lib/api";
import { Spacing, BottomTabInset, BrandFonts } from "@/constants/theme";

export default function MyHireAdsScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<HireListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    listMyHireListings(session.user.id)
      .then(setListings)
      .catch(() => setError("Could not load your ads. Pull down to try again."));
  }, [session]);

  // useFocusEffect already fires on initial mount (first focus) and again
  // whenever this screen regains focus — e.g. coming back from post.tsx
  // after an edit — so a single hook covers load-on-mount and refresh.
  useFocusEffect(load);

  // No account → straight to sign-in, same idiom as tickets.tsx.
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace({ pathname: "/login", params: { next: "/hire/my-ads" } });
    }
  }, [authLoading, session]);

  async function toggleArchived(listing: HireListing) {
    if (!session || busyId) return;
    setBusyId(listing.id);
    try {
      await archiveHireListing(session.access_token, listing.id, !listing.is_archived);
      load();
    } catch (e) {
      Alert.alert(
        "Could not update this ad",
        e instanceof ApiError ? e.message : "Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(listing: HireListing) {
    Alert.alert("Delete this ad?", "This can't be undone — it will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteListing(listing),
      },
    ]);
  }

  async function deleteListing(listing: HireListing) {
    if (!session) return;
    setBusyId(listing.id);
    try {
      await deleteHireListing(session.access_token, listing.id);
      load();
    } catch (e) {
      Alert.alert(
        "Could not delete this ad",
        e instanceof ApiError ? e.message : "Please try again.",
      );
      setBusyId(null);
    }
  }

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>My Ads</Text>
        <View style={styles.backButton} />
      </View>
    </SafeAreaView>
  );

  if (authLoading || !session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary, textAlign: "center", paddingHorizontal: Spacing.four }}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  if (listings === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={[styles.center, { gap: Spacing.three }]}>
          <Text style={{ color: theme.textSecondary }}>You haven&apos;t posted any listings yet.</Text>
          <Pressable
            onPress={() => router.push("/hire/post")}
            style={[styles.primaryButton, { backgroundColor: theme.brand }]}
          >
            <Text style={styles.primaryButtonText}>Post an ad</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <AdRow
            listing={item}
            theme={theme}
            busy={busyId === item.id}
            onToggleArchived={() => toggleArchived(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
      />
    </View>
  );
}

function ReviewBadge({ listing, theme }: { listing: HireListing; theme: ReturnType<typeof useTheme> }) {
  if (listing.moderation_status === "pending") {
    return (
      <View style={[styles.badge, { backgroundColor: "#fef3c7" }]}>
        <Text style={[styles.badgeText, { color: "#92400e" }]}>Pending review</Text>
      </View>
    );
  }
  if (listing.moderation_status === "rejected") {
    return (
      <View style={[styles.badge, { backgroundColor: "#fee2e2" }]}>
        <Text style={[styles.badgeText, { color: "#b91c1c" }]}>Not approved</Text>
      </View>
    );
  }
  if (listing.is_archived) {
    return (
      <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
        <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Archived</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: "#dcfce7" }]}>
      <Text style={[styles.badgeText, { color: "#15803d" }]}>Live</Text>
    </View>
  );
}

function AdRow({
  listing,
  theme,
  busy,
  onToggleArchived,
  onDelete,
}: {
  listing: HireListing;
  theme: ReturnType<typeof useTheme>;
  busy: boolean;
  onToggleArchived: () => void;
  onDelete: () => void;
}) {
  const thumb = listing.images[0];
  const metaParts = [
    formatBusType(listing.bus_type) ?? listing.bus_type,
    `${listing.seat_count} seats`,
    listing.is_ac ? "A/C" : "Non-A/C",
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.brand }]}>
            <Ionicons name="bus" size={22} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {listing.title}
            </Text>
            <ReviewBadge listing={listing} theme={theme} />
          </View>
          <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
            {metaParts.join(" · ")}
          </Text>
          <Text style={[styles.priceText, { color: theme.brand }]} numberOfLines={1}>
            {formatPrice(listing.price_amount, listing.price_type)}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => router.push({ pathname: "/hire/post", params: { id: listing.id } })}
          disabled={busy}
          style={[styles.actionButton, { borderColor: theme.border }]}
        >
          <Ionicons name="create-outline" size={16} color={theme.text} />
          <Text style={[styles.actionText, { color: theme.text }]}>Edit</Text>
        </Pressable>

        <Pressable
          onPress={onToggleArchived}
          disabled={busy}
          style={[styles.actionButton, { borderColor: theme.border, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <>
              <Ionicons
                name={listing.is_archived ? "arrow-undo-outline" : "archive-outline"}
                size={16}
                color={theme.text}
              />
              <Text style={[styles.actionText, { color: theme.text }]}>
                {listing.is_archived ? "Unarchive" : "Archive"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={onDelete}
          disabled={busy}
          style={[styles.actionButton, { borderColor: "#fecaca", opacity: busy ? 0.6 : 1 }]}
        >
          <Ionicons name="trash-outline" size={16} color="#dc2626" />
          <Text style={[styles.actionText, { color: "#dc2626" }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    alignItems: "center",
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
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  listContent: {
    flexGrow: 1,
    padding: Spacing.four,
    paddingBottom: Spacing.six + BottomTabInset,
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTop: { flexDirection: "row", gap: Spacing.three },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, justifyContent: "center", gap: 3 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  cardTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  metaText: { fontFamily: BrandFonts.uiRegular, fontSize: 12 },
  priceText: { fontFamily: BrandFonts.headingSemiBold, fontSize: 13, fontWeight: "800" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: BrandFonts.uiSemiBold, fontSize: 11, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: Spacing.two },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: { fontFamily: BrandFonts.uiMedium, fontSize: 12, fontWeight: "500" },
  primaryButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" },
  primaryButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 14 },
});
