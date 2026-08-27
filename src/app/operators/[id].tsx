import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { getOperatorProfile, type OperatorProfile } from "@/lib/operators";
import { formatDuration } from "@/lib/popular-routes";
import { Banner } from "@/components/banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spacing, BrandFonts } from "@/constants/theme";

/** Same calendar-day basis lib/popular-routes.ts uses, so "today"/"next trip" always agree. */
function colomboTodayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

/** "tomorrow" / "in 2 days" / "Fri, 2 Aug" for a yyyy-mm-dd relative to today. */
function relativeDateLabel(dateIso: string, todayDateIso: string) {
  const days = Math.round(
    (new Date(`${dateIso}T00:00:00`).getTime() - new Date(`${todayDateIso}T00:00:00`).getTime()) / 86400000,
  );
  if (days === 1) return "tomorrow";
  if (days > 1 && days <= 6) return `in ${days} days`;
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function OperatorProfileScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getOperatorProfile(id)
      .then((p) => (p ? setProfile(p) : setNotFound(true)))
      .catch(() => setError("Could not load this operator. Pull down to try again."));
  }, [id]);

  function openRoute(route: OperatorProfile["routes"][number]) {
    router.push({
      pathname: "/search-results",
      params: {
        ...(route.routeCardId ? { routeCardId: route.routeCardId } : { routeId: route.routeId }),
        date: colomboTodayIso(),
        operator: id,
      },
    });
  }

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      </View>
      {profile?.logoUrl ? (
        <Image source={{ uri: profile.logoUrl }} style={styles.heroLogo} />
      ) : (
        <View style={[styles.heroLogo, styles.heroLogoFallback]}>
          <Text style={styles.heroLogoInitial}>{(profile?.name ?? "?").slice(0, 1)}</Text>
        </View>
      )}
      <Text style={styles.heroTitle}>{profile?.name ?? "Operator"}</Text>
      {profile && (
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Verified Operator</Text>
            <Image
              source={require("../../../assets/images/verified-badge.png")}
              style={styles.verifiedBadgeIcon}
            />
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="star" size={11} color="#fde68a" />
            <Text style={styles.heroBadgeText}>{profile.rating.toFixed(1)}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
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
        {hero}
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>Operator not found.</Text>
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <ScrollView contentContainerStyle={{ padding: Spacing.three, paddingBottom: Spacing.six }}>
          <View style={styles.section}>
            <Skeleton style={{ width: 160, height: 16, alignSelf: "center" }} />
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[styles.routeCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <View style={styles.routeCardTopRow}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton style={{ width: "70%", height: 14 }} />
                    <Skeleton style={{ width: "50%", height: 11 }} />
                    <Skeleton style={{ width: "60%", height: 11 }} />
                  </View>
                  <Skeleton style={styles.routeThumb} />
                </View>
                <View style={[styles.routeFooterRow, { borderTopColor: theme.border }]}>
                  <Skeleton style={{ width: 70, height: 15 }} />
                  <Skeleton style={{ width: 90, height: 28, borderRadius: 10 }} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  const today = colomboTodayIso();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView contentContainerStyle={{ padding: Spacing.three, paddingBottom: Spacing.six }}>
        {/* Routes — coverage stats, amenities, and bus classes stay web-only */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Routes and Schedules</Text>
          {profile.routes.length === 0 ? (
            <Text style={{ color: theme.textSecondary, marginTop: Spacing.two }}>No routes assigned yet.</Text>
          ) : (
            profile.routes.map((r) => {
              const dur = formatDuration(r.durationMinutes);
              return (
                <Pressable
                  key={r.routeCardId ?? r.routeId}
                  onPress={() => openRoute(r)}
                  style={[styles.routeCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                >
                  <View style={styles.routeCardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.routeName, { color: theme.text }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 12, marginTop: 3 }}>
                        {r.departureTime && r.arrivalTime
                          ? `${r.departureTime} - ${r.arrivalTime}`
                          : r.departureTime || "No trips scheduled"}
                      </Text>
                      <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {r.todayCount > 0
                          ? `${r.todayCount} ${r.todayCount === 1 ? "trip" : "trips"} today${dur ? ` · ${dur}` : ""}`
                          : r.nextDateIso
                            ? `Next trip ${relativeDateLabel(r.nextDateIso, today)}${dur ? ` · ${dur}` : ""}`
                            : ""}
                      </Text>
                    </View>
                    {r.imageUrl ? (
                      <Image source={{ uri: r.imageUrl }} style={styles.routeThumb} />
                    ) : (
                      <View style={[styles.routeThumb, styles.routeThumbFallback, { backgroundColor: theme.brand }]}>
                        <Ionicons name="bus" size={18} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                  </View>

                  <View style={[styles.routeFooterRow, { borderTopColor: theme.border }]}>
                    {r.minFare != null ? (
                      <Text style={[styles.routeFare, { color: theme.brand }]}>
                        LKR {r.minFare.toLocaleString("en-LK", { maximumFractionDigits: 0 })}
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 12 }}>
                        No buses yet
                      </Text>
                    )}
                    <View style={[styles.routeSearchButton, { backgroundColor: theme.brand }]}>
                      <Text style={styles.routeSearchButtonText}>Search buses</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: 0,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", width: "100%", marginBottom: Spacing.one },
  backButton: {},
  heroLogo: { width: 56, height: 56, borderRadius: 28, marginTop: Spacing.one },
  heroLogoFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  heroLogoInitial: { fontFamily: BrandFonts.headingSemiBold, color: "#fff", fontSize: 22, fontWeight: "800" },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    textAlign: "center",
    marginTop: Spacing.two,
  },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: Spacing.three },
  heroBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  heroBadgeText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontSize: 12, fontWeight: "600" },
  verifiedBadgeIcon: { width: 14, height: 14, borderRadius: 2 },
  section: { marginTop: Spacing.five },
  sectionTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 16, fontWeight: "800", textAlign: "center" },
  routeCard: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, marginTop: Spacing.three },
  routeCardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  routeThumb: { width: 56, height: 56, borderRadius: 10 },
  routeThumbFallback: { alignItems: "center", justifyContent: "center" },
  routeName: { fontFamily: BrandFonts.headingSemiBold, fontSize: 15, fontWeight: "700" },
  routeFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  routeFare: { fontFamily: BrandFonts.headingSemiBold, fontSize: 17, fontWeight: "800" },
  routeSearchButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  routeSearchButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 13 },
});
