import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth";
import {
  getHireListing,
  formatBusType,
  formatCondition,
  formatPriceType,
  formatDriverIncluded,
  formatContactMethod,
  formatFeature,
  formatSuitableFor,
  formatPrice,
  HIRE_BUS_TYPES,
  HIRE_CONDITIONS,
  HIRE_PRICE_TYPES,
  HIRE_DRIVER_OPTIONS,
  HIRE_CONTACT_METHODS,
  HIRE_FEATURES,
  HIRE_SUITABLE_FOR,
  HIRE_PROVINCE_DISTRICTS,
  HIRE_PROVINCES,
} from "@/lib/hire-listings";
import {
  createHireListing,
  updateHireListing,
  ApiError,
  type HireListingInput,
} from "@/lib/api";
import { uploadBusHirePhoto } from "@/lib/storage";
import { Banner } from "@/components/banner";
import { Spacing, BrandFonts } from "@/constants/theme";

const MAX_PHOTOS = 4;
const MAX_CUSTOM_FEATURE_LENGTH = 40;

type Theme = ReturnType<typeof useTheme>;
type PickerKey = "busType" | "condition" | "priceType" | "province" | "district" | "contactMethod" | "driverIncluded";

// Deep-linking (or a cold start) straight into this screen leaves no back
// history — router.back() would then throw the "GO_BACK not handled"
// warning, so fall back to the Hire tab instead.
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/hire");
}

/** Post/edit form for a single Hire-a-Bus listing. Editing is keyed off an
 *  optional `?id=` — the listing is fetched and ownership-checked client
 *  side purely so the UI doesn't even offer an edit affordance for someone
 *  else's ad; the API would reject the write either way. */
