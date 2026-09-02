import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";
import { TabBarBaseHeight } from "@/constants/theme";

/** No blanket auth gate here — Home and Hire are browsable without an
 *  account. Tickets and Profile are account-based and handle their own
 *  signed-out state (redirect / sign-in prompt) individually. */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: TabBarBaseHeight + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 0,
          backgroundColor: theme.backgroundElement,
          paddingTop: 10,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "My Tickets",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "ticket" : "ticket-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="hire"
        options={{
          title: "Hire",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "bus" : "bus-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "person" : "person-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
