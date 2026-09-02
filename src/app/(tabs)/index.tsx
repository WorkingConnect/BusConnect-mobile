import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@/hooks/use-theme";
import { useThemeMode } from "@/lib/theme-mode-context";
import { useAuth } from "@/lib/auth";
import { listLocations, type Location } from "@/lib/locations";
import {
  listPopularRoutes,
  formatDuration,
  type PopularRoute,
} from "@/lib/popular-routes";
import { listActiveOperators, type OperatorSummary } from "@/lib/operators";
import { getWallet, type Wallet } from "@/lib/api";
import { NotificationBell } from "@/components/notification-bell";
import { Spacing, BottomTabInset, TabBarBaseHeight, BrandFonts } from "@/constants/theme";

const ROUTE_CARD_WIDTH = 220;
const OPERATOR_CARD_WIDTH = 128;
// Must match the tab bar's own borderTopLeftRadius/borderTopRightRadius in
// (tabs)/_layout.tsx — see the comment where this is used below.
const TAB_BAR_CORNER_RADIUS = 24;

// Date-only string in the device's local calendar day — NOT toISOString(),
// which converts to UTC first and lands on the wrong day for anyone east of
// UTC (e.g. Sri Lanka, UTC+5:30) between local midnight and the UTC rollover.
function localDateIso(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return localDateIso(new Date());
}

/** Same calendar-day basis lib/popular-routes.ts uses, so "today"/"next trip" always agree. */
function colomboTodayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

