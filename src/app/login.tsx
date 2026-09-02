import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { PhoneField } from "@/components/phone-field";
import { Banner } from "@/components/banner";
import { toE164 } from "@/lib/phone";
import { Spacing, BrandFonts } from "@/constants/theme";

export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goNext() {
    // `next` is a dynamic, runtime-constructed path (e.g. "/trips/abc?from=x")
    // that typed routes can't statically validate — Href is the documented
    // escape hatch for exactly this case.
    router.replace(((next as string) || "/") as Href);
  }

  async function signIn() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      phone: toE164(phone),
      password,
    });
    setLoading(false);
    if (error) return setError(error.message);
    goNext();
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={["top"]}
        style={[styles.hero, { backgroundColor: theme.brand }]}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push("/"))}
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + Spacing.three }]}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Image
          source={require("../../assets/images/applogo.png")}
          style={styles.logo}
        />
        <Text style={styles.heroTitle}>Welcome back</Text>
        <Text style={styles.heroSubtitle}>
          Sign in with your phone number and password.
        </Text>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.formArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Phone number
            </Text>
            <PhoneField value={phone} onChangeText={setPhone} />

            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textSecondary, marginTop: Spacing.three },
              ]}
            >
              Password
            </Text>
            <View style={[styles.inputWrap, { borderColor: theme.border }]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={theme.textSecondary}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                autoComplete="current-password"
                style={[styles.input, { color: theme.text }]}
              />
            </View>

            {error && (
              <View style={{ marginTop: Spacing.three }}>
                <Banner tone="error" message={error} />
              </View>
            )}

            <Pressable
              onPress={() => router.push("/forgot-password")}
              style={{ marginTop: Spacing.two, alignSelf: "flex-end" }}
            >
              <Text
                style={{ color: theme.brand, fontWeight: "600", fontSize: 13 }}
              >
                Forgot password?
              </Text>
            </Pressable>

            <Pressable
              onPress={signIn}
              disabled={loading || !phone || !password}
              style={[
                styles.button,
                {
                  backgroundColor: theme.brand,
                  opacity: loading || !phone || !password ? 0.6 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/signup",
                  params: { next: (next as string) || undefined },
                })
              }
              style={{ marginTop: Spacing.three, alignItems: "center" }}
            >
              <Text style={{ color: theme.textSecondary }}>
                New to BusConnect?{" "}
                <Text style={{ color: theme.brand, fontWeight: "700" }}>
                  Sign up
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  closeButton: {
    position: "absolute",
    top: Spacing.three,
    left: Spacing.four,
    zIndex: 1,
  },
  formArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.four,
    justifyContent: "center",
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginBottom: Spacing.three,
  },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: Spacing.one,
    lineHeight: 19,
    maxWidth: 300,
  },
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
    marginTop: Spacing.five,
  },
  fieldLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  input: { fontFamily: BrandFonts.uiRegular, flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing.four,
  },
  buttonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
});
