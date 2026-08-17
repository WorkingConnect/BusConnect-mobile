import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { getBooking, ApiError, type Booking } from "@/lib/api";
import { Banner } from "@/components/banner";
import { Spacing } from "@/constants/theme";

const NOTCH_SIZE = 24;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !session) return;
    let cancelled = false;
    // Payment webhooks can take a beat to land — poll briefly while pending
    // rather than showing a stale "pending" state right after checkout.
    async function poll() {
      try {
        const b = await getBooking(session!.access_token, id);
        if (cancelled) return;
        setBooking(b);
        if (b.status === "pending") setTimeout(poll, 3000);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load your ticket.");
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [id, session]);

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Your ticket</Text>
        <View style={styles.backButton} />
      </View>
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

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  const ticket = booking.tickets?.[0];
  const confirmed = booking.status === "confirmed";

  function Cell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
      <View style={styles.cell}>
        <Text style={[styles.cellLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[styles.cellValue, { color: valueColor ?? theme.text }]}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.qrSection}>
            <Text style={[styles.status, { color: confirmed ? "#16a34a" : "#c17a1f" }]}>
              {confirmed ? "Confirmed" : booking.status === "pending" ? "Payment pending…" : booking.status}
            </Text>

            {confirmed && ticket?.qr_signature ? (
              <View style={styles.qrWrap}>
                <QRCode value={ticket.qr_signature} size={200} />
              </View>
            ) : booking.status === "pending" ? (
              <View style={styles.qrWrap}>
                <ActivityIndicator color={theme.brand} />
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Waiting for payment confirmation…</Text>
              </View>
            ) : null}
          </View>

          {/* Torn-ticket-stub divider: a dashed perforation line with
           *  semicircle cutouts (colored to match the page background, not
           *  the card) punched into the card's left/right edges. */}
          <View style={styles.perforationRow}>
            <View style={[styles.notch, styles.notchLeft, { backgroundColor: theme.background }]} />
            <View style={[styles.dashedLine, { borderColor: theme.border }]} />
            <View style={[styles.notch, styles.notchRight, { backgroundColor: theme.background }]} />
          </View>

          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <Cell label="Operator" value={booking.trip?.bus?.operator?.name ?? "—"} />
              <Cell label="Pickup point" value={booking.from_stop?.location?.name_en ?? "—"} />
            </View>
            <View style={styles.gridRow}>
              <Cell label="Seats" value={booking.seats.join(", ")} />
              <Cell label="Reference" value={booking.id.slice(0, 8).toUpperCase()} />
            </View>
            <View style={styles.gridRow}>
              <Cell
                label="Departs"
                value={booking.trip?.depart_at ? formatDateTime(booking.trip.depart_at) : "—"}
              />
              <Cell
                label="Amount"
                value={`LKR ${Number(booking.amount).toLocaleString("en-LK")}`}
                valueColor={theme.brand}
              />
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => router.replace("/(tabs)/tickets")}
          style={[styles.ticketsButton, { borderColor: theme.brand }]}
        >
          <Ionicons name="ticket-outline" size={18} color={theme.brand} />
          <Text style={[styles.ticketsButtonLabel, { color: theme.brand }]}>Go to my tickets</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.four },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 32 },
  heroTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  card: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  qrSection: { padding: Spacing.four, paddingBottom: Spacing.three },
  status: { fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: Spacing.three },
  qrWrap: { alignItems: "center", justifyContent: "center", paddingVertical: Spacing.two },
  perforationRow: { flexDirection: "row", alignItems: "center", height: NOTCH_SIZE },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    position: "absolute",
    top: 0,
  },
  notchLeft: { left: -NOTCH_SIZE / 2 },
  notchRight: { right: -NOTCH_SIZE / 2 },
  dashedLine: {
    flex: 1,
    marginHorizontal: NOTCH_SIZE,
    borderStyle: "dashed",
    borderTopWidth: 1,
  },
  grid: { padding: Spacing.four, paddingTop: Spacing.three, gap: Spacing.four },
  gridRow: { flexDirection: "row" },
  cell: { flex: 1, gap: 4 },
  cellLabel: { fontSize: 12 },
  cellValue: { fontSize: 16, fontWeight: "700" },
  ticketsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    marginTop: Spacing.four,
  },
  ticketsButtonLabel: { fontSize: 15, fontWeight: "700" },
});
