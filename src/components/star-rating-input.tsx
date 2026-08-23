import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function StarRatingInput({
  value,
  onChange,
  disabled,
  size = 22,
}: {
  value: number;
  onChange?: (n: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={disabled || !onChange}
          hitSlop={6}
          onPress={() => onChange?.(n)}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={size}
            color="#f59e0b"
          />
        </Pressable>
      ))}
    </View>
  );
}
