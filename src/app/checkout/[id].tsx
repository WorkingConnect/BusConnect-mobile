import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import {
  checkoutBooking,
  cancelBooking,
  getBooking,
  getWallet,
  payBookingFromWallet,
  ApiError,
  type Booking,
  type MpgsCheckoutSession,
  type Wallet,
} from "@/lib/api";
import { Spacing } from "@/constants/theme";

function formatLkr(amount: number) {
  return `LKR ${amount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}


/**
 * A minimal HTML shell that loads MPGS's hosted-checkout SDK and hands it
 * only the session id — the SDK then does a full-page redirect to MPGS's own
 * payment page inside this WebView. data-error/data-cancel are function
 * *names* the SDK looks up on window, not URLs; they only fire for a problem
 * before the page ever leaves (bad/expired session) — there is no
 * client-side success callback for this flow at all.
 */
function checkoutHtml(checkout: MpgsCheckoutSession) {
  return `<!doctype html><html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>html, body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <script>
      window.mpgsErrorCallback = function (err) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", err: String(err) }));
      };
      window.mpgsCancelCallback = function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "cancel" }));
      };
      // Global safety net — Checkout.configure() can throw asynchronously
      // outside the try/catch below (observed when this document had no
      // baseUrl, so window.onerror is worth keeping even now that it does).
      window.onerror = function (message) {
        window.mpgsErrorCallback(message);
      };
    </script>
    <script
      src="${checkout.checkoutJsUrl}"
      data-error="mpgsErrorCallback"
      data-cancel="mpgsCancelCallback"
      onerror="window.mpgsErrorCallback('checkout.min.js failed to load')"
    ></script>
    <script>
      (async function () {
        try {
          await window.Checkout.configure({ session: { id: "${checkout.sessionId}" } });
          await window.Checkout.showPaymentPage();
        } catch (err) {
          window.mpgsErrorCallback(err);
        }
      })();
    </script>
  </body></html>`;
}

type Stage = "loading" | "choose" | "wallet-confirm" | "wallet-paying" | "card";

export default function CheckoutScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [checkout, setCheckout] = useState<MpgsCheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const amount = booking?.amount ?? null;
  const expiresAt = booking?.holds?.[0]?.expires_at ?? null;
  // The operator's own rate — every operator has one (default 2%), server-
  // computed the same way on both charging paths (mpgs.service.ts,
  // pay_booking_from_wallet()). Falls back to 2 only if it's ever missing.
  const convenienceFeePct = booking?.trip?.bus?.operator?.convenience_fee_pct ?? 2;

  // The seat hold behind this booking runs out ~8 minutes after the seats
  // were first selected on the seat map (create_booking() links the same
  // seat_holds rows, it doesn't reset their TTL) — count it down here so the
  // payer knows the seats can be given back to someone else.
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    function tick() {
      const remaining = Math.max(
        0,
        Math.round((new Date(expiresAt as string).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Backing out of checkout to the seat map should give the seats back
  // immediately rather than making everyone else wait out the full TTL.
  function goBack() {
    if (id && session && booking?.status === "pending") {
      void cancelBooking(session.access_token, id).catch(() => {
        // Best-effort — expire_holds() (pg_cron) frees the seats anyway once
        // the TTL lapses, so a failed release here isn't user-facing.
      });
    }
    router.back();
  }

  useEffect(() => {
    if (!id || !session) return;
    Promise.all([
      getBooking(session.access_token, id),
      getWallet(session.access_token),
    ])
      .then(([b, w]) => {
        setBooking(b);
        setWallet(w);
        setStage("choose");
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Could not load this booking.",
        ),
      );
  }, [id, session]);

  function payWithCard() {
    if (!id || !session) return;
    setStage("card");
    checkoutBooking(session.access_token, id)
      .then(setCheckout)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Could not start payment.",
        ),
      );
  }

  // "Pay from wallet" no longer pays immediately — it opens a confirmation
  // step (wallet balance + booking details) with an explicit pay action.
  function reviewWalletPayment() {
    setError(null);
    setStage("wallet-confirm");
  }

  function confirmWalletPayment() {
    if (!id || !session) return;
    setStage("wallet-paying");
    payBookingFromWallet(session.access_token, id)
      .then(() =>
        router.replace({ pathname: "/bookings/[id]", params: { id } }),
      )
      .catch((e) => {
        setError(
          e instanceof ApiError ? e.message : "Could not pay from wallet.",
        );
        setStage("wallet-confirm");
      });
  }

  function onNavigate(nav: WebViewNavigation) {
    // MPGS's return_url resolves through our API to
    // `${webBaseUrl}/bookings/{id}?...` — once the WebView reaches that,
    // hand off to the native ticket screen instead of rendering the web page.
    if (id && nav.url.includes(`/bookings/${id}`)) {
      router.replace({ pathname: "/bookings/[id]", params: { id } });
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "error") {
        setError("Payment could not start. Please try again.");
      }
      // "cancel" is rare for this redirect mode; leave the WebView showing.
    } catch {
      // ignore malformed messages
    }
  }

  const hero = (
    <SafeAreaView
      edges={["top"]}
      style={[styles.hero, { backgroundColor: theme.brand }]}
    >
      <View style={styles.heroTopRow}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Payment</Text>
        <View style={styles.backButton} />
      </View>
      <Text style={styles.heroSubtitle}>Choose how you&apos;d like to pay</Text>
    </SafeAreaView>
  );

  if (error && stage !== "choose" && stage !== "wallet-confirm") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>{error}</Text>
        </View>
      </View>
    );
  }

  if (stage === "loading" || (stage === "card" && !checkout)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
          <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
            {stage === "card" ? "Redirecting to secure checkout…" : "Loading…"}
          </Text>
        </View>
      </View>
    );
  }

  if (stage === "wallet-paying") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
          <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
            Paying from your wallet…
          </Text>
        </View>
      </View>
    );
  }

  if (stage === "choose") {
    const insufficientWallet =
      wallet !== null && amount !== null && wallet.balance < amount;
    const expired = secondsLeft === 0;
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.chooseContainer}>
          {booking && (
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              {booking.trip?.bus?.operator?.name && (
                <View style={styles.operatorRow}>
                  {booking.trip.bus.operator.logo_url ? (
                    <Image
                      source={{ uri: booking.trip.bus.operator.logo_url }}
                      style={styles.operatorLogo}
                    />
                  ) : (
                    <View style={[styles.operatorLogo, styles.operatorLogoFallback, { backgroundColor: theme.brand }]}>
                      <Ionicons name="bus" size={16} color="#fff" />
                    </View>
                  )}
                  <Text style={[styles.operatorName, { color: theme.text }]}>
                    {booking.trip.bus.operator.name}
                  </Text>
                </View>
              )}

              <View style={styles.routeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routeLabel, { color: theme.textSecondary }]}>
                    From
                  </Text>
                  <Text style={[styles.routeValue, { color: theme.text }]}>
                    {booking.from_stop?.location?.name_en ?? "—"}
                  </Text>
                </View>
                <View style={styles.routeLine}>
                  <View style={[styles.routeDash, { borderColor: theme.border }]} />
                  <Ionicons name="arrow-forward" size={14} color={theme.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.routeLabel, { color: theme.textSecondary, textAlign: "right" }]}
                  >
                    To
                  </Text>
                  <Text style={[styles.routeValue, { color: theme.text, textAlign: "right" }]}>
                    {booking.to_stop?.location?.name_en ?? "—"}
                  </Text>
                </View>
              </View>

              <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

              <View style={styles.detailsGrid}>
                <View style={styles.detailsRow}>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Date
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {booking.trip?.depart_at
                        ? new Date(booking.trip.depart_at).toLocaleDateString("en-LK", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Time
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {booking.trip?.depart_at
                        ? new Date(booking.trip.depart_at).toLocaleTimeString("en-LK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailsRow}>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Passenger
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {booking.seats.length}
                    </Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      Seat no.
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {booking.seats.join(", ")}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

              <View style={styles.summaryRow}>
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Subtotal</Text>
                <Text style={{ color: theme.text, fontSize: 14 }}>
                  {formatLkr(booking.amount)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                  Convenience fee ({convenienceFeePct}%)
                </Text>
                <Text style={{ color: theme.text, fontSize: 14 }}>
                  {formatLkr(booking.amount * (convenienceFeePct / 100))}
                </Text>
              </View>

              <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

              <View style={styles.summaryRow}>
                <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>
                  Amount due
                </Text>
                <Text style={{ color: theme.brand, fontWeight: "800", fontSize: 16 }}>
                  {formatLkr(booking.amount * (1 + convenienceFeePct / 100))}
                </Text>
              </View>
            </View>
          )}

          {secondsLeft !== null && (
            <View style={styles.holdTimerRow}>
              <Ionicons
                name="time-outline"
                size={14}
                color={expired ? "#dc2626" : theme.textSecondary}
              />
              <Text
                style={[
                  styles.holdTimerText,
                  { color: expired ? "#dc2626" : theme.textSecondary },
                ]}
              >
                {expired
                  ? "Seat hold expired"
                  : `Seats held for ${formatCountdown(secondsLeft)}`}
              </Text>
            </View>
          )}

          {expired && (
            <Text style={[styles.expiredHint, { color: theme.textSecondary }]}>
              These seats may have been given to someone else. Go back and
              select seats again.
            </Text>
          )}

          {error && (
            <Text
              style={{ color: "#dc2626", fontSize: 13, marginTop: Spacing.two }}
            >
              {error}
            </Text>
          )}

          <Pressable
            onPress={reviewWalletPayment}
            disabled={insufficientWallet || expired}
            style={[
              styles.methodButton,
              {
                borderColor: theme.border,
                opacity: insufficientWallet || expired ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name="wallet-outline" size={20} color={theme.brand} />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}
              >
                Pay from wallet
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Balance: {formatLkr(wallet?.balance ?? 0)}
                {insufficientWallet ? " · Insufficient balance" : ""}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>

          <Pressable
            onPress={payWithCard}
            disabled={expired}
            style={[
              styles.methodButton,
              { borderColor: theme.border, opacity: expired ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="card-outline" size={20} color={theme.brand} />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}
              >
                Pay with card
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Secure checkout
              </Text>
            </View>
            <Image
              source={require("../../../assets/images/payment.jpeg")}
              style={styles.cardLogos}
              resizeMode="contain"
            />
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  if (stage === "wallet-confirm" && booking) {
    const totalWithFee = booking.amount * (1 + convenienceFeePct / 100);
    const insufficientWallet = wallet !== null && wallet.balance < totalWithFee;
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.chooseContainer}>
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
              Wallet balance
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              {formatLkr(wallet?.balance ?? 0)}
            </Text>

            <View style={[styles.dashedDivider, { borderColor: theme.border }]} />

            <View style={styles.summaryRow}>
              <Text style={{ color: theme.textSecondary }}>Amount to pay</Text>
              <Text style={{ color: theme.brand, fontWeight: "800" }}>
                {formatLkr(totalWithFee)}
              </Text>
            </View>
          </View>

          {error && (
            <Text style={{ color: "#dc2626", fontSize: 13, marginTop: Spacing.three }}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={confirmWalletPayment}
            disabled={insufficientWallet}
            style={[
              styles.payButton,
              { backgroundColor: theme.brand, opacity: insufficientWallet ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.payButtonLabel}>
              {insufficientWallet ? "Insufficient balance" : `Pay ${formatLkr(totalWithFee)}`}
            </Text>
          </Pressable>

          <Pressable onPress={() => setStage("choose")} style={styles.backLink}>
            <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>
              Choose a different payment method
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!checkout) return null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <WebView
        style={{ flex: 1 }}
        // baseUrl gives this raw-HTML document a real https:// origin instead
        // of null/about:blank. Without it, MPGS's checkout.min.js throws an
        // uncaught error inside Checkout.configure() (masked as a generic
        // cross-origin "Script error." by the browser's same-origin script
        // error policy) — almost certainly an anti-embedding origin check in
        // their SDK rejecting a document with no real origin.
        source={{ html: checkoutHtml(checkout), baseUrl: "https://busconnect.lk" }}
        onNavigationStateChange={onNavigate}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          if (id && req.url.includes(`/bookings/${id}`)) {
            router.replace({ pathname: "/bookings/[id]", params: { id } });
            return false;
          }
          return true;
        }}
        // The viewport meta tag baked into checkoutHtml() only covers our own
        // bootstrap document — showPaymentPage() then navigates the WebView
        // to MPGS's own hosted page, a completely different document our
        // meta tag never touches. injectedJavaScriptBeforeContentLoaded runs
        // on every navigation in this WebView (unlike source.html), so it's
        // the only way to force a mobile-sized viewport on MPGS's real page.
        injectedJavaScriptBeforeContentLoaded={`
          (function () {
            var meta = document.querySelector('meta[name="viewport"]');
            if (!meta) {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              document.head && document.head.appendChild(meta);
            }
            meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';
          })();
          true;
        `}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]}>
            <ActivityIndicator color={theme.brand} />
          </View>
        )}
      />
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
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.one,
  },
  chooseContainer: { flex: 1, padding: Spacing.four },
  amountLabel: { fontSize: 13, textAlign: "center" },
  amountValue: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
    marginBottom: Spacing.five,
  },
  methodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  cardLogos: { width: 64, height: 22 },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  summaryTitle: { fontSize: 16, fontWeight: "800", marginBottom: Spacing.three },
  operatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  operatorLogo: { width: 32, height: 32, borderRadius: 8 },
  operatorLogoFallback: { alignItems: "center", justifyContent: "center" },
  operatorName: { fontSize: 15, fontWeight: "700" },
  routeRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  routeLabel: { fontSize: 11, marginBottom: 2 },
  routeValue: { fontSize: 14, fontWeight: "700" },
  routeLine: { flexDirection: "row", alignItems: "center", width: 40 },
  routeDash: { flex: 1, borderTopWidth: 1, borderStyle: "dashed" },
  chipRow: { flexDirection: "row", gap: Spacing.two, marginTop: Spacing.three },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  detailsGrid: { marginTop: Spacing.one, gap: Spacing.three },
  detailsRow: { flexDirection: "row" },
  detailCell: { flex: 1, gap: 2 },
  detailLabel: { fontSize: 11 },
  detailValue: { fontSize: 14, fontWeight: "700" },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginVertical: Spacing.three,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  payButton: {
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: Spacing.four,
  },
  payButtonLabel: { color: "#fff", fontWeight: "800", fontSize: 16 },
  backLink: { alignItems: "center", paddingVertical: Spacing.three, marginTop: Spacing.two },
  holdTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: Spacing.three,
  },
  holdTimerText: { fontSize: 13, fontWeight: "600" },
  expiredHint: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: Spacing.three,
  },
});
