import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import {
  listHireListings,
  formatBusType,
  formatPrice,
  HIRE_BUS_TYPES,
  HIRE_PRICE_TYPES,
  HIRE_PROVINCE_DISTRICTS,
  type HireListing,
} from "@/lib/hire-listings";
import { Spacing, BottomTabInset, BrandFonts } from "@/constants/theme";

const MIN_SEATS_OPTIONS = [10, 20, 30, 40];

type Filters = {
  busType: string | null;
  ac: "yes" | "no" | null;
  province: string | null;
  district: string | null;
  priceType: string | null;
  minSeats: number | null;
};

const EMPTY_FILTERS: Filters = {
  busType: null,
  ac: null,
  province: null,
  district: null,
  priceType: null,
  minSeats: null,
};

function countActive(f: Filters): number {
  return Object.values(f).filter((v) => v !== null).length;
}

function goToPost() {
  router.push("/hire/post");
}
function goToMyAds() {
  router.push("/hire/my-ads");
}

export default function HireScreen() {
  const theme = useTheme();
  const [listings, setListings] = useState<HireListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(() => {
    listHireListings()
      .then(setListings)
      .catch(() => setError("Could not load listings. Pull down to try again."));
  }, []);

  // useFocusEffect already fires on initial mount (first focus), so this
  // also covers the load-on-mount case without a separate effect.
  useFocusEffect(load);

  const filteredListings = useMemo(() => {
    if (!listings) return listings;
    return listings.filter((l) => {
      if (filters.busType && l.bus_type !== filters.busType) return false;
      if (filters.ac === "yes" && !l.is_ac) return false;
      if (filters.ac === "no" && l.is_ac) return false;
      if (filters.province && l.province !== filters.province) return false;
      if (filters.district && l.district !== filters.district) return false;
      if (filters.priceType && l.price_type !== filters.priceType) return false;
      if (filters.minSeats && l.seat_count < filters.minSeats) return false;
      return true;
    });
  }, [listings, filters]);

  const activeCount = countActive(filters);

  function openFilters() {
    setDraftFilters(filters);
    setFiltersOpen(true);
  }
  function applyFilters() {
    setFilters(draftFilters);
    setFiltersOpen(false);
  }
  function clearDraftFilters() {
    setDraftFilters(EMPTY_FILTERS);
  }

  const hero = (
    <SafeAreaView edges={["top"]} style={[styles.hero, { backgroundColor: theme.brand }]}>
      <View style={styles.heroTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Hire a Bus</Text>
          <Text style={styles.heroSubtitle}>Browse busses for trips and tours</Text>
        </View>
        <Pressable onPress={goToMyAds} hitSlop={8} style={styles.myAdsButton}>
          <Ionicons name="reader-outline" size={16} color="#fff" />
          <Text style={styles.myAdsButtonText}>My Ads</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {hero}

      <View style={[styles.filterBarRow, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={openFilters}
          style={[
            styles.filterButton,
            {
              borderColor: activeCount > 0 ? theme.brand : theme.border,
              backgroundColor: activeCount > 0 ? theme.backgroundSelected : theme.backgroundElement,
            },
          ]}
        >
          <Ionicons name="options-outline" size={15} color={activeCount > 0 ? theme.brand : theme.text} />
          <Text
            style={[styles.filterButtonText, { color: activeCount > 0 ? theme.brand : theme.text }]}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </Text>
        </Pressable>
        {activeCount > 0 && (
          <Pressable onPress={() => setFilters(EMPTY_FILTERS)} hitSlop={8}>
            <Text style={[styles.clearText, { color: theme.textSecondary }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary, textAlign: "center", paddingHorizontal: Spacing.four }}>
            {error}
          </Text>
        </View>
      ) : filteredListings === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.textSecondary }}>
                {activeCount > 0 ? "No listings match your filters." : "No listings yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => <ListingCard listing={item} theme={theme} />}
        />
      )}

      <Pressable
        onPress={goToPost}
        style={[styles.postButton, { backgroundColor: theme.brand }]}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.postButtonText}>Post an ad</Text>
      </Pressable>

      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFiltersOpen(false)}>
          <Pressable
            style={[styles.filterSheet, { backgroundColor: theme.backgroundElement }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: theme.text }]}>Filters</Text>
              <Pressable onPress={clearDraftFilters} hitSlop={8}>
                <Text style={[styles.clearText, { color: theme.brand }]}>Clear all</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <FilterSection title="Bus Type" theme={theme}>
                <ChipRow
                  theme={theme}
                  options={[{ value: null, label: "Any" }, ...HIRE_BUS_TYPES]}
                  value={draftFilters.busType}
                  onChange={(v) => setDraftFilters((p) => ({ ...p, busType: v }))}
                />
              </FilterSection>

              <FilterSection title="AC" theme={theme}>
                <ChipRow
                  theme={theme}
                  options={[
                    { value: null, label: "Any" },
                    { value: "yes", label: "A/C" },
                    { value: "no", label: "Non-A/C" },
                  ]}
                  value={draftFilters.ac}
                  onChange={(v) => setDraftFilters((p) => ({ ...p, ac: v as Filters["ac"] }))}
                />
              </FilterSection>

              <FilterSection title="Province" theme={theme}>
                <ChipRow
                  theme={theme}
                  options={[
                    { value: null, label: "Any" },
                    ...HIRE_PROVINCE_DISTRICTS.map((p) => ({ value: p.province, label: p.province })),
                  ]}
                  value={draftFilters.province}
                  onChange={(v) => setDraftFilters((p) => ({ ...p, province: v, district: null }))}
                />
              </FilterSection>

              {draftFilters.province && (
                <FilterSection title="District" theme={theme}>
                  <ChipRow
                    theme={theme}
                    options={[
                      { value: null, label: "Any" },
                      ...(
                        HIRE_PROVINCE_DISTRICTS.find((p) => p.province === draftFilters.province)
                          ?.districts ?? []
                      ).map((d) => ({ value: d, label: d })),
                    ]}
                    value={draftFilters.district}
                    onChange={(v) => setDraftFilters((p) => ({ ...p, district: v }))}
                  />
                </FilterSection>
              )}

              <FilterSection title="Price Type" theme={theme}>
                <ChipRow
                  theme={theme}
                  options={[{ value: null, label: "Any" }, ...HIRE_PRICE_TYPES]}
                  value={draftFilters.priceType}
                  onChange={(v) => setDraftFilters((p) => ({ ...p, priceType: v }))}
                />
              </FilterSection>

              <FilterSection title="Minimum Seats" theme={theme}>
                <ChipRow
                  theme={theme}
                  options={[
                    { value: null, label: "Any" },
                    ...MIN_SEATS_OPTIONS.map((n) => ({ value: String(n), label: `${n}+` })),
                  ]}
                  value={draftFilters.minSeats ? String(draftFilters.minSeats) : null}
                  onChange={(v) => setDraftFilters((p) => ({ ...p, minSeats: v ? Number(v) : null }))}
                />
              </FilterSection>
            </ScrollView>

            <Pressable onPress={applyFilters} style={[styles.applyButton, { backgroundColor: theme.brand }]}>
              <Text style={styles.applyButtonText}>Apply filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function FilterSection({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: Spacing.three }}>
      <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  theme,
  options,
  value,
  onChange,
}: {
  theme: ReturnType<typeof useTheme>;
  options: { value: string | null; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <View style={styles.chipWrapRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.label}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                borderColor: active ? theme.brand : theme.border,
                backgroundColor: active ? theme.brand : theme.background,
              },
            ]}
          >
            <Text style={{ fontFamily: BrandFonts.uiMedium, fontSize: 13, color: active ? "#fff" : theme.text }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ListingCard({
  listing,
  theme,
}: {
  listing: HireListing;
  theme: ReturnType<typeof useTheme>;
}) {
  const thumb = listing.images[0];
  const metaParts: string[] = [
    formatBusType(listing.bus_type) ?? listing.bus_type,
    `${listing.seat_count} seats`,
    listing.is_ac ? "A/C" : "Non-A/C",
  ];

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/hire/[id]", params: { id: listing.id } })}
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.brand }]}>
          <Ionicons name="bus" size={24} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
          {listing.title}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
            {listing.city}, {listing.district}
          </Text>
        </View>
        <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
          {metaParts.join(" · ")}
        </Text>
        <Text style={[styles.priceText, { color: theme.brand }]} numberOfLines={1}>
          {formatPrice(listing.price_amount, listing.price_type)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  heroTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontFamily: BrandFonts.uiRegular,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  myAdsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  myAdsButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  filterBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterButtonText: { fontFamily: BrandFonts.uiSemiBold, fontSize: 13, fontWeight: "600" },
  clearText: { fontFamily: BrandFonts.uiMedium, fontSize: 13 },
  listContent: {
    flexGrow: 1,
    padding: Spacing.four,
    paddingBottom: Spacing.six + BottomTabInset,
    gap: Spacing.three,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 15,
    fontWeight: "700",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: BrandFonts.uiRegular, fontSize: 12 },
  priceText: {
    fontFamily: BrandFonts.headingSemiBold,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  postButton: {
    position: "absolute",
    right: Spacing.four,
    bottom: BottomTabInset - Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  postButtonText: {
    fontFamily: BrandFonts.uiSemiBold,
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  filterSheet: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    position: "absolute",
    bottom: 0,
  },
  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.three,
  },
  filterSheetTitle: { fontFamily: BrandFonts.headingSemiBold, fontSize: 17, fontWeight: "800" },
  filterSectionTitle: {
    fontFamily: BrandFonts.uiSemiBold,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipWrapRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  applyButton: {
    marginTop: Spacing.two,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyButtonText: { fontFamily: BrandFonts.uiSemiBold, color: "#fff", fontWeight: "700", fontSize: 15 },
});
