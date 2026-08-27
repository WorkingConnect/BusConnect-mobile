import { Linking, Platform } from "react-native";

// App Store Connect app id (eas.json submit.production.ios.ascAppId).
const IOS_APP_STORE_ID = "id6794645415";
const ANDROID_PACKAGE = "lk.busconnect.app";

// Same number used for phone support on the web app's Help Centre page.
const SUPPORT_WHATSAPP_NUMBER = "94764670645";

export async function openStoreReview(): Promise<void> {
  const url =
    Platform.OS === "ios" && IOS_APP_STORE_ID
      ? `itms-apps://apps.apple.com/app/${IOS_APP_STORE_ID}?action=write-review`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  await Linking.openURL(url);
}

export async function openWhatsAppSupport(): Promise<void> {
  const message = encodeURIComponent("Hi, I need help with my BusConnect booking.");
  await Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${message}`);
}