/** "tomorrow" / "in 2 days" / "Fri, 2 Aug" for a yyyy-mm-dd relative to today. */
function relativeDateLabel(dateIso: string, todayDateIso: string) {
  const days = Math.round(
    (new Date(`${dateIso}T00:00:00`).getTime() -
      new Date(`${todayDateIso}T00:00:00`).getTime()) /
      86400000,
  );
  if (days === 1) return "tomorrow";
  if (days > 1 && days <= 6) return `in ${days} days`;
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useThemeMode();
  const { session } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [from, setFrom] = useState<Location | null>(null);
  const [to, setTo] = useState<Location | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [loading, setLoading] = useState(true);
  const [popularRoutes, setPopularRoutes] = useState<PopularRoute[] | null>(
    null,
  );
  const [operators, setOperators] = useState<OperatorSummary[] | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const firstName = (
    session?.user.user_metadata?.full_name as string | undefined
  )?.split(" ")[0];

  useEffect(() => {
    void listLocations().then((data) => {
      setLocations(data);
      setFrom(data[0] ?? null);
      setTo(data[1] ?? data[0] ?? null);
      setLoading(false);
    });
    void listPopularRoutes(6).then(setPopularRoutes);
    void listActiveOperators().then(setOperators);
  }, []);

  function openOperator(op: OperatorSummary) {
    router.push({ pathname: "/operators/[id]", params: { id: op.id } });
  }

  useEffect(() => {
    if (!session) {
      setWallet(null);
      return;
    }
    void getWallet(session.access_token)
      .then(setWallet)
      .catch(() => {
        // Non-critical here — the wallet screen itself surfaces real errors.
      });
  }, [session]);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  function search() {
    if (!from || !to) return;
    router.push({
      pathname: "/search-results",
      params: { from: from.id, to: to.id, date: localDateIso(date) },
    });
  }

  function searchRoute(route: PopularRoute) {
    router.push({
      pathname: "/search-results",
      params: route.routeCardId
        ? { routeCardId: route.routeCardId, date: todayIso() }
        : { routeId: route.routeId, date: todayIso() },
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView
          edges={["top"]}
          style={[styles.hero, { backgroundColor: theme.brand }]}
        >
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                {firstName
                  ? `Hello, ${firstName}`
                  : "Every Journey, Connected."}
              </Text>
              <Text style={styles.tagline}>
                Search live seats, book securely, board with a QR ticket.
              </Text>
            </View>
            {session && <NotificationBell />}
          </View>
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator
            style={{ marginTop: Spacing.six }}
            color={theme.brand}
          />
        ) : (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.routeRow}>
              <View style={styles.dotsColumn}>
                <View style={[styles.dot, { backgroundColor: theme.brand }]} />
                <View
                  style={[styles.dotLine, { backgroundColor: theme.border }]}
                />
                <View
                  style={[
                    styles.dot,
                    styles.dotOutline,
                    { borderColor: theme.brand },
                  ]}
                />
              </View>

              <View style={styles.routeFields}>
                <Pressable
                  onPress={() => setPicking("from")}
                  style={styles.routeField}
                >
                  <Text
                    style={[styles.fieldLabel, { color: theme.textSecondary }]}
                  >
                    From
                  </Text>
                  <Text
                    style={[styles.fieldValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {from?.name_en ?? "Select"}
                  </Text>
                </Pressable>
                <View
                  style={[
                    styles.routeDivider,
                    { backgroundColor: theme.border },
                  ]}
                />
                <Pressable
                  onPress={() => setPicking("to")}
                  style={styles.routeField}
                >
                  <Text
                    style={[styles.fieldLabel, { color: theme.textSecondary }]}
                  >
                    To
                  </Text>
                  <Text
                    style={[styles.fieldValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {to?.name_en ?? "Select"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={swap}
                hitSlop={10}
                style={[
                  styles.swapButton,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons name="swap-vertical" size={18} color={theme.brand} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.dateField, { borderColor: theme.border }]}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={theme.textSecondary}
              />
              <View style={{ marginLeft: Spacing.two }}>
                <Text
                  style={[styles.fieldLabel, { color: theme.textSecondary }]}
                >
                  Date
                </Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>
                  {formatDate(date)}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={search}
              disabled={!from || !to}
              style={[
                styles.searchButton,
                {
                  backgroundColor: theme.brand,
                  opacity: !from || !to ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons name="search" size={17} color="#fff" />
              <Text style={styles.searchButtonText}>Search buses</Text>
            </Pressable>
          </View>
        )}

        {session && (
          <Pressable
            onPress={() => router.push("/wallet")}
            style={[
              styles.walletCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Image
              source={require("../../../assets/images/applogo.png")}
              style={styles.walletIcon}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Wallet balance
              </Text>
              <Text
                style={{
                  color: theme.text,
                  fontWeight: "800",
                  fontSize: 17,
                  marginTop: 2,
                }}
              >
                LKR{" "}
                {(wallet?.balance ?? 0).toLocaleString("en-LK", {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
        )}

        {popularRoutes === null ? null : popularRoutes.length > 0 ? (
          <View style={styles.popularSection}>
            <Text style={[styles.popularTitle, { color: theme.text }]}>
              Popular routes
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={ROUTE_CARD_WIDTH + Spacing.three}
              decelerationRate="fast"
              contentContainerStyle={styles.popularScrollContent}
            >
              {popularRoutes.map((r) => {
                const dur = formatDuration(r.durationMinutes);
                return (
                  <Pressable
                    key={r.routeCardId ?? r.routeId}
                    onPress={() => searchRoute(r)}
                    style={[
                      styles.routeCard,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View>
                      {r.imageUrl ? (
                        <Image
                          source={{ uri: r.imageUrl }}
                          style={styles.routeCardImage}
                        />
                      ) : (
                        <View
                          style={[
                            styles.routeCardImage,
                            styles.routeCardImageFallback,
                            { backgroundColor: theme.brand },
                          ]}
                        >
                          <Ionicons
                            name="bus"
                            size={22}
                            color="rgba(255,255,255,0.5)"
                          />
                        </View>
                      )}
                      <View style={styles.routeBadge}>
                        <Text
                          style={[
                            styles.routeBadgeTop,
                            { backgroundColor: theme.brand },
                          ]}
                        >
                          TODAY
                        </Text>
                        <View
                          style={[
                            styles.routeBadgeBottom,
                            { backgroundColor: theme.backgroundElement },
                          ]}
                        >
                          <Text
                            style={[
                              styles.routeBadgeCount,
                              { color: theme.text },
                            ]}
                          >
                            {r.todayCount}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.routeCardBody}>
                      <View style={styles.routeCardHeading}>
                        <Text
                          style={[styles.routeCardText, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          marginTop: 3,
                        }}
                      >
                        {r.todayCount > 0
                          ? `${r.todayCount} ${r.todayCount === 1 ? "trip" : "trips"} today${dur ? ` · ${dur}` : ""}`
                          : r.nextDateIso
                            ? `Next trip ${relativeDateLabel(r.nextDateIso, colomboTodayIso())}${dur ? ` · ${dur}` : ""}`
                            : "No buses scheduled yet"}
                      </Text>

                      <View
                        style={[
                          styles.routeDashedDivider,
                          { borderColor: theme.border },
                        ]}
                      />

                      <View style={styles.routeFooterRow}>
                        {r.minFare != null ? (
                          <View>
                            <Text
                              style={[
                                styles.routeFareLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              LKR
                            </Text>
                            <Text
                              style={[
                                styles.routeFareValue,
                                { color: theme.brand },
                              ]}
                            >
                              {r.minFare.toLocaleString("en-LK", {
                                maximumFractionDigits: 0,
                              })}
                            </Text>
                            <Text
                              style={[
                                styles.routeFareLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              onwards
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 11 }}
                          >
                            No buses yet
                          </Text>
                        )}
                        <View
                          style={[
                            styles.routeSearchButton,
                            { backgroundColor: theme.brand },
                          ]}
                        >
                          <Text style={styles.routeSearchButtonText}>
                            Search
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {operators === null ? null : operators.length > 0 ? (
          <View style={styles.popularSection}>
            <Text style={[styles.popularTitle, { color: theme.text }]}>
              Our operators
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={OPERATOR_CARD_WIDTH + Spacing.three}
              decelerationRate="fast"
              contentContainerStyle={styles.popularScrollContent}
            >
              {operators.map((op) => (
                <Pressable
                  key={op.id}
                  onPress={() => openOperator(op)}
                  style={[
                    styles.operatorCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {op.logoUrl ? (
                    <Image
                      source={{ uri: op.logoUrl }}
                      style={styles.operatorLogo}
                    />
                  ) : (
                    <View
                      style={[
                        styles.operatorLogo,
                        styles.operatorLogoFallback,
                        { backgroundColor: theme.brand },
                      ]}
                    >
                      <Text style={styles.operatorLogoInitial}>
                        {op.name.slice(0, 1)}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[styles.operatorName, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {op.name}
                  </Text>
                  <View style={styles.operatorRatingRow}>
                    <Ionicons name="star" size={11} color="#f59e0b" />
                    <Text
                      style={[
                        styles.operatorRatingText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {op.rating.toFixed(1)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date(todayIso())}
          onChange={(_event, selected) => {
            setShowDatePicker(false);
            if (selected) setDate(selected);
          }}
        />
      )}

      {showDatePicker && Platform.OS === "ios" && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.overlay]}
            onPress={() => setShowDatePicker(false)}
          />
          <View
            style={[
              styles.datePickerSheet,
              {
                backgroundColor: theme.backgroundElement,
                // See the matching comment on styles.sheet's override below.
                bottom:
                  TabBarBaseHeight + insets.bottom - TAB_BAR_CORNER_RADIUS,
              },
            ]}
          >
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                <Text
                  style={{
                    color: theme.brand,
                    fontWeight: "700",
                    fontSize: 15,
                  }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={date}
              mode="date"
              display="inline"
              themeVariant={resolvedScheme}
              accentColor={theme.brand}
              minimumDate={new Date(todayIso())}
              style={styles.datePickerNative}
              onChange={(_event, selected) => {
                if (selected) setDate(selected);
              }}
            />
          </View>
        </View>
      )}

      {picking && (
        <LocationPicker
          locations={locations}
          theme={theme}
          insets={insets}
          onSelect={(loc) => {
            if (picking === "from") setFrom(loc);
            else setTo(loc);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </View>
  );
}

function LocationPicker({
  locations,
  theme,
  insets,
  onSelect,
  onClose,
}: {
  locations: Location[];
  theme: ReturnType<typeof useTheme>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onSelect: (loc: Location) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = locations.filter((l) =>
    l.name_en.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={[StyleSheet.absoluteFill, styles.overlay]}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.backgroundElement,
            // The tab bar's own top corners are rounded (see _layout.tsx),
            // so sitting exactly flush against its top edge leaves small
            // dark notches where those corners curve away from this sheet's
            // square bottom corners. Tucking a few points behind the tab
            // bar (it renders on top, elevation 8) hides that without any
            // visible overlap.
            bottom: TabBarBaseHeight + insets.bottom - TAB_BAR_CORNER_RADIUS,
          },
        ]}
      >
        <View style={[styles.searchInputWrap, { borderColor: theme.border }]}>
          <Ionicons
            name="search-outline"
            size={17}
            color={theme.textSecondary}
          />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search locations…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <ScrollView>
          {filtered.map((loc) => (
            <Pressable
              key={loc.id}
              onPress={() => onSelect(loc)}
              style={styles.locationRow}
            >
              <Ionicons
                name="location-outline"
                size={16}
                color={theme.textSecondary}
              />
              <Text
                style={{
                  color: theme.text,
                  fontSize: 16,
                  marginLeft: Spacing.two,
                }}
              >
                {loc.name_en}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.six + BottomTabInset },
  hero: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six + Spacing.two,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start" },
  greeting: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    maxWidth: 240,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.one,
    maxWidth: 260,
    lineHeight: 18,
  },
  card: {
    marginHorizontal: Spacing.four,
    marginTop: -Spacing.six,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
  },
  walletIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  routeRow: { flexDirection: "row", alignItems: "stretch" },
  dotsColumn: { width: 16, alignItems: "center", paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOutline: { backgroundColor: "transparent", borderWidth: 2 },
  dotLine: { width: 2, flex: 1, marginVertical: 4 },
  routeFields: { flex: 1, marginLeft: Spacing.two },
  routeField: { paddingVertical: Spacing.two },
  routeDivider: { height: StyleSheet.hairlineWidth },
  fieldLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: { fontFamily: BrandFonts.uiSemiBold, fontSize: 16, fontWeight: "700", marginTop: 3 },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  searchButton: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.one,
  },
  searchButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
  popularSection: { marginTop: Spacing.five, gap: Spacing.two },
  popularTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  popularScrollContent: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  routeCard: {
    width: ROUTE_CARD_WIDTH,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  routeCardImage: { width: "100%", height: 110 },
  routeCardImageFallback: { alignItems: "center", justifyContent: "center" },
  routeBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  routeBadgeTop: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  routeBadgeBottom: { paddingHorizontal: 10, paddingVertical: 4 },
  routeBadgeCount: { fontFamily: BrandFonts.headingSemiBold, fontSize: 15, fontWeight: "800", textAlign: "center" },
  routeCardBody: { padding: Spacing.three },
  routeCardHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeCardText: { fontFamily: BrandFonts.headingSemiBold, fontSize: 15, fontWeight: "700", flexShrink: 1 },
  routeDashedDivider: {
    marginVertical: Spacing.three,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  routeFooterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  routeFareLabel: { fontFamily: BrandFonts.uiRegular, fontSize: 10, fontWeight: "600" },
  routeFareValue: { fontFamily: BrandFonts.headingSemiBold, fontSize: 18, fontWeight: "800", marginTop: 1 },
  routeSearchButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  routeSearchButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 13 },
  operatorCard: {
    width: OPERATOR_CARD_WIDTH,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    alignItems: "center",
  },
  operatorLogo: { width: 52, height: 52, borderRadius: 26 },
  operatorLogoFallback: { alignItems: "center", justifyContent: "center" },
  operatorLogoInitial: { fontFamily: BrandFonts.headingSemiBold, color: "#fff", fontSize: 20, fontWeight: "800" },
  operatorName: {
    fontFamily: BrandFonts.headingSemiBold,
    marginTop: Spacing.two,
    fontSize: 13,
    lineHeight: 16,
    height: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  operatorRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  operatorRatingText: { fontSize: 11, fontWeight: "600" },
  overlay: { backgroundColor: "rgba(0,0,0,0.4)" },
  datePickerSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    // The tab bar floats over the content (position: "absolute" in the tabs
    // layout, with elevation above everything else), so a sheet anchored to
    // the true screen bottom renders underneath it. Anchoring above the tab
    // bar's reserved space instead keeps the whole sheet visible.
    bottom: BottomTabInset,
    borderRadius: 20,
    paddingBottom: Spacing.three,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  datePickerNative: { alignSelf: "center", width: 300, height: 300 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    // Same reasoning as datePickerSheet — keep the sheet clear of the
    // floating tab bar instead of anchoring flush to the screen bottom.
    bottom: BottomTabInset,
    top: "20%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#8883",
  },
});
