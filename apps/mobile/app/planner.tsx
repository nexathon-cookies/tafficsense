import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTabBackHandler } from "../src/lib/use-tab-back-handler";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { fetchActiveIncidents, fetchRoute, fetchTrafficSegments } from "../src/lib/api";
import { mangaluruPlaces } from "../src/lib/places";
import { categoryLabel, formatDistance, formatEstimatedDuration } from "../src/lib/format";
import { describeFreshness } from "../src/lib/freshness";
import { TrafficMap } from "../src/components/traffic-map";
import {
  AppHeader,
  BottomNav,
  Button,
  Card,
  FeedbackBox,
  Icon,
} from "../src/components/ui";
import { colors, layout, minTouchTarget, radius, shadows, space, typography } from "../src/theme/tokens";

type PlanState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; routes: RouteOption[]; incidents: LiveIncident[]; incidentsOk: boolean; checkedAt: Date };

const POPULAR_CORRIDORS = [
  { label: "Hampankatta → Bejai", from: 0, to: 1, tag: "City Core" },
  { label: "Pumpwell → Central Rwy", from: 4, to: 5, tag: "South Hub" },
  { label: "Hampankatta → Airport", from: 0, to: 7, tag: "NH 66 North" },
  { label: "Ladyhill → Kadri", from: 3, to: 6, tag: "Inner Loop" },
];

