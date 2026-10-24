import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTabBackHandler } from "../src/lib/use-tab-back-handler";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { LiveIncident, TrafficSegment } from "@trafficsense/shared";
import { apiConfigurationError, fetchActiveIncidents, fetchTrafficSegments } from "../src/lib/api";
import { categoryLabel } from "../src/lib/format";
import { describeFreshness } from "../src/lib/freshness";
import { evidenceLabel, formatClock, LIVE_REFRESH_MS } from "../src/lib/evidence";
import { TrafficMap } from "../src/components/traffic-map";
import {
  AppHeader,
  BottomNav,
  Card,
  EvidenceBadge,
  FeedbackBox,
  FreshnessChip,
  Icon,
  StatusBadge,
} from "../src/components/ui";
import { areIncidentListsEqual, areSegmentListsEqual } from "../src/lib/traffic-equality";
import { colors, layout, minTouchTarget, radius, shadows, space, typography } from "../src/theme/tokens";

type TrafficData = {
  incidents: LiveIncident[];
  segments: TrafficSegment[];
  readAt: string;
  updatedAt: Date;
};

type ViewMode = "map" | "list";

type TrafficControlsBarProps = {
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  clockString: string;
  count: number | string;
  floating?: boolean;
};

function TrafficControlsBar({
  activeView,
  onSelectView,
  searchQuery,
  onSearchQueryChange,
  clockString,
  count,
  floating,
}: TrafficControlsBarProps) {
  return (
    <View style={floating ? styles.topFloatingControls : styles.topControls}>
      <View style={styles.switcherRow}>
        {/* Segmented Pill Toggle */}
        <View style={styles.segmentedToggle} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === "map" }}
            accessibilityLabel="Switch to Map view"
            onPress={() => onSelectView("map")}
            style={[styles.toggleBtn, activeView === "map" && styles.toggleBtnActive]}
          >
            <Icon
              name="map"
              size={16}
              color={activeView === "map" ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.toggleBtnText,
                activeView === "map" && styles.toggleBtnTextActive,
              ]}
            >
              Map
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === "list" }}
            accessibilityLabel="Switch to List view"
            onPress={() => onSelectView("list")}
            style={[styles.toggleBtn, activeView === "list" && styles.toggleBtnActive]}
          >
            <Icon
              name="edit_note"
              size={16}
              color={activeView === "list" ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.toggleBtnText,
                activeView === "list" && styles.toggleBtnTextActive,
              ]}
            >
              List
            </Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{count}</Text>
            </View>
          </Pressable>
        </View>

        {/* Live Sync & Simulation Pill */}
        <View style={styles.liveSyncPill}>
          <View style={styles.liveDot} />
          <Text style={styles.clockText}>{clockString}</Text>
          <View style={styles.simulatedMiniBadge}>
            <Text style={styles.simulatedMiniBadgeText}>SIMULATED</Text>
          </View>
        </View>
      </View>

      {/* Corridor Search Bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color={colors.primary} />
        <TextInput
          placeholder="Search corridor (e.g. Balmatta Rd, Kadri, Ladyhill)"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={onSearchQueryChange}
          style={styles.searchInput}
        />
        <Pressable accessibilityLabel="Filter corridors" style={styles.micBtn}>
          <Icon name="mic" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function TrafficScreen() {
  useTabBackHandler();
  const [view, setView] = useState<ViewMode>("map");
  const [data, setData] = useState<TrafficData | null>(null);
  const [error, setError] = useState<string | null>(apiConfigurationError);
  const [loading, setLoading] = useState(!apiConfigurationError);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fitKey, setFitKey] = useState(0);
  const hasData = useRef(false);
  const [sheetTranslateY] = useState(() => new Animated.Value(0));

  const sheetDragResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => sheetTranslateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 84) {
        Animated.timing(sheetTranslateY, { toValue: 280, duration: 160, useNativeDriver: true }).start(() => {
          setSelectedId(null);
          sheetTranslateY.setValue(0);
        });
      } else {
        Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 3 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 3 }).start();
    },
  }), [sheetTranslateY]);

  const load = useCallback(async () => {
    if (apiConfigurationError) return;
    try {
      const [incidents, segments] = await Promise.all([fetchActiveIncidents(), fetchTrafficSegments()]);
      const updatedAt = new Date();
      setData((prev) => {
        if (
          prev &&
          areIncidentListsEqual(prev.incidents, incidents) &&
          areSegmentListsEqual(prev.segments, segments.segments) &&
          prev.readAt === segments.read_at
        ) {
          return prev;
        }
        return { incidents, segments: segments.segments, readAt: segments.read_at, updatedAt };
      });
      setError(null);
      if (!hasData.current) {
        hasData.current = true;
        setFitKey((val) => val + 1);
        setSelectedId(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Traffic service is unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const selected = useMemo(() => {
    if (!data) return null;
    return data.incidents.find((incident) => incident.id === selectedId) ?? null;
  }, [data, selectedId]);

  const filteredIncidents = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.incidents;
    const q = searchQuery.toLowerCase();
    return data.incidents.filter(
      (inc) =>
        categoryLabel(inc.category).toLowerCase().includes(q) ||
        inc.category.toLowerCase().includes(q) ||
        inc.level_reason.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const clockString = data ? formatClock(data.updatedAt) : "Not synced";

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader subtitle="Mangaluru · Map" showLive />

      {/* Error Feedback Box if any */}
      {error ? (
        <View style={styles.errorPadding}>
          <FeedbackBox
            variant="warning"
            title="Update interrupted"
            message={
              data
                ? `Showing last recorded update from ${formatClock(data.updatedAt)}. ${error}`
                : error
            }
            actionText="Try again"
            onAction={() => void load()}
          />
        </View>
      ) : null}

      {/* Main Content: Map or List */}
      {view === "map" ? (
        <View style={styles.mapContainer}>
          <TrafficMap
            incidents={data?.incidents ?? []}
            segments={data?.segments ?? []}
            selectedIncidentId={selectedId}
            onSelectIncident={(id) => setSelectedId(id)}
            fitKey={fitKey}
            fullScreen
            floatingControls
            floatingTopOffset={115}
            hideDetailsCard
          />

          {/* Top Floating Controls Overlay */}
          <TrafficControlsBar
            activeView={view}
            onSelectView={setView}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            clockString={clockString}
            count={data?.incidents.length ?? "—"}
            floating
          />

          {loading && !data ? (
            <View style={styles.mapLoadingOverlay} accessibilityLiveRegion="polite" accessibilityLabel="Loading live reports and corridor feeds">
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading live reports and corridor feeds…</Text>
            </View>
          ) : null}

          {/* Collapsible Inspection Bottom Sheet */}
          {selected ? (
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
              {/* Drag Handle */}
              <View
                {...sheetDragResponder.panHandlers}
                accessible
                accessibilityLabel="Drag down to close incident details"
                accessibilityHint="Swipe down to dismiss this report. Select a map marker or list item to open it again."
                style={styles.dragHandleWrapper}
              >
                <View style={styles.dragHandle} />
              </View>

              <View style={styles.sheetContent}>
                {/* Header & Verification Row */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetTitleGroup}>
                    <View style={styles.sheetCategoryIconBox}>
                      <Icon name="flood" size={20} color={colors.error} />
                    </View>
                    <Text numberOfLines={1} style={styles.sheetTitle}>
                      {categoryLabel(selected.category)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close incident details"
                    accessibilityHint="Dismisses this report. Select a map marker or list item to open it again."
                    onPress={() => setSelectedId(null)}
                    style={styles.sheetCloseBtn}
                  >
                    <Icon name="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                {/* Badges Row */}
                <View style={styles.sheetBadgesRow}>
                  <EvidenceBadge
                    level={selected.level}
                    label={evidenceLabel(selected.level)}
                  />
                  <FreshnessChip
                    label={describeFreshness(selected.last_confirmed_at).label}
                    stale={describeFreshness(selected.last_confirmed_at).stale}
                  />
                  <StatusBadge label={provenanceLabel(selected.provenance)} variant={selected.provenance === "authority" ? "info" : "neutral"} />
                </View>

                {/* Location Descriptor */}
                <View style={styles.locationDescriptorBox}>
                  <Icon name="location_on" size={20} color={colors.primary} />
                  <View style={styles.locationDescriptorTextCol}>
                    <Text style={styles.locationDescriptorTitle}>
                      {categoryLabel(selected.category)}
                    </Text>
                    <Text style={styles.locationDescriptorSubtitle}>
                      {selected.level_reason || "No additional detail was returned for this report."}
                    </Text>
                  </View>
                </View>

                {/* Civic Honesty & Transparency Statement */}
                <View style={styles.civicHonestyBox}>
                  <Text style={styles.civicHonestyText}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      Observation from commuters:{" "}
                    </Text>
                    A report is a driver observation, not proof of systemic failure. Delay projections are simulated estimates, not sensor-calibrated guarantees.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.sheetActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Update incident status"
                    onPress={() => router.push("/report")}
                    style={styles.sheetSecondaryBtn}
                  >
                    <Icon name="location_on" size={18} color={colors.primary} />
                    <Text style={styles.sheetSecondaryBtnText}>Update Status</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Avoid corridor and plan detour"
                    onPress={() => router.push("/planner")}
                    style={styles.sheetPrimaryBtn}
                  >
                    <Icon name="alt_route" size={18} color="#ffffff" />
                    <Text style={styles.sheetPrimaryBtnText}>Avoid Corridor</Text>
                  </Pressable>
                </View>

                {/* Tile Privacy Card */}
                <View style={styles.tilePrivacyCard}>
                  <View style={styles.tilePrivacyLeft}>
                    <Icon name="shield" size={16} color={colors.textSecondary} />
                    <Text style={styles.tilePrivacyText} numberOfLines={1}>
                      OpenStreetMap receives tile requests for the viewed area; your GPS fix itself is not sent.
                    </Text>
                  </View>
                  <Text style={styles.detailsLink}>Details</Text>
                </View>
              </View>
            </Animated.View>
          ) : (data?.incidents.length ?? 0) > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View active reports summary"
              onPress={() => {
                if (data?.incidents[0]) setSelectedId(data.incidents[0].id);
              }}
              style={styles.floatingSummaryPill}
            >
              <View style={styles.floatingSummaryDot} />
              <Text style={styles.floatingSummaryText}>
                {data?.incidents.length} community reports active · Tap to inspect
              </Text>
              <Icon name="expand_more" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        /* Accessible List View */
        <View style={{ flex: 1 }}>
          <TrafficControlsBar
            activeView={view}
            onSelectView={setView}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            clockString={clockString}
            count={data?.incidents.length ?? "—"}
          />

          <ScrollView
            contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {loading && !data ? (
            <View style={styles.centerLoading} accessibilityLiveRegion="polite" accessibilityLabel="Loading live reports and corridor feeds">
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>Loading live reports and corridor feeds…</Text>
            </View>
          ) : filteredIncidents.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No active reports in this view</Text>
              <Text style={styles.emptySubtitle}>
                Clear passage reported along monitored coastal corridors.
              </Text>
            </Card>
          ) : (
            filteredIncidents.map((incident) => {
              const freshness = describeFreshness(incident.last_confirmed_at);
              const label = evidenceLabel(incident.level);
              return (
                <Card
                  key={incident.id}
                  onPress={() => {
                    setSelectedId(incident.id);
                    setView("map");
                  }}
                  style={styles.listItemCard}
                >
                  <View style={styles.listHeaderRow}>
                    <View style={styles.listTitleGroup}>
                      <View style={[styles.listCategoryIconBox, { backgroundColor: colors.errorSurface }]}>
                        <Icon name="warning" size={18} color={colors.error} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listCategoryName}>
                          {categoryLabel(incident.category).toUpperCase()}
                        </Text>
                        <Text style={styles.listRoadName} numberOfLines={1}>
                          {categoryLabel(incident.category)}
                        </Text>
                      </View>
                    </View>
                    <FreshnessChip label={freshness.label} stale={freshness.stale} />
                  </View>

                  {incident.level_reason ? (
                    <Text style={styles.listDesc}>{incident.level_reason}</Text>
                  ) : null}

                  <View style={styles.listBadgesRow}>
                    <EvidenceBadge level={incident.level} label={label} />
                    <StatusBadge label={provenanceLabel(incident.provenance)} variant={incident.provenance === "authority" ? "info" : "neutral"} />
                  </View>
                </Card>
              );
            })
          )}
          <View style={{ height: layout.safeBottomPadding }} />
        </ScrollView>
      </View>
      )}

      <BottomNav activeTab="map" />
    </View>
  );
}

