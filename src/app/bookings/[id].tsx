import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { getBooking, ApiError, type Booking } from "@/lib/api";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

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
  const [copied, setCopied] = useState(false);

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

  async function copyBookingId() {
    await Clipboard.setStringAsync(booking!.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function Cell({
    label,
    value,
    valueColor,
    emphasize,
  }: {
    label: string;
    value: string;
    valueColor?: string;
    /** Matches BusConnect-web's `font-heading` treatment on the Amount cell
     *  only — every other cell value there is plain body text. */
    emphasize?: boolean;
  }) {
    return (
      <View style={styles.cell}>
        <Text style={[styles.cellLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text
          style={[
            styles.cellValue,
            { color: valueColor ?? theme.text },
            emphasize && { fontFamily: BrandFonts.headingSemiBold },
          ]}
        >
          {value}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.qrSection}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: confirmed ? "#dcfce7" : "#fef3c7" },
                ]}
              >
                {confirmed && <Ionicons name="checkmark-circle" size={12} color="#15803d" />}
                <Text style={[styles.statusPillText, { color: confirmed ? "#15803d" : "#b45309" }]}>
                  {confirmed ? "Confirmed" : booking.status === "pending" ? "Payment pending…" : booking.status}
                </Text>
              </View>
            </View>

            {confirmed && ticket?.qr_signature ? (
              <View style={styles.qrWrap}>
                <QRCode value={ticket.qr_signature} size={200} />
                <Text style={[styles.qrCaption, { color: theme.textSecondary }]}>
                  Show this QR to the conductor
                </Text>
                <View style={styles.bookingIdBlock}>
                  <Text style={[styles.bookingIdText, { color: theme.textSecondary }]}>
                    Booking ID: {booking.id}
                  </Text>
                  <Pressable onPress={copyBookingId} hitSlop={8} style={styles.copyButton}>
                    <Ionicons name={copied ? "checkmark" : "copy-outline"} size={11} color={theme.brand} />
                    <Text style={[styles.copyButtonText, { color: theme.brand }]}>
                      {copied ? "Copied" : "Copy"}
                    </Text>
                  </Pressable>
                </View>
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
              <Cell label="Operator" value={booking.trip?.bus?.operator?.name ?? "-"} />
              <Cell label="Pickup point" value={booking.from_stop?.location?.name_en ?? "-"} />
            </View>
            <View style={styles.gridRow}>
              <Cell label="Seats" value={booking.seats.join(", ")} />
              <Cell label="Reference" value={booking.id.slice(0, 8).toUpperCase()} />
            </View>
            <View style={styles.gridRow}>
              <Cell
                label="Departs"
                value={booking.trip?.depart_at ? formatDateTime(booking.trip.depart_at) : "-"}
              />
              <Cell
                label="Amount"
                value={`LKR ${Number(booking.amount).toLocaleString("en-LK")}`}
                valueColor={theme.brand}
                emphasize
              />
            </View>
          </View>
        </View>

        {confirmed && Number(booking.co2_saved_kg) > 0 && (
          <View style={[styles.co2Banner, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
            <Ionicons name="leaf-outline" size={18} color="#059669" />
            <Text style={{ color: "#065f46", fontSize: 13, flex: 1 }}>
              This trip saves ~
              <Text style={{ fontFamily: BrandFonts.uiSemiBold, fontWeight: "700" }}>
                {Number(booking.co2_saved_kg).toFixed(1)} kg
              </Text>{" "}
              of CO2 vs. your usual ride.
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => router.replace("/(tabs)/tickets")}
          style={[styles.ticketsButton, { backgroundColor: theme.brand }]}
        >
          <Ionicons name="ticket-outline" size={15} color="#fff" />
          <Text style={styles.ticketsButtonLabel}>Go to my tickets</Text>
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
    fontFamily: BrandFonts.headingSemiBold,
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  card: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  qrSection: { padding: Spacing.four, paddingBottom: Spacing.three },
  statusRow: { alignItems: "center", marginBottom: Spacing.three },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillText: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  qrWrap: { alignItems: "center", justifyContent: "center", paddingVertical: Spacing.two },
  qrCaption: { fontFamily: BrandFonts.uiRegular, fontSize: 12, marginTop: Spacing.three },
  bookingIdBlock: { alignItems: "center", gap: 4, marginTop: 6 },
  bookingIdText: { fontFamily: BrandFonts.uiRegular, fontSize: 11 },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 3 },
  copyButtonText: { fontFamily: BrandFonts.uiSemiBold, fontSize: 11, fontWeight: "600" },
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
  cellLabel: { fontFamily: BrandFonts.uiRegular, fontSize: 12 },
  cellValue: { fontSize: 16, fontWeight: "700" },
  ticketsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    marginTop: Spacing.four,
  },
  ticketsButtonLabel: { fontFamily: BrandFonts.uiSemiBold, fontSize: 13, fontWeight: "700", color: "#fff" },
  co2Banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
});