export default function HireListingFormScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = typeof rawId === "string" && rawId.length > 0 ? rawId : undefined;
  const isEdit = !!id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busType, setBusType] = useState<HireListingInput["busType"] | null>(null);
  const [condition, setCondition] = useState<HireListingInput["condition"] | null>(null);
  const [seatCount, setSeatCount] = useState("");
  const [isAc, setIsAc] = useState<boolean | null>(null);
  const [driverIncluded, setDriverIncluded] = useState<HireListingInput["driverIncluded"] | null>(null);
  const [busModel, setBusModel] = useState("");
  const [manufacturingYear, setManufacturingYear] = useState("");

  const [features, setFeatures] = useState<string[]>([]);
  const [customFeatureInput, setCustomFeatureInput] = useState("");

  const [priceAmount, setPriceAmount] = useState("");
  const [priceType, setPriceType] = useState<HireListingInput["priceType"] | null>(null);
  const [minHireDuration, setMinHireDuration] = useState("");
  const [area, setArea] = useState("");

  const [suitableFor, setSuitableFor] = useState<string[]>([]);

  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    HireListingInput["preferredContactMethod"] | null
  >(null);

  const [images, setImages] = useState<string[]>([]);

  const [confirmed, setConfirmed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);

  const [loadingListing, setLoadingListing] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No account → straight to sign-in, same idiom as tickets.tsx — the form
  // needs an access token, so there's nothing useful to show first.
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace({
        pathname: "/login",
        params: { next: isEdit ? `/hire/post?id=${id}` : "/hire/post" },
      });
    }
  }, [authLoading, session, isEdit, id]);

  // Prefill from the existing listing when editing. Bails to a not-found
  // state (rather than trusting the API to reject a foreign edit) if the
  // listing doesn't exist or isn't this user's.
  useEffect(() => {
    if (!isEdit || !session) return;
    let cancelled = false;
    getHireListing(id).then((listing) => {
      if (cancelled) return;
      if (!listing || listing.posted_by !== session.user.id) {
        setNotFound(true);
        setLoadingListing(false);
        return;
      }
      setTitle(listing.title);
      setDescription(listing.description ?? "");
      setBusType((listing.bus_type as HireListingInput["busType"]) ?? null);
      setCondition((listing.condition as HireListingInput["condition"]) ?? null);
      setSeatCount(listing.seat_count != null ? String(listing.seat_count) : "");
      setIsAc(listing.is_ac);
      setDriverIncluded((listing.driver_included as HireListingInput["driverIncluded"]) ?? null);
      setBusModel(listing.bus_model ?? "");
      setManufacturingYear(listing.manufacturing_year != null ? String(listing.manufacturing_year) : "");
      setFeatures(listing.features ?? []);
      setPriceAmount(listing.price_amount != null ? String(listing.price_amount) : "");
      setPriceType((listing.price_type as HireListingInput["priceType"]) ?? null);
      setMinHireDuration(listing.min_hire_duration ?? "");
      setArea(listing.area ?? "");
      setSuitableFor(listing.suitable_for ?? []);
      setProvince(listing.province ?? "");
      setDistrict(listing.district ?? "");
      setCity(listing.city ?? "");
      setContactName(listing.contact_name ?? "");
      setContactPhone(listing.contact_phone);
      setContactWhatsapp(listing.contact_whatsapp ?? "");
      setPreferredContactMethod(
        (listing.preferred_contact_method as HireListingInput["preferredContactMethod"]) ?? null,
      );
      setImages(listing.images ?? []);
      setLoadingListing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit, id, session]);

  async function pickPhoto() {
    if (images.length >= MAX_PHOTOS || uploadingPhoto || !session) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadBusHirePhoto(session.user.id, result.assets[0].uri);
      setImages((prev) => [...prev, url]);
    } catch {
      setError("Photo upload failed. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  function toggleFeature(value: string) {
    setFeatures((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function addCustomFeature() {
    const trimmed = customFeatureInput.trim().slice(0, MAX_CUSTOM_FEATURE_LENGTH);
    setCustomFeatureInput("");
    if (!trimmed) return;
    if (features.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    setFeatures((prev) => [...prev, trimmed]);
  }

  function toggleSuitableFor(value: string) {
    setSuitableFor((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function pickerTitle(key: PickerKey): string {
    switch (key) {
      case "busType":
        return "Bus Type";
      case "condition":
        return "Condition";
      case "priceType":
        return "Price Type";
      case "contactMethod":
        return "Preferred Contact Method";
      case "driverIncluded":
        return "Driver Included?";
      case "province":
        return "Province";
      case "district":
        return "District";
    }
  }

  function pickerOptions(key: PickerKey): { value: string; label: string }[] {
    switch (key) {
      case "busType":
        return HIRE_BUS_TYPES;
      case "condition":
        return HIRE_CONDITIONS;
      case "priceType":
        return HIRE_PRICE_TYPES;
      case "contactMethod":
        return HIRE_CONTACT_METHODS;
      case "driverIncluded":
        return HIRE_DRIVER_OPTIONS;
      case "province":
        return HIRE_PROVINCES.map((p) => ({ value: p, label: p }));
      case "district":
        return (HIRE_PROVINCE_DISTRICTS.find((p) => p.province === province)?.districts ?? []).map((d) => ({
          value: d,
          label: d,
        }));
    }
  }

  function pickerValue(key: PickerKey): string | null {
    switch (key) {
      case "busType":
        return busType;
      case "condition":
        return condition ?? null;
      case "priceType":
        return priceType;
      case "contactMethod":
        return preferredContactMethod ?? null;
      case "driverIncluded":
        return driverIncluded ?? null;
      case "province":
        return province || null;
      case "district":
        return district || null;
    }
  }

  function handlePickerSelect(key: PickerKey, value: string) {
    switch (key) {
      case "busType":
        setBusType(value as HireListingInput["busType"]);
        break;
      case "condition":
        setCondition(value as HireListingInput["condition"]);
        break;
      case "priceType":
        setPriceType(value as HireListingInput["priceType"]);
        break;
      case "contactMethod":
        setPreferredContactMethod(value as HireListingInput["preferredContactMethod"]);
        break;
      case "driverIncluded":
        setDriverIncluded(value as HireListingInput["driverIncluded"]);
        break;
      case "province":
        setProvince(value);
        setDistrict((prev) => {
          const districts = HIRE_PROVINCE_DISTRICTS.find((p) => p.province === value)?.districts ?? [];
          return districts.includes(prev) ? prev : "";
        });
        break;
      case "district":
        setDistrict(value);
        break;
    }
    setActivePicker(null);
  }

  const canSubmit =
    title.trim().length > 0 &&
    !!busType &&
    seatCount.trim().length > 0 &&
    isAc !== null &&
    priceAmount.trim().length > 0 &&
    !!priceType &&
    province.trim().length > 0 &&
    district.trim().length > 0 &&
    city.trim().length > 0 &&
    contactName.trim().length > 0 &&
    contactPhone.trim().length > 0 &&
    confirmed &&
    !submitting &&
    !uploadingPhoto;

  const hasDetails = title.trim().length > 0 || !!busType || priceAmount.trim().length > 0;

  async function submit() {
    if (!session || !canSubmit || !busType || isAc === null || !priceType) return;
    setSubmitting(true);
    setError(null);
    const input: HireListingInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      busType,
      condition: condition ?? undefined,
      seatCount: Number(seatCount),
      isAc,
      busModel: busModel.trim() || undefined,
      manufacturingYear: manufacturingYear.trim() ? Number(manufacturingYear) : undefined,
      features: features.length ? features : undefined,
      priceAmount: Number(priceAmount),
      priceType,
      minHireDuration: minHireDuration.trim() || undefined,
      area: area.trim() || undefined,
      suitableFor: suitableFor.length ? suitableFor : undefined,
      province,
      district,
      city: city.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactWhatsapp: contactWhatsapp.trim() || undefined,
      preferredContactMethod: preferredContactMethod ?? undefined,
      driverIncluded: driverIncluded ?? undefined,
      images,
    };
    try {
      const listing =
        isEdit && id
          ? await updateHireListing(session.access_token, id, input)
          : await createHireListing(session.access_token, input);
      router.replace({ pathname: "/hire/[id]", params: { id: listing.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your listing. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const customFeatures = features.filter((v) => !HIRE_FEATURES.some((f) => f.value === v));

  const previewBadges = [
    busType ? formatBusType(busType) : null,
    seatCount.trim() ? `${seatCount.trim()} seats` : null,
    isAc === null ? null : isAc ? "A/C" : "Non-A/C",
    condition ? formatCondition(condition) : null,
    driverIncluded ? formatDriverIncluded(driverIncluded) : null,
  ].filter((p): p is string => !!p);

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>{isEdit ? "Edit ad" : "Post an ad"}</Text>
        <View style={styles.backButton} />
      </View>
    </SafeAreaView>
  );

  if (authLoading || !session || loadingListing) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {hero}
        <View style={[styles.center, { paddingHorizontal: Spacing.four }]}>
          <Banner tone="error" message="That listing doesn't exist, or isn't yours to edit." />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={{ marginBottom: Spacing.three }}>
              <Banner tone="error" message={error} />
            </View>
          )}

          <Section
            title="Photos"
            subtitle="Upload up to 4 photos. Add a cover photo, plus interior and exterior shots."
            theme={theme}
          >
            <View style={styles.photoRow}>
              {images.map((url) => (
                <View key={url} style={styles.photoThumbWrap}>
                  <Image source={{ uri: url }} style={styles.photoThumb} />
                  <Pressable
                    onPress={() => removePhoto(url)}
                    hitSlop={8}
                    style={[styles.photoRemove, { backgroundColor: "rgba(0,0,0,0.6)" }]}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_PHOTOS && (
                <Pressable
                  onPress={pickPhoto}
                  disabled={uploadingPhoto}
                  style={[styles.photoAdd, { borderColor: theme.border }]}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator color={theme.brand} />
                  ) : (
                    <Ionicons name="add" size={24} color={theme.textSecondary} />
                  )}
                </Pressable>
              )}
            </View>
          </Section>

          <Section title="Basic Details" theme={theme}>
            <TextField
              label="Ad Title"
              required
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. 45-seat luxury coach for hire"
              theme={theme}
            />

            <PickerField
              label="Bus Type"
              required
              displayValue={busType ? formatBusType(busType) : null}
              placeholder="Select bus type"
              onPress={() => setActivePicker("busType")}
              theme={theme}
            />

            <PickerField
              label="Condition"
              displayValue={condition ? formatCondition(condition) : null}
              placeholder="Select condition"
              onPress={() => setActivePicker("condition")}
              theme={theme}
            />

            <TextField
              label="Seating Capacity"
              required
              value={seatCount}
              onChangeText={(v) => setSeatCount(v.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 45"
              keyboardType="number-pad"
              theme={theme}
            />

            <View style={{ marginBottom: Spacing.three }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>AC / Non-AC *</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => setIsAc(true)}
                  style={[
                    styles.segmentPill,
                    {
                      borderColor: isAc === true ? theme.brand : theme.border,
                      backgroundColor: isAc === true ? theme.brand : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: BrandFonts.uiSemiBold,
                      fontWeight: "700",
                      fontSize: 14,
                      color: isAc === true ? "#fff" : theme.text,
                    }}
                  >
                    A/C
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsAc(false)}
                  style={[
                    styles.segmentPill,
                    {
                      borderColor: isAc === false ? theme.brand : theme.border,
                      backgroundColor: isAc === false ? theme.brand : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: BrandFonts.uiSemiBold,
                      fontWeight: "700",
                      fontSize: 14,
                      color: isAc === false ? "#fff" : theme.text,
                    }}
                  >
                    Non-A/C
                  </Text>
                </Pressable>
              </View>
            </View>

            <PickerField
              label="Driver Included?"
              displayValue={driverIncluded ? formatDriverIncluded(driverIncluded) : null}
              placeholder="Select an option"
              onPress={() => setActivePicker("driverIncluded")}
              theme={theme}
            />

            <TextField
              label="Bus Model"
              value={busModel}
              onChangeText={setBusModel}
              placeholder="e.g. Volvo B11R"
              theme={theme}
            />

            <TextField
              label="Manufacturing Year"
              value={manufacturingYear}
              onChangeText={(v) => setManufacturingYear(v.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 2018"
              keyboardType="number-pad"
              theme={theme}
            />
          </Section>

          <Section title="Features & Facilities" theme={theme}>
            <View style={styles.chipGrid}>
              {HIRE_FEATURES.map((f) => {
                const active = features.includes(f.value);
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => toggleFeature(f.value)}
                    style={[
                      styles.toggleChip,
                      {
                        borderColor: active ? theme.brand : theme.border,
                        backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: BrandFonts.uiMedium,
                        fontSize: 13,
                        color: active ? theme.brand : theme.text,
                      }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
              {customFeatures.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => toggleFeature(v)}
                  style={[
                    styles.toggleChip,
                    { borderColor: theme.brand, backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Text style={{ fontFamily: BrandFonts.uiMedium, fontSize: 13, color: theme.brand }}>{v}</Text>
                  <Ionicons name="close" size={14} color={theme.brand} />
                </Pressable>
              ))}
            </View>
            <View style={styles.customFeatureRow}>
              <TextInput
                value={customFeatureInput}
                onChangeText={(v) => setCustomFeatureInput(v.slice(0, MAX_CUSTOM_FEATURE_LENGTH))}
                placeholder="Add another feature"
                placeholderTextColor={theme.textSecondary}
                onSubmitEditing={addCustomFeature}
                style={[
                  styles.input,
                  styles.customFeatureInput,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              <Pressable onPress={addCustomFeature} style={[styles.addFeatureButton, { backgroundColor: theme.brand }]}>
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            </View>
          </Section>

          <Section title="Hire Details" theme={theme}>
            <TextField
              label="Price (LKR)"
              required
              value={priceAmount}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9.]/g, "");
                const parts = cleaned.split(".");
                setPriceAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned);
              }}
              placeholder="e.g. 15000"
              keyboardType="decimal-pad"
              theme={theme}
            />

            <PickerField
              label="Price Type"
              required
              displayValue={priceType ? formatPriceType(priceType) : null}
              placeholder="Select price type"
              onPress={() => setActivePicker("priceType")}
              theme={theme}
            />

            <TextField
              label="Minimum Hire Duration"
              value={minHireDuration}
              onChangeText={setMinHireDuration}
              placeholder="e.g. 1 day, 3 days"
              theme={theme}
            />

            <TextField
              label="Service Area / Available Locations"
              value={area}
              onChangeText={setArea}
              placeholder="e.g. Colombo and suburbs, island-wide"
              theme={theme}
            />
          </Section>

          <Section title="Description" theme={theme}>
            <TextField
              label="Describe your bus"
              value={description}
              onChangeText={setDescription}
              placeholder="Tell renters about your bus, availability, routes you're comfortable with, etc."
              multiline
              theme={theme}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Suitable For</Text>
            <View style={styles.chipGrid}>
              {HIRE_SUITABLE_FOR.map((s) => {
                const active = suitableFor.includes(s.value);
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => toggleSuitableFor(s.value)}
                    style={[
                      styles.toggleChip,
                      {
                        borderColor: active ? theme.brand : theme.border,
                        backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
                      },
                    ]}
                  >
                    {active && <Ionicons name="checkmark" size={14} color={theme.brand} />}
                    <Text
                      style={{
                        fontFamily: BrandFonts.uiMedium,
                        fontSize: 13,
                        color: active ? theme.brand : theme.text,
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Location" theme={theme}>
            <PickerField
              label="Province"
              required
              displayValue={province || null}
              placeholder="Select province"
              onPress={() => setActivePicker("province")}
              theme={theme}
            />

            <PickerField
              label="District"
              required
              displayValue={district || null}
              placeholder="Select district"
              disabled={!province}
              disabledHint={!province ? "Select a province first" : undefined}
              onPress={() => setActivePicker("district")}
              theme={theme}
            />

            <TextField
              label="City"
              required
              value={city}
              onChangeText={setCity}
              placeholder="e.g. Nugegoda"
              theme={theme}
            />
          </Section>

          <Section title="Contact Details" theme={theme}>
            <TextField
              label="Contact Name"
              required
              value={contactName}
              onChangeText={setContactName}
              placeholder="e.g. Sunil Perera"
              theme={theme}
            />

            <TextField
              label="Phone Number"
              required
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="07XXXXXXXX"
              keyboardType="phone-pad"
              theme={theme}
            />

            <TextField
              label="WhatsApp"
              value={contactWhatsapp}
              onChangeText={setContactWhatsapp}
              placeholder="Optional, if different from phone"
              keyboardType="phone-pad"
              theme={theme}
            />

            <PickerField
              label="Preferred Contact Method"
              displayValue={preferredContactMethod ? formatContactMethod(preferredContactMethod) : null}
              placeholder="Select an option"
              onPress={() => setActivePicker("contactMethod")}
              theme={theme}
            />
          </Section>

          <Section title="Publish" theme={theme}>
            <Pressable onPress={() => setConfirmed((v) => !v)} style={styles.confirmRow}>
              <Ionicons
                name={confirmed ? "checkbox" : "square-outline"}
                size={22}
                color={confirmed ? theme.brand : theme.textSecondary}
              />
              <Text style={[styles.confirmText, { color: theme.text }]}>
                I confirm that the information provided is accurate.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setPreviewOpen(true)}
              disabled={!hasDetails}
              style={[styles.previewButton, { borderColor: theme.brand, opacity: hasDetails ? 1 : 0.5 }]}
            >
              <Ionicons name="eye-outline" size={18} color={theme.brand} />
              <Text style={{ fontFamily: BrandFonts.uiSemiBold, fontWeight: "700", fontSize: 14, color: theme.brand }}>
                Preview Ad
              </Text>
            </Pressable>

            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.button, { backgroundColor: theme.brand, opacity: canSubmit ? 1 : 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{isEdit ? "Save changes" : "Post ad"}</Text>
              )}
            </Pressable>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!activePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActivePicker(null)}>
          <Pressable
            style={[styles.pickerSheet, { backgroundColor: theme.backgroundElement }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontFamily: BrandFonts.uiSemiBold,
                color: theme.text,
                fontWeight: "800",
                fontSize: 15,
                marginBottom: Spacing.three,
              }}
            >
              {activePicker ? pickerTitle(activePicker) : ""}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {activePicker &&
                pickerOptions(activePicker).map((opt) => {
                  const selected = pickerValue(activePicker) === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => handlePickerSelect(activePicker, opt.value)}
                      style={[styles.pickerRow, { borderColor: theme.border }]}
                    >
                      <Text
                        style={{
                          fontFamily: selected ? BrandFonts.uiSemiBold : BrandFonts.uiMedium,
                          color: theme.text,
                          fontWeight: selected ? "800" : "500",
                          fontSize: 14,
                        }}
                      >
                        {opt.label}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={theme.brand} />}
                    </Pressable>
                  );
                })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={[styles.previewHero, { backgroundColor: theme.brand, paddingTop: insets.top + Spacing.three }]}>
            <Text style={styles.heroTitle}>Preview</Text>
            <Pressable onPress={() => setPreviewOpen(false)} hitSlop={8} style={styles.backButton}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.previewContainer}>
            {images.length > 0 ? (
              <Image source={{ uri: images[0] }} style={styles.previewImage} />
            ) : (
              <View style={[styles.previewImage, styles.previewImageFallback, { backgroundColor: theme.brand }]}>
                <Ionicons name="bus" size={40} color="rgba(255,255,255,0.5)" />
              </View>
            )}

            <Text style={[styles.previewPrice, { color: theme.brand }]}>
              {priceAmount.trim() && priceType ? formatPrice(Number(priceAmount), priceType) : "Price not set"}
            </Text>
            <Text style={[styles.previewTitle, { color: theme.text }]}>{title.trim() || "Untitled ad"}</Text>

            {(city || district || province) && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
                <Text style={{ fontFamily: BrandFonts.uiRegular, fontSize: 14, color: theme.textSecondary }}>
                  {[city, district, province].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}

            {previewBadges.length > 0 && (
              <View style={styles.badgeRow}>
                {previewBadges.map((b) => (
                  <View key={b} style={[styles.badge, { backgroundColor: theme.background }]}>
                    <Text style={[styles.badgeText, { color: theme.text }]}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {features.length > 0 && (
              <View style={styles.previewSection}>
                <Text style={[styles.previewSectionTitle, { color: theme.text }]}>Features & Facilities</Text>
                <View style={styles.chipWrapRow}>
                  {features.map((f) => (
                    <View key={f} style={[styles.chip, { backgroundColor: theme.background }]}>
                      <Text style={[styles.chipText, { color: theme.text }]}>{formatFeature(f)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {suitableFor.length > 0 && (
              <View style={styles.previewSection}>
                <Text style={[styles.previewSectionTitle, { color: theme.text }]}>Suitable For</Text>
                <View style={styles.chipWrapRow}>
                  {suitableFor.map((s) => (
                    <View key={s} style={[styles.chip, { backgroundColor: theme.background }]}>
                      <Text style={[styles.chipText, { color: theme.text }]}>{formatSuitableFor(s)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {description.trim() && (
              <View style={styles.previewSection}>
                <Text style={[styles.previewSectionTitle, { color: theme.text }]}>Description</Text>
                <Text style={[styles.previewDescription, { color: theme.text }]}>{description}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Section({
  title,
  subtitle,
  theme,
  children,
}: {
  title: string;
  subtitle?: string;
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function PickerField({
  label,
  required,
  displayValue,
  placeholder,
  disabled,
  disabledHint,
  onPress,
  theme,
}: {
  label: string;
  required?: boolean;
  displayValue: string | null;
  placeholder: string;
  disabled?: boolean;
  disabledHint?: string;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <View style={{ marginBottom: Spacing.three }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.dropdownField,
          { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: disabled ? 0.6 : 1 },
        ]}
      >
        <Text
          style={{
            fontFamily: displayValue ? BrandFonts.uiMedium : BrandFonts.uiRegular,
            fontSize: 15,
            color: displayValue ? theme.text : theme.textSecondary,
          }}
        >
          {displayValue ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      {disabled && disabledHint ? (
        <Text style={[styles.disabledHint, { color: theme.textSecondary }]}>{disabledHint}</Text>
      ) : null}
    </View>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  keyboardType,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "phone-pad" | "number-pad" | "decimal-pad";
  theme: Theme;
}) {
  return (
    <View style={{ marginBottom: Spacing.three }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.input,
          {
            borderColor: theme.border,
            color: theme.text,
            backgroundColor: theme.backgroundElement,
          },
          multiline && styles.multilineInput,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  backButton: { width: 32 },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: Spacing.four, paddingBottom: Spacing.six },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  cardTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 12,
    marginTop: 2,
  },
  cardBody: { marginTop: Spacing.three },
  fieldLabel: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    fontFamily: BrandFonts.uiRegular,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
  },
  multilineInput: { minHeight: 90, textAlignVertical: "top" },
  dropdownField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  disabledHint: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 12,
    marginTop: 6,
  },
  segmentRow: { flexDirection: "row", gap: Spacing.two },
  segmentPill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  toggleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  customFeatureInput: { flex: 1, paddingVertical: 12 },
  addFeatureButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  confirmText: {
    flex: 1,
    fontFamily: BrandFonts.uiRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: Spacing.three,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  pickerSheet: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    position: "absolute",
    bottom: 0,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  photoThumbWrap: { width: 72, height: 72, borderRadius: 10, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 16 },
  previewHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  previewContainer: { padding: Spacing.four, paddingBottom: Spacing.six },
  previewImage: { width: "100%", height: 200, borderRadius: 16 },
  previewImageFallback: { alignItems: "center", justifyContent: "center" },
  previewPrice: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    marginTop: Spacing.three,
  },
  previewTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: 4,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: Spacing.two },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.two },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: BrandFonts.uiSemiBold, fontSize: 12, fontWeight: "700" },
  previewSection: { marginTop: Spacing.three, gap: Spacing.one },
  previewSectionTitle: { fontFamily: BrandFonts.uiSemiBold, fontSize: 13, fontWeight: "700" },
  chipWrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: BrandFonts.uiMedium, fontSize: 12 },
  previewDescription: { fontSize: 14, lineHeight: 20 },
});
