import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/api";
import { BrandFonts } from "@/constants/theme";

/** Bell icon with an unread badge — refreshes the count every time this
 *  screen regains focus (e.g. coming back from the notifications list),
 *  not on a timer, since there's no realtime channel for this yet. */
export function NotificationBell() {
  const { session } = useAuth();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      getUnreadNotificationCount(session.access_token)
        .then((r) => setCount(r.count))
        .catch(() => {
          /* badge just stays stale until the next focus */
        });
    }, [session]),
  );

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      hitSlop={10}
      style={styles.button}
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={24} color="#fff" />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});
