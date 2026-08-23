import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "@/hooks/use-network-status";

/** Fixed banner across the top of the app whenever the device has no
 *  connection — standard pattern so no individual screen needs its own
 *  offline handling; API calls will just fail underneath it as usual. */
export function OfflineBanner() {
  const isConnected = useNetworkStatus();
  if (isConnected !== false) return null;

  return (
    <SafeAreaView edges={["top"]} style={styles.wrap} pointerEvents="none">
      <View style={styles.banner}>
        <Ionicons name="cloud-offline" size={15} color="#fff" />
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 999 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#374151",
    paddingVertical: 8,
  },
  text: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
