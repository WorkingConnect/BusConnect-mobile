import { supabase } from "./supabase";

/** Bus hire listings — a classifieds board, deliberately separate from the
 * booking system (see BusConnect-api/supabase/migrations/0088 & 0090).
 * Field names match the DB row directly (snake_case), same convention as
 * TripManifest etc. elsewhere in this file's siblings. */
export interface HireListing {
  id: string;
  posted_by: string;
  title: string;
  description: string | null;
  bus_type: string;
  condition: string | null;
  seat_count: number;
  is_ac: boolean;
  bus_model: string | null;
  manufacturing_year: number | null;
  features: string[];
  price_amount: number;
  price_type: string;
  min_hire_duration: string | null;
  area: string | null;
  suitable_for: string[];
  province: string;
  district: string;
  city: string;
  contact_name: string;
  contact_phone: string;
  contact_whatsapp: string | null;
  preferred_contact_method: string | null;
  driver_included: string | null;
  images: string[];
  moderation_status: "pending" | "approved" | "rejected";
  is_archived: boolean;
  created_at: string;
}

const LISTING_COLUMNS =
  "id, posted_by, title, description, bus_type, condition, seat_count, is_ac, bus_model, manufacturing_year, features, price_amount, price_type, min_hire_duration, area, suitable_for, province, district, city, contact_name, contact_phone, contact_whatsapp, preferred_contact_method, driver_included, images, moderation_status, is_archived, created_at";

/** Shared value/label vocabulary for every picker/select in the post form —
 * kept here so the post form, browse cards, and detail screen all show the
 * same labels for the same underlying value. */
export const HIRE_BUS_TYPES: { value: string; label: string }[] = [
  { value: "mini_bus", label: "Mini Bus" },
  { value: "midi_bus", label: "Midi Bus" },
  { value: "standard_bus", label: "Standard Bus" },
  { value: "luxury_coach", label: "Luxury Coach" },
  { value: "super_luxury_coach", label: "Super Luxury Coach" },
  { value: "double_decker", label: "Double-Decker" },
  { value: "other", label: "Other" },
];

export const HIRE_CONDITIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "average", label: "Average" },
];

export const HIRE_PRICE_TYPES: { value: string; label: string }[] = [
  { value: "per_day", label: "Per Day" },
  { value: "per_trip", label: "Per Trip" },
  { value: "per_km", label: "Per Km" },
  { value: "negotiable", label: "Negotiable" },
];

export const HIRE_DRIVER_OPTIONS: { value: string; label: string }[] = [
  { value: "included", label: "Driver included" },
  { value: "not_included", label: "Driver not included" },
  { value: "on_request", label: "Driver available on request" },
];

export const HIRE_CONTACT_METHODS: { value: string; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "both", label: "Both" },
];

export const HIRE_FEATURES: { value: string; label: string }[] = [
  { value: "air_conditioning", label: "Air Conditioning" },
  { value: "reclining_seats", label: "Reclining Seats" },
  { value: "audio_system", label: "Audio System" },
  { value: "tv", label: "TV" },
  { value: "usb_charging", label: "USB Charging" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "luggage_space", label: "Luggage Space" },
  { value: "toilet", label: "Toilet" },
  { value: "microphone", label: "Microphone" },
  { value: "curtains", label: "Curtains" },
  { value: "sleeper_seats", label: "Sleeper Seats" },
];

export const HIRE_SUITABLE_FOR: { value: string; label: string }[] = [
  { value: "tours", label: "Tours" },
  { value: "weddings", label: "Weddings" },
  { value: "school_trips", label: "School/University Trips" },
  { value: "corporate_events", label: "Corporate Events" },
  { value: "airport_transfers", label: "Airport Transfers" },
  { value: "sports_events", label: "Sports Events" },
  { value: "private_events", label: "Private Events" },
  { value: "other", label: "Other" },
];

/** Sri Lanka's 9 provinces, each with their districts — used for the
 * cascading Province -> District picker. */