export default function PlannerScreen() {
  const [startIndex, setStartIndex] = useState(0);
  const [destIndex, setDestIndex] = useState(1);
  const [preferBus, setPreferBus] = useState(false);
  const [plan, setPlan] = useState<PlanState>({ kind: "idle" });
  const [allIncidents, setAllIncidents] = useState<LiveIncident[]>([]);
  const [allSegments, setAllSegments] = useState<TrafficSegment[]>([]);
  const [showAlternative, setShowAlternative] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [pickerModal, setPickerModal] = useState<"origin" | "dest" | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [fitKey, setFitKey] = useState(0);
  const [plannerViewMode, setPlannerViewMode] = useState<"map" | "details">("map");

  // Android: hardware back → Home (when no modal open), or closes modal
  useTabBackHandler(pickerModal === null);
  useEffect(() => {
    if (pickerModal === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPickerModal(null);
      return true;
    });
    return () => sub.remove();
  }, [pickerModal]);

  const checkRoute = async (start = startIndex, dest = destIndex) => {
    setShowAlternative(false);
    setSelectedIncidentId(null);
    setSelectedRouteId(null);
    setPlan({ kind: "loading" });
    try {
      const [routes, incidentsResult, segmentsResult] = await Promise.all([
        fetchRoute(mangaluruPlaces[start].coords, mangaluruPlaces[dest].coords),
        fetchActiveIncidents().catch(() => [] as LiveIncident[]),
        fetchTrafficSegments().catch(() => ({ segments: [] as TrafficSegment[] })),
      ]);
      setAllIncidents(incidentsResult);
      setAllSegments(segmentsResult.segments);
      setSelectedRouteId(routes.find((route) => route.is_recommended)?.id ?? routes[0]?.id ?? null);
      setFitKey((val) => val + 1);
      setPlan({
        kind: "result",
        routes,
        incidents: incidentsResult,
        incidentsOk: true,
        checkedAt: new Date(),
      });
    } catch (reason) {
      try {
        const fallbackIncs = await fetchActiveIncidents();
        setAllIncidents(fallbackIncs);
      } catch {}
      setPlan({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Route service is unavailable.",
      });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkRoute();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const swapPlaces = () => {
    const nextStart = destIndex;
    const nextDest = startIndex;
    setStartIndex(nextStart);
    setDestIndex(nextDest);
    void checkRoute(nextStart, nextDest);
  };

  const selectPreset = (from: number, to: number) => {
    setStartIndex(from);
    setDestIndex(to);
    void checkRoute(from, to);
  };

  const recommendedRoute =
    plan.kind === "result"
      ? plan.routes.find((r) => r.is_recommended) ?? plan.routes[0]
      : null;

  const primaryRoute =
    plan.kind === "result"
      ? plan.routes.find((route) => route.id === selectedRouteId) ?? recommendedRoute
      : null;

  const alternativeRoute =
    plan.kind === "result"
      ? plan.routes.find((r) => r.id !== primaryRoute?.id && r.avoids_incident) ?? null
      : null;

  const primaryIncidents =
    plan.kind === "result" && primaryRoute
      ? allIncidents.filter((inc) => primaryRoute.incidents_on_route?.some((w) => w.id === inc.id))
      : [];

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) return null;
    return allIncidents.find((i) => i.id === selectedIncidentId) ?? null;
  }, [allIncidents, selectedIncidentId]);

  const originPlace = mangaluruPlaces[startIndex];
  const destPlace = mangaluruPlaces[destIndex];

  const filteredPlaces = useMemo(() => {
    if (!searchFilter.trim()) return mangaluruPlaces;
    const q = searchFilter.toLowerCase();
    return mangaluruPlaces.filter((p) => p.name.toLowerCase().includes(q));
  }, [searchFilter]);

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader subtitle="Mangaluru · Route Planner" showLive />

      {plannerViewMode === "map" ? (
        <View style={styles.fullScreenMapContainer}>
          {/* Top Floating Route Bar */}
          <View style={styles.floatingRouteTopBar}>
            <View style={styles.topBarPlacesRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Origin: ${originPlace.name}. Tap to change.`}
                onPress={() => {
                  setSearchFilter("");
                  setPickerModal("origin");
                }}
                style={styles.topBarPlaceTarget}
              >
                <View style={styles.topBarDotGreen} />
                <Text numberOfLines={1} style={styles.topBarPlaceText}>
                  {originPlace.name}
                </Text>
              </Pressable>
              <Icon name="chevron_right" size={14} color={colors.textSecondary} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Destination: ${destPlace.name}. Tap to change.`}
                onPress={() => {
                  setSearchFilter("");
                  setPickerModal("dest");
                }}
                style={styles.topBarPlaceTarget}
              >
                <View style={styles.topBarDotRed} />
                <Text numberOfLines={1} style={styles.topBarPlaceText}>
                  {destPlace.name}
                </Text>
              </Pressable>
            </View>

            <View style={styles.topBarActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Swap origin and destination"
                onPress={swapPlaces}
                style={styles.topBarIconBtn}
              >
                <Icon name="swap_vert" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch to Route Details view"
                onPress={() => setPlannerViewMode("details")}
                style={styles.topBarDetailsBtn}
              >
                <Icon name="edit_note" size={15} color={colors.primary} />
                <Text style={styles.topBarDetailsBtnText}>Details</Text>
              </Pressable>
            </View>
          </View>

          {/* Full-Screen TrafficMap with Accident Pins & Corridors */}
          <TrafficMap
            segments={allSegments}
            routes={plan.kind === "result" ? plan.routes : []}
            selectedRouteId={primaryRoute?.id ?? null}
            alternativeId={showAlternative ? (alternativeRoute?.id ?? null) : null}
            incidents={allIncidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={(id) => setSelectedIncidentId(id)}
            fitKey={fitKey}
            fullScreen
            floatingControls
            floatingTopOffset={64}
            hideDetailsCard
          />

          {/* Floating Selected Incident Toast */}
          {selectedIncident ? (
            <View style={styles.floatingIncidentAlertCard}>
              <View style={styles.floatingIncidentAlertHeader}>
                <View style={styles.floatingIncidentIconBadge}>
                  <Icon name="warning" size={16} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.floatingIncidentCategoryText}>
                    {categoryLabel(selectedIncident.category)} · {selectedIncident.level}
                  </Text>
                  <Text numberOfLines={1} style={styles.floatingIncidentReasonText}>
                    {selectedIncident.level_reason || "Reported on corridor"}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close incident banner"
                  onPress={() => setSelectedIncidentId(null)}
                  hitSlop={10}
                  style={styles.floatingIncidentCloseBtn}
                >
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Floating Bottom Route Card */}
          {plan.kind === "loading" ? (
            <View style={styles.floatingEmptyPromptPill}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.floatingEmptyPromptText}>Calculating fastest corridor route…</Text>
            </View>
          ) : primaryRoute ? (
            <Card style={styles.floatingBottomRouteCard}>
              <View style={styles.floatingCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.floatingCardEyebrow}>
                    {showAlternative && alternativeRoute ? "ALTERNATIVE DETOUR" : "PRIMARY RECOMMENDED ROUTE"}
                  </Text>
                  <Text numberOfLines={1} style={styles.floatingCardTitle}>
                    {showAlternative && alternativeRoute ? alternativeRoute.name : primaryRoute.name}
                  </Text>
                </View>
                <View style={styles.floatingCardDurationBadge}>
                  <Text style={styles.floatingCardDurationText}>
                    ~{formatEstimatedDuration(showAlternative && alternativeRoute ? alternativeRoute.duration_s : primaryRoute.duration_s)}
                  </Text>
                </View>
              </View>

              <View style={styles.floatingCardMetaRow}>
                <View style={styles.floatingCardMetaItem}>
                  <Icon name="directions_car" size={14} color={colors.textSecondary} />
                  <Text style={styles.floatingCardMetaText}>
                    {formatDistance(showAlternative && alternativeRoute ? alternativeRoute.distance_m : primaryRoute.distance_m)}
                  </Text>
                </View>
                <View style={styles.floatingCardMetaItem}>
                  <Icon
                    name={primaryIncidents.length ? "warning" : "verified"}
                    size={14}
                    color={primaryIncidents.length ? colors.warning : colors.success}
                  />
                  <Text
                    style={[
                      styles.floatingCardMetaText,
                      { color: primaryIncidents.length ? colors.warning : colors.success, fontWeight: "600" },
                    ]}
                  >
                    {primaryIncidents.length ? `${primaryIncidents.length} hazard report(s)` : "Free-flow baseline"}
                  </Text>
                </View>
              </View>

              {alternativeRoute ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAlternative ? "Show recommended route" : "Inspect incident-avoiding alternative"}
                  onPress={() => setShowAlternative((prev) => !prev)}
                  style={[
                    styles.floatingAltToggleBtn,
                    showAlternative && styles.floatingAltToggleBtnActive,
                  ]}
                >
                  <Icon
                    name="alt_route"
                    size={16}
                    color={showAlternative ? "#ffffff" : colors.secondary}
                  />
                  <Text
                    style={[
                      styles.floatingAltToggleText,
                      showAlternative && styles.floatingAltToggleTextActive,
                    ]}
                  >
                    {showAlternative ? "Viewing Alternative Detour" : "Inspect Alternative Detour"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View full turn-by-turn and corridor details"
                onPress={() => setPlannerViewMode("details")}
                style={styles.floatingViewDetailsBtn}
              >
                <Text style={styles.floatingViewDetailsText}>View full turn-by-turn & monsoon advisory</Text>
                <Icon name="chevron_right" size={16} color={colors.primary} />
              </Pressable>
            </Card>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to Route Details"
              onPress={() => setPlannerViewMode("details")}
              style={styles.floatingEmptyPromptPill}
            >
              <Text style={styles.floatingEmptyPromptText}>Tap to choose places and calculate route</Text>
              <Icon name="chevron_right" size={16} color={colors.primary} />
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {/* Corridor Context & Title Header */}
        <View style={styles.corridorHeader}>
          <View style={styles.corridorTitleCol}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.corridorEyebrow}>MANGALURU CORRIDOR NAVIGATOR</Text>
            </View>
            <Text style={styles.screenTitle}>Plan Commuter Route</Text>
          </View>
          <View style={styles.nhLiveBadge}>
            <Icon name="tune" size={13} color={colors.secondary} />
            <Text style={styles.nhLiveBadgeText}>NH 66 LIVE</Text>
          </View>
        </View>

        {/* Unified Route Selection Card */}
        <Card style={styles.routeCard}>
          <View style={styles.inputGroupContainer}>
            {/* Visual Route Stem / Indicators */}
            <View style={styles.routeStemContainer}>
              <View style={styles.originIndicator}>
                <View style={styles.originDot} />
              </View>
              <View style={styles.stemLineTrack}>
                <View style={styles.stemDot} />
                <View style={styles.stemDot} />
                <View style={styles.stemDot} />
              </View>
              <View style={styles.destIndicator}>
                <Icon name="location_on" size={18} color={colors.secondary} />
              </View>
            </View>

            {/* Inputs Column */}
            <View style={styles.fieldsColumn}>
              {/* Origin Field */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Select origin: currently ${originPlace.name}`}
                onPress={() => {
                  setSearchFilter("");
                  setPickerModal("origin");
                }}
                style={({ pressed }) => [
                  styles.fieldBox,
                  pressed && styles.fieldBoxPressed,
                ]}
              >
                <View style={styles.fieldTextGroup}>
                  <Text style={styles.fieldSubLabel}>ORIGIN (START POINT)</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {originPlace.name}
                  </Text>
                </View>
                <Icon name="expand_more" size={18} color={colors.textMuted} />
              </Pressable>

              <View style={styles.fieldDivider} />

              {/* Destination Field */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Select destination: currently ${destPlace.name}`}
                onPress={() => {
                  setSearchFilter("");
                  setPickerModal("dest");
                }}
                style={({ pressed }) => [
                  styles.fieldBox,
                  pressed && styles.fieldBoxPressed,
                ]}
              >
                <View style={styles.fieldTextGroup}>
                  <Text style={styles.fieldSubLabel}>DESTINATION (END POINT)</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {destPlace.name}
                  </Text>
                </View>
                <Icon name="expand_more" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Vertically Centered Swap Button */}
            <View style={styles.swapActionWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Swap origin and destination places"
                onPress={swapPlaces}
                style={({ pressed }) => [
                  styles.swapCircleBtn,
                  pressed && styles.swapCircleBtnPressed,
                ]}
              >
                <Icon name="swap_vert" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Quick Demo Corridors Row */}
          <View style={styles.presetsContainer}>
            <Text style={styles.presetsLabel}>POPULAR CORRIDORS:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsScroll}
            >
              {POPULAR_CORRIDORS.map((preset) => {
                const isSelected = startIndex === preset.from && destIndex === preset.to;
                return (
                  <Pressable
                    key={preset.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${preset.label}`}
                    onPress={() => selectPreset(preset.from, preset.to)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      isSelected && styles.presetChipSelected,
                      pressed && styles.presetChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        isSelected && styles.presetChipTextSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                    <View
                      style={[
                        styles.presetTagBadge,
                        isSelected && styles.presetTagBadgeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetTagText,
                          isSelected && styles.presetTagTextSelected,
                        ]}
                      >
                        {preset.tag}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Public Bus Corridor Toggle */}
          <View style={styles.preferenceRow}>
            <View style={styles.switchCol}>
              <Switch
                value={preferBus}
                onValueChange={setPreferBus}
                trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                thumbColor="#ffffff"
              />
              <Text style={styles.switchLabel}>Prefer public bus corridor</Text>
            </View>
            <View style={styles.busBadge}>
              <Icon name="directions_bus" size={14} color={colors.primary} />
              <Text style={styles.busBadgeText}>KSRTC/City</Text>
            </View>
          </View>

          {/* Primary Submit CTA */}
          <Button
            title={plan.kind === "loading" ? "Checking corridor route…" : "Check corridor route"}
            loading={plan.kind === "loading"}
            onPress={() => void checkRoute()}
            variant="primary"
            icon={<Icon name="alt_route" size={20} color="#ffffff" />}
          />
        </Card>

        {/* Error Feedback Box if needed */}
        {plan.kind === "error" ? (
          <FeedbackBox
            variant="error"
            title="Route unavailable"
            message={plan.message}
            actionText="Try again"
            onAction={() => void checkRoute()}
          />
        ) : null}

        {/* Map Container */}
        <View style={styles.mapCard}>
          <TrafficMap
            segments={allSegments}
            routes={plan.kind === "result" ? plan.routes : []}
            selectedRouteId={primaryRoute?.id ?? null}
            alternativeId={showAlternative ? (alternativeRoute?.id ?? null) : null}
            incidents={allIncidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={(id) => setSelectedIncidentId(id)}
            fitKey={fitKey}
            floatingControls
            mapHeight={280}
            onOpenFullScreen={() => setPlannerViewMode("map")}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to full-screen map view"
            onPress={() => setPlannerViewMode("map")}
            style={styles.fullScreenExpandPrompt}
          >
            <Icon name="fullscreen" size={16} color={colors.primary} />
            <Text style={styles.fullScreenExpandPromptText}>Full-Screen Google Map View</Text>
            <Icon name="chevron_right" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {/* Idle / Educational Empty State */}
        {plan.kind === "idle" || plan.kind === "loading" ? (
          <Card
            style={styles.emptyCard}
            accessibilityLiveRegion={plan.kind === "loading" ? "polite" : "none"}
          >
            <View style={styles.emptyHeaderRow}>
              <View style={styles.emptyIconCircle}>
                <Icon name="alt_route" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyTitle}>
                  {plan.kind === "loading"
                    ? "Evaluating corridor conditions…"
                    : "Ready to plan your corridor"}
                </Text>
                <Text style={styles.emptyBody}>
                  {plan.kind === "loading"
                    ? "Calculating free-flow synthetic baselines and matching active community obstacle reports."
                    : "Select your start and end points above and tap Check corridor route to evaluate travel times and hazards."}
                </Text>
              </View>
            </View>

            <View style={styles.featurePoints}>
              <View style={styles.featureItem}>
                <Icon name="check_circle" size={15} color={colors.primary} />
                <Text style={styles.featureText}>
                  Free-flow synthetic baselines (no speculative delay estimates)
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Icon name="check_circle" size={15} color={colors.primary} />
                <Text style={styles.featureText}>
                  Verified community hazard reports along NH 66 corridors
                </Text>
              </View>
              <View style={styles.featureItem}>
                <Icon name="check_circle" size={15} color={colors.primary} />
                <Text style={styles.featureText}>
                  Automatic incident-avoiding detour recommendations
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Results State */}
        {plan.kind === "result" && primaryRoute ? (
          <>
            <Card style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryTitleGroup}>
                  <Icon name="verified" size={18} color={colors.primary} />
                  <Text style={styles.summaryEyebrow}>PRIMARY CORRIDOR</Text>
                </View>
                <View style={styles.baselineBadge}>
                  <Text style={styles.baselineBadgeText}>BASELINE</Text>
                </View>
              </View>

              <Text style={styles.corridorName}>{primaryRoute.name}</Text>

              {/* Telemetry Strip */}
              <View style={styles.telemetryStrip}>
                <View style={styles.telemetryItem}>
                  <Icon name="directions_car" size={18} color={colors.primary} />
                  <Text style={styles.telemetryNumber}>
                    {formatDistance(primaryRoute.distance_m)}
                  </Text>
                </View>
                <View style={styles.telemetryDivider} />
                <View style={styles.telemetryItem}>
                  <Icon name="radar" size={18} color={colors.primary} />
                  <Text style={styles.telemetryNumber}>
                    {`${formatEstimatedDuration(primaryRoute.duration_s)} free-flow`}
                  </Text>
                </View>
              </View>

              <View style={styles.noteStrip}>
                <Icon name="help_center" size={15} color={colors.textSecondary} />
                <Text style={styles.noteStripText}>
                  Note: Delay savings are not shown. Travel times are free-flow synthetic baselines computed without speculative dynamic projections.
                </Text>
              </View>
            </Card>

            {/* Community Reports Affecting Corridor */}
            <View
              style={[
                styles.warningContainer,
                primaryIncidents.length === 0 && styles.warningContainerClear,
              ]}
            >
              <View style={styles.warningHeaderRow}>
                <View
                  style={[
                    styles.warningIconCircle,
                    primaryIncidents.length === 0 && styles.warningIconCircleClear,
                  ]}
                >
                  <Icon
                    name={primaryIncidents.length > 0 ? "warning" : "shield"}
                    size={20}
                    color="#ffffff"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningCardTitle}>
                    {primaryIncidents.length > 0
                      ? `${primaryIncidents.length} Community report${
                          primaryIncidents.length > 1 ? "s" : ""
                        } affect this corridor`
                      : "No active community reports affect this corridor"}
                  </Text>
                  <Text style={styles.warningCardSubtitle}>
                    {plan.incidentsOk
                      ? "Based on the current community-report feed"
                      : "The report feed could not be refreshed for this check"}
                  </Text>
                </View>
              </View>

              {primaryIncidents.length > 0 ? (
                primaryIncidents.map((inc) => {
                  const warning = primaryRoute?.incidents_on_route?.find((w) => w.id === inc.id);
                  const distText = warning
                    ? ` (${(warning.distance_to_route_m / 1000).toFixed(1)} km from route)`
                    : "";
                  return (
                    <View key={inc.id} style={styles.affectingReportItem}>
                      <View style={styles.affectingReportTop}>
                        <Text style={styles.affectingReportTitle}>
                          {categoryLabel(inc.category)}
                        </Text>
                        <View style={styles.corroboratedBadge}>
                          <Text style={styles.corroboratedBadgeText}>
                            {inc.level} Corroborated
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.affectingReportDesc}>
                        {inc.level_reason || categoryLabel(inc.category)}
                        {distText}
                      </Text>
                      <View style={styles.affectingReportMeta}>
                        <Text style={styles.affectingMetaText}>
                          Confirmed by {inc.report_count ?? 1} motorists
                        </Text>
                        <Text style={styles.affectingMetaText}>
                          {describeFreshness(inc.last_confirmed_at).label}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.noReportsText}>
                  {plan.incidentsOk
                    ? "Route corridor is currently clear of reported obstacles."
                    : "Try refresh when the community-report feed is available."}
                </Text>
              )}

              {/* Toggle Alternative Route Button */}
              {alternativeRoute ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show alternative route on the map"
                  onPress={() => setShowAlternative(!showAlternative)}
                  style={({ pressed }) => [
                    styles.showAltBtn,
                    pressed && styles.showAltBtnPressed,
                  ]}
                >
                  <Icon name="alt_route" size={18} color="#ffffff" />
                  <Text style={styles.showAltBtnText}>
                    {showAlternative ? "Hide alternative route" : "Show alternative route on the map"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Detour Recommendation Card (When Alternative active) */}
            {showAlternative && alternativeRoute ? (
              <Card style={styles.detourCard}>
                <View style={styles.detourHeader}>
                  <View style={styles.detourTitleGroup}>
                    <View style={[styles.labelDot, { backgroundColor: colors.secondary }]} />
                    <Text style={styles.detourEyebrow}>DETOUR RECOMMENDATION</Text>
                  </View>
                  <View style={styles.clearBadge}>
                    <View style={[styles.legendBarDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.clearBadgeText}>
                      {alternativeRoute.avoids_incident
                        ? "Avoids reported incident"
                        : "Alternative"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.detourName}>{alternativeRoute.name}</Text>

                <View style={styles.telemetryStrip}>
                  <View style={styles.telemetryItem}>
                    <Text style={styles.telemetryNumber}>
                      {formatDistance(alternativeRoute.distance_m)}
                    </Text>
                  </View>
                  <View style={styles.telemetryDivider} />
                  <View style={styles.telemetryItem}>
                    <Text style={styles.telemetryNumber}>
                      {formatEstimatedDuration(alternativeRoute.duration_s)}
                    </Text>
                  </View>
                  <View style={styles.telemetryDivider} />
                  <View style={styles.telemetryItem}>
                    <Text style={[styles.telemetryNumber, { color: colors.success }]}>
                      {alternativeRoute.incidents_on_route?.length ?? 0} active reports
                    </Text>
                  </View>
                </View>

                <View style={styles.detourSelectRow}>
                  <View style={styles.detourL0Badge}>
                    <Icon name="shield" size={14} color={colors.secondary} />
                    <Text style={styles.detourL0Text}>
                      {alternativeRoute.avoids_incident
                        ? "Marked as avoiding an incident"
                        : "Alternative returned by the planner"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedRouteId(alternativeRoute.id);
                      setFitKey((value) => value + 1);
                    }}
                    style={styles.selectThisBtn}
                  >
                    <Text style={styles.selectThisBtnText}>Select this</Text>
                    <Icon name="chevron_right" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              </Card>
            ) : null}

            {/* Civic Transparency Notice */}
            <View style={styles.civicHonestyCard}>
              <View style={styles.civicHonestyHeader}>
                <Icon name="shield" size={18} color={colors.primary} />
                <Text style={styles.civicHonestyTitle}>Community-report coverage</Text>
              </View>
              <Text style={styles.civicHonestyBody}>
                This route uses community reports only, not automated traffic sensors. Report availability and freshness depend on the latest successful feed refresh.
              </Text>
              <View style={styles.syncFooterRow}>
                <Text style={styles.syncFooterText}>
                  Checked {plan.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh corridor state"
                  onPress={() => void checkRoute()}
                  style={styles.refreshBtn}
                >
                  <Icon name="sync" size={14} color={colors.primary} />
                  <Text style={styles.refreshBtnText}>REFRESH</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : null}

        <View style={{ height: layout.safeBottomPadding }} />
      </ScrollView>
      )}

      {/* Place Picker Modal with Tap-Outside Backdrop & Search Filter */}
      <Modal
        visible={pickerModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerModal(null)}
      >
        <View style={styles.modalBackdrop}>
          {/* Tapping outside sheet closes modal */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerModal(null)}
            accessibilityLabel="Close picker backdrop"
          />

          <View style={styles.modalContent}>
            {/* Sheet Handle */}
            <View style={styles.sheetHandleRow}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {pickerModal === "origin" ? "Select Starting Point" : "Select Destination"}
                </Text>
                <Text style={styles.modalSubtitle}>Mangaluru demonstration corridor presets</Text>
              </View>
              <Pressable
                accessibilityLabel="Close picker"
                onPress={() => setPickerModal(null)}
                style={styles.modalCloseBtn}
              >
                <Icon name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Place Search Filter */}
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search landmarks or junctions…"
                placeholderTextColor={colors.textMuted}
                value={searchFilter}
                onChangeText={setSearchFilter}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {filteredPlaces.map((place) => {
                const originalIndex = mangaluruPlaces.findIndex((p) => p.name === place.name);
                const isSelected =
                  pickerModal === "origin" ? originalIndex === startIndex : originalIndex === destIndex;
                const isDisabled =
                  pickerModal === "origin" ? originalIndex === destIndex : originalIndex === startIndex;

                return (
                  <Pressable
                    key={place.name}
                    disabled={isDisabled}
                    onPress={() => {
                      const nextStart = pickerModal === "origin" ? originalIndex : startIndex;
                      const nextDest = pickerModal === "dest" ? originalIndex : destIndex;
                      if (pickerModal === "origin") {
                        setStartIndex(originalIndex);
                      } else {
                        setDestIndex(originalIndex);
                      }
                      setPickerModal(null);
                      void checkRoute(nextStart, nextDest);
                    }}
                    style={({ pressed }) => [
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      isDisabled && styles.modalItemDisabled,
                      pressed && !isDisabled && styles.modalItemPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.modalItemIconCircle,
                        pickerModal === "origin"
                          ? { backgroundColor: colors.surfaceContainerHighest }
                          : { backgroundColor: colors.evidenceSurface },
                      ]}
                    >
                      <Icon
                        name={pickerModal === "origin" ? "trip_origin" : "location_on"}
                        size={18}
                        color={pickerModal === "origin" ? colors.primary : colors.secondary}
                      />
                    </View>

                    <View style={styles.modalItemInfo}>
                      <Text
                        style={[
                          styles.modalItemText,
                          isSelected && styles.modalItemTextSelected,
                          isDisabled && styles.modalItemTextDisabled,
                        ]}
                      >
                        {place.name}
                      </Text>
                      <Text style={styles.modalItemSubtext}>
                        {isDisabled
                          ? "Currently selected for opposite field"
                          : `Coordinates: ${place.coords[1].toFixed(4)}°N, ${place.coords[0].toFixed(4)}°E`}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View style={styles.selectedCheckCircle}>
                        <Icon name="check" size={14} color="#ffffff" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BottomNav activeTab="plan" />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: space.gutter,
    paddingTop: 8,
    gap: 14,
  },
  corridorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  corridorTitleCol: {
    flex: 1,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  corridorEyebrow: {
    ...typography.codeSm,
    fontSize: 10.5,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  screenTitle: {
    ...typography.headlineMd,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
  },
  nhLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  nhLiveBadgeText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.secondary,
    fontWeight: "700",
  },
  routeCard: {
    padding: space.md,
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  inputGroupContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.control,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    gap: 10,
  },
  routeStemContainer: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    width: 22,
  },
  originIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  stemLineTrack: {
    height: 38,
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  stemDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.outlineVariant,
  },
  destIndicator: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldsColumn: {
    flex: 1,
    gap: 2,
  },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  fieldBoxPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  fieldTextGroup: {
    flex: 1,
    gap: 1,
  },
  fieldSubLabel: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  fieldValue: {
    ...typography.titleSm,
    fontSize: 14.5,
    color: colors.text,
    fontWeight: "700",
  },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.surfaceContainerHighest,
    marginVertical: 4,
  },
  swapActionWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  swapCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  swapCircleBtnPressed: {
    backgroundColor: colors.surfaceContainerHigh,
    transform: [{ scale: 0.92 }],
  },
  presetsContainer: {
    gap: 6,
  },
  presetsLabel: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  presetsScroll: {
    gap: 8,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  presetChipSelected: {
    backgroundColor: colors.primaryFixed,
    borderColor: colors.primary,
  },
  presetChipPressed: {
    opacity: 0.8,
  },
  presetChipText: {
    ...typography.labelSm,
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.text,
  },
  presetChipTextSelected: {
    color: colors.onPrimaryFixed,
    fontWeight: "700",
  },
  presetTagBadge: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  presetTagBadgeSelected: {
    backgroundColor: colors.onPrimaryFixed,
  },
  presetTagText: {
    ...typography.codeSm,
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  presetTagTextSelected: {
    color: "#ffffff",
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  switchCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  switchLabel: {
    ...typography.labelMd,
    color: colors.text,
    fontWeight: "600",
  },
  busBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  busBadgeText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.primary,
    fontWeight: "700",
  },
  mapCard: {
    width: "100%",
    borderRadius: radius.card,
    backgroundColor: colors.surfaceContainer,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  emptyCard: {
    padding: space.md,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  emptyIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  emptyBody: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  featurePoints: {
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    ...typography.bodySm,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  summaryCard: {
    padding: space.md,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryEyebrow: {
    ...typography.codeSm,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  baselineBadge: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  baselineBadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  corridorName: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  telemetryStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: radius.control,
    gap: 12,
  },
  telemetryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  telemetryNumber: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.text,
  },
  telemetryDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.outlineVariant,
  },
  noteStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: radius.control,
  },
  noteStripText: {
    ...typography.bodySm,
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 15,
  },
  warningContainer: {
    backgroundColor: colors.errorSurface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "#ffd8d2",
    padding: 14,
    gap: 10,
  },
  warningContainerClear: {
    backgroundColor: colors.successSurface,
    borderColor: "#c3e7d6",
  },
  warningHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  warningIconCircleClear: {
    backgroundColor: colors.success,
  },
  warningCardTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  warningCardSubtitle: {
    ...typography.bodySm,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  affectingReportItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  affectingReportTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  affectingReportTitle: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.text,
  },
  corroboratedBadge: {
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  corroboratedBadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.secondary,
    fontWeight: "700",
  },
  affectingReportDesc: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  affectingReportMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  affectingMetaText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.textMuted,
  },
  noReportsText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  showAltBtn: {
    height: 48,
    borderRadius: radius.control,
    backgroundColor: colors.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadows.card,
  },
  showAltBtnPressed: {
    opacity: 0.9,
  },
  showAltBtnText: {
    ...typography.labelLg,
    color: "#ffffff",
    fontWeight: "700",
  },
  detourCard: {
    padding: space.md,
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.secondary,
  },
  detourHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detourTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detourEyebrow: {
    ...typography.codeSm,
    color: colors.secondary,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  clearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.successSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  clearBadgeText: {
    ...typography.labelSm,
    color: colors.success,
    fontWeight: "600",
  },
  detourName: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  detourSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  detourL0Badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    flex: 1,
    marginRight: 8,
  },
  detourL0Text: {
    ...typography.codeSm,
    color: colors.secondary,
    fontWeight: "600",
    fontSize: 10.5,
  },
  selectThisBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  selectThisBtnText: {
    ...typography.labelMd,
    fontWeight: "700",
    color: colors.primary,
  },
  civicHonestyCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  civicHonestyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  civicHonestyTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  civicHonestyBody: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  syncFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  syncFooterText: {
    ...typography.codeSm,
    color: colors.textMuted,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  refreshBtnText: {
    ...typography.codeSm,
    fontWeight: "700",
    color: colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.md,
    gap: 12,
    maxHeight: "85%",
  },
  sheetHandleRow: {
    alignItems: "center",
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  modalTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  modalSubtitle: {
    ...typography.bodySm,
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalCloseBtn: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.text,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: minTouchTarget + 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.control,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  modalItemSelected: {
    backgroundColor: colors.surfaceContainerLow,
  },
  modalItemPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  modalItemDisabled: {
    opacity: 0.45,
  },
  modalItemIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalItemInfo: {
    flex: 1,
    gap: 2,
  },
  modalItemText: {
    ...typography.titleSm,
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalItemTextDisabled: {
    color: colors.textMuted,
  },
  modalItemSubtext: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.textMuted,
  },
  selectedCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  fullScreenMapContainer: {
    flex: 1,
    position: "relative",
    width: "100%",
    height: "100%",
  },
  floatingRouteTopBar: {
    position: "absolute",
    top: 10,
    left: space.gutter,
    right: space.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 25,
    ...shadows.sheet,
  },
  topBarPlacesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  topBarDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  topBarDotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  topBarPlaceText: {
    ...typography.labelSm,
    color: colors.text,
    fontWeight: "700",
    maxWidth: 90,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  topBarDetailsBtnText: {
    ...typography.labelSm,
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  floatingBottomRouteCard: {
    position: "absolute",
    bottom: 70,
    left: space.gutter,
    right: space.gutter,
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 25,
    ...shadows.sheet,
  },
  floatingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  floatingCardEyebrow: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.secondary,
    fontWeight: "700",
  },
  floatingCardTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
    marginTop: 2,
  },
  floatingCardDurationBadge: {
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  floatingCardDurationText: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "800",
  },
  floatingCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  floatingCardMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  floatingCardMetaText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 12,
  },
  floatingAltToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.evidenceSurface,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  floatingAltToggleBtnActive: {
    backgroundColor: colors.secondary,
  },
  floatingAltToggleText: {
    ...typography.labelSm,
    color: colors.secondary,
    fontWeight: "700",
  },
  floatingAltToggleTextActive: {
    color: "#ffffff",
  },
  floatingViewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  floatingViewDetailsText: {
    ...typography.bodySm,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  floatingEmptyPromptPill: {
    position: "absolute",
    bottom: 74,
    left: space.gutter,
    right: space.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 25,
    ...shadows.sheet,
  },
  floatingEmptyPromptText: {
    ...typography.labelMd,
    color: colors.text,
    fontWeight: "600",
  },
  fullScreenExpandPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.control,
    marginTop: 8,
  },
  fullScreenExpandPromptText: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "700",
  },
  topBarPlaceTarget: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  floatingIncidentAlertCard: {
    position: "absolute",
    bottom: 245,
    left: space.gutter,
    right: space.gutter,
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderRadius: radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.error,
    zIndex: 26,
    ...shadows.sheet,
  },
  floatingIncidentAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  floatingIncidentIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingIncidentCategoryText: {
    ...typography.labelMd,
    color: colors.error,
    fontWeight: "700",
  },
  floatingIncidentReasonText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  floatingIncidentCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
});
