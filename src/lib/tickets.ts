/**
 * Direct-Supabase read for "My tickets", mirroring BusConnect-web's
 * tickets/page.tsx query — RLS restricts bookings/tickets to the signed-in
 * user's own rows, so no NestJS round-trip is needed. QR codes are rendered
 * client-side from qr_signature via react-native-qrcode-svg instead of the
 * web's server-side qrcode-to-data-url step.
 */
import { supabase } from "./supabase";

export interface MyBooking {
  id: string;
  tripId: string;
  fromStopId: string;
  code: string;
  seats: string[];
  amount: number;
  refundedSeats: string[];
  refundedAmount: number;
  status: string;
  createdAt: string;
  departAt: string | null;
  tripStatus: string | null;
  routeName: string | null;
  operatorName: string;
  operatorLogo: string | null;
  busType: string | null;
  busClass: string | null;
  regNo: string | null;
  qrSignature: string | null;
  ticketStatus: string | null;
  locationSharing: boolean;
}

interface BookingRow {
  id: string;
  trip_id: string;
  from_stop_id: string;
  seats: string[];
  amount: number;
  refunded_seats: string[];
  refunded_amount: number;
  status: string;
  created_at: string;
  trip: {
    depart_at: string;
    status: string;
    location_sharing: boolean | null;
    route: { name: string } | null;
    bus: {
      reg_no: string;
      bus_type: { name: string; class: string } | null;
      operator: { name: string; logo_url: string | null } | null;
    } | null;
  } | null;
  tickets: { qr_signature: string | null; status: string }[];
}

export async function listMyBookings(): Promise<MyBooking[]> {
  // Unpaid bookings (pending/reserved_unpaid) never surface here — a
  // booking only belongs in "my tickets" once it's confirmed or explicitly
  // cancelled.
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `id, trip_id, from_stop_id, seats, amount, refunded_seats, refunded_amount, status, created_at,
       trip:trips ( depart_at, status, location_sharing,
         route:routes ( name ),
         bus:buses ( reg_no, bus_type:bus_types ( name, class ),
           operator:operators ( name, logo_url ) ) ),
       tickets ( qr_signature, status )`,
    )
    .in("status", ["confirmed", "cancelled", "refunded"])
    .eq("hidden_by_passenger", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as BookingRow[];

  // Arrived+boarded bookings used to be hidden here once fully scanned.
  // They now stay visible as trip history so a passenger can rate the trip
  // — see the reviews feature.
  return rows.map((b) => {
    const ticket = b.tickets?.[0];
    return {
      id: b.id,
      tripId: b.trip_id,
      fromStopId: b.from_stop_id,
      code: b.id.slice(0, 6).toUpperCase(),
      seats: b.seats,
      amount: Number(b.amount),
      refundedSeats: b.refunded_seats ?? [],
      refundedAmount: Number(b.refunded_amount ?? 0),
      status: b.status,
      createdAt: b.created_at,
      departAt: b.trip?.depart_at ?? null,
      tripStatus: b.trip?.status ?? null,
      routeName: b.trip?.route?.name ?? null,
      operatorName: b.trip?.bus?.operator?.name ?? "Trip",
      operatorLogo: b.trip?.bus?.operator?.logo_url ?? null,
      busType: b.trip?.bus?.bus_type?.name ?? null,
      busClass: b.trip?.bus?.bus_type?.class ?? null,
      regNo: b.trip?.bus?.reg_no ?? null,
      qrSignature:
        b.status === "confirmed" ? (ticket?.qr_signature ?? null) : null,
      ticketStatus: ticket?.status ?? null,
      locationSharing: b.trip?.location_sharing ?? false,
    };
  });
}
