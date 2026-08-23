import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useThemeMode } from "@/lib/theme-mode-context";
import { searchTrips, searchTripsByRoute, ApiError, type TripSearchResult } from "@/lib/api";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-LK", { weekday: "short", day: "numeric", month: "short" });
}

function duration(depart: string, arrive: string) {
  const mins = Math.round((new Date(arrive).getTime() - new Date(depart).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m ? ` ${m}m` : ""}`;
}

export default function SearchResultsScreen() {
  const theme = useTheme();
  const { resolvedScheme } = useThemeMode();
  const { from, to, routeCardId, routeId, date, operator } = useLocalSearchParams<{
    from?: string;
    to?: string;
    routeCardId?: string;
    routeId?: string;
    date: string;
    /** Pre-selects the operator filter — set when arriving from an
     *  operator's own "routes we run" list, so results start scoped to
     *  that operator. */
    operator?: string;
  }>();
  const requestKey = `${from}-${to}-${routeCardId}-${routeId}-${date}`;
  // Keyed by the request that produced it — lets "loading" fall naturally
  // out of a key mismatch instead of an imperative reset in the effect body
  // (a synchronous setState there would double-render on every param change).
  const [resultsState, setResultsState] = useState<{ key: string; data: TripSearchResult[] } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBusTypeSheet, setShowBusTypeSheet] = useState(false);
  const [showOperatorSheet, setShowOperatorSheet] = useState(false);
  const [busTypeFilter, setBusTypeFilter] = useState<string | null>(null);
  const [operatorFilter, setOperatorFilter] = useState<string | null>(operator ?? null);

  useEffect(() => {
    if (!date || !((from && to) || routeCardId || routeId)) return;
    const request =
      from && to ? searchTrips({ from, to, date }) : searchTripsByRoute({ routeCardId, routeId, date });
    request
      .then((data) => setResultsState({ key: requestKey, data }))
      .catch((e) =>
        setErrorState({
          key: requestKey,
          message: e instanceof ApiError ? e.message : "Could not load trips. Pull down to try again.",
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from from/to/routeCardId/routeId/date
  }, [from, to, routeCardId, routeId, date]);

  const results = resultsState?.key === requestKey ? resultsState.data : null;
  const error = errorState?.key === requestKey ? errorState.message : null;

  const busTypes = useMemo(
    () => Array.from(new Set((results ?? []).map((r) => r.bus_type_class))).sort(),
    [results],
  );
  const operators = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of results ?? []) byId.set(r.operator_id, r.operator_name);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [results]);
  const filteredResults = useMemo(
    () =>
      results
        ? results.filter(
            (r) =>
              (!busTypeFilter || r.bus_type_class === busTypeFilter) &&
              (!operatorFilter || r.operator_id === operatorFilter),
          )
        : null,
    [results, busTypeFilter, operatorFilter],
  );

  // Reset a filter that no longer matches any result for this search (new
  // date/route swapped underneath it) rather than silently showing nothing.
  useEffect(() => {
    if (busTypeFilter && !busTypes.includes(busTypeFilter)) setBusTypeFilter(null);
  }, [busTypes, busTypeFilter]);
  useEffect(() => {
    if (operatorFilter && !operators.some(([id]) => id === operatorFilter)) setOperatorFilter(null);
  }, [operators, operatorFilter]);

  const pickerValue = useMemo(() => (date ? new Date(`${date}T00:00:00`) : new Date()), [date]);

  function onDateChange(next: Date) {
    router.setParams({ date: localDateIso(next) });
  }

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Search results</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={styles.chipRow}>
        {date && (
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateChip} hitSlop={8}>
            <Ionicons name="calendar-outline" size={14} color="#fff" />
            <Text style={styles.heroSubtitle}>{formatDate(date)}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
        {busTypes.length > 0 && (
          <Pressable onPress={() => setShowBusTypeSheet(true)} style={styles.dateChip} hitSlop={8}>
            <Ionicons name="bus-outline" size={14} color="#fff" />
            <Text style={styles.heroSubtitle}>
              {busTypeFilter ? busTypeFilter.replace("_", " ") : "Bus type"}
            </Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
        {operators.length > 0 && (
          <Pressable onPress={() => setShowOperatorSheet(true)} style={styles.dateChip} hitSlop={8}>
            <Ionicons name="business-outline" size={14} color="#fff" />
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              {operatorFilter ? (operators.find(([id]) => id === operatorFilter)?.[1] ?? "Operator") : "Operator"}
            </Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );

  const datePickerOverlay = (
    <>
      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          minimumDate={new Date(todayIso())}
          onChange={(_event, selected) => {
            setShowDatePicker(false);
            if (selected) onDateChange(selected);
          }}
        />
      )}

      {showDatePicker && Platform.OS === "ios" && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setShowDatePicker(false)} />
          <View style={[styles.datePickerSheet, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.datePickerHeader}>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.brand, fontWeight: "700", fontSize: 15 }}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="inline"
              themeVariant={resolvedScheme}
              accentColor={theme.brand}
              minimumDate={new Date(todayIso())}
              style={styles.datePickerNative}
              onChange={(_event, selected) => {
                if (selected) onDateChange(selected);
              }}
            />
          </View>
        </View>
      )}
    </>
  );

  const busTypeSheet = showBusTypeSheet && (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={[StyleSheet.absoluteFill, styles.overlay]}
        onPress={() => setShowBusTypeSheet(false)}
      />
      <View style={[styles.datePickerSheet, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.datePickerHeader, { justifyContent: "space-between" }]}>
          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "700", fontSize: 15 }}>Bus type</Text>
          <Pressable onPress={() => setShowBusTypeSheet(false)} hitSlop={8}>
            <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.brand, fontWeight: "700", fontSize: 15 }}>Done</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.busTypeOption}
          onPress={() => {
            setBusTypeFilter(null);
            setShowBusTypeSheet(false);
          }}
        >
          <Text style={{ color: theme.text, fontSize: 15 }}>All bus types</Text>
          {!busTypeFilter && <Ionicons name="checkmark" size={18} color={theme.brand} />}
        </Pressable>
        {busTypes.map((type) => (
          <Pressable
            key={type}
            style={styles.busTypeOption}
            onPress={() => {
              setBusTypeFilter(type);
              setShowBusTypeSheet(false);
            }}
          >
            <Text style={{ color: theme.text, fontSize: 15, textTransform: "capitalize" }}>
              {type.replace("_", " ")}
            </Text>
            {busTypeFilter === type && <Ionicons name="checkmark" size={18} color={theme.brand} />}
          </Pressable>
        ))}
      </View>
    </View>
  );

  const operatorSheet = showOperatorSheet && (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={[StyleSheet.absoluteFill, styles.overlay]}
        onPress={() => setShowOperatorSheet(false)}
      />
      <View style={[styles.datePickerSheet, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.datePickerHeader, { justifyContent: "space-between" }]}>
          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "700", fontSize: 15 }}>Operator</Text>
          <Pressable onPress={() => setShowOperatorSheet(false)} hitSlop={8}>
            <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.brand, fontWeight: "700", fontSize: 15 }}>Done</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.busTypeOption}
          onPress={() => {
            setOperatorFilter(null);
            setShowOperatorSheet(false);
          }}
        >
          <Text style={{ color: theme.text, fontSize: 15 }}>All operators</Text>
          {!operatorFilter && <Ionicons name="checkmark" size={18} color={theme.brand} />}
        </Pressable>
        {operators.map(([id, name]) => (
          <Pressable
            key={id}
            style={styles.busTypeOption}
            onPress={() => {
              setOperatorFilter(id);
              setShowOperatorSheet(false);
            }}
          >
            <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
              {name}
            </Text>
            {operatorFilter === id && <Ionicons name="checkmark" size={18} color={theme.brand} />}
          </Pressable>
        ))}
      </View>
    </View>
  );

  let content: ReactNode;
  if (error) {
    content = (
      <View style={styles.center}>
        <View style={{ width: "100%" }}>
          <Banner tone="error" message={error} />
        </View>
      </View>
    );
  } else if (!results) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  } else if (results.length === 0) {
    content = (
      <View style={styles.center}>
        <Text style={{ color: theme.textSecondary, textAlign: "center" }}>
          No buses found for this route and date.{"\n"}Try another date above.
        </Text>
      </View>
    );
  } else if ((filteredResults ?? []).length === 0) {
    const operatorName = operatorFilter ? operators.find(([id]) => id === operatorFilter)?.[1] : null;
    content = (
      <View style={styles.center}>
        <Text style={{ color: theme.textSecondary, textAlign: "center" }}>
          No{busTypeFilter ? ` ${busTypeFilter.replace("_", " ")}` : ""} buses
          {operatorName ? ` from ${operatorName}` : ""} for this route and date.
        </Text>
        <Pressable
          onPress={() => {
            setBusTypeFilter(null);
            setOperatorFilter(null);
          }}
          style={{ marginTop: Spacing.two }}
        >
          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.brand, fontWeight: "700" }}>Clear filters</Text>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}
        data={filteredResults}
        keyExtractor={(item) => `${item.trip_id}-${item.from_stop_id}-${item.to_stop_id}`}
        renderItem={({ item }) => <TripCard trip={item} theme={theme} />}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      {content}
      {datePickerOverlay}
      {busTypeSheet}
      {operatorSheet}
    </View>
  );
}

function TripCard({ trip, theme }: { trip: TripSearchResult; theme: ReturnType<typeof useTheme> }) {
  const dur = duration(trip.boarding_at, trip.drop_at);
  const overnight = new Date(trip.drop_at).toDateString() !== new Date(trip.boarding_at).toDateString();
  const amenities = trip.bus_amenities.slice(0, 4);
  const image = trip.bus_images[0];

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/trips/[id]",
          params: { id: trip.trip_id, from: trip.from_stop_id, to: trip.to_stop_id },
        })
      }
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      <View style={styles.thumbWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            {trip.operator_logo_url ? (
              <Image source={{ uri: trip.operator_logo_url }} style={styles.thumbLogo} />
            ) : (
              <Text style={styles.thumbInitial}>{trip.operator_name.slice(0, 1)}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.badgeRow}>
          <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.brand, fontSize: 11, fontWeight: "700" }}>
              {trip.bus_type_class.replace("_", " ")}
            </Text>
          </View>
          <View style={styles.operatorRow}>
            <Ionicons name="bus-outline" size={13} color={theme.textSecondary} />
            <Text
              style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}
              numberOfLines={1}
            >
              {trip.operator_name} · {trip.bus_reg_no}
            </Text>
          </View>
        </View>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={11} color="#f59e0b" />
          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.textSecondary, fontSize: 11, fontWeight: "600" }}>
            {trip.operator_rating.toFixed(1)} · {trip.operator_reliability_score.toFixed(0)}%
          </Text>
        </View>

        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.time, { color: theme.text }]}>{formatTime(trip.boarding_at)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {trip.from_location_name}
            </Text>
          </View>
          <View style={styles.durationCol}>
            <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.textSecondary, fontSize: 11, fontWeight: "600" }}>{dur}</Text>
            <View style={styles.durationLine}>
              <View style={[styles.durationDash, { backgroundColor: theme.border }]} />
              <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
              <View style={[styles.durationDash, { backgroundColor: theme.border }]} />
            </View>
            {overnight && (
              <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: "#b45309", fontSize: 10, fontWeight: "700", marginTop: 2 }}>
                Arrives next day
              </Text>
            )}
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.time, { color: theme.text }]}>{formatTime(trip.drop_at)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {trip.to_location_name}
            </Text>
          </View>
        </View>

        {amenities.length > 0 && (
          <View style={styles.amenitiesRow}>
            {amenities.map((a) => (
              <View key={a} style={[styles.amenityChip, { backgroundColor: theme.backgroundSelected }]}>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{a}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.footerRow, { borderTopColor: theme.border }]}>
          <View>
            <Text
              style={{
                fontFamily: BrandFonts.uiSemiBold,
                color: theme.textSecondary,
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              LKR
            </Text>
            <Text style={[styles.fare, { color: theme.brand }]}>{trip.fare.toLocaleString("en-LK")}</Text>
          </View>
          <View style={[styles.selectButton, { backgroundColor: theme.brand }]}>
            <Text style={styles.selectButtonText}>Select seats</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 22 },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroSubtitle: { fontFamily: BrandFonts.uiSemiBold, fontSize: 13, color: "#fff", fontWeight: "600" },
  overlay: { backgroundColor: "rgba(0,0,0,0.4)" },
  datePickerSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.six,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  datePickerNative: { alignSelf: "center", width: 300, height: 300 },
  busTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  thumbWrap: { width: "100%", height: 120 },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#004AAD" },
  thumbLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#fff" },
  thumbInitial: { fontFamily: BrandFonts.headingSemiBold, color: "#fff", fontSize: 26, fontWeight: "800" },
  cardBody: { padding: Spacing.three },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: Spacing.two },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  operatorRow: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  timeRow: { flexDirection: "row", alignItems: "center", marginTop: Spacing.three, gap: Spacing.two },
  time: { fontFamily: BrandFonts.headingSemiBold, fontSize: 19, fontWeight: "800" },
  durationCol: { alignItems: "center" },
  durationLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, width: 64 },
  durationDash: { height: 1, flex: 1 },
  amenitiesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.three },
  amenityChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fare: { fontFamily: BrandFonts.headingSemiBold, fontSize: 20, fontWeight: "800" },
  selectButton: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  selectButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 13 },
});
