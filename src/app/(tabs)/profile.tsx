import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useTheme } from "@/hooks/use-theme";
import { useThemeMode } from "@/lib/theme-mode-context";
import { useAuth } from "@/lib/auth";
import {
  getMyProfile,
  updateMyProfile,
  ApiError,
  type MyProfile,
} from "@/lib/api";
import { PhoneField } from "@/components/phone-field";
import { stripCountryCode, toE164, formatPhoneDisplay } from "@/lib/phone";
import {
  getPushNotificationsEnabled,
  setPushNotificationsEnabled,
} from "@/lib/notification-preference";
import {
  registerForPushNotifications,
  unregisterCurrentPushToken,
} from "@/lib/push-notifications";
import { openStoreReview, openWhatsAppSupport } from "@/lib/app-links";
import { Banner } from "@/components/banner";
import { Spacing, BottomTabInset, BrandFonts } from "@/constants/theme";

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, loading: authLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleSignOut() {
    // signOut() itself holds a brief global overlay (see root _layout.tsx)
    // while the tabs layout's own auth-gate redirect takes over navigation.
    await signOut();
  }

  useEffect(() => {
    if (!session) return;
    getMyProfile(session.access_token)
      .then(setProfile)
      .catch((e) =>
        setLoadError(
          e instanceof ApiError ? e.message : "Could not reach BusConnect-api.",
        ),
      );
  }, [session]);

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/login", params: { next: "/profile" } })
          }
        >
          <Text style={{ color: theme.brand, fontWeight: "600", fontSize: 16 }}>
            Sign in to view your profile
          </Text>
        </Pressable>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <View style={{ width: "100%", paddingHorizontal: Spacing.four }}>
          <Banner tone="error" message={loadError} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ProfileHero profile={profile} theme={theme} />

          <ProfileForm
            profile={profile}
            accessToken={session.access_token}
            provider={session.user.app_metadata?.provider ?? null}
            onSaved={setProfile}
            theme={theme}
          />

          <PreferencesSection theme={theme} session={session} />
          <SupportSection theme={theme} />

          <Pressable onPress={handleSignOut} style={styles.dangerButton}>
            <Ionicons name="log-out-outline" size={17} color="#fff" />
            <Text style={styles.dangerButtonText}>Sign out</Text>
          </Pressable>

          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textSecondary, marginTop: Spacing.four },
            ]}
          >
            Danger zone
          </Text>
          <Pressable
            onPress={() => router.push("/delete-account")}
            style={styles.dangerButton}
          >
            <Ionicons name="trash-outline" size={17} color="#fff" />
            <Text style={styles.dangerButtonText}>Delete account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ProfileHero({
  profile,
  theme,
}: {
  profile: MyProfile;
  theme: ReturnType<typeof useTheme>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (profile.avatar_url !== failedUrl && imageFailed) setImageFailed(false);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.hero, { backgroundColor: theme.brand }]}
    >
      {profile.avatar_url && !imageFailed ? (
        <Image
          source={{ uri: profile.avatar_url }}
          style={styles.avatar}
          onError={() => {
            setFailedUrl(profile.avatar_url);
            setImageFailed(true);
          }}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={40} color="rgba(255,255,255,0.85)" />
        </View>
      )}
      <Text style={styles.heroName}>{profile.name || "Add your name"}</Text>
      <Text style={styles.heroSubtitle}>
        {formatPhoneDisplay(profile.phone)}
      </Text>
    </SafeAreaView>
  );
}

