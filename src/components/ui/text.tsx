import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  type TextProps,
  type TextStyle,
  type Text as RNTextRef,
} from 'react-native';

import { BrandFonts } from '@/constants/theme';

// RN ignores `fontWeight` on custom fonts loaded as separate static files
// (each weight is its own family, unlike a variable font), so a screen's
// existing `fontWeight: "700"` style would otherwise render in whatever
// single face this component defaults to instead of actually looking bold.
// Map the requested weight to the matching loaded IBM Plex Sans face so
// bold/semibold text still reads as bold.
function resolveFontFamily(fontWeight: TextStyle['fontWeight']): string {
  if (fontWeight === 'bold') return BrandFonts.bodySemiBold;
  const weight = typeof fontWeight === 'string' ? parseInt(fontWeight, 10) : fontWeight;
  if (typeof weight === 'number' && weight >= 600) return BrandFonts.bodySemiBold;
  if (typeof weight === 'number' && weight >= 500) return BrandFonts.bodyMedium;
  return BrandFonts.bodyRegular;
}

// Drop-in replacement for RN's `Text` that defaults to BusConnect-web's body
// font (IBM Plex Sans) instead of the platform system font, so screens don't
// need to set fontFamily individually. Pass an explicit `fontFamily` in
// `style` to override (e.g. BrandFonts.headingSemiBold for a heading).
export const Text = forwardRef<RNTextRef, TextProps>(({ style, ...rest }, ref) => {
  const flattened = StyleSheet.flatten(style);
  const fontFamily = flattened?.fontFamily ?? resolveFontFamily(flattened?.fontWeight);
  return <RNText ref={ref} style={[style, { fontFamily }]} {...rest} />;
});

Text.displayName = 'Text';
