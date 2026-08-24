import { supabase } from "./supabase";

export interface Location {
  id: string;
  name_en: string;
  name_si: string | null;
  name_ta: string | null;
}

/** Public read under RLS (see BusConnect-api/supabase/migrations/0003_rls.sql) —
 * same direct-Supabase-read pattern as BusConnect-web's lib/locations.ts.
 * Scoped to list_bookable_locations() (0084) rather than the raw `locations`
 * table, so the From/To pickers only ever offer stops that are actually on
 * a route with a currently bookable trip — not every location ever created. */
export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase.rpc("list_bookable_locations");

  if (error) {
    console.error("listLocations:", error.message);
    return [];
  }
  return data ?? [];
}
