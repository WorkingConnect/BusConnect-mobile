import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import {
  getTripRoute,
  getTripLive,
  getTrip,
  getTripCrew,
  ApiError,
  type TripRoute,
  type TripLive,
  type TripDetail,
  type TripCrew,
  type CrewMember,
} from "@/lib/api";
import { TrackingMap, type BusPosition } from "@/components/tracking-map";
import { Banner } from "@/components/banner";
import { BrandFonts, Spacing } from "@/constants/theme";

const STALE_MS = 35_000; // no fresh GPS point for this long → treated as "not connected"
const POLL_MS = 20_000; // safety net behind realtime
const CREW_REFRESH_MS = 4 * 60 * 1000; // crew photo URLs are signed for 300s
const NOTIFY_ETA_MIN = 3; // fire the "almost here" alert at this ETA or below

type Theme = ReturnType<typeof useTheme>;

export default function TrackScreen() {
  const theme = useTheme();
  const { id, stopId, routeName, operatorName } = useLocalSearchParams<{
    id: string;
    stopId?: string;
    routeName?: string;
    operatorName?: string;
  }>();

  const [route, setRoute] = useState<TripRoute | null>(null);
  const [live, setLive] = useState<TripLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tripDetail, setTripDetail] = useState<TripDetail | null>(null);
  const [crew, setCrew] = useState<TripCrew | null>(null);
  const [notifyNear, setNotifyNear] = useState(false);
  // Hides the button entirely once notifications are permanently denied —
  // tapping it would just silently fail (iOS/Android don't re-prompt after
  // a denial), so there's no point offering a control that can't work.
  const [notifyPermissionDenied, setNotifyPermissionDenied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const notifiedRef = useRef(false);

  // Ask once for foreground location so the map can draw the native
  // "current location" dot (react-native-maps needs the runtime grant on
  // Android; iOS gates the dot on it too). The map's showsUserLocation
  // renders and updates the dot itself — we don't track the position in JS.
  // Silently does nothing if denied, same as any other nice-to-have layer.
  useEffect(() => {
    void Location.requestForegroundPermissionsAsync();
  }, []);

  // Route line + stops — fetched once, static.
  useEffect(() => {
    if (!id) return;
    getTripRoute(id)
      .then(setRoute)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Could not load the route.",
        ),
      );
  }, [id]);

  // Bus/operator details — fetched once, static for the trip.
  useEffect(() => {
    if (!id) return;
    getTrip(id)
      .then(setTripDetail)
      .catch(() => {
        /* the info card just stays hidden if this fails — not critical */
      });
  }, [id]);

  // Driver/conductor — the profile photo is a 5-min signed URL, so refresh
  // it periodically instead of fetching once and letting the image break.
  useEffect(() => {
    if (!id) return;
    let active = true;
    function load() {
      getTripCrew(id)
        .then((c) => {
          if (active) setCrew(c);
        })
        .catch(() => {
          /* crew card just stays hidden if this fails */
        });
    }
    load();
    const interval = setInterval(load, CREW_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id]);

  // Reset the "almost here" alert when tracking a different trip.
  useEffect(() => {
    notifiedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync("proximity", {
        name: "Bus arrival alerts",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  }, []);

  // Live position + status/sharing — an initial fetch, then re-fetched on every
  // realtime event (new GPS point or a status/sharing change) instead of
  // parsing PostGIS geometry off the wire, plus a slow poll as a safety net.
  const refresh = useCallback(() => {
    if (!id) return;
    getTripLive(id, stopId)
      .then(setLive)
      .catch(() => {
        /* transient — next event/poll retries */
      });
  }, [id, stopId]);

  useEffect(() => {
    if (!id) return;
    refresh();
    const channel = supabase
      .channel(`trip-track:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_gps",
          filter: `trip_id=eq.${id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trips",
          filter: `id=eq.${id}`,
        },
        refresh,
      )
      .subscribe();
    const poll = setInterval(refresh, POLL_MS);
    // Tick so the "last seen" staleness re-evaluates without a new event.
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id, refresh]);

  const position = useMemo<BusPosition | null>(
    () =>
      live?.tracking
        ? { lat: live.lat, lng: live.lng, speedKmh: live.speed_kmh, recordedAt: live.recorded_at }
        : null,
    [live],
  );

  const boardingName = useMemo(
    () => route?.stops.find((s) => s.route_stop_id === stopId)?.name ?? null,
    [route, stopId],
  );

  const sheet = useMemo(
    () => deriveSheet(live, boardingName, now),
    [live, boardingName, now],
  );

  // Check current permission status once on mount (getPermissionsAsync
  // doesn't prompt) so a previously-denied state hides the button right
  // from the start, not just after the user taps it and gets denied again.
  useEffect(() => {
    void Notifications.getPermissionsAsync().then((perm) => {
      setNotifyPermissionDenied(perm.status === "denied");
    });
  }, []);

  const toggleNotify = useCallback(async () => {
    if (!notifyNear) {
      const perm = await Notifications.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setNotifyPermissionDenied(perm.status === "denied");
        return;
      }
    }
    setNotifyNear((v) => !v);
    notifiedRef.current = false;
  }, [notifyNear]);

  // Fires once per trip when the ETA first drops to the threshold — a ref
  // flag (not state) tracks "already sent" so this can't re-fire on every
  // subsequent live update while still under the threshold.
  useEffect(() => {
    if (!notifyNear || notifiedRef.current) return;
    if (!sheet.connected || sheet.etaMinutes == null) return;
    if (sheet.etaMinutes > NOTIFY_ETA_MIN) return;
    notifiedRef.current = true;
    void Notifications.scheduleNotificationAsync({
      content: {
        title: "Your bus is almost here",
        body: boardingName
          ? `Arriving at ${boardingName} in about ${sheet.etaMinutes} min.`
          : `Arriving in about ${sheet.etaMinutes} min.`,
      },
      trigger: null,
    });
  }, [notifyNear, sheet.connected, sheet.etaMinutes, boardingName]);

  if (error && !route) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <View style={{ width: "100%", paddingHorizontal: Spacing.four }}>
          <Banner tone="error" message={error} />
        </View>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: Spacing.four }}
        >
          <Text
            style={{
              fontFamily: BrandFonts.uiSemiBold,
              color: theme.brand,
              fontWeight: "600",
            }}
          >
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!route) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <TrackingMap
        route={route}
        boardingStopId={stopId ?? ""}
        position={position}
        bottomInset={sheetHeight}
      />

      {/* Top bar over the map */}
      <SafeAreaView
        edges={["top"]}
        style={styles.topBar}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#111" />
        </Pressable>
        {routeName ? (
          <View style={styles.routePill}>
            <Text style={styles.routePillText} numberOfLines={1}>
              {routeName}
            </Text>
          </View>
        ) : null}
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {/* Bottom sheet */}
      <View
        style={styles.sheetWrap}
        pointerEvents="box-none"
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}
        >
          <Pressable onPress={() => setCollapsed((v) => !v)} hitSlop={8}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          </Pressable>

          <View style={styles.statusRow}>
            <View style={styles.statusRowLeft}>
              <ConnectionDot connected={sheet.connected} />
            </View>
            <View style={styles.statusRowLeft}>
              {!notifyPermissionDenied && (
                <Pressable
                  onPress={toggleNotify}
                  hitSlop={8}
                  style={[
                    styles.notifyBtn,
                    { borderColor: notifyNear ? theme.brand : theme.border },
                    notifyNear && { backgroundColor: theme.brandSoft },
                  ]}
                >
                  <Ionicons
                    name={notifyNear ? "notifications" : "notifications-outline"}
                    size={13}
                    color={notifyNear ? theme.brand : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.notifyBtnText,
                      { color: notifyNear ? theme.brand : theme.textSecondary },
                    ]}
                  >
                    {notifyNear ? "Notifying" : "Notify me"}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => setCollapsed((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={collapsed ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {!collapsed && (
            <>
              {sheet.etaMinutes != null ? (
                <>
                  {boardingName ? (
                    <Text
                      style={[styles.etaTo, { color: theme.textSecondary }]}
                    >
                      To {boardingName}
                    </Text>
                  ) : null}
                  <View style={styles.statsRow}>
                    <View style={styles.statBlock}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Travel time
                      </Text>
                      <View style={styles.statValueRow}>
                        <Text style={[styles.statValue, { color: theme.text }]}>
                          {sheet.etaMinutes}
                        </Text>
                        <Text style={[styles.statUnit, { color: theme.text }]}>
                          {" "}
                          min
                        </Text>
                      </View>
                    </View>
                    {sheet.distanceKm != null && (
                      <View style={styles.statBlock}>
                        <Text
                          style={[
                            styles.statLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Distance
                        </Text>
                        <View style={styles.statValueRow}>
                          <Text
                            style={[styles.statValue, { color: theme.text }]}
                          >
                            {sheet.distanceKm}
                          </Text>
                          <Text
                            style={[styles.statUnit, { color: theme.text }]}
                          >
                            {" "}
                            km
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <Text style={[styles.heroTitle, { color: theme.text }]}>
                  {sheet.title}
                </Text>
              )}

              {sheet.sub ? (
                <Text style={[styles.sub, { color: theme.textSecondary }]}>
                  {sheet.sub}
                </Text>
              ) : null}

              <View style={[styles.metaRow, { borderTopColor: theme.border }]}>
                <Ionicons
                  name="bus-outline"
                  size={15}
                  color={theme.textSecondary}
                />
                <Text
                  style={{ color: theme.textSecondary, fontSize: 13, flex: 1 }}
                  numberOfLines={1}
                >
                  {operatorName ?? "Your bus"}
                  {tripDetail ? ` · ${tripDetail.bus.reg_no}` : ""}
                </Text>
                {sheet.speedKmh != null ? (
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    {sheet.speedKmh} km/h
                  </Text>
                ) : null}
              </View>

              {crew?.conductor && (
                <View style={styles.infoCard}>
                  <ConductorCard member={crew.conductor} theme={theme} />
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </View>
    </View>
  );
}

function ConductorCard({
  member,
  theme,
}: {
  member: CrewMember;
  theme: Theme;
}) {
  return (
    <View style={styles.crewChip}>
      {member.photoUrl ? (
        <Image source={{ uri: member.photoUrl }} style={styles.crewAvatar} />
      ) : (
        <View
          style={[
            styles.crewAvatar,
            styles.crewAvatarPlaceholder,
            { backgroundColor: theme.brandSoft },
          ]}
        >
          <Ionicons name="person" size={14} color={theme.brand} />
        </View>
      )}
      <View style={{ flexShrink: 1, flex: 1 }}>
        <Text style={[styles.crewLabel, { color: theme.textSecondary }]}>
          Conductor
        </Text>
        <Text
          style={[styles.crewName, { color: theme.text }]}
          numberOfLines={1}
        >
          {member.name}
        </Text>
      </View>
      {member.phone && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${member.phone}`)}
          hitSlop={8}
          style={[styles.callButton, { backgroundColor: theme.brand }]}
        >
          <Ionicons name="call" size={16} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

interface SheetState {
  /** True only when we're actively receiving fresh GPS from the bus right
   *  now — drives the green/red dot. Every other state (not started,
   *  boarding, paused, signal gap, completed) is "not connected" — the
   *  passenger doesn't need to know why, just whether the live map is
   *  trustworthy at this moment. */
  connected: boolean;
  title: string;
  sub: string | null;
  etaMinutes: number | null;
  speedKmh: number | null;
  distanceKm: number | null;
}

function deriveSheet(
  live: TripLive | null,
  boardingName: string | null,
  now: number,
): SheetState {
  if (!live)
    return {
      connected: false,
      title: "Locating your bus…",
      sub: null,
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };

  const status = live.status ?? "scheduled";
  const sharing = live.sharing ?? true;

  if (status === "arrived")
    return {
      connected: false,
      title: "Trip completed",
      sub: "This bus has finished its trip.",
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };
  if (status === "cancelled")
    return {
      connected: false,
      title: "Trip cancelled",
      sub: null,
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };
  if (status === "scheduled")
    return {
      connected: false,
      title: "Waiting to depart",
      sub: "Live tracking begins when the bus starts boarding.",
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };

  // boarding / departed
  if (!sharing || !live.tracking)
    return {
      connected: false,
      title:
        status === "boarding" ? "Boarding at the stop" : "Starting the trip",
      sub: "Waiting for the bus's live location…",
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };

  const ageMs = now - new Date(live.recorded_at).getTime();
  if (ageMs > STALE_MS) {
    return {
      connected: false,
      title:
        status === "boarding" ? "Boarding at the stop" : "Waiting for signal",
      sub: null,
      etaMinutes: null,
      speedKmh: null,
      distanceKm: null,
    };
  }

  const speedKmh = live.speed_kmh != null ? Math.round(live.speed_kmh) : null;
  const distanceKm =
    live.distance_m != null
      ? Math.round((live.distance_m / 1000) * 10) / 10
      : null;
  return {
    connected: true,
    title: status === "boarding" ? "Boarding at the stop" : "On the way",
    sub:
      status === "boarding"
        ? "The bus is at the stop, boarding passengers."
        : boardingName
          ? null
          : "Heading to your stop.",
    etaMinutes: live.eta_minutes ?? null,
    speedKmh,
    distanceKm,
  };
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: connected ? "#059669" : "#dc2626" },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  routePill: {
    flex: 1,
    marginHorizontal: Spacing.two,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  routePillText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#111",
    fontWeight: "700",
    fontSize: 13,
  },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.three,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRowLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifyBtnText: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 11,
    fontWeight: "700",
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  etaTo: { fontSize: 15, fontWeight: "500", marginTop: Spacing.two },
  statsRow: { flexDirection: "row", gap: Spacing.five, marginTop: Spacing.two },
  statBlock: {},
  statLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
  statValue: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  statUnit: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 15,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    marginTop: Spacing.two,
    letterSpacing: -0.3,
  },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  infoCard: { marginTop: Spacing.three, gap: Spacing.two },
  crewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  crewAvatar: { width: 36, height: 36, borderRadius: 18 },
  crewAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  crewLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  crewName: { fontSize: 13, fontWeight: "600" },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
