/**
 * Typed client for the BusConnect NestJS API — passenger-relevant subset,
 * ported from BusConnect-web/src/lib/api.ts (same shapes/names on purpose,
 * to keep the two clients easy to reason about side by side). Public reads
 * (search, trip detail, seat map) need no token. Writes (holds, bookings)
 * require the caller to pass the Supabase access token.
 */
import type { HireListing } from "./hire-listings";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
  } catch {
    // fetch() itself throwing (not an HTTP error status) means the request
    // never reached the server — no connection, DNS failure, etc. Status 0
    // distinguishes this from a real server-returned error everywhere
    // ApiError.status is checked.
    throw new ApiError(
      0,
      "No internet connection. Check your network and try again.",
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Types (mirror BusConnect-api response shapes) ───────────────────────────

export interface TripSearchResult {
  trip_id: string;
  route_id: string;
  route_name: string;
  from_stop_id: string;
  to_stop_id: string;
  from_location_name: string;
  to_location_name: string;
  boarding_at: string;
  drop_at: string;
  fare: number;
  depart_at: string;
  arrive_est: string | null;
  status: string;
  booking_closed: boolean;
  bus_reg_no: string;
  bus_amenities: string[];
  bus_images: string[];
  bus_type_name: string;
  bus_type_class: string;
  bus_type_seat_count: number;
  operator_id: string;
  operator_name: string;
  operator_logo_url: string | null;
  operator_rating: number;
  operator_reliability_score: number;
}

export interface CrewMember {
  name: string;
  photoUrl: string | null;
  phone: string | null;
}

export interface TripCrew {
  driver: CrewMember | null;
  conductor: CrewMember | null;
}

export function getTripCrew(tripId: string) {
  return request<TripCrew>(`/trips/${tripId}/crew`);
}

/**
 * Seat layout convention stored in bus_types.layout_json — see
 * BusConnect-web/src/lib/seat-layout.ts's layoutToGrid() for the full
 * legacy-vs-freeform explanation this mirrors. seat_no is opaque text
 * throughout the booking system regardless of which format produced it.
 */
export interface SeatLayout {
  rows: number;
  cols: (string | null)[];
  labels?: string[];
  grid?: (string | null)[][];
}

/** Per-seat status beyond plain taken/free — held (pending checkout), booked
 *  (with the gender picked at selection time), or blocked (conductor marked
 *  it out-of-service/reserved). */
export interface SeatState {
  seat_no: string;
  status: "held" | "booked" | "blocked";
  gender: "male" | "female" | null;
}

export interface SeatMap {
  trip_id: string;
  layout: SeatLayout | null;
  taken: string[];
  seats: SeatState[];
}

export interface TripStopTime {
  route_stop_id: string;
  seq: number;
  location_id: string;
  location_name: string;
  scheduled_at: string | null;
  can_board: boolean;
  can_drop: boolean;
}

export interface TripFare {
  from_stop_id: string;
  to_stop_id: string;
  fare: number;
}

export interface TripDetail {
  id: string;
  depart_at: string;
  arrive_est: string | null;
  base_fare: number;
  status: string;
  route: { id: string; name: string; origin_id: string; dest_id: string };
  bus: {
    reg_no: string;
    amenities: string[];
    operator: {
      id: string;
      name: string;
      logo_url: string | null;
      rating: number;
      reliability_score: number;
    } | null;
    bus_type: {
      name: string;
      class: string;
      seat_count: number;
      layout_json: SeatLayout | null;
    };
  };
  fares: TripFare[];
  stops: TripStopTime[];
}

export interface Booking {
  id: string;
  trip_id: string;
  seats: string[];
  amount: number;
  status: string;
  from_stop_id: string;
  to_stop_id: string;
  tickets?: { id: string; status: string; qr_signature: string | null }[];
  payments?: { id: string; status: string; amount: number }[];
  refunds?: { id: string; amount: number; reason: string; status: string }[];
  trip?: {
    depart_at: string;
    bus?: {
      reg_no?: string | null;
      operator?: { name: string; logo_url?: string | null; convenience_fee_pct?: number } | null;
    } | null;
  };
  from_stop?: { location?: { name_en: string } | null } | null;
  to_stop?: { location?: { name_en: string } | null } | null;
  /** All rows share the same expires_at — they're created together by one
   *  hold_seats() call and linked to this booking as a group. */
  holds?: { expires_at: string }[];
}

export interface CancelResult {
  ok: true;
  refundPct: number;
  refundAmount: number;
  refundStatus: "processed" | "pending_manual" | "not_eligible" | "none";
  message: string;
}

export interface HoldResult {
  ok: boolean;
  hold_group: string;
  trip_id: string;
  seats: string[];
  expires_at: string;
}

export interface BookingResult {
  ok: boolean;
  booking_id: string;
  trip_id: string;
  seats: string[];
  amount: number;
}

/** MPGS Hosted Checkout: session id + SDK URL to hand to Checkout.configure(). */
export interface MpgsCheckoutSession {
  sessionId: string;
  checkoutJsUrl: string;
}

/** Live GPS position from the conductor's device, if it's pushing one yet. */
export type TripStatus =
  "scheduled" | "boarding" | "departed" | "arrived" | "cancelled";

export type TripLive =
  | { ok: true; status: TripStatus; sharing: boolean; tracking: false }
  | {
      ok: true;
      status: TripStatus;
      sharing: boolean;
      tracking: true;
      lat: number;
      lng: number;
      speed_kmh: number | null;
      recorded_at: string;
      distance_m: number | null;
      eta_minutes: number | null;
    };

/** One stop along the route, with coordinates, for drawing the tracking map. */
export interface TripRouteStop {
  route_stop_id: string;
  location_id: string;
  name: string;
  seq: number;
  lat: number;
  lng: number;
  is_origin: boolean;
  is_dest: boolean;
}

/** The static map layer: the route line (GeoJSON, [lng,lat] pairs) + stops. */
export interface TripRoute {
  ok: boolean;
  path: { type: "LineString"; coordinates: [number, number][] } | null;
  stops: TripRouteStop[];
}

// ── Public (no token) ────────────────────────────────────────────────────────

export function searchTrips(params: {
  from: string;
  to: string;
  date: string;
}) {
  const qs = new URLSearchParams(params).toString();
  return request<TripSearchResult[]>(`/search?${qs}`);
}

/** Journeys for every route sharing a route card, or a single card-less route — pass exactly one of routeCardId/routeId. */
export function searchTripsByRoute(params: {
  routeCardId?: string;
  routeId?: string;
  date: string;
}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>,
  ).toString();
  return request<TripSearchResult[]>(`/search-by-route?${qs}`);
}

export function getTrip(id: string) {
  return request<TripDetail>(`/trips/${id}`);
}

export function getSeatmap(id: string) {
  return request<SeatMap>(`/trips/${id}/seatmap`);
}

export function getTripLive(id: string, stopId?: string) {
  const qs = stopId ? `?stopId=${encodeURIComponent(stopId)}` : "";
  return request<TripLive>(`/trips/${id}/live${qs}`);
}

export function getTripRoute(id: string) {
  return request<TripRoute>(`/trips/${id}/route`);
}

// ── Authenticated (token required) ──────────────────────────────────────────

export function createHold(
  accessToken: string,
  body: {
    tripId: string;
    seats: { seatNo: string; gender?: "male" | "female" }[];
  },
) {
  return request<HoldResult>("/holds", {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
}

export function releaseHold(accessToken: string, holdGroup: string) {
  return request(`/holds/${holdGroup}`, { method: "DELETE", accessToken });
}

export function createBooking(
  accessToken: string,
  body: { holdGroup: string; fromStopId: string; toStopId: string },
) {
  return request<BookingResult>("/bookings", {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
}

export function getBooking(accessToken: string, id: string) {
  return request<Booking>(`/bookings/${id}`, { accessToken });
}

export function cancelBooking(accessToken: string, id: string) {
  return request<CancelResult>(`/bookings/${id}/cancel`, {
    method: "POST",
    accessToken,
  });
}

/** Removes a cancelled/refunded booking from the passenger's own ticket list — the record itself is kept. */
export function hideBooking(accessToken: string, id: string) {
  return request<{ ok: true }>(`/bookings/${id}/hide`, {
    method: "POST",
    accessToken,
  });
}

export interface ReviewResult {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
}

/** Rate a completed (arrived) trip, 1-5 stars with optional text. */
export function submitReview(accessToken: string, body: { tripId: string; rating: number; text?: string }) {
  return request<ReviewResult>("/reviews", {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
}

/** Returns the passenger's own review for this trip, or null if not yet rated. */
export function getMyReview(accessToken: string, tripId: string) {
  return request<ReviewResult | null>(`/reviews/mine?tripId=${tripId}`, { accessToken });
}

export function checkoutBooking(accessToken: string, bookingId: string) {
  return request<MpgsCheckoutSession>(`/bookings/${bookingId}/pay`, {
    method: "POST",
    accessToken,
  });
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export interface Wallet {
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: "topup" | "payment" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed";
  amount: number;
  booking_id: string | null;
  created_at: string;
}

export function getWallet(accessToken: string) {
  return request<Wallet>("/wallet", { accessToken });
}

export function listWalletTransactions(accessToken: string) {
  return request<WalletTransaction[]>("/wallet/transactions", { accessToken });
}

export function topupWallet(accessToken: string, amount: number) {
  return request<MpgsCheckoutSession>("/wallet/topup", {
    method: "POST",
    body: JSON.stringify({ amount }),
    accessToken,
  });
}

export function payBookingFromWallet(accessToken: string, bookingId: string) {
  return request<{ ok: boolean; ticket_id?: string }>(
    `/wallet/bookings/${bookingId}/pay`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export interface MyProfile {
  id: string;
  name: string | null;
  phone: string | null;
  nic: string | null;
  email: string | null;
  avatar_url: string | null;
  lang: string;
  created_at: string | null;
}

export function getMyProfile(accessToken: string) {
  return request<MyProfile>("/me/profile", { accessToken });
}

export interface UpdateMyProfileInput {
  name?: string;
  phone?: string;
  email?: string;
  nic?: string;
  avatarUrl?: string;
}

export function updateMyProfile(
  accessToken: string,
  input: UpdateMyProfileInput,
) {
  return request<MyProfile>("/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
    accessToken,
  });
}

export function deleteMyAccount(accessToken: string) {
  return request<{ ok: boolean; walletRefunded: number }>("/me/account", {
    method: "DELETE",
    accessToken,
  });
}

export type PushApp = "passenger" | "pilot";
export type PushPlatform = "ios" | "android";

export function registerPushToken(
  accessToken: string,
  body: { token: string; platform: PushPlatform; app: PushApp },
) {
  return request<{ ok: true }>("/notifications/push-token", {
    method: "POST",
    body: JSON.stringify(body),
    accessToken,
  });
}

export interface NotificationItem {
  id: string;
  template: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export function listNotifications(accessToken: string) {
  return request<NotificationItem[]>("/notifications?app=passenger", {
    accessToken,
  });
}

export function getUnreadNotificationCount(accessToken: string) {
  return request<{ count: number }>(
    "/notifications/unread-count?app=passenger",
    { accessToken },
  );
}

export function markNotificationRead(accessToken: string, id: string) {
  return request<{ ok: true }>(`/notifications/${id}/read`, {
    method: "PATCH",
    accessToken,
  });
}

export function markAllNotificationsRead(accessToken: string) {
  return request<{ ok: true }>("/notifications/read-all?app=passenger", {
    method: "POST",
    accessToken,
  });
}

export function deleteNotification(accessToken: string, id: string) {
  return request<{ ok: true }>(`/notifications/${id}`, {
    method: "DELETE",
    accessToken,
  });
}

export function unregisterPushToken(accessToken: string, token: string) {
  return request<{ ok: true }>("/notifications/push-token", {
    method: "DELETE",
    body: JSON.stringify({ token }),
    accessToken,
  });
}

// ── Bus hire listings — writes only; browsing/mine reads are direct-Supabase
//    (see lib/hire-listings.ts), same convention as locations/popular routes. ──

export interface HireListingInput {
  title: string;
  description?: string;
  busType:
    | "mini_bus"
    | "midi_bus"
    | "standard_bus"
    | "luxury_coach"
    | "super_luxury_coach"
    | "double_decker"
    | "other";
  condition?: "new" | "good" | "average";
  seatCount: number;
  isAc: boolean;
  busModel?: string;
  manufacturingYear?: number;
  features?: string[];
  priceAmount: number;
  priceType: "per_day" | "per_trip" | "per_km" | "negotiable";
  minHireDuration?: string;
  area?: string;
  suitableFor?: string[];
  province: string;
  district: string;
  city: string;
  contactName: string;
  contactPhone: string;
  contactWhatsapp?: string;
  preferredContactMethod?: "call" | "whatsapp" | "both";
  driverIncluded?: "included" | "not_included" | "on_request";
  images?: string[];
}

export function createHireListing(accessToken: string, input: HireListingInput) {
  return request<HireListing>("/hire-listings", {
    method: "POST",
    body: JSON.stringify(input),
    accessToken,
  });
}

export function updateHireListing(accessToken: string, id: string, input: HireListingInput) {
  return request<HireListing>(`/hire-listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    accessToken,
  });
}

export function archiveHireListing(accessToken: string, id: string, archived: boolean) {
  return request<HireListing>(`/hire-listings/${id}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
    accessToken,
  });
}

export function deleteHireListing(accessToken: string, id: string) {
  return request<{ ok: true }>(`/hire-listings/${id}`, {
    method: "DELETE",
    accessToken,
  });
}
