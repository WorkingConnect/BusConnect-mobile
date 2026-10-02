import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import Svg, { Circle } from "react-native-svg";
import { BrandFonts } from "@/constants/theme";

const SIZE = 34;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Small shrinking ring + seconds countdown, same idea as Google
 *  Authenticator's per-code timer — shows how long until this specific
 *  displayed QR code is swapped for a new one. `durationMs` is the
 *  rotation interval (not the token's own server-side expiry, which is
 *  longer — see My QR screen's REFRESH_MS comment). Render with
 *  `key={token}` at the call site so a fresh token remounts this (and
 *  restarts the ring) instead of needing an imperative reset. */
export function CountdownRing({
  durationMs,
  color,
  trackColor,
}: {
  durationMs: number;
  color: string;
  trackColor: string;
}) {
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)));
    }, 1000);
    return () => clearInterval(id);
  }, [durationMs]);

  const ratio = remainingMs / durationMs;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={trackColor} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        />
      </Svg>
      <Text style={{ fontFamily: BrandFonts.uiSemiBold, color, fontSize: 10, fontWeight: "700" }}>{seconds}</Text>
    </View>
  );
}
