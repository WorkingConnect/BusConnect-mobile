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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";
import { updateMyProfile } from "@/lib/api";
import { PhoneField } from "@/components/phone-field";
import { Banner } from "@/components/banner";
import { toE164 } from "@/lib/phone";
import { Spacing, BrandFonts } from "@/constants/theme";

export default function SignUpScreen() {
  const theme = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goNext() {
    router.replace(((next as string) || "/") as Href);
  }

  async function createAccount() {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      phone: toE164(phone),
      password,
      options: { data: { full_name: name } },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setStage("otp");
  }

  async function verifyAndFinish() {
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token: otp,
      type: "sms",
    });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }
    const accessToken = data.session?.access_token;
    try {
      if (accessToken) {
        await updateMyProfile(accessToken, { name });
      }
    } catch {
      // Profile fields can still be filled in later from the Profile tab —
      // don't block account creation on this best-effort backfill.
    } finally {
      setLoading(false);
    }
    goNext();
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <SafeAreaView
        edges={["top"]}
        style={[styles.hero, { backgroundColor: theme.brand }]}
      >
        <Image
          source={require("../../assets/images/applogo.png")}
          style={styles.logo}
        />
        <Text style={styles.heroTitle}>Create your account</Text>
        <Text style={styles.heroSubtitle}>
          {stage === "details"
            ? "Just a few details, then we'll verify your number with a one-time code."
            : `Enter the code sent to ${toE164(phone)}.`}
        </Text>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            {stage === "details" ? (
              <>
                <Field
                  icon="person-outline"
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                  theme={theme}
                />
                <View style={{ marginBottom: Spacing.three }}>
                  <Text
                    style={[styles.fieldLabel, { color: theme.textSecondary }]}
                  >
                    Phone number
                  </Text>
                  <PhoneField value={phone} onChangeText={setPhone} />
                </View>
                <Field
                  icon="lock-closed-outline"
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoComplete="new-password"
                  theme={theme}
                />

                {error && <Banner tone="error" message={error} />}
                <Pressable
                  onPress={createAccount}
                  disabled={loading || !name || !phone || !password}
                  style={[
                    styles.button,
                    {
                      backgroundColor: theme.brand,
                      opacity:
                        loading || !name || !phone || !password ? 0.6 : 1,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      Send verification code
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Field
                  icon="keypad-outline"
                  label="One-time code"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  letterSpacing={6}
                  theme={theme}
                />
                {error && <Banner tone="error" message={error} />}
                <Pressable
                  onPress={verifyAndFinish}
                  disabled={loading || !otp}
                  style={[
                    styles.button,
                    {
                      backgroundColor: theme.brand,
                      opacity: loading || !otp ? 0.6 : 1,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      Verify & create account
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() =>
                router.replace({
                  pathname: "/login",
                  params: { next: (next as string) || undefined },
                })
              }
              style={{ marginTop: Spacing.four, alignItems: "center" }}
            >
              <Text style={{ color: theme.textSecondary }}>
                Already have an account?{" "}
                <Text style={{ color: theme.brand, fontWeight: "700" }}>
                  Sign in
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoComplete,
  secureTextEntry,
  letterSpacing,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "phone-pad" | "email-address" | "number-pad";
  autoComplete?: "tel" | "new-password" | "one-time-code";
  secureTextEntry?: boolean;
  letterSpacing?: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ marginBottom: Spacing.three }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View style={[styles.inputWrap, { borderColor: theme.border }]}>
        <Ionicons name={icon} size={18} color={theme.textSecondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, letterSpacing }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: Spacing.five, alignItems: "center" },
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
  form: { width: "100%" },
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
    marginTop: Spacing.one,
  },
  buttonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
});
