import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import { router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { topupWallet, ApiError, type MpgsCheckoutSession } from "@/lib/api";
import { BrandFonts, Spacing } from "@/constants/theme";

const PRESET_AMOUNTS = [500, 1000, 1500, 2000, 5000];
const MIN_AMOUNT = 500;

/** Same MPGS Hosted Checkout shell as the booking checkout screen — see
 *  checkout/[id].tsx for why the callbacks are function *names*, not URLs. */
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
      // outside the try/catch below when this document has no real origin.
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

type Stage = "amount" | "starting" | "checkout";

export default function WalletTopupScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [stage, setStage] = useState<Stage>("amount");
  const [amountText, setAmountText] = useState(String(PRESET_AMOUNTS[0]));
  const [checkout, setCheckout] = useState<MpgsCheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(amountText);
  const validAmount = amount >= MIN_AMOUNT;

  function startCheckout() {
    if (!session || !validAmount) return;
    setError(null);
    setStage("starting");
    topupWallet(session.access_token, amount)
      .then((c) => {
        setCheckout(c);
        setStage("checkout");
      })
      .catch((e) => {
        console.log(
          "[wallet topup] startCheckout failed:",
          e instanceof ApiError ? `ApiError status=${e.status} message=${e.message}` : String(e),
        );
        setError(e instanceof ApiError ? e.message : "Could not start top-up.");
        setStage("amount");
      });
  }

  // MPGS's return_url resolves through our API to `${webBaseUrl}/wallet?...`
  // — once the WebView reaches that, hand off to the native wallet screen.
  // Must NOT match our own API's intermediate return endpoint
  // (`/api/wallet/mpgs/return`), which also contains "/wallet" — matching it
  // there blocks the WebView from ever loading that URL via
  // onShouldStartLoadWithRequest, so the backend confirmation handler that
  // credits the balance, logs the transaction, and sends SMS never runs.
  function isFinalWalletPage(url: string) {
    return url.includes("/wallet") && !url.includes("/api/");
  }
  function backToWallet() {
    router.replace("/wallet");
  }

  function onNavigate(nav: WebViewNavigation) {
    if (isFinalWalletPage(nav.url)) backToWallet();
  }

  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "error") {
        console.log("[mpgs webview topup] error:", data.err);
        setError("Payment could not start. Please try again.");
        setStage("amount");
      }
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
        <Text style={styles.heroTitle}>Top Up Wallet</Text>
        <View style={styles.backButton} />
      </View>
      <Text style={styles.heroSubtitle}>Recharge Your Wallet</Text>
    </SafeAreaView>
  );

  if (stage === "checkout" && checkout) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <WebView
          style={{ flex: 1 }}
          // baseUrl gives this raw-HTML document a real https:// origin —
          // without it MPGS's checkout.min.js throws inside
          // Checkout.configure() (see checkout/[id].tsx for the full story).
          source={{ html: checkoutHtml(checkout), baseUrl: "https://busconnect.lk" }}
          onNavigationStateChange={onNavigate}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(req) => {
            if (isFinalWalletPage(req.url)) {
              backToWallet();
              return false;
            }
            return true;
          }}
          // Forces a mobile viewport on every page this WebView navigates to
          // (including MPGS's real hosted page after showPaymentPage()'s
          // internal redirect) — the <meta> baked into checkoutHtml() only
          // covers our own bootstrap document. See checkout/[id].tsx.
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
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: theme.background }]}>
              <ActivityIndicator color={theme.brand} />
            </View>
          )}
        />
      </View>
    );
  }

  if (stage === "starting") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
          <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
            Redirecting to secure checkout…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          Amount{" "}
          {validAmount ? "" : `(Minimum top-up amount is LKR ${MIN_AMOUNT}.)`}
        </Text>
        <View
          style={[
            styles.amountInputWrap,
            {
              borderColor: theme.border,
              backgroundColor: theme.backgroundElement,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: BrandFonts.uiRegular,
              color: theme.textSecondary,
              fontSize: 16,
              marginRight: 6,
            }}
          >
            LKR
          </Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            style={[styles.amountInput, { color: theme.text }]}
          />
        </View>

        <View style={styles.presetRow}>
          {PRESET_AMOUNTS.map((v) => {
            const active = amount === v;
            return (
              <Pressable
                key={v}
                onPress={() => setAmountText(String(v))}
                style={[
                  styles.presetChip,
                  {
                    borderColor: active ? theme.brand : theme.border,
                    backgroundColor: active
                      ? theme.backgroundSelected
                      : "transparent",
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: BrandFonts.uiSemiBold,
                    color: active ? theme.brand : theme.text,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  LKR {v.toLocaleString("en-LK")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <Text
            style={{ color: "#dc2626", fontSize: 13, marginTop: Spacing.five }}
          >
            {error}
          </Text>
        )}

        <Pressable
          onPress={startCheckout}
          disabled={!validAmount}
          style={[
            styles.submitButton,
            { backgroundColor: theme.brand, opacity: validAmount ? 1 : 0.5 },
          ]}
        >
          <Text style={styles.submitButtonText}>Top Up Wallet</Text>
        </Pressable>
      </ScrollView>
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
    fontFamily: BrandFonts.headingSemiBold,
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
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six },
  sectionLabel: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
  amountInput: {
    fontFamily: BrandFonts.uiSemiBold,
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    paddingVertical: Spacing.two,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: Spacing.five,
  },
  submitButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
