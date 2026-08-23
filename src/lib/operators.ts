import { supabase } from "./supabase";

export interface OperatorSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  rating: number;
  reliabilityScore: number;
}

export interface FleetGroup {
  busTypeId: string;
  name: string;
  /** bus_class enum value, e.g. "semi_luxury" — render with `.replace('_', ' ')`. */
  class: string;
  seatCount: number;
  busCount: number;
  amenities: string[];
  imageUrl: string | null;
}

export interface OperatorRoute {
  routeCardId: string | null;
  routeId: string;
  name: string;
  imageUrl: string | null;
  /** Every stat below comes from this operator's own trips on this route
   *  only — never blended with other operators serving the same corridor. */
  durationMinutes: number | null;
  todayCount: number;
  nextDateIso: string | null;
  minFare: number | null;
  /** "6:00 AM" style time-of-day for the soonest upcoming trip on this
   *  route — null if nothing's scheduled. departureTime/arrivalTime are
   *  this same trip's start and end, not two different trips' departures. */
  departureTime: string | null;
  arrivalTime: string | null;
}

export interface OperatorProfile {
  id: string;
  name: string;
  logoUrl: string | null;
  rating: number;
  reliabilityScore: number;
  fleet: FleetGroup[];
  routes: OperatorRoute[];
  /** Distinct origin/destination locations across this operator's routes. */
  citiesServed: number;
}

interface OperatorRow {
  id: string;
  name: string;
  logo_url: string | null;
  rating: number;
  reliability_score: number;
  status: string;
}

interface BusRow {
  id: string;
  bus_type_id: string;
  amenities: string[] | null;
  front_image_url: string | null;
}

interface BusTypeRow {
  id: string;
  name: string;
  class: string;
  seat_count: number;
}

/**
 * Active operators for the homepage directory. Same direct-Supabase read
 * pattern as lib/popular-routes.ts (public read under RLS) — no
 * BusConnect-api round trip for a plain display read.
 */
export async function listActiveOperators(): Promise<OperatorSummary[]> {
  const { data, error } = await supabase
    .from("operators")
    .select("id, name, logo_url, rating, reliability_score")
    .eq("status", "active")
    .order("name");

  if (error) {
    console.error("listActiveOperators: falling back to empty list —", error.message);
    return [];
  }
  return (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    logoUrl: o.logo_url,
    rating: o.rating,
    reliabilityScore: o.reliability_score,
  }));
}

/**
 * One operator's public profile: identity, their active fleet grouped by bus
 * type, and the routes they're allowed to run (route_operators —
 * BusConnect-api's 0063_route_operators.sql), each with schedule stats
 * (departures, duration, fare, first/last departure) computed from this
 * operator's own trips only — never blended with other operators' trips on
 * the same corridor. Returns null for an unknown or non-active operator
 * (pending/suspended operators aren't shown to riders).
 */
