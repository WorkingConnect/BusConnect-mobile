import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import MapView, {
  AnimatedRegion,
  Marker,
  Polyline,
  type Camera,
  type Region,
} from "react-native-maps";
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  State as GestureState,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import type { TripRoute } from "@/lib/api";
import { MUTED_ANDROID_MAP_STYLE } from "@/constants/map-style";

// react-native-maps' native pinch-to-zoom (Google Maps/Apple Maps' own
// gesture recognizer) has no sensitivity setting — it's baked into the
// native SDK. To make pinch-zoom feel slower/gentler we disable it
// (zoomEnabled={false} below) and drive zoom from our own PinchGestureHandler
// instead, scaling the raw pinch amount down before applying it to the
// camera.
const PINCH_SENSITIVITY = 0.45;

export interface BusPosition {
  lat: number;
  lng: number;
  /** km/h from the conductor's device, when reported — drives how fast the
   *  marker dead-reckons forward between GPS fixes. Optional so callers
   *  (e.g. the passenger's own position) can omit it. */
  speedKmh?: number | null;
  /** ISO timestamp of this fix — lets the marker predict how far the bus has
   *  travelled since it was recorded. */
  recordedAt?: string | null;
}

const BRAND = "#004aad";
const ROUTE_UPCOMING = "#a9c2e8";
const PIN_END = "#dc2626";

// The bus reports its position every ~8s. Rather than gliding to each fix and
// then sitting frozen until the next one (the classic bus-tracker stutter),
// we project the bus onto the route line and advance it continuously along
// the road at its own speed, easing to each fresh fix when it lands — the
// smooth, always-alive feel of Uber/Grab/Metro-style tracking.
const MAX_PREDICT_S = 10; // stop dead-reckoning forward if a fix is this overdue (before the screen's 35s "signal lost")
const POSITION_EASE = 0.15; // per-frame lerp of the drawn position toward the predicted one — smooths fix corrections
const CAM_FOLLOW_MS = 900; // how often (and how long) the camera re-centres on the moving bus while following
const MAX_SPEED_MPS = 30; // ~108 km/h — clamp bad speed reads so a glitch can't fling the marker down the route
// Beyond this perpendicular distance from the mapped route, snapping the
// bus onto "the nearest point on the line" stops being an honest read of
// where it actually is — a real detour, a GPS glitch, or (in practice, the
// more common case) route geometry that doesn't quite match the real road
// would otherwise confidently show the bus on a road it was never on. Past
// this threshold the raw fix is shown directly instead.
const MAX_SNAP_DISTANCE_M = 600;

type LatLng = { latitude: number; longitude: number };

const EARTH_R = 6371000;

/** Great-circle distance between two coordinates, in metres. */
function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Running distance (metres) from the route's start to each vertex, so any
 *  "distance along the route" can be mapped to/from a vertex in O(1)–O(n). */
function cumulativeDistances(coords: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + haversineMeters(coords[i - 1], coords[i]);
  }
  return cum;
}

/** Projects a GPS point onto the route polyline, returning how far along the
 *  route (metres) the nearest point sits, and how far off the line the raw
 *  point itself is (perpendicular distance, metres) — the latter is what
 *  decides whether snapping onto the line is still an honest thing to do.
 *  Uses a flat-earth metre projection local to the point — fine at Sri Lanka
 *  scale for finding the closest segment. Called once per fix, so a full
 *  scan is cheap. */
