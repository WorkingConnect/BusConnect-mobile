/**
 * Mirrors BusConnect-web's lib/storage.ts uploadPassengerPhoto, adapted for
 * RN: there's no File/Blob-from-disk shortcut, so the picked asset is read
 * as base64 via expo-file-system and decoded to an ArrayBuffer for upload.
 */
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

export async function uploadPassengerPhoto(userId: string, uri: string): Promise<string> {
  const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage
    .from("passenger-photos")
    .upload(path, decode(base64), { upsert: true, contentType });
  if (error) throw error;

  return supabase.storage.from("passenger-photos").getPublicUrl(path).data.publicUrl;
}

/** Same shape as uploadPassengerPhoto — a listing photo isn't sensitive
 * either, public bucket, folder-per-user (see 0088_bus_hire_listings.sql). */
export async function uploadBusHirePhoto(userId: string, uri: string): Promise<string> {
  const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage
    .from("bus-hire-photos")
    .upload(path, decode(base64), { upsert: true, contentType });
  if (error) throw error;

  return supabase.storage.from("bus-hire-photos").getPublicUrl(path).data.publicUrl;
}
