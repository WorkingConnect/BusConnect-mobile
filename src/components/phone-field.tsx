import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { PHONE_COUNTRY_CODE } from "@/lib/phone";
import { BrandFonts, Spacing } from "@/constants/theme";

/** Phone input with a fixed +94 country-code badge — the user only ever
 *  types the local 9-digit number. `value`/`onChangeText` deal in local
 *  digits only; combine with lib/phone.ts's toE164() before sending to the
 *  API. */
export function PhoneField({
  value,
  onChangeText,
  placeholder = "7X XXX XXXX",
}: {
  value: string;
  onChangeText: (digits: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <Ionicons name="call-outline" size={18} color={theme.textSecondary} />
      <Text style={[styles.code, { color: theme.text, borderRightColor: theme.border }]}>
        {PHONE_COUNTRY_CODE}
      </Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, ""))}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType="phone-pad"
        maxLength={9}
        style={[styles.input, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  code: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 16,
    fontWeight: "600",
    paddingRight: Spacing.two,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  input: {
    fontFamily: BrandFonts.uiRegular,
    flex: 1,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
});