function projectDistanceAlong(point: LatLng, coords: LatLng[], cum: number[]): { along: number; perpM: number } {
  const mPerDegLat = 111320;
  const cosLat = Math.cos(toRad(point.latitude));
  const px = point.longitude * mPerDegLat * cosLat;
  const py = point.latitude * mPerDegLat;
  let bestAlong = 0;
  let bestPerp = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = a.longitude * mPerDegLat * cosLat;
    const ay = a.latitude * mPerDegLat;
    const bx = b.longitude * mPerDegLat * cosLat;
    const by = b.latitude * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;
    let t = segLen2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const perp = Math.hypot(px - cx, py - cy);
    if (perp < bestPerp) {
      bestPerp = perp;
      bestAlong = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return { along: bestAlong, perpM: bestPerp };
}

/** The coordinate (and road bearing) at a given distance along the route.
 *  `cursor` is the last segment index we were on — advancing it forward keeps
 *  this O(1) per frame instead of re-scanning the whole line every time. */
function pointAtDistance(
  dist: number,
  coords: LatLng[],
  cum: number[],
  cursor: number,
): { latitude: number; longitude: number; bearing: number; cursor: number } {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, dist));
  let i = Math.max(0, Math.min(cursor, coords.length - 2));
  while (i < coords.length - 2 && cum[i + 1] < d) i++;
  while (i > 0 && cum[i] > d) i--;
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = (d - cum[i]) / segLen;
  const a = coords[i];
  const b = coords[i + 1];
  return {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
    bearing: bearingBetween(a, b),
    cursor: i,
  };
}

/** Adds the shortest signed rotation from `prev` toward `target` degrees,
 *  keeping the value continuous (never a 359°→0° backspin) so the marker
 *  turns the short way. */
function unwrapHeading(prev: number, target: number): number {
  const delta = (((target - prev) % 360) + 540) % 360 - 180;
  return prev + delta;
}

// Sri Lanka's bounding box, plus a little padding — the map keeps its center
// inside this box and won't zoom out far enough to show much beyond the
// island, so passengers can't accidentally pan/zoom off into open ocean.
const SL_BOUNDS = { minLat: 5.5, maxLat: 10.0, minLng: 79.3, maxLng: 82.1 };
const MAX_LAT_DELTA = 4;
const MAX_LNG_DELTA = 4;

/** Nudges a region back inside SL_BOUNDS/max zoom-out if it strayed past
 *  them — returns null when the region is already fine (no re-animation). */
function clampToSriLanka(region: Region): Region | null {
  let { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  let changed = false;
  if (latitudeDelta > MAX_LAT_DELTA) {
    latitudeDelta = MAX_LAT_DELTA;
    changed = true;
  }
  if (longitudeDelta > MAX_LNG_DELTA) {
    longitudeDelta = MAX_LNG_DELTA;
    changed = true;
  }
  if (latitude < SL_BOUNDS.minLat) {
    latitude = SL_BOUNDS.minLat;
    changed = true;
  } else if (latitude > SL_BOUNDS.maxLat) {
    latitude = SL_BOUNDS.maxLat;
    changed = true;
  }
  if (longitude < SL_BOUNDS.minLng) {
    longitude = SL_BOUNDS.minLng;
    changed = true;
  } else if (longitude > SL_BOUNDS.maxLng) {
    longitude = SL_BOUNDS.maxLng;
    changed = true;
  }
  return changed
    ? { latitude, longitude, latitudeDelta, longitudeDelta }
    : null;
}

const MIN_MARKER_SCALE = 0.55;
const MAX_MARKER_SCALE = 1.5;
// latitudeDelta at which the bus icon renders at its natural (1x) size —
// roughly the app's typical "just recentred" zoom level.
const SCALE_REFERENCE_DELTA = 0.05;

/** Maps a region's zoom (latitudeDelta — smaller is more zoomed in) to a
 *  marker scale factor, clamped so the icon never disappears zoomed out or
 *  balloons zoomed in. */
function scaleForDelta(latitudeDelta: number): number {
  if (!latitudeDelta || latitudeDelta <= 0) return 1;
  const raw = SCALE_REFERENCE_DELTA / latitudeDelta;
  return Math.max(MIN_MARKER_SCALE, Math.min(MAX_MARKER_SCALE, raw));
}

/** A region that frames a set of coordinates with some padding. */
function regionFor(coords: LatLng[]): Region {
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.04),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.04),
  };
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

