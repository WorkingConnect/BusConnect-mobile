import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { deleteMyAccount, ApiError } from "@/lib/api";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

/**
 * Deleting is really "deactivate + anonymize" server-side (see
 * BusConnect-api's DELETE /me/account) — only the passenger's own
 * identifying fields are scrubbed and the account is banned from signing
 * back in. Blocked outright if the account has any booking history at all
 * (real financial history, not something an anonymize pass can paper over —
 * the API returns a 409 with a message this screen just surfaces as-is), or
 * if this same login is also used for an operator dashboard or pilot app
 * account (deleting would lock them out of those too). If there's no
 * booking history but a wallet balance, deleting cashes it out as a refund
 * admin sends by bank transfer, confirmed by SMS once processed.
 *
 * Re-verification before something this destructive: if the account has a
 * phone number on file, send a fresh OTP and require it (proves whoever's
 * holding the device right now can still receive it — protects against a
 * left-open session on a shared device). Accounts with no phone (Google
 * sign-in, never added one) fall back to typing a confirmation phrase.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const phone = session?.user.phone;
  const [stage, setStage] = useState<"confirm" | "otp">("confirm");
  const [otp, setOtp] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!phone) return;
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) return setError(error.message);
    setStage("otp");
  }

  async function finishWithOtp() {
    if (!phone) return;
    setError(null);
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    if (verifyError) {
      setLoading(false);
      return setError(verifyError.message);
    }
    await finishDelete();
  }

  async function finishWithConfirmText() {
    setError(null);
    setLoading(true);
    await finishDelete();
  }

  async function finishDelete() {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Session expired. Sign in again to delete your account.");
      await deleteMyAccount(accessToken);
      // Don't await the full signOut() — it holds a global overlay (see
      // root _layout.tsx) open for a bit on its own; navigate right away
      // while that overlay covers the transition, instead of waiting it
      // out here and then cutting to /login right as it disappears.
      void signOut();
      router.replace("/login");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function confirmAndDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your name, email, phone and NIC from BusConnect, and you won't be able to sign in again. Any wallet balance is queued for a refund by bank transfer.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => (phone ? void sendCode() : void finishWithConfirmText()),
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Delete account</Text>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={[styles.badge, { backgroundColor: "#fee2e2" }]}>
        <Ionicons name="trash-outline" size={26} color="#dc2626" />
      </View>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Accounts with any booking history can&apos;t be deleted. Contact support if you need that removed. If you
        have no bookings but still have a wallet balance, deleting your account queues it for a refund by bank
        transfer; you&apos;ll get an SMS once it&apos;s sent.
      </Text>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {stage === "confirm" ? (
          <>
            {!phone && (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Type DELETE to confirm
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder="DELETE"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                />
              </>
            )}
            {error && <Banner tone="error" message={error} />}
            <Pressable
              onPress={confirmAndDelete}
              disabled={loading || (!phone && confirmText.trim().toUpperCase() !== "DELETE")}
              style={[
                styles.button,
                {
                  backgroundColor: "#dc2626",
                  opacity: loading || (!phone && confirmText.trim().toUpperCase() !== "DELETE") ? 0.6 : 1,
                },
              ]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Delete my account</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Enter the code sent to {phone}</Text>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="6-digit code"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border, letterSpacing: 6 }]}
            />
            {error && <Banner tone="error" message={error} />}
            <Pressable
              onPress={finishWithOtp}
              disabled={loading || !otp}
              style={[styles.button, { backgroundColor: "#dc2626", opacity: loading || !otp ? 0.6 : 1 }]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & delete</Text>}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.three, alignItems: "center" }}>
          <Text style={{ color: theme.textSecondary }}>Cancel</Text>
        </Pressable>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: { alignSelf: "flex-start", marginBottom: Spacing.two },
  heroTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  container: { flexGrow: 1, padding: Spacing.four, paddingTop: Spacing.five, alignItems: "center" },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: Spacing.three },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: Spacing.two, marginBottom: Spacing.five, lineHeight: 20, maxWidth: 320 },
  card: { width: "100%", borderWidth: 1, borderRadius: 20, padding: Spacing.four },
  fieldLabel: { fontFamily: BrandFonts.uiSemiBold, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: { fontFamily: BrandFonts.uiRegular, borderWidth: 1, borderRadius: 12, padding: Spacing.three, fontSize: 16, marginBottom: Spacing.three },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
});
