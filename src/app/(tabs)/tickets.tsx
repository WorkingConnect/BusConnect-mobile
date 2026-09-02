import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { listMyBookings, type MyBooking } from "@/lib/tickets";
import { hideBooking, getMyReview, submitReview, ApiError } from "@/lib/api";
import { Banner } from "@/components/banner";
import { StarRatingInput } from "@/components/star-rating-input";
import { Spacing, BottomTabInset, BrandFonts } from "@/constants/theme";

type Tab = "confirmed" | "cancelled";

/** Unpaid bookings (pending/reserved_unpaid) aren't shown at all — the API
 *  query already excludes them, this is just the display-side mapping. */
function tabOf(status: string): Tab | null {
  if (status === "confirmed") return "confirmed";
  if (status === "cancelled" || status === "refunded") return "cancelled";
  return null;
}

function money(n: number) {
  return `LKR ${Number(n).toLocaleString("en-LK")}`;
}
function dateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dateOnly(iso: string) {
  return new Date(iso).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TAB_LABEL: Record<Tab, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};
const TABS: Tab[] = ["confirmed", "cancelled"];

export default function TicketsScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("confirmed");
  // The tab bar keeps this screen mounted in the background when navigating
  // away (Sign In / Not now), so the modal's `visible` must be driven by
  // this instead of hardcoded true — otherwise it keeps rendering on top of
  // whatever screen navigation lands on. Resets on every focus so a guest
  // who dismissed it still sees it again on returning to this tab.
  const [signInDismissed, setSignInDismissed] = useState(false);
  useFocusEffect(useCallback(() => setSignInDismissed(false), []));

  const load = useCallback(() => {
    if (!session) return;
    listMyBookings()
      .then(setBookings)
      .catch(() => setError("Could not load your tickets."));
  }, [session]);

  // useFocusEffect already runs on initial mount (first focus), so this
  // also covers the load-on-mount case without a second, redundant fetch.
  useFocusEffect(load);

  const hero = (
    <SafeAreaView
      edges={["top"]}
      style={[styles.hero, { backgroundColor: theme.brand }]}
    >
      <Text style={styles.heroTitle}>My Tickets</Text>
      <Text style={styles.heroSubtitle}>
        Track your bookings and boarding passes.
      </Text>
    </SafeAreaView>
  );

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <Modal visible={!signInDismissed} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.signInCard, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="ticket-outline" size={40} color={theme.brand} />
                <Text style={{ fontFamily: BrandFonts.headingSemiBold, color: theme.text, fontWeight: "800", fontSize: 17, marginTop: Spacing.two, textAlign: "center" }}>
                  Sign in to view your tickets
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.one, textAlign: "center" }}>
                  Track your bookings and boarding passes.
                </Text>
                <Pressable
                  onPress={() => {
                    setSignInDismissed(true);
                    router.push({ pathname: "/login", params: { next: "/tickets" } });
                  }}
                  style={[styles.signInButton, { backgroundColor: theme.brand }]}
                >
                  <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    Sign In
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSignInDismissed(true);
                    router.push("/");
                  }}
                  hitSlop={8}
                  style={{ marginTop: Spacing.three }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "600" }}>Not now</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    );
  }

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

  if (!bookings) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={[styles.center, { gap: Spacing.three }]}>
          <Text style={{ color: theme.textSecondary }}>
            You haven&apos;t booked any trips yet.
          </Text>
          <Pressable
            onPress={() => router.push("/")}
            style={[
              styles.primaryButton,
              { flex: 0, backgroundColor: theme.brand },
            ]}
          >
            <Text style={styles.primaryButtonText}>Search buses</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const visible = bookings.filter((b) => tabOf(b.status) !== null);
  const counts: Record<Tab, number> = {
    confirmed: visible.filter((b) => tabOf(b.status) === "confirmed").length,
    cancelled: visible.filter((b) => tabOf(b.status) === "cancelled").length,
  };
  const shown = visible.filter((b) => tabOf(b.status) === tab);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.background },
        ]}
      >
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tabButton,
                {
                  backgroundColor:
                    tab === t ? theme.brand : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text
                style={{
                  fontFamily: BrandFonts.uiSemiBold,
                  color: tab === t ? "#fff" : theme.text,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                {TAB_LABEL[t]} {counts[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        {shown.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={{ color: theme.textSecondary }}>
              No {TAB_LABEL[tab].toLowerCase()} bookings.
            </Text>
          </View>
        ) : (
          shown.map((b) => (
            <TicketCard
              key={b.id}
              b={b}
              t={tab}
              theme={theme}
              accessToken={session.access_token}
              onDeleted={() =>
                setBookings(
                  (prev) => prev?.filter((x) => x.id !== b.id) ?? null,
                )
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TicketCard({
  b,
  t,
  theme,
  accessToken,
  onDeleted,
}: {
  b: MyBooking;
  t: Tab;
  theme: ReturnType<typeof useTheme>;
  accessToken: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const boarded = b.ticketStatus === "used";
  const arrived = b.tripStatus === "arrived";

  function confirmDelete() {
    Alert.alert(
      "Remove this ticket?",
      "This only removes it from your list. It won't affect any refund already in progress.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            hideBooking(accessToken, b.id)
              .then(onDeleted)
              .catch((e) => {
                setDeleting(false);
                Alert.alert(
                  "Could not remove this ticket",
                  e instanceof ApiError ? e.message : "Please try again.",
                );
              });
          },
        },
      ],
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.badgeRow}>
          <Badge label={TAB_LABEL[t]} tone={t} />
          {b.busClass && (
            <Badge label={b.busClass.replace("_", " ")} tone="class" />
          )}
          {boarded && <Badge label="Boarded" tone="confirmed" />}
        </View>

        <Text style={[styles.routeName, { color: theme.text }]}>
          {b.routeName ?? b.operatorName}
        </Text>
        <Text
          style={[styles.routeMeta, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {dateTime(b.departAt)} · {b.operatorName}
          {b.regNo ? ` · ${b.regNo}` : ""}
        </Text>
      </View>

      <View style={styles.notchRow}>
        <View
          style={[
            styles.notchCircle,
            styles.notchLeft,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        />
        <View style={[styles.dashedLine, { borderColor: theme.border }]} />
        <View
          style={[
            styles.notchCircle,
            styles.notchRight,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        />
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.statsGrid}>
          <Stat label="Booking code" value={b.code} theme={theme} />
          <Stat
            label={b.seats.length === 1 ? "Seat" : "Seats"}
            value={b.seats.join(", ")}
            theme={theme}
          />
          <Stat
            label="Total paid"
            value={t === "confirmed" ? money(b.amount) : "-"}
            theme={theme}
          />
          <Stat label="Booked on" value={dateOnly(b.createdAt)} theme={theme} />
          {t === "confirmed" && b.refundedAmount > 0 && (
            <Stat
              label="Refunded"
              value={`${money(b.refundedAmount)} (balance ${money(b.amount - b.refundedAmount)})`}
              theme={theme}
            />
          )}
        </View>

        <View style={{ marginTop: Spacing.three, gap: Spacing.two }}>
          {t === "confirmed" && arrived && (
            <RateTripButton
              tripId={b.tripId}
              accessToken={accessToken}
              theme={theme}
            />
          )}
          {t === "confirmed" && !arrived && b.qrSignature ? (
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setOpen((v) => !v)}
                style={[styles.primaryButton, { backgroundColor: theme.brand }]}
              >
                <Text style={styles.primaryButtonText}>
                  {open ? "Hide QR" : "Show QR ticket"}
                </Text>
              </Pressable>
              {b.tripStatus !== "arrived" &&
                b.tripStatus !== "cancelled" &&
                b.locationSharing && (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/track/[id]",
                        params: {
                          id: b.tripId,
                          stopId: b.fromStopId,
                          routeName: b.routeName ?? "",
                          operatorName: b.operatorName,
                        },
                      })
                    }
                    style={[
                      styles.secondaryButton,
                      { borderColor: theme.brand },
                    ]}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={14}
                      color={theme.brand}
                    />
                    <Text
                      style={{
                        fontFamily: BrandFonts.uiSemiBold,
                        color: theme.brand,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      Track bus
                    </Text>
                  </Pressable>
                )}
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => router.push(`/bookings/${b.id}`)}
                style={[styles.secondaryButton, { borderColor: theme.border }]}
              >
                <Text
                  style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "600", fontSize: 13 }}
                >
                  View booking
                </Text>
              </Pressable>
              {t !== "confirmed" && (
                <Pressable
                  onPress={confirmDelete}
                  disabled={deleting}
                  hitSlop={8}
                  style={[
                    styles.deleteButton,
                    { borderColor: theme.border, opacity: deleting ? 0.5 : 1 },
                  ]}
                >
                  {deleting ? (
                    <ActivityIndicator color="#dc2626" size="small" />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  )}
                </Pressable>
              )}
            </View>
          )}
        </View>

        {open && b.qrSignature && (
          <View style={[styles.qrWrap, { borderTopColor: theme.border }]}>
            <View style={[styles.qrBox, { borderColor: theme.border }]}>
              <QRCode value={b.qrSignature} size={200} />
            </View>
            <Text style={[styles.qrHint, { color: theme.textSecondary }]}>
              Show this at boarding · covers all {b.seats.length} seat
              {b.seats.length === 1 ? "" : "s"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

type RateState = "loading" | "idle" | "open" | "busy" | "rated";

function RateTripButton({
  tripId,
  accessToken,
  theme,
}: {
  tripId: string;
  accessToken: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const [state, setState] = useState<RateState>("loading");
  const [rating, setRating] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyReview(accessToken, tripId)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setRating(existing.rating);
          setState("rated");
        } else {
          setState("idle");
        }
      })
      .catch(() => !cancelled && setState("idle"));
    return () => {
      cancelled = true;
    };
  }, [tripId, accessToken]);

  function submit() {
    setError(null);
    setState("busy");
    submitReview(accessToken, { tripId, rating })
      .then(() => setState("rated"))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not submit your rating. Try again.");
        setState("open");
      });
  }

  if (state === "loading") return null;

  if (state === "rated") {
    return (
      <View
        style={[
          styles.secondaryButton,
          { borderColor: theme.border, flex: 0, alignSelf: "flex-start", gap: 8 },
        ]}
      >
        <StarRatingInput value={rating} size={15} />
        <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.textSecondary, fontWeight: "600", fontSize: 13 }}>
          Rated
        </Text>
      </View>
    );
  }

  if (state === "idle") {
    return (
      <Pressable
        onPress={() => setState("open")}
        style={[styles.primaryButton, { backgroundColor: theme.brand }]}
      >
        <Text style={styles.primaryButtonText}>Rate this trip</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.border, padding: Spacing.three },
      ]}
    >
      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>How was your trip?</Text>
      <View style={{ marginTop: Spacing.two }}>
        <StarRatingInput value={rating} onChange={setRating} disabled={state === "busy"} />
      </View>
      {error && (
        <Text style={{ color: "#dc2626", fontSize: 13, marginTop: Spacing.two }}>{error}</Text>
      )}
      <View style={[styles.actionRow, { marginTop: Spacing.three }]}>
        <Pressable
          onPress={submit}
          disabled={rating === 0 || state === "busy"}
          style={[
            styles.primaryButton,
            { backgroundColor: theme.brand, opacity: rating === 0 || state === "busy" ? 0.6 : 1 },
          ]}
        >
          {state === "busy" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit rating</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => setState("idle")}
          disabled={state === "busy"}
          style={[styles.secondaryButton, { borderColor: theme.border }]}
        >
          <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "600", fontSize: 13 }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: Tab | "class" }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    confirmed: { bg: "#d1fae5", fg: "#047857" },
    cancelled: { bg: "#e4e4e7", fg: "#52525b" },
    class: { bg: "#e6eefb", fg: "#004aad" },
  };
  const c = colors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text
        style={{
          fontFamily: BrandFonts.uiSemiBold,
          color: c.fg,
          fontSize: 11,
          fontWeight: "700",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stat}>
      <Text
        style={{
          fontFamily: BrandFonts.uiSemiBold,
          color: theme.textSecondary,
          fontSize: 11,
          textTransform: "uppercase",
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: BrandFonts.uiSemiBold,
          color: theme.text,
          fontSize: 14,
          fontWeight: "700",
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
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
  },
  container: {
    flexGrow: 1,
    padding: Spacing.four,
    paddingBottom: Spacing.four + BottomTabInset,
    gap: Spacing.three,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: Spacing.four },
  signInCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: Spacing.five,
    alignItems: "center",
  },
  signInButton: {
    marginTop: Spacing.four,
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  tabRow: { flexDirection: "row", gap: Spacing.two },
  tabButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.five,
    alignItems: "center",
  },
  card: { borderWidth: 1, borderRadius: 16, overflow: "visible" },
  cardTop: { padding: Spacing.four, paddingBottom: Spacing.three },
  cardBottom: { padding: Spacing.four, paddingTop: Spacing.three },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  routeName: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
    letterSpacing: -0.2,
  },
  routeMeta: { fontFamily: BrandFonts.uiRegular, fontSize: 13, marginTop: 3, lineHeight: 18 },
  notchRow: { height: 20, flexDirection: "row", alignItems: "center" },
  notchCircle: {
    position: "absolute",
    top: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  notchLeft: { left: -12 },
  notchRight: { right: -12 },
  dashedLine: {
    flex: 1,
    marginHorizontal: 20,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  stat: { minWidth: "42%" },
  actionRow: { flexDirection: "row", gap: Spacing.two },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 13 },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
  },
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
  },
  qrWrap: {
    alignItems: "center",
    marginTop: Spacing.four,
    paddingTop: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  qrBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff",
  },
  qrHint: { fontFamily: BrandFonts.uiRegular, fontSize: 12, marginTop: Spacing.two, textAlign: "center" },
});
