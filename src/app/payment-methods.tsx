import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { BrandFonts, Spacing } from "@/constants/theme";

export default function PaymentMethodsScreen() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
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
          <Text style={styles.heroTitle}>Payment Methods</Text>
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          Saved cards
        </Text>
        <Text
          style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}
        >
          No saved cards. You can add and pay with a new card.
        </Text>

        <Pressable
          onPress={() =>
            Alert.alert(
              "Coming soon",
              "Saving cards for faster checkout isn't available yet.",
            )
          }
          style={[
            styles.newCardCard,
            {
              borderColor: theme.brand,
              backgroundColor: theme.backgroundSelected,
            },
          ]}
        >
          <Ionicons name="card-outline" size={28} color={theme.brand} />
          <Text
            style={{
              fontFamily: BrandFonts.uiSemiBold,
              color: theme.brand,
              fontWeight: "700",
              fontSize: 15,
              marginTop: Spacing.two,
            }}
          >
            Add Card
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  content: { padding: Spacing.four },
  sectionLabel: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  newCardCard: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: Spacing.six,
    marginTop: Spacing.three,
  },
});