export async function getOperatorProfile(operatorId: string): Promise<OperatorProfile | null> {
  const { data: operator, error: operatorErr } = await supabase
    .from("operators")
    .select("id, name, logo_url, rating, reliability_score, status")
    .eq("id", operatorId)
    .maybeSingle();

  if (operatorErr) {
    console.error("getOperatorProfile: could not load operator —", operatorErr.message);
    return null;
  }
  const op = operator as OperatorRow | null;
  if (!op || op.status !== "active") return null;

  const [{ data: buses, error: busesErr }, { data: routeOperators, error: routeOpsErr }] = await Promise.all([
    supabase
      .from("buses")
      .select("id, bus_type_id, amenities, front_image_url")
      .eq("operator_id", operatorId)
      .eq("status", "active"),
    supabase.from("route_operators").select("route_id").eq("operator_id", operatorId),
  ]);
  if (busesErr) {
    console.error("getOperatorProfile: could not load fleet —", busesErr.message);
  }
  if (routeOpsErr) {
    console.error("getOperatorProfile: could not load assigned routes —", routeOpsErr.message);
  }

  // ── Fleet: active buses grouped by bus type ────────────────────────────
  const busRows = (buses ?? []) as unknown as BusRow[];
  const busTypeIds = [...new Set(busRows.map((b) => b.bus_type_id))];
  let busTypes: BusTypeRow[] = [];
  if (busTypeIds.length > 0) {
    const { data, error } = await supabase
      .from("bus_types")
      .select("id, name, class, seat_count")
      .in("id", busTypeIds);
    if (error) {
      console.error("getOperatorProfile: could not load bus types —", error.message);
    } else {
      busTypes = (data ?? []) as unknown as BusTypeRow[];
    }
  }
  const busTypeById = new Map(busTypes.map((t) => [t.id, t]));

  const fleetByType = new Map<string, FleetGroup>();
  for (const bus of busRows) {
    const type = busTypeById.get(bus.bus_type_id);
    if (!type) continue; // orphaned bus_type_id shouldn't happen, but don't crash if it does
    const existing = fleetByType.get(bus.bus_type_id);
    if (existing) {
      existing.busCount += 1;
      for (const a of bus.amenities ?? []) {
        if (!existing.amenities.includes(a)) existing.amenities.push(a);
      }
      if (!existing.imageUrl && bus.front_image_url) existing.imageUrl = bus.front_image_url;
    } else {
      fleetByType.set(bus.bus_type_id, {
        busTypeId: bus.bus_type_id,
        name: type.name,
        class: type.class,
        seatCount: type.seat_count,
        busCount: 1,
        amenities: [...(bus.amenities ?? [])],
        imageUrl: bus.front_image_url,
      });
    }
  }

  // ── Routes: this operator's route_operators, grouped by route_card_id
  //    same as the homepage catalog (two routes sharing a card display as
  //    one row), but every stat below is scoped to just this operator's own
  //    trips, never blended with anyone else's trips on the same corridor. ──
  const routeIds = (routeOperators ?? []).map((r) => r.route_id as string);
  const busIds = busRows.map((b) => b.id);

  interface RouteGroup {
    routeCardId: string | null;
    routeId: string;
    name: string;
    imageUrl: string | null;
  }
  const groupByKey = new Map<string, RouteGroup>();
  const routeIdToKey = new Map<string, string>();
  let citiesServed = 0;
  if (routeIds.length > 0) {
    const { data, error } = await supabase
      .from("routes")
      .select("id, route_card_id, name, image_url, origin_id, dest_id")
      .in("id", routeIds);
    if (error) {
      console.error("getOperatorProfile: could not load routes —", error.message);
    } else {
      for (const r of data ?? []) {
        const id = r.id as string;
        const key = (r.route_card_id as string | null) ?? `route:${id}`;
        routeIdToKey.set(id, key);
        if (!groupByKey.has(key)) {
          groupByKey.set(key, {
            routeCardId: r.route_card_id as string | null,
            routeId: id,
            name: r.name as string,
            imageUrl: r.image_url as string | null,
          });
        }
      }
      citiesServed = new Set((data ?? []).flatMap((r) => [r.origin_id as string, r.dest_id as string])).size;
    }
  }

  // ── This operator's own upcoming trips on those routes — today's count,
  //    fastest duration, cheapest fare, and the soonest upcoming trip's
  //    departure/arrival. ────────────────────────────────────────────────
  interface RouteStats {
    todayCount: number;
    nextDateIso: string | null;
    durationMinutes: number | null;
    minFare: number | null;
    /** The soonest upcoming trip found so far — departure and its own
     *  arrival, not the earliest/latest departure across all trips. */
    nextTripDepartAt: string;
    nextTripArriveAt: string | null;
  }
  const statsByKey = new Map<string, RouteStats>();
  if (routeIds.length > 0 && busIds.length > 0) {
    const { data, error } = await supabase
      .from("trips")
      .select("route_id, depart_at, arrive_est, base_fare")
      .in("route_id", routeIds)
      .in("bus_id", busIds)
      .in("status", ["scheduled", "boarding"])
      .gte("depart_at", new Date().toISOString());
    if (error) {
      console.error("getOperatorProfile: could not load trip schedule —", error.message);
    } else {
      const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
      for (const t of data ?? []) {
        const key = routeIdToKey.get(t.route_id as string);
        if (!key) continue;
        const departAt = t.depart_at as string;
        const dateIso = new Date(departAt).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
        const arriveEst = t.arrive_est as string | null;
        const durationMinutes = arriveEst
          ? Math.round((new Date(arriveEst).getTime() - new Date(departAt).getTime()) / 60000)
          : null;
        const fare = t.base_fare != null ? Number(t.base_fare) : null;

        const existing = statsByKey.get(key);
        if (!existing) {
          statsByKey.set(key, {
            todayCount: dateIso === todayIso ? 1 : 0,
            nextDateIso: dateIso,
            durationMinutes,
            minFare: fare,
            nextTripDepartAt: departAt,
            nextTripArriveAt: arriveEst,
          });
        } else {
          if (dateIso === todayIso) existing.todayCount += 1;
          if (!existing.nextDateIso || dateIso < existing.nextDateIso) existing.nextDateIso = dateIso;
          if (durationMinutes != null && (existing.durationMinutes == null || durationMinutes < existing.durationMinutes)) {
            existing.durationMinutes = durationMinutes;
          }
          if (fare != null && (existing.minFare == null || fare < existing.minFare)) existing.minFare = fare;
          if (departAt < existing.nextTripDepartAt) {
            existing.nextTripDepartAt = departAt;
            existing.nextTripArriveAt = arriveEst;
          }
        }
      }
    }
  }
  const formatDepartureTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-LK", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Colombo",
    });

  const routes: OperatorRoute[] = [...groupByKey.entries()]
    .map(([key, group]) => {
      const stats = statsByKey.get(key);
      return {
        ...group,
        durationMinutes: stats?.durationMinutes ?? null,
        todayCount: stats?.todayCount ?? 0,
        nextDateIso: stats?.nextDateIso ?? null,
        minFare: stats?.minFare ?? null,
        departureTime: stats ? formatDepartureTime(stats.nextTripDepartAt) : null,
        arrivalTime: stats?.nextTripArriveAt ? formatDepartureTime(stats.nextTripArriveAt) : null,
      };
    })
    .sort((a, b) => b.todayCount - a.todayCount || a.name.localeCompare(b.name));

  return {
    id: op.id,
    name: op.name,
    logoUrl: op.logo_url,
    rating: op.rating,
    reliabilityScore: op.reliability_score,
    fleet: [...fleetByType.values()].sort((a, b) => a.name.localeCompare(b.name)),
    routes,
    citiesServed,
  };
}