function ProfileForm({
  profile,
  accessToken,
  provider,
  onSaved,
  theme,
}: {
  profile: MyProfile;
  accessToken: string;
  provider: string | null;
  onSaved: (p: MyProfile) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(stripCountryCode(profile.phone));
  const [email, setEmail] = useState(profile.email ?? "");
  const [nic, setNic] = useState(profile.nic ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Google owns the email on a Google sign-in; the phone number is the login
  // credential itself on phone-OTP sign-in — neither is safe to edit here.
  const emailLocked = provider === "google";
  const phoneLocked = provider === "phone";

  function startEditing() {
    setError(null);
    setSaved(false);
    setName(profile.name ?? "");
    setPhone(stripCountryCode(profile.phone));
    setEmail(profile.email ?? "");
    setNic(profile.nic ?? "");
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  async function submit() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      setStatus("Saving…");
      const updated = await updateMyProfile(accessToken, {
        name: name || undefined,
        phone: phoneLocked ? undefined : phone ? toE164(phone) : undefined,
        email: emailLocked ? undefined : email || undefined,
        nic: nic || undefined,
      });
      onSaved(updated);
      setSaved(true);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <View
      style={[
        styles.card,
        styles.firstCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Personal information
        </Text>
        {!isEditing && (
          <Pressable onPress={startEditing} hitSlop={8} style={styles.editLink}>
            <Text
              style={{ color: theme.brand, fontWeight: "600", fontSize: 13 }}
            >
              Edit
            </Text>
          </Pressable>
        )}
      </View>

      {isEditing ? (
        <>
          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            theme={theme}
          />

          {!phoneLocked && (
            <View style={{ marginTop: Spacing.three }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Phone number
              </Text>
              <PhoneField value={phone} onChangeText={setPhone} />
            </View>
          )}

          <Field
            label="NIC"
            value={nic}
            onChangeText={setNic}
            placeholder="200012345678 or 991234567V"
            theme={theme}
          />

          {!emailLocked && (
            <Field
              label="Email address (optional)"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.lk"
              keyboardType="email-address"
              theme={theme}
            />
          )}

          {error && (
            <View style={{ marginTop: Spacing.two }}>
              <Banner tone="error" message={error} />
            </View>
          )}

          <View style={styles.editActionsRow}>
            <Pressable
              onPress={cancelEditing}
              disabled={busy}
              style={[
                styles.cancelButton,
                { borderColor: theme.border, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "600" }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={busy}
              style={[
                styles.saveButton,
                {
                  backgroundColor: theme.brand,
                  opacity: busy ? 0.6 : 1,
                  flex: 1,
                  marginTop: 0,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {status ?? "Save changes"}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <View style={{ marginTop: Spacing.two }}>
          <ReadOnlyRow label="Full name" value={profile.name} theme={theme} />
          <ReadOnlyRow
            label="Phone number"
            value={formatPhoneDisplay(profile.phone)}
            theme={theme}
          />
          <ReadOnlyRow label="NIC" value={profile.nic} theme={theme} />
          {!emailLocked && (
            <ReadOnlyRow
              label="Email address"
              value={profile.email}
              theme={theme}
              last
              stack
            />
          )}
          {saved && (
            <Text style={{ color: "#059669", marginTop: Spacing.two }}>
              Saved.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function ReadOnlyRow({
  label,
  value,
  theme,
  last,
  stack,
}: {
  label: string;
  value: string | null | undefined;
  theme: ReturnType<typeof useTheme>;
  last?: boolean;
  /** Label above value instead of side-by-side — for values too long to sit
   *  next to the label without an awkward mid-word wrap (e.g. an email). */
  stack?: boolean;
}) {
  const rowStyle = [
    stack ? styles.readOnlyRowStack : styles.readOnlyRow,
    !last && {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
  ];

  if (stack) {
    return (
      <View style={rowStyle}>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{label}</Text>
        <Text
          style={{
            color: theme.text,
            fontWeight: "600",
            fontSize: 14,
            marginTop: 4,
          }}
        >
          {value || "—"}
        </Text>
      </View>
    );
  }

  return (
    <View style={rowStyle}>
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          color: theme.text,
          fontWeight: "600",
          fontSize: 14,
          flexShrink: 1,
          marginLeft: Spacing.two,
          textAlign: "right",
        }}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function PreferencesSection({
  theme,
  session,
}: {
  theme: ReturnType<typeof useTheme>;
  session: Session | null;
}) {
  const { mode, setMode } = useThemeMode();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void getPushNotificationsEnabled().then(setPushEnabled);
  }, []);

  // Actually registers/unregisters this device's Expo push token with the
  // backend (not just a local preference flag) — turning this off means
  // pushes genuinely stop arriving, not just that the app stops asking.
  async function togglePush(next: boolean) {
    if (!session) return;
    setPushEnabled(next);
    setPushBusy(true);
    try {
      if (next) {
        await registerForPushNotifications(session.access_token);
      } else {
        await unregisterCurrentPushToken(session.access_token);
      }
      await setPushNotificationsEnabled(next);
    } finally {
      setPushBusy(false);
    }
  }

  const modes: {
    key: "light" | "dark" | "system";
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "light", label: "Light", icon: "sunny-outline" },
    { key: "dark", label: "Dark", icon: "moon-outline" },
    { key: "system", label: "System", icon: "phone-portrait-outline" },
  ];

  return (
    <View style={{ marginTop: Spacing.four }}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        Preferences
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <Text
          style={[
            styles.fieldLabel,
            { color: theme.textSecondary, marginBottom: Spacing.two },
          ]}
        >
          Appearance
        </Text>
        <View style={styles.segmentRow}>
          {modes.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[
                  styles.segment,
                  {
                    borderColor: theme.border,
                    backgroundColor: active ? theme.brand : "transparent",
                  },
                ]}
              >
                <Ionicons
                  name={m.icon}
                  size={15}
                  color={active ? "#fff" : theme.textSecondary}
                />
                <Text
                  style={{
                    color: active ? "#fff" : theme.text,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}
            >
              Push notifications
            </Text>
            <Text
              style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}
            >
              Trip updates and alerts
            </Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={togglePush}
            disabled={pushBusy || !session}
            trackColor={{ true: theme.brand }}
          />
        </View>
      </View>
    </View>
  );
}

function SupportSection({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginTop: Spacing.four }}>
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        Support
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            gap: 0,
          },
        ]}
      >
        <Pressable
          onPress={() => void openStoreReview()}
          style={styles.linkRow}
        >
          <Ionicons name="star-outline" size={16} color={theme.textSecondary} />
          <Text
            style={{ color: theme.text, fontWeight: "600", fontSize: 14, flex: 1 }}
          >
            Rate us
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <View
          style={[styles.compactDivider, { backgroundColor: theme.border }]}
        />
        <Pressable
          onPress={() => void openWhatsAppSupport()}
          style={styles.linkRow}
        >
          <Ionicons
            name="logo-whatsapp"
            size={16}
            color={theme.textSecondary}
          />
          <Text
            style={{ color: theme.text, fontWeight: "600", fontSize: 14, flex: 1 }}
          >
            Help center
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
        <View
          style={[styles.compactDivider, { backgroundColor: theme.border }]}
        />
        <Pressable
          onPress={() => void Linking.openURL("https://busconnect.lk/en/privacy")}
          style={styles.linkRow}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={theme.textSecondary}
          />
          <Text
            style={{ color: theme.text, fontWeight: "600", fontSize: 14, flex: 1 }}
          >
            Privacy policy
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "phone-pad" | "email-address";
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ marginTop: Spacing.three }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.six + BottomTabInset },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    alignItems: "center",
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroName: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 19,
    fontWeight: "800",
    color: "#fff",
    marginTop: Spacing.three,
  },
  heroSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  card: {
    marginHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
  },
  // Only the first card (Personal information) needs to ride up into the
  // curved hero header — the others sit under their own section label, and
  // inheriting this negative margin would pull the card up over that label.
  firstCard: { marginTop: -Spacing.four },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 15, fontWeight: "700" },
  editLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  editActionsRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
  },
  readOnlyRow: {
    paddingVertical: Spacing.three,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readOnlyRowStack: {
    paddingVertical: Spacing.three,
  },
  sectionLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: Spacing.four + Spacing.one,
    marginBottom: Spacing.two,
  },
  fieldLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    fontFamily: BrandFonts.uiRegular,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 16,
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing.four,
  },
  saveButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
  segmentRow: { flexDirection: "row", gap: Spacing.two },
  segment: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.three },
  compactDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.half,
  },
  toggleRow: { flexDirection: "row", alignItems: "center" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  dangerButton: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  dangerButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 15 },
});
