import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  getTrip,
  getSeatmap,
  getTripCrew,
  createHold,
  createBooking,
  ApiError,
  type TripDetail,
  type SeatMap,
  type SeatState,
  type TripCrew,
  type CrewMember,
} from "@/lib/api";
import { layoutToGrid } from "@/lib/seat-layout";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

function formatTripTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
}

const SEAT_COLOR = {
  selected: "#059669",
  male: "#2563eb",
  female: "#ec4899",
  pending: "#eab308",
  blocked: "#6b7280",
};

export default function TripDetailScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { id, from, to } = useLocalSearchParams<{ id: string; from: string; to: string }>();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [seatmap, setSeatmap] = useState<SeatMap | null>(null);
  const [crew, setCrew] = useState<TripCrew | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [genders, setGenders] = useState<Map<string, "male" | "female">>(new Map());
  const [genderPromptSeat, setGenderPromptSeat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopPickerMode, setStopPickerMode] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getTrip(id), getSeatmap(id)])
      .then(([t, s]) => {
        setTrip(t);
        setSeatmap(s);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this trip."));
    getTripCrew(id)
      .then(setCrew)
      .catch(() => void 0);
  }, [id]);

  // Live seat updates via Supabase Realtime, same pattern as the web app.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`seat_holds:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seat_holds", filter: `trip_id=eq.${id}` },
        () => {
          void getSeatmap(id).then(setSeatmap);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  const seatStates = useMemo(() => {
    const map = new Map<string, SeatState>();
    for (const s of seatmap?.seats ?? []) map.set(s.seat_no, s);
    return map;
  }, [seatmap]);

  const grid = useMemo(
    () => layoutToGrid(seatmap?.layout ?? trip?.bus.bus_type.layout_json ?? null, trip?.bus.bus_type.seat_count ?? 40),
    [seatmap, trip],
  );

  const fare = trip?.fares.find((f) => f.from_stop_id === from && f.to_stop_id === to)?.fare ?? trip?.base_fare ?? 0;
  const total = selected.size * fare;

  const stops = useMemo(() => [...(trip?.stops ?? [])].sort((a, b) => a.seq - b.seq), [trip]);
  // Fall back to the route's full endpoints when opened directly with no
  // ?from=&to= (e.g. a shared/bookmarked link), same as the web app.
  const fromStopId = (from && stops.some((s) => s.route_stop_id === from) ? from : stops[0]?.route_stop_id) ?? "";
  const toStopId =
    (to && stops.some((s) => s.route_stop_id === to) ? to : stops[stops.length - 1]?.route_stop_id) ?? "";
  const boardStop = stops.find((s) => s.route_stop_id === fromStopId);
  const dropStop = stops.find((s) => s.route_stop_id === toStopId);
  const boardableStops = stops.filter((s) => s.can_board);
  const droppableStops = stops.filter((s) => s.can_drop);

  // Updates the actual from/to route params (not just local state) so every
  // other read of from/to — fare lookup, handleContinue, shareTrip — stays
  // in sync with whatever the passenger picks here.
  function pickStop(routeStopId: string) {
    if (stopPickerMode === "from") router.setParams({ from: routeStopId, to: toStopId });
    else if (stopPickerMode === "to") router.setParams({ from: fromStopId, to: routeStopId });
    setStopPickerMode(null);
  }

  function seatKind(label: string): "available" | "selected" | "male" | "female" | "pending" | "blocked" {
    if (selected.has(label)) return "selected";
    const state = seatStates.get(label);
    if (!state) return "available";
    if (state.status === "blocked") return "blocked";
    if (state.status === "held") return "pending";
    return state.gender === "female" ? "female" : "male";
  }

  function tapSeat(label: string) {
    if (seatStates.has(label)) return;
    if (selected.has(label)) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
      setGenders((prev) => {
        const next = new Map(prev);
        next.delete(label);
        return next;
      });
      return;
    }
    setGenderPromptSeat(label);
  }

  function pickGender(gender: "male" | "female") {
    if (!genderPromptSeat) return;
    setSelected((prev) => new Set(prev).add(genderPromptSeat));
    setGenders((prev) => new Map(prev).set(genderPromptSeat, gender));
    setGenderPromptSeat(null);
  }

  async function handleContinue() {
    if (selected.size === 0 || !id || !from || !to) return;
    if (!session) {
      router.push({ pathname: "/login", params: { next: `/trips/${id}?from=${from}&to=${to}` } });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const hold = await createHold(session.access_token, {
        tripId: id,
        seats: [...selected].map((seatNo) => ({ seatNo, gender: genders.get(seatNo) })),
      });
      const booking = await createBooking(session.access_token, {
        holdGroup: hold.hold_group,
        fromStopId: from,
        toStopId: to,
      });
      router.push({ pathname: "/checkout/[id]", params: { id: booking.booking_id } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.message.includes("Booking has been closed")) {
        setError(e.message);
        setSelected(new Set());
        setGenders(new Map());
      } else if (e instanceof ApiError && e.status === 409) {
        setError("Some of those seats were just taken. Please pick again.");
        setSelected(new Set());
        setGenders(new Map());
        if (id) void getSeatmap(id).then(setSeatmap);
      } else {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function shareTrip() {
    if (!id) return;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    const url = `https://busconnect.lk/en/trips/${id}${query ? `?${query}` : ""}`;
    const operatorName = trip?.bus.operator?.name ?? "this trip";
    void Share.share({
      message: `${operatorName} on BusConnect: ${url}`,
      url,
    });
  }

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Pressable onPress={shareTrip} hitSlop={8} style={styles.backButton}>
          <Ionicons name="share-outline" size={20} color="#fff" />
        </Pressable>
      </View>
      <Text style={styles.heroTitle}>{trip?.bus.operator?.name ?? "Trip details"}</Text>
      {trip && (
        <>
          <Text style={styles.heroSubtitle}>
            {trip.bus.bus_type.name}
            {trip.bus.bus_type.name.includes(trip.bus.reg_no) ? "" : ` · ${trip.bus.reg_no}`}
          </Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{trip.bus.bus_type.class.replace("_", " ")}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="star" size={11} color="#fde68a" />
              <Text style={styles.heroBadgeText}>{(trip.bus.operator?.rating ?? 0).toFixed(1)}</Text>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );

  if (error && !trip) {
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

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView contentContainerStyle={{ padding: Spacing.three, paddingBottom: Spacing.six }}>
        <View
          style={[styles.journeyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <Text style={[styles.journeyTitle, { color: theme.text }]}>Your journey</Text>
          {boardStop && dropStop && (
            <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
              Boarding at{" "}
              <Text style={{ fontFamily: BrandFonts.uiSemiBold, fontWeight: "700", color: theme.text }}>
                {boardStop.location_name}
              </Text>
              , dropping at{" "}
              <Text style={{ fontFamily: BrandFonts.uiSemiBold, fontWeight: "700", color: theme.text }}>
                {dropStop.location_name}
              </Text>
            </Text>
          )}

          <View style={{ marginTop: Spacing.three }}>
            {stops.map((s) => {
              const isBoard = s.route_stop_id === fromStopId;
              const isDrop = s.route_stop_id === toStopId;
              const inSegment = !!(boardStop && dropStop && s.seq >= boardStop.seq && s.seq <= dropStop.seq);
              const dotColor = isBoard || isDrop ? theme.brand : inSegment ? theme.textSecondary : theme.border;
              return (
                <View key={s.route_stop_id} style={styles.stopRow}>
                  <View style={styles.stopDotCol}>
                    <View style={[styles.stopDot, { borderColor: dotColor }]} />
                    {s.seq < stops.length && <View style={[styles.stopLine, { backgroundColor: theme.border }]} />}
                  </View>
                  <View style={{ flex: 1, marginBottom: Spacing.three }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text
                        style={{
                          color: inSegment ? theme.text : theme.textSecondary,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {s.location_name}
                      </Text>
                      {isBoard && (
                        <View style={[styles.stopTag, { backgroundColor: "#d1fae5" }]}>
                          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: "#047857", fontSize: 9, fontWeight: "700" }}>
                            BOARD
                          </Text>
                        </View>
                      )}
                      {isDrop && (
                        <View style={[styles.stopTag, { backgroundColor: "#dbeafe" }]}>
                          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: "#1d4ed8", fontSize: 9, fontWeight: "700" }}>
                            DROP
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 1 }}>
                      {s.scheduled_at ? formatTripTime(s.scheduled_at) : "-"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {trip.bus.amenities.length > 0 && (
            <View style={[styles.journeySection, { borderTopColor: theme.border }]}>
              <Text style={[styles.journeySectionLabel, { color: theme.textSecondary }]}>On board</Text>
              <View style={styles.amenitiesWrap}>
                {trip.bus.amenities.map((a) => (
                  <View key={a} style={[styles.amenityChip, { backgroundColor: theme.backgroundSelected }]}>
                    <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 11 }}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {(crew?.driver || crew?.conductor) && (
            <View style={[styles.journeySection, { borderTopColor: theme.border }]}>
              <Text style={[styles.journeySectionLabel, { color: theme.textSecondary }]}>Your crew</Text>
              <View style={{ flexDirection: "row", gap: Spacing.four, marginTop: Spacing.two, flexWrap: "wrap" }}>
                {crew.driver && <CrewBadge role="Driver" member={crew.driver} theme={theme} />}
                {crew.conductor && <CrewBadge role="Conductor" member={crew.conductor} theme={theme} />}
              </View>
            </View>
          )}

          <View style={[styles.journeySection, styles.trustRow, { borderTopColor: theme.border }]}>
            <Ionicons name="shield-checkmark" size={15} color="#10b981" />
            <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 11 }}>
              Secure checkout · Instant e-ticket · QR boarding
            </Text>
          </View>
        </View>

        <View style={styles.legend}>
          <LegendItem color="transparent" border={theme.border} label="Available" />
          <LegendItem color={SEAT_COLOR.selected} label="Selected" />
          <LegendItem color={SEAT_COLOR.male} label="Male" />
          <LegendItem color={SEAT_COLOR.female} label="Female" />
          <LegendItem color={SEAT_COLOR.pending} label="Pending" />
          <LegendItem color={SEAT_COLOR.blocked} label="Unavailable" />
        </View>

        <Text style={styles.frontLabel}>FRONT OF BUS</Text>

        <View style={[styles.seatCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {grid.map((row, r) => (
            <View key={r} style={styles.seatRow}>
              {row.map((label, ci) => {
                if (label === null) return <View key={ci} style={styles.aisle} />;
                const kind = seatKind(label);
                const taken = kind !== "available" && kind !== "selected";
                return (
                  <Pressable
                    key={ci}
                    disabled={taken || busy}
                    onPress={() => tapSeat(label)}
                    style={[
                      styles.seat,
                      { borderColor: theme.border },
                      kind === "selected" && { backgroundColor: SEAT_COLOR.selected, borderColor: SEAT_COLOR.selected },
                      kind === "male" && { backgroundColor: SEAT_COLOR.male, borderColor: SEAT_COLOR.male },
                      kind === "female" && { backgroundColor: SEAT_COLOR.female, borderColor: SEAT_COLOR.female },
                      kind === "pending" && { backgroundColor: SEAT_COLOR.pending, borderColor: SEAT_COLOR.pending },
                      kind === "blocked" && { backgroundColor: SEAT_COLOR.blocked, borderColor: SEAT_COLOR.blocked },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: BrandFonts.uiSemiBold,
                        fontSize: 11,
                        fontWeight: "700",
                        color: kind === "available" ? theme.text : "#fff",
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={[styles.footer, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {stops.length > 0 && (
            <View style={[styles.footerStopsRow, { borderBottomColor: theme.border }]}>
              <Pressable onPress={() => setStopPickerMode("from")} style={styles.stopField}>
                <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 11 }}>Boarding</Text>
                <Text
                  style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "700", fontSize: 13 }}
                  numberOfLines={1}
                >
                  {boardStop?.location_name ?? "Select"}
                </Text>
              </Pressable>
              <View style={[styles.footerStopsDivider, { backgroundColor: theme.border }]} />
              <Pressable onPress={() => setStopPickerMode("to")} style={styles.stopField}>
                <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 11 }}>Drop-off</Text>
                <Text
                  style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "700", fontSize: 13 }}
                  numberOfLines={1}
                >
                  {dropStop?.location_name ?? "Select"}
                </Text>
              </Pressable>
            </View>
          )}
          <View style={styles.footerSummaryRow}>
            <View>
              <Text style={{ fontFamily: BrandFonts.uiRegular, color: theme.textSecondary, fontSize: 12 }}>
                {selected.size > 0 ? [...selected].join(", ") : "No seats selected"}
              </Text>
              <Text style={{ fontFamily: BrandFonts.headingSemiBold, color: theme.brand, fontWeight: "800", fontSize: 18 }}>
                LKR {total.toLocaleString("en-LK")}
              </Text>
            </View>
            <Pressable
              onPress={handleContinue}
              disabled={selected.size === 0 || busy}
              style={[styles.continueButton, { backgroundColor: theme.brand, opacity: selected.size === 0 || busy ? 0.6 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueText}>Continue</Text>}
            </Pressable>
          </View>
        </View>

        {error && (
          <View style={{ marginTop: Spacing.three }}>
            <Banner tone="error" message={error} />
          </View>
        )}
      </ScrollView>

      <Modal visible={!!genderPromptSeat} transparent animationType="fade" onRequestClose={() => setGenderPromptSeat(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setGenderPromptSeat(null)}>
          <View style={[styles.genderSheet, { backgroundColor: theme.backgroundElement }]}>
            <Text
              style={{
                fontFamily: BrandFonts.uiSemiBold,
                color: theme.text,
                fontWeight: "700",
                marginBottom: Spacing.three,
                textAlign: "center",
              }}
            >
              Seat {genderPromptSeat}
            </Text>
            <View style={{ flexDirection: "row", gap: Spacing.two }}>
              <Pressable
                onPress={() => pickGender("male")}
                style={[styles.genderButton, { borderColor: SEAT_COLOR.male }]}
              >
                <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: SEAT_COLOR.male, fontWeight: "700" }}>Male</Text>
              </Pressable>
              <Pressable
                onPress={() => pickGender("female")}
                style={[styles.genderButton, { borderColor: SEAT_COLOR.female }]}
              >
                <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: SEAT_COLOR.female, fontWeight: "700" }}>
                  Female
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!stopPickerMode}
        transparent
        animationType="slide"
        onRequestClose={() => setStopPickerMode(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStopPickerMode(null)}>
          <Pressable
            style={[styles.stopPickerSheet, { backgroundColor: theme.backgroundElement }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontFamily: BrandFonts.uiSemiBold,
                color: theme.text,
                fontWeight: "800",
                fontSize: 15,
                marginBottom: Spacing.three,
              }}
            >
              {stopPickerMode === "from" ? "Boarding stop" : "Drop-off stop"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(stopPickerMode === "from" ? boardableStops : droppableStops).map((s) => {
                const selected = stopPickerMode === "from" ? s.route_stop_id === fromStopId : s.route_stop_id === toStopId;
                const disabled = stopPickerMode === "from" ? s.seq >= (dropStop?.seq ?? Infinity) : s.seq <= (boardStop?.seq ?? -Infinity);
                return (
                  <Pressable
                    key={s.route_stop_id}
                    disabled={disabled}
                    onPress={() => pickStop(s.route_stop_id)}
                    style={[styles.stopPickRow, { borderColor: theme.border, opacity: disabled ? 0.4 : 1 }]}
                  >
                    <Text
                      style={{
                        fontFamily: selected ? BrandFonts.uiSemiBold : BrandFonts.uiMedium,
                        color: theme.text,
                        fontWeight: selected ? "800" : "500",
                        fontSize: 14,
                      }}
                    >
                      {s.location_name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.brand} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function LegendItem({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color, borderColor: border ?? color }]} />
      <Text style={{ fontFamily: BrandFonts.uiRegular, fontSize: 12, color: "#8a8f98" }}>{label}</Text>
    </View>
  );
}

function CrewBadge({
  role,
  member,
  theme,
}: {
  role: string;
  member: CrewMember;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.two }}>
      {member.photoUrl ? (
        <Image source={{ uri: member.photoUrl }} style={styles.crewPhoto} />
      ) : (
        <View style={[styles.crewPhoto, styles.crewPhotoFallback, { borderColor: theme.border }]}>
          <Ionicons name="person" size={16} color={theme.textSecondary} />
        </View>
      )}
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
          {role}
        </Text>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{member.name}</Text>
      </View>
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
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: Spacing.one,
  },
  backButton: {},
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  heroSubtitle: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.one,
    textAlign: "center",
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.three,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  journeyCard: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  journeyTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 15, fontWeight: "700" },
  stopRow: { flexDirection: "row", gap: Spacing.two },
  stopDotCol: { alignItems: "center", width: 14 },
  stopDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  stopLine: { width: 1, flex: 1, marginVertical: 3 },
  stopTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  journeySection: { marginTop: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  journeySectionLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amenitiesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.two },
  amenityChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  crewPhoto: { width: 36, height: 36, borderRadius: 18 },
  crewPhotoFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.three, marginTop: Spacing.three, marginBottom: Spacing.three },
  frontLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#9ca3af",
    marginBottom: Spacing.two,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  seatCard: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, alignItems: "center", gap: Spacing.two },
  seatRow: { flexDirection: "row", gap: Spacing.two },
  seat: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  aisle: { width: 24 },
  footer: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  footerStopsRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  footerStopsDivider: { width: 1, alignSelf: "stretch", marginVertical: Spacing.two },
  footerSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.three,
  },
  continueButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  continueText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  genderSheet: { borderRadius: 16, padding: Spacing.four, width: 260 },
  stopField: { flex: 1, padding: Spacing.three },
  stopPickerSheet: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    position: "absolute",
    bottom: 0,
  },
  stopPickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  genderButton: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
});