function provenanceLabel(provenance: LiveIncident["provenance"]) {
  if (provenance === "authority") return "Authority update";
  if (provenance === "verified") return "Verified incident";
  return "Community report";
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topControls: {
    paddingHorizontal: space.gutter,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: colors.background,
    zIndex: 20,
  },
  topFloatingControls: {
    position: "absolute",
    top: 10,
    left: space.gutter,
    right: space.gutter,
    gap: 8,
    zIndex: 35,
  },
  switcherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentedToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceContainer,
    padding: 3,
    borderRadius: radius.pill,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  toggleBtnText: {
    ...typography.labelMd,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  toggleBtnTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  liveSyncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    ...shadows.card,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  clockText: {
    ...typography.codeSm,
    color: colors.textSecondary,
  },
  simulatedMiniBadge: {
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  simulatedMiniBadgeText: {
    ...typography.codeSm,
    fontSize: 8.5,
    color: colors.evidence,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    gap: 10,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.text,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  errorPadding: {
    paddingHorizontal: space.gutter,
    paddingBottom: 8,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: "rgba(250, 248, 255, 0.82)",
  },
  floatingControlsStack: {
    position: "absolute",
    right: 16,
    top: 16,
    gap: 10,
    zIndex: 30,
  },
  roundFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sheet,
  },
  pressedFab: {
    backgroundColor: colors.surfaceContainer,
  },
  legendPill: {
    position: "absolute",
    left: 16,
    bottom: 230,
    flexDirection: "row",
    gap: 6,
    zIndex: 30,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    ...shadows.card,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.labelSm,
    fontSize: 10,
    color: colors.text,
    fontWeight: "600",
  },
  mapAttribution: {
    position: "absolute",
    right: 8,
    bottom: 216,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  attributionText: {
    ...typography.codeSm,
    fontSize: 9,
    color: colors.textMuted,
  },
  floatingSummaryPill: {
    position: "absolute",
    bottom: 74,
    left: space.gutter,
    right: space.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sheet,
    zIndex: 35,
  },
  floatingSummaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  floatingSummaryText: {
    ...typography.labelMd,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
    marginHorizontal: 10,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.sheet,
    zIndex: 40,
  },
  dragHandleWrapper: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: minTouchTarget,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
  },
  sheetContent: {
    paddingHorizontal: space.gutter,
    paddingBottom: 14,
    gap: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sheetCategoryIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    ...typography.headlineSm,
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  sheetCloseBtn: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  locationDescriptorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: radius.control,
  },
  locationDescriptorTextCol: {
    flex: 1,
  },
  locationDescriptorTitle: {
    ...typography.titleSm,
    color: colors.text,
    fontWeight: "600",
  },
  locationDescriptorSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
  },
  civicHonestyBox: {
    backgroundColor: colors.surfaceContainer,
    padding: 10,
    borderRadius: radius.control,
  },
  civicHonestyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sheetActionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 2,
  },
  sheetSecondaryBtn: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sheetSecondaryBtnText: {
    ...typography.labelLg,
    color: colors.primary,
    fontWeight: "700",
  },
  sheetPrimaryBtn: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: radius.control,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...shadows.card,
  },
  sheetPrimaryBtnText: {
    ...typography.labelLg,
    color: "#ffffff",
    fontWeight: "700",
  },
  tilePrivacyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLow,
    padding: 8,
    borderRadius: radius.control,
  },
  tilePrivacyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  tilePrivacyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  detailsLink: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "600",
  },
  listContainer: {
    paddingHorizontal: space.gutter,
    paddingTop: 8,
    gap: 12,
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  emptySubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  listItemCard: {
    padding: space.md,
    gap: 8,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  listTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  listCategoryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  listCategoryName: {
    ...typography.labelSm,
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  listRoadName: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  listDesc: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  listBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