export const HIRE_PROVINCE_DISTRICTS: { province: string; districts: string[] }[] = [
  { province: "Western", districts: ["Colombo", "Gampaha", "Kalutara"] },
  { province: "Central", districts: ["Kandy", "Matale", "Nuwara Eliya"] },
  { province: "Southern", districts: ["Galle", "Matara", "Hambantota"] },
  { province: "Northern", districts: ["Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu"] },
  { province: "Eastern", districts: ["Trincomalee", "Batticaloa", "Ampara"] },
  { province: "North Western", districts: ["Kurunegala", "Puttalam"] },
  { province: "North Central", districts: ["Anuradhapura", "Polonnaruwa"] },
  { province: "Uva", districts: ["Badulla", "Monaragala"] },
  { province: "Sabaragamuwa", districts: ["Ratnapura", "Kegalle"] },
];
export const HIRE_PROVINCES: string[] = HIRE_PROVINCE_DISTRICTS.map((p) => p.province);

function formatFrom(list: { value: string; label: string }[], value: string | null): string | null {
  return list.find((t) => t.value === value)?.label ?? value;
}

export const formatBusType = (v: string | null) => formatFrom(HIRE_BUS_TYPES, v);
export const formatCondition = (v: string | null) => formatFrom(HIRE_CONDITIONS, v);
export const formatPriceType = (v: string | null) => formatFrom(HIRE_PRICE_TYPES, v);
export const formatDriverIncluded = (v: string | null) => formatFrom(HIRE_DRIVER_OPTIONS, v);
export const formatContactMethod = (v: string | null) => formatFrom(HIRE_CONTACT_METHODS, v);
export const formatFeature = (v: string) => formatFrom(HIRE_FEATURES, v) ?? v;
export const formatSuitableFor = (v: string) => formatFrom(HIRE_SUITABLE_FOR, v) ?? v;

/** e.g. "LKR 15,000 / Per Day" */
export function formatPrice(amount: number, priceType: string): string {
  const formatted = `LKR ${amount.toLocaleString("en-LK")}`;
  if (priceType === "negotiable") return `${formatted} (Negotiable)`;
  return `${formatted} / ${formatPriceType(priceType) ?? priceType}`;
}

/** Which contact buttons a listing's detail page should show. No
 * preference set (older listings) keeps the old behavior of showing
 * whichever contact info exists. A preference that needs WhatsApp but has
 * no WhatsApp number on file falls back to Call rather than showing a
 * dead button. */
export function getContactVisibility(listing: {
  contact_whatsapp: string | null;
  preferred_contact_method: string | null;
}): { showCall: boolean; showWhatsapp: boolean } {
  const hasWhatsapp = !!listing.contact_whatsapp;
  switch (listing.preferred_contact_method) {
    case "call":
      return { showCall: true, showWhatsapp: false };
    case "whatsapp":
      return hasWhatsapp ? { showCall: false, showWhatsapp: true } : { showCall: true, showWhatsapp: false };
    case "both":
      return { showCall: true, showWhatsapp: hasWhatsapp };
    default:
      return { showCall: true, showWhatsapp: hasWhatsapp };
  }
}

/** Public read under RLS (0092: moderation_status = 'approved' and not
 * is_archived, or posted_by = auth.uid()) — same direct-Supabase-read
 * pattern as listLocations(). Only ever shows approved, non-archived
 * listings; a signed-out browser sees the same thing. */
export async function listHireListings(): Promise<HireListing[]> {
  const { data, error } = await supabase
    .from("bus_hire_listings")
    .select(LISTING_COLUMNS)
    .eq("moderation_status", "approved")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listHireListings:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getHireListing(id: string): Promise<HireListing | null> {
  const { data, error } = await supabase
    .from("bus_hire_listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getHireListing:", error.message);
    return null;
  }
  return data;
}

/** The signed-in user's own listings, any status — RLS's posted_by clause
 * covers this without needing an API round trip. */
export async function listMyHireListings(userId: string): Promise<HireListing[]> {
  const { data, error } = await supabase
    .from("bus_hire_listings")
    .select(LISTING_COLUMNS)
    .eq("posted_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listMyHireListings:", error.message);
    return [];
  }
  return data ?? [];
}
