import { supabase } from "./supabase";

export type OfferTheme = "amber" | "yellow" | "pink" | "blue" | "green";

export interface Offer {
  id: string;
  title: string;
  code: string;
  validTill: string;
  terms: string[];
  theme: OfferTheme;
  imageUrl: string | null;
}

interface OfferRow {
  id: string;
  title: string;
  code: string;
  valid_till: string;
  terms: string[] | null;
  theme: OfferTheme;
  image_url: string | null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Offers for the home screen's "Offers for you" carousel — the same
 * `offers` table BusConnect-web reads (see 0099_offers.sql), whose RLS
 * already restricts the anon client to `is_active` rows. The `valid_till`
 * filter here additionally drops ones that are still marked active but
 * have quietly expired.
 *
 * Display-only: copying a code doesn't validate or apply a discount
 * anywhere in the booking flow yet.
 */
export async function listOffers(): Promise<Offer[]> {
  const { data, error } = await supabase
    .from("offers")
    .select("id, title, code, valid_till, terms, theme, image_url")
    .gte("valid_till", todayIso())
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listOffers: could not load offers —", error.message);
    return [];
  }
  return ((data ?? []) as unknown as OfferRow[]).map((o) => ({
    id: o.id,
    title: o.title,
    code: o.code,
    validTill: o.valid_till,
    terms: o.terms ?? [],
    theme: o.theme,
    imageUrl: o.image_url,
  }));
}

export function formatValidTill(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
