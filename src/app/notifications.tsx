import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  ApiError,
  type NotificationItem,
} from "@/lib/api";
import { Banner } from "@/components/banner";
import { BrandFonts, Spacing } from "@/constants/theme";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-LK", { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    listNotifications(session.access_token)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load notifications."));
  }, [session]);

  useFocusEffect(load);

  async function onTap(item: NotificationItem) {
    if (!session) return;
    if (!item.readAt) {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? null);
      void markNotificationRead(session.access_token, item.id);
    }
    const route = item.data?.route as string | undefined;
    if (route) router.push(route as Href);
  }

  async function onMarkAllRead() {
    if (!session) return;
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
    await markAllNotificationsRead(session.access_token);
  }

  async function onDelete(id: string) {
    if (!session) return;
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    try {
      await deleteNotification(session.access_token, id);
    } catch {
      // Best-effort — a failed delete just means it reappears on next load,
      // which is a fine fallback for a swipe action with no visible retry UI.
    }
  }

  const hasUnread = items?.some((i) => !i.readAt) ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.heroTitle}>Notifications</Text>
          <Pressable onPress={onMarkAllRead} hitSlop={8} disabled={!hasUnread} style={styles.markAllButton}>
            <Text style={[styles.markAllText, { opacity: hasUnread ? 1 : 0 }]}>Mark all read</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {error && (
        <View style={{ padding: Spacing.four }}>
          <Banner tone="error" message={error} />
        </View>
      )}

      {!items && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : items?.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={40} color={theme.textSecondary} />
          <Text style={{ color: theme.textSecondary, marginTop: Spacing.three }}>Nothing yet. You&apos;re all caught up.</Text>
        </View>
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <FlatList
            data={items ?? []}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: Spacing.four, gap: Spacing.two }}
            renderItem={({ item }) => (
              <NotificationRow
                item={item}
                theme={theme}
                onPress={() => onTap(item)}
                onDelete={() => onDelete(item.id)}
              />
            )}
          />
        </GestureHandlerRootView>
      )}
    </View>
  );
}

/** Swipe left to reveal a delete button — tap it to remove (no auto-delete
 *  on full swipe, so a stray gesture can't lose a notification by accident). */
function NotificationRow({
  item,
  theme,
  onPress,
  onDelete,
}: {
  item: NotificationItem;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  function renderRightActions(progress: SharedValue<number>) {
    const style = useAnimatedStyle(() => ({
      transform: [{ scale: Math.min(progress.value, 1) }],
    }));
    return (
      <Animated.View style={[styles.deleteAction, style]}>
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={styles.deleteButton}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} friction={2} rightThreshold={40}>
      <Pressable
        onPress={onPress}
        style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      >
        {!item.readAt && <View style={[styles.unreadDot, { backgroundColor: theme.brand }]} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{timeAgo(item.createdAt)}</Text>
        </View>
      </Pressable>
    </Swipeable>
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
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 32 },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  markAllButton: { minWidth: 32 },
  markAllText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.six },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  title: { fontSize: 14, fontWeight: "700" },
  body: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, marginTop: 6 },
  deleteAction: { justifyContent: "center", alignItems: "flex-end", paddingLeft: Spacing.two },
  deleteButton: {
    backgroundColor: "#dc2626",
    borderRadius: 14,
    width: 52,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
