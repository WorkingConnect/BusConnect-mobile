import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import {
  getWallet,
  listWalletTransactions,
  ApiError,
  type Wallet,
  type WalletTransaction,
} from "@/lib/api";
import { Banner } from "@/components/banner";
import { Spacing, BottomTabInset } from "@/constants/theme";

function formatLkr(amount: number) {
  return `LKR ${amount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TX_LABEL: Record<WalletTransaction["type"], string> = {
  topup: "Top up",
  payment: "Ticket payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default function WalletScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    Promise.all([
      getWallet(session.access_token),
      listWalletTransactions(session.access_token),
    ])
      .then(([w, tx]) => {
        setWallet(w);
        setTransactions(tx);
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Could not load your wallet.",
        ),
      );
  }, [session]);

  useFocusEffect(load);

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
          <Text style={styles.heroTitle}>My Wallet Details</Text>
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <FlatList
        contentContainerStyle={styles.list}
        data={(transactions ?? []).filter((t) => t.status === "completed")}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <>
            <View
              style={[
                styles.passCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.passBody}>
                <Text style={[styles.passLabel, { color: theme.brand }]}>
                  BusConnect Wallet
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Use your balance to pay for tickets instantly
                </Text>

                <View
                  style={[styles.dashedDivider, { borderColor: theme.border }]}
                />

                <Pressable
                  onPress={() => router.push("/wallet-topup")}
                  style={[styles.topupButton, { backgroundColor: theme.brand }]}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.topupButtonText}>Top up wallet</Text>
                </Pressable>
              </View>
              <View style={styles.balanceFooter}>
                <Text style={[styles.balanceFooterLabel, { color: theme.textSecondary }]}>
                  Balance
                </Text>
                <Text style={[styles.balanceFooterValue, { color: theme.text }]}>
                  {formatLkr(wallet?.balance ?? 0)}
                </Text>
              </View>
            </View>

            {error && (
              <View style={{ marginTop: Spacing.three }}>
                <Banner tone="error" message={error} />
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              Recent activity
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={[styles.txRow, { borderColor: theme.border }]}>
            <View
              style={[
                styles.txIcon,
                {
                  backgroundColor:
                    item.type === "topup" ? "#dcfce7" : "#dbeafe",
                },
              ]}
            >
              <Ionicons
                name={item.type === "topup" ? "add" : "ticket-outline"}
                size={16}
                color={item.type === "topup" ? "#16a34a" : "#1d4ed8"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}
              >
                {TX_LABEL[item.type]}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {new Date(item.created_at).toLocaleString("en-LK", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            <Text
              style={{
                color:
                  item.type === "topup" || item.type === "refund"
                    ? "#16a34a"
                    : theme.text,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              {item.type === "topup" || item.type === "refund" ? "+" : "-"}
              {formatLkr(item.amount)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          transactions && transactions.length === 0 ? (
            <Text
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginTop: Spacing.four,
              }}
            >
              No wallet activity yet.
            </Text>
          ) : !transactions ? (
            <ActivityIndicator
              color={theme.brand}
              style={{ marginTop: Spacing.five }}
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
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
  list: {
    padding: Spacing.four,
    paddingBottom: Spacing.four + BottomTabInset,
    gap: Spacing.two,
  },
  passCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  passBody: { padding: Spacing.four },
  passLabel: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  dashedDivider: {
    marginVertical: Spacing.three,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  topupButton: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topupButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  balanceFooter: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  balanceFooterLabel: { fontSize: 12 },
  balanceFooterValue: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.five,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
