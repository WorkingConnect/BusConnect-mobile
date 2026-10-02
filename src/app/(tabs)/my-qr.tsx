import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import {
  getIdentityQrToken,
  getOnboardFareHistory,
  getWallet,
  ApiError,
  type OnboardFare,
} from "@/lib/api";
import { Banner } from "@/components/banner";
import { CountdownRing } from "@/components/countdown-ring";
import { Spacing, BrandFonts } from "@/constants/theme";

// The token itself is valid for 5 minutes server-side (see api's
// IdentityService — long enough for a conductor to scan, pick stops, and
// confirm without it expiring mid-transaction). Refreshing the displayed
// QR well before that just keeps it visually "live" and limits how long an
// unused screenshot stays usable; the old one stays visible until the new
// one resolves so there's no blank/flicker frame.
const REFRESH_MS = 4 * 60_000;

function formatLkr(amount: number) {
  return `LKR ${amount.toLocaleString("en-LK")}`;
}

export default function MyQrScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [fares, setFares] = useState<OnboardFare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Same pattern as tickets.tsx: the tab stays mounted when navigating away
  // (e.g. to Sign In), so the prompt's visibility must be driven by this
  // instead of hardcoded true, and resets on every focus.
  const [signInDismissed, setSignInDismissed] = useState(false);
  useFocusEffect(useCallback(() => setSignInDismissed(false), []));

  const refreshToken = useCallback(() => {
    if (!session) return;
    getIdentityQrToken(session.access_token)
      .then((res) => setToken(res.token))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not refresh your QR. Pull to retry."));
  }, [session]);

  const load = useCallback(() => {
    if (!session) return;
    refreshToken();
    Promise.all([getWallet(session.access_token), getOnboardFareHistory(session.access_token)])
      .then(([w, f]) => {
        setBalance(w.balance);
        setFares(f);
      })
      .catch(() => {});
  }, [session, refreshToken]);

  useFocusEffect(load);

  useEffect(() => {
    if (!session) return;
    timerRef.current = setInterval(refreshToken, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, refreshToken]);

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <Text style={styles.heroTitle}>My QR</Text>
      <Text style={styles.heroSubtitle}>Scan to pay onboard a city bus, from your wallet.</Text>
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
                <Ionicons name="qr-code-outline" size={40} color={theme.brand} />
                <Text
                  style={{
                    fontFamily: BrandFonts.headingSemiBold,
                    color: theme.text,
                    fontWeight: "800",
                    fontSize: 17,
                    marginTop: Spacing.two,
                    textAlign: "center",
                  }}
                >
                  Sign in to see your QR
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: Spacing.one, textAlign: "center" }}>
                  Scan to pay onboard a city bus, from your wallet.
                </Text>
                <Pressable
                  onPress={() => {
                    setSignInDismissed(true);
                    router.push({ pathname: "/login", params: { next: "/my-qr" } });
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
            Show this to the conductor on any city bus
          </Text>
          <View style={styles.qrWrap}>
            {token ? (
              <QRCode value={token} size={220} />
            ) : (
              <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={theme.brand} />
              </View>
            )}
            {token && (
              <View style={[styles.ringBadge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <CountdownRing key={token} durationMs={REFRESH_MS} color={theme.brand} trackColor={theme.border} />
              </View>
            )}
          </View>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Refreshes automatically. It only works while this screen is open
          </Text>
          <View style={[styles.balanceRow, { borderTopColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Wallet balance</Text>
            <Text style={{ fontFamily: BrandFonts.headingSemiBold, color: theme.text, fontWeight: "800", fontSize: 16 }}>
              {balance != null ? formatLkr(balance) : "…"}
            </Text>
          </View>
        </View>

        {error && (
          <View style={{ marginTop: Spacing.three }}>
            <Banner tone="error" message={error} />
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Recent onboard fares</Text>
        {fares == null ? (
          <ActivityIndicator color={theme.brand} style={{ marginTop: Spacing.four }} />
        ) : fares.length === 0 ? (
          <Text style={{ color: theme.textSecondary, marginTop: Spacing.two }}>
            No onboard fares yet
          </Text>
        ) : (
          <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
            {fares.map((f) => (
              <View
                key={f.id}
                style={[styles.fareRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {f.fromStopName ?? "?"} → {f.toStopName ?? "?"}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {new Date(f.createdAt).toLocaleString("en-LK", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={{ fontFamily: BrandFonts.uiSemiBold, color: theme.text, fontWeight: "700" }}>
                  {formatLkr(f.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  container: { flexGrow: 1, padding: Spacing.four },
  card: { borderWidth: 1, borderRadius: 20, padding: Spacing.four, alignItems: "center" },
  cardLabel: { fontSize: 13, textAlign: "center" },
  qrWrap: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    backgroundColor: "#fff",
    borderRadius: 16,
    position: "relative",
  },
  ringBadge: {
    position: "absolute",
    top: -10,
    right: -10,
    borderRadius: 20,
    borderWidth: 1,
    padding: 3,
  },
  hint: { fontSize: 11, textAlign: "center", marginTop: Spacing.three },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.five,
  },
  fareRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
  },
});