/** Initial compass bearing from a to b, in degrees (0 = north). */
function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Index of the route-coordinate vertex closest to a point (nearest-vertex
 *  approximation — good enough to split the line into traveled/upcoming
 *  without pulling in a full geometry library). */
function nearestVertexIndex(point: LatLng, coords: LatLng[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dLat = coords[i].latitude - point.latitude;
    const dLng = coords[i].longitude - point.longitude;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

const BUS_ICON = require("../../assets/images/bus.png");

/**
 * Top-down vehicle image (nose pointing up/north) for the live bus marker —
 * Uber-style, rotates in place to its GPS heading rather than sitting inside
 * a static circular badge.
 */
function BusVehicleIcon() {
  return (
    <Image
      source={BUS_ICON}
      style={styles.busImage}
      resizeMode="contain"
    />
  );
}

/** Teardrop map-pin marker for a stop (start/end/boarding), Google-Maps-style. */
function StopPin({ color }: { color: string }) {
  return (
    <View style={styles.pinWrap}>
      <Ionicons name="location" size={32} color={color} />
      <View style={styles.pinHole} />
    </View>
  );
}

/**
 * Premium native live map for the passenger tracking screen — Google Maps on
 * Android, Apple Maps on iOS (react-native-maps). Draws the route line, every
 * stop, the passenger's own boarding stop as a highlighted pin, and a
 * brand-blue bus puck that glides smoothly (AnimatedRegion) between GPS
 * updates and rotates to its heading. Camera follows the bus until the user
 * pans away, then a recenter button brings it back — Uber-style.
 */
export function TrackingMap({
  route,
  boardingStopId,
  position,
  bottomInset = 0,
}: {
  route: TripRoute;
  boardingStopId: string;
  position: BusPosition | null;
  /** Height of any overlay (e.g. the bottom sheet) covering the map's
   *  bottom edge, so the recenter/zoom controls sit above it instead of
   *  underneath. */
  bottomInset?: number;
}) {
  const mapRef = useRef<MapView>(null);
  const [userMoved, setUserMoved] = useState(false);
  // Mirror of `userMoved` for the animation loop's closure, which can't see
  // React state updates without re-subscribing.
  const userMovedRef = useRef(false);
  const placed = useRef(false);
  const prevPos = useRef<LatLng | null>(null);

  // Marker snapshotting: react-native-maps captures the marker's content to a
  // native image. We only need that snapshot once (to grab the bus icon);
  // after ~1.5s we turn it off so the per-frame position/rotation updates
  // animate natively without re-snapshotting every frame.
  const [busTracksView, setBusTracksView] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBusTracksView(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Lazy-init the animated coordinate (a `useRef(new …)` would read the ref
  // during render, which the compiler lint disallows).
  const [busCoord] = useState(
    () =>
      new AnimatedRegion({
        latitude: position?.lat ?? 7.3,
        longitude: position?.lng ?? 80.0,
        latitudeDelta: 0,
        longitudeDelta: 0,
      }),
  );
  // Native map markers render at a fixed screen size regardless of zoom by
  // default (same as Google Maps/Uber) — scaled here instead so the bus icon
  // grows zooming in and shrinks zooming out, tracked from the region's
  // latitudeDelta (smaller delta = more zoomed in).
  const [markerScale] = useState(() => new Animated.Value(1));
  const [heading] = useState(() => new Animated.Value(0));
  const headingRotate = heading.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
    // A continuous unwrapped heading can run past 360°/below 0°; extend keeps
    // the rotation linear rather than clamping.
    extrapolate: "extend",
  });

  const routeCoords = useMemo<LatLng[]>(
    () =>
      (route.path?.coordinates ?? []).map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      })),
    [route],
  );
  const hasPath = routeCoords.length >= 2;

  // ── Route-follow prediction state (all refs — driven imperatively by the
  //    animation loop, never React state, so nothing re-renders per frame) ──
  const coordsRef = useRef<LatLng[]>([]);
  const cumRef = useRef<number[]>([]);
  const fixAlongRef = useRef<number | null>(null); // distance-along at the last GPS fix
  const fixTimeRef = useRef(0); // when that fix was recorded (ms)
  const speedMpsRef = useRef(0); // effective speed used to dead-reckon forward
  const displayAlongRef = useRef(0); // distance-along currently drawn
  const cursorRef = useRef(0); // forward-only segment cursor for pointAtDistance
  const unwrappedHeadingRef = useRef(0);
  const lastCamRef = useRef(0);
  // True while the latest fix is too far from the mapped route to trust a
  // snap — the RAF loop below leaves the marker alone (already placed
  // directly at the raw fix) rather than fighting it with route-prediction
  // math that assumes a point that's actually on the line.
  const offRouteRef = useRef(false);

  useEffect(() => {
    coordsRef.current = routeCoords;
    cumRef.current = hasPath ? cumulativeDistances(routeCoords) : [];
    cursorRef.current = 0;
  }, [routeCoords, hasPath]);

  // The already-traveled portion of the line (muted) vs. what's ahead (brand
  // blue) — a nearest-vertex split against the bus's current position, same
  // idea as Uber's "road behind you fades" treatment.
  const [traveledCoords, upcomingCoords] = useMemo<[LatLng[], LatLng[]]>(() => {
    if (!position || routeCoords.length < 2) return [[], routeCoords];
    const idx = nearestVertexIndex(
      { latitude: position.lat, longitude: position.lng },
      routeCoords,
    );
    return [routeCoords.slice(0, idx + 1), routeCoords.slice(idx)];
  }, [position, routeCoords]);

  const boardingStop = route.stops.find(
    (s) => s.route_stop_id === boardingStopId,
  );
  const otherStops = route.stops.filter(
    (s) => s.route_stop_id !== boardingStopId,
  );

  const initialRegion = useMemo<Region>(() => {
    if (position) {
      return {
        latitude: position.lat,
        longitude: position.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    const pts = routeCoords.length
      ? routeCoords
      : route.stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
    return pts.length
      ? regionFor(pts)
      : { latitude: 7.3, longitude: 80.0, latitudeDelta: 1, longitudeDelta: 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial only; later movement is imperative
  }, []);

  // ── On each new GPS fix: update the prediction targets (route mode), or
  //    fall back to the old glide-to-fix behaviour when the trip has no route
  //    geometry to follow. No per-frame work here — just refreshing the
  //    targets the animation loop below reads. ──────────────────────────────
  useEffect(() => {
    // Tracking lost → freeze the marker and reset so the next fix snaps fresh.
    if (!position) {
      placed.current = false;
      fixAlongRef.current = null;
      prevPos.current = null;
      offRouteRef.current = false;
      return;
    }

    // Fallback: no route line to follow — glide straight to each fix (the
    // original behaviour). `toValue` is required by the RN Animated config
    // type but ignored by region timing.
    if (!hasPath) {
      const next: LatLng = { latitude: position.lat, longitude: position.lng };
      if (!placed.current) {
        placed.current = true;
        busCoord.setValue({ ...next, latitudeDelta: 0, longitudeDelta: 0 });
      } else {
        busCoord
          .timing({ toValue: 0, ...next, latitudeDelta: 0, longitudeDelta: 0, duration: 1000, useNativeDriver: false })
          .start();
        const prev = prevPos.current;
        if (prev) {
          const moved = (prev.latitude - next.latitude) ** 2 + (prev.longitude - next.longitude) ** 2;
          if (moved > 1e-10) {
            Animated.timing(heading, { toValue: bearingBetween(prev, next), duration: 900, useNativeDriver: true }).start();
          }
        }
      }
      prevPos.current = next;
      if (!userMovedRef.current) mapRef.current?.animateCamera({ center: next }, { duration: 800 });
      return;
    }

    // Route mode: project the fix onto the line and work out how fast to
    // dead-reckon forward from it.
    const coords = coordsRef.current;
    const cum = cumRef.current;
    if (coords.length < 2) return;

    const next: LatLng = { latitude: position.lat, longitude: position.lng };
    const { along, perpM } = projectDistanceAlong(next, coords, cum);

    if (perpM > MAX_SNAP_DISTANCE_M) {
      // Too far from the mapped route to trust a snap — show the raw fix
      // directly instead of confidently placing the bus on the wrong road.
      // Same glide-to-fix treatment as the no-route-geometry fallback above.
      offRouteRef.current = true;
      if (!placed.current) {
        placed.current = true;
        busCoord.setValue({ ...next, latitudeDelta: 0, longitudeDelta: 0 });
      } else {
        busCoord
          .timing({ toValue: 0, ...next, latitudeDelta: 0, longitudeDelta: 0, duration: 1000, useNativeDriver: false })
          .start();
        const prev = prevPos.current;
        if (prev) {
          const moved = (prev.latitude - next.latitude) ** 2 + (prev.longitude - next.longitude) ** 2;
          if (moved > 1e-10) {
            const bearing = bearingBetween(prev, next);
            unwrappedHeadingRef.current = unwrapHeading(unwrappedHeadingRef.current, bearing);
            Animated.timing(heading, { toValue: unwrappedHeadingRef.current, duration: 900, useNativeDriver: true }).start();
          }
        }
      }
      prevPos.current = next;
      if (!userMovedRef.current) mapRef.current?.animateCamera({ center: next }, { duration: 800 });
      return;
    }
    offRouteRef.current = false;

    const fixTime = position.recordedAt ? new Date(position.recordedAt).getTime() : Date.now();

    // Prefer the device's reported speed; when it's missing or zero, derive it
    // from how far along the route we've advanced since the previous fix —
    // more reliable for prediction than a single instantaneous read.
    const prevAlong = fixAlongRef.current;
    const prevTime = fixTimeRef.current;
    let speedMps = position.speedKmh != null && position.speedKmh > 0 ? position.speedKmh / 3.6 : 0;
    if (speedMps === 0 && prevAlong != null && fixTime > prevTime) {
      const derived = (along - prevAlong) / ((fixTime - prevTime) / 1000);
      if (derived > 0) speedMps = derived;
    }
    speedMps = Math.max(0, Math.min(MAX_SPEED_MPS, speedMps));

    fixAlongRef.current = along;
    fixTimeRef.current = fixTime;
    speedMpsRef.current = speedMps;

    if (!placed.current) {
      placed.current = true;
      displayAlongRef.current = along;
      cursorRef.current = 0;
      const p = pointAtDistance(along, coords, cum, 0);
      cursorRef.current = p.cursor;
      busCoord.setValue({ latitude: p.latitude, longitude: p.longitude, latitudeDelta: 0, longitudeDelta: 0 });
      unwrappedHeadingRef.current = p.bearing;
      heading.setValue(p.bearing);
      if (!userMovedRef.current) {
        mapRef.current?.animateCamera({ center: { latitude: p.latitude, longitude: p.longitude } }, { duration: 600 });
      }
    }
    prevPos.current = next;
  }, [position, hasPath, busCoord, heading]);

  // ── The engine: a requestAnimationFrame loop that advances the drawn
  //    position continuously between fixes, so the bus never freezes. Reads
  //    only refs (updated by the effect above), sets the marker imperatively.
  useEffect(() => {
    if (!hasPath) return;
    let raf = 0;
    const loop = () => {
      const coords = coordsRef.current;
      const cum = cumRef.current;
      if (!offRouteRef.current && fixAlongRef.current != null && cum.length > 1) {
        const now = Date.now();
        const elapsed = Math.max(0, (now - fixTimeRef.current) / 1000);
        const routeLen = cum[cum.length - 1];
        // Predicted position = last fix + how far we'd have travelled at the
        // known speed since then, capped so a stalled feed can't run the bus
        // away down the route.
        const predicted = Math.min(
          routeLen,
          fixAlongRef.current + speedMpsRef.current * Math.min(elapsed, MAX_PREDICT_S),
        );
        // Ease the drawn distance toward the prediction — continuous forward
        // motion, and any correction when a fresh fix lands is smoothed out.
        displayAlongRef.current += (predicted - displayAlongRef.current) * POSITION_EASE;

        const p = pointAtDistance(displayAlongRef.current, coords, cum, cursorRef.current);
        cursorRef.current = p.cursor;
        busCoord.setValue({ latitude: p.latitude, longitude: p.longitude, latitudeDelta: 0, longitudeDelta: 0 });

        const unwrapped = unwrapHeading(unwrappedHeadingRef.current, p.bearing);
        unwrappedHeadingRef.current = unwrapped;
        heading.setValue(unwrapped);

        if (!userMovedRef.current && now - lastCamRef.current > CAM_FOLLOW_MS) {
          lastCamRef.current = now;
          mapRef.current?.animateCamera(
            { center: { latitude: p.latitude, longitude: p.longitude } },
            { duration: CAM_FOLLOW_MS },
          );
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasPath, busCoord, heading]);

  function recenter() {
    userMovedRef.current = false;
    lastCamRef.current = 0; // let the follow loop re-centre immediately
    setUserMoved(false);
    if (position) {
      mapRef.current?.animateCamera(
        {
          center: { latitude: position.lat, longitude: position.lng },
          // Apple Maps ignores `zoom` (it's altitude-driven); Google Maps
          // ignores `altitude` — set both so either provider zooms in.
          zoom: 15,
          altitude: 1500,
        },
        { duration: 700 },
      );
    } else if (routeCoords.length) {
      mapRef.current?.animateToRegion(regionFor(routeCoords), 700);
    }
  }

  async function zoomBy(delta: number) {
    const camera = await mapRef.current?.getCamera();
    if (!camera) return;
    if (Platform.OS === "ios") {
      // Apple Maps' camera has no `zoom` — it's altitude-driven (meters
      // above the ground); halving/doubling it approximates one zoom step.
      const factor = delta > 0 ? 0.5 : 2;
      mapRef.current?.animateCamera(
        { ...camera, altitude: (camera.altitude ?? 8000) * factor },
        { duration: 250 },
      );
    } else {
      mapRef.current?.animateCamera(
        { ...camera, zoom: (camera.zoom ?? 12) + delta },
        { duration: 250 },
      );
    }
  }

  // Camera captured at the start of a pinch, so each gesture update applies
  // a *scaled-down* zoom relative to a fixed baseline rather than to the
  // previous frame — compounding a reduced-but-still-relative delta every
  // frame would drift from what the fingers are actually doing.
  const pinchBase = useRef<Camera | null>(null);

  async function onPinchStateChange(event: PinchGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.state === GestureState.BEGAN) {
      pinchBase.current = (await mapRef.current?.getCamera()) ?? null;
    }
  }

  function onPinchEvent(event: PinchGestureHandlerGestureEvent) {
    const base = pinchBase.current;
    if (!base) return;
    // nativeEvent.scale is cumulative since the gesture began, not
    // incremental — dampen how much of that reaches the camera.
    const eased = 1 + (event.nativeEvent.scale - 1) * PINCH_SENSITIVITY;
    if (Platform.OS === "ios") {
      // Apple Maps' camera is altitude-driven (meters above ground) —
      // smaller altitude = more zoomed in, so scale divides rather than adds.
      mapRef.current?.setCamera({ altitude: (base.altitude ?? 8000) / eased });
    } else {
      // Google Maps' zoom is log2-scaled — doubling the on-screen size of
      // things is +1 zoom level.
      mapRef.current?.setCamera({ zoom: (base.zoom ?? 12) + Math.log2(eased) });
    }
  }

  function onRegionChangeComplete(region: Region) {
    const clamped = clampToSriLanka(region);
    if (clamped) mapRef.current?.animateToRegion(clamped, 300);
    Animated.timing(markerScale, {
      toValue: scaleForDelta((clamped ?? region).latitudeDelta),
      duration: 200,
      useNativeDriver: true,
    }).start();
  }

  // Set the marker's starting size to match wherever the map actually opens
  // (a route-wide overview vs. a close-in fix on the bus render very
  // differently) instead of always starting at 1x and jumping on first pan.
  useEffect(() => {
    markerScale.setValue(scaleForDelta(initialRegion.latitudeDelta));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial only
  }, []);

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
    <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={(e) => void onPinchStateChange(e)}>
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onPanDrag={() => {
          userMovedRef.current = true;
          if (!userMoved) setUserMoved(true);
        }}
        onRegionChangeComplete={onRegionChangeComplete}
        minZoomLevel={6}
        zoomEnabled={false}
        showsUserLocation={true}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        userInterfaceStyle="light"
        customMapStyle={
          Platform.OS === "android" ? MUTED_ANDROID_MAP_STYLE : undefined
        }
      >
        {traveledCoords.length > 1 && (
          <Polyline
            coordinates={traveledCoords}
            strokeColor={ROUTE_UPCOMING}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {upcomingCoords.length > 1 && (
          <Polyline
            coordinates={upcomingCoords}
            strokeColor={BRAND}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {otherStops.map((s) =>
          s.is_origin || s.is_dest ? (
            <Marker
              key={s.route_stop_id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              title={s.is_origin ? "Start" : "End"}
              description={s.name}
            >
              <StopPin color={s.is_origin ? BRAND : PIN_END} />
            </Marker>
          ) : (
            <Marker
              key={s.route_stop_id}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.stopDot} />
            </Marker>
          ),
        )}

        {boardingStop && (
          <Marker
            coordinate={{
              latitude: boardingStop.lat,
              longitude: boardingStop.lng,
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            title="Your stop"
            description={boardingStop.name}
          >
            <StopPin color={BRAND} />
          </Marker>
        )}

        {position && (
          <Marker.Animated
            coordinate={busCoord as unknown as LatLng}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={busTracksView}
          >
            <Animated.View
              style={[styles.busWrap, { transform: [{ scale: markerScale }] }]}
            >
              <View style={styles.busShadow} />
              <Animated.View
                style={[
                  styles.busVehicle,
                  { transform: [{ rotate: headingRotate }] },
                ]}
              >
                <BusVehicleIcon />
              </Animated.View>
            </Animated.View>
          </Marker.Animated>
        )}
      </MapView>

      <View style={[styles.controls, { bottom: 16 + bottomInset }]}>
        {userMoved && (
          <Pressable
            style={styles.controlButton}
            onPress={recenter}
            hitSlop={8}
          >
            <Ionicons name="locate" size={20} color={BRAND} />
          </Pressable>
        )}
        <Pressable
          style={styles.controlButton}
          onPress={() => zoomBy(1)}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={BRAND} />
        </Pressable>
        <Pressable
          style={styles.controlButton}
          onPress={() => zoomBy(-1)}
          hitSlop={8}
        >
          <Ionicons name="remove" size={20} color={BRAND} />
        </Pressable>
      </View>
    </View>
    </PinchGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  stopDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: BRAND,
  },
  pinWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinHole: {
    position: "absolute",
    top: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  busWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // Static ellipse grounding the vehicle to the map, independent of its
  // rotation — mirrors the drop-shadow Uber/Google Maps put under a live car.
  busShadow: {
    position: "absolute",
    bottom: 6,
    width: 22,
    height: 8,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  busVehicle: {
    width: 28,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  busImage: {
    width: 28,
    height: 44,
  },
  controls: {
    position: "absolute",
    right: 16,
    gap: 10,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
