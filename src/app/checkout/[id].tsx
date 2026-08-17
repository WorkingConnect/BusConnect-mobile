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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const amount = booking?.amount ?? null;

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
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backButton}
        >
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
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.chooseContainer}>
          <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
            Amount due
          </Text>
          <Text style={[styles.amountValue, { color: theme.text }]}>
            {amount !== null ? formatLkr(amount) : "—"}
          </Text>

          {error && (
            <Text
              style={{ color: "#dc2626", fontSize: 13, marginTop: Spacing.two }}
            >
              {error}
            </Text>
          )}

          <Pressable
            onPress={reviewWalletPayment}
            disabled={insufficientWallet}
            style={[
              styles.methodButton,
              {
                borderColor: theme.border,
                opacity: insufficientWallet ? 0.5 : 1,
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
            style={[styles.methodButton, { borderColor: theme.border }]}
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
    const insufficientWallet = wallet !== null && wallet.balance < booking.amount;
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

            {booking.trip?.bus?.operator?.name && (
              <View style={styles.summaryRow}>
                <Text style={{ color: theme.textSecondary }}>Operator</Text>
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  {booking.trip.bus.operator.name}
                </Text>
              </View>
            )}
            {booking.from_stop?.location?.name_en && (
              <View style={styles.summaryRow}>
                <Text style={{ color: theme.textSecondary }}>Pickup point</Text>
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  {booking.from_stop.location.name_en}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={{ color: theme.textSecondary }}>Seats</Text>
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {booking.seats.join(", ")}
              </Text>
            </View>
            {booking.trip?.depart_at && (
              <View style={styles.summaryRow}>
                <Text style={{ color: theme.textSecondary }}>Departs</Text>
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  {formatDateTime(booking.trip.depart_at)}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={{ color: theme.textSecondary }}>Reference</Text>
              <Text style={{ color: theme.text }}>
                {booking.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={{ color: theme.textSecondary }}>Amount to pay</Text>
              <Text style={{ color: theme.brand, fontWeight: "800" }}>
                {formatLkr(booking.amount)}
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
              {insufficientWallet ? "Insufficient balance" : `Pay ${formatLkr(booking.amount)}`}
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
});
