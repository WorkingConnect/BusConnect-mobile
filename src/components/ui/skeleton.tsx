import { useEffect } from "react";
import type { ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "@/hooks/use-theme";

/** Pulsing placeholder block for loading states. Sized/shaped via `style` to mimic the content it stands in for. */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const theme = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ backgroundColor: theme.backgroundElement, borderRadius: 6 }, style, animatedStyle]} />;
}
