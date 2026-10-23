import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LiveIncident } from "@trafficsense/shared";
import { fetchActiveIncidents } from "../src/lib/api";
import { describeFreshness } from "../src/lib/freshness";
import { evidenceLabel, formatClock } from "../src/lib/evidence";
import { categoryLabel } from "../src/lib/format";
import {
  AppHeader,
  BottomNav,
  Button,
  Card,
  EvidenceBadge,
  FreshnessChip,
  Icon,
  SimulatedBadge,
} from "../src/components/ui";
import { areIncidentListsEqual } from "../src/lib/traffic-equality";
import { colors, layout, radius, shadows, space, typography } from "../src/theme/tokens";

export default function HomeScreen() {
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("09:42");

  const loadIncidents = useCallback(async () => {
    try {
      const data = await fetchActiveIncidents();
      setIncidents((prev) => (areIncidentListsEqual(prev, data) ? prev : data));
      const now = new Date();
      setLastUpdated(formatClock(now));
    } catch {
      // Retain last known state on fetch error
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadIncidents();
      const interval = setInterval(() => void loadIncidents(), 30000);
      return () => clearInterval(interval);
    }, [loadIncidents]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadIncidents();
  };

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader subtitle="Mangaluru · Home" showLive />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Status Bar & Live Greeting */}
        <View style={styles.statusBarSection}>
          <View style={styles.liveMetaRow}>
            <View style={styles.liveIndicator}>
              <View style={styles.pulsingDotWrapper}>
                <View style={styles.pulsingHalo} />
                <View style={styles.pulsingCore} />
              </View>
              <Text style={styles.liveTimestampText}>
                Live · updated {lastUpdated} · 30s auto-refresh
              </Text>
            </View>

            <View style={styles.simulatedPill}>
              <Icon name="tune" size={13} color={colors.evidence} />
              <Text style={styles.simulatedPillText}>SIMULATED DATA</Text>
            </View>
          </View>

          <View style={styles.greetingRow}>
            <View style={styles.greetingTextCol}>
              <Text style={styles.greetingTitle}>Good morning, Commuter</Text>
              <Text style={styles.greetingSubtitle}>
                Coastal coastal skies overcast · Wet tarmac advisory active
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync data"
              onPress={() => {
                setRefreshing(true);
                void loadIncidents();
              }}
              style={({ pressed }) => [styles.syncButton, pressed && styles.syncButtonPressed]}
            >
              <Icon name="sync" size={16} color={colors.primary} />
              <Text style={styles.syncButtonText}>Sync</Text>
            </Pressable>
          </View>
        </View>

        {/* Hero Interactive Card: Plan My Route */}
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTitleGroup}>
              <View style={styles.heroIconBox}>
                <Icon name="alt_route" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.heroTitle}>Plan my route</Text>
                <Text style={styles.heroSubtitle}>
                  Mangaluru Central Corridor & Kankanady Bypass
                </Text>
              </View>
            </View>
            <View style={styles.corridorBadge}>
              <Text style={styles.corridorBadgeText}>CORRIDOR MODEL</Text>
            </View>
          </View>

          {/* Vector Map Schematic Visual */}
          <View style={styles.schematicContainer}>
            {/* Grid pattern background */}
            <View style={styles.schematicGrid}>
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
            </View>

            {/* Simulated Road Paths */}
            <View style={styles.roadNetwork}>
              {/* Secondary gray road */}
              <View style={styles.roadGray} />
              {/* Teal primary corridor */}
              <View style={styles.roadTeal} />
              {/* Congested orange segment */}
              <View style={styles.roadOrange} />
            </View>

            {/* Hampankatta Landmark Pin */}
            <View style={styles.pinHampankatta}>
              <View style={styles.pinDotTeal} />
              <Text style={styles.pinLabel}>Hampankatta</Text>
            </View>

            {/* Kadri Hills Landmark Pin */}
            <View style={styles.pinKadri}>
              <View style={styles.pinDotOrange} />
              <Text style={styles.pinLabel}>Kadri Hills</Text>
            </View>

            {/* Telemetry Bubble */}
            <View style={styles.telemetryBubble}>
              <Icon name="radar" size={13} color={colors.primary} />
              <Text style={styles.telemetryText}>Avg: 26 km/h</Text>
            </View>
          </View>

          {/* Quick Route Inputs */}
          <View style={styles.routeInputsStack}>
            <View style={styles.inputRow}>
              <Icon name="trip_origin" size={18} color={colors.primary} />
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>ORIGIN</Text>
                <Text style={styles.inputValue}>State Bank / Ladyhill</Text>
              </View>
            </View>

            <View style={styles.inputRow}>
              <Icon name="location_on" size={18} color="#7d4200" />
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>DESTINATION</Text>
                <Text style={styles.inputValue}>Pumpwell Circle / Kankanady</Text>
              </View>
              <View style={styles.swapIconBtn}>
                <Icon name="swap_vert" size={18} color={colors.textSecondary} />
              </View>
            </View>

            <Button
              title="Inspect Coastal Routes · ~18 min"
              onPress={() => router.push("/planner")}
              variant="primary"
              icon={<Icon name="directions_car" size={20} color="#ffffff" />}
            />
          </View>
        </Card>

        {/* 2x2 Quick Action Grid */}
        <View style={styles.actionGrid}>
          {/* Action 1: Report issue */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report issue: Waterlog, pothole, jam"
            onPress={() => router.push("/report")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.errorSurface }]}>
                <Icon name="warning" size={20} color={colors.error} />
              </View>
              <Text style={styles.tileBadgeGray}>1-tap</Text>
            </View>
            <View>
              <Text style={styles.tileTitle}>Report issue</Text>
              <Text style={styles.tileSubtitle}>Waterlog, pot, jam</Text>
            </View>
          </Pressable>

          {/* Action 2: Live map */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live map: Pan-city sensors"
            onPress={() => router.push("/traffic")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.primaryFixed }]}>
                <Icon name="explore" size={20} color={colors.primary} />
              </View>
              <View style={styles.tileBadgeLive}>
                <Text style={styles.tileBadgeLiveText}>LIVE</Text>
              </View>
            </View>
            <View>
              <Text style={styles.tileTitle}>Live map</Text>
              <Text style={styles.tileSubtitle}>Pan-city sensors</Text>
            </View>
          </Pressable>

          {/* Action 3: Plan route */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plan route: Monsoon detours"
            onPress={() => router.push("/planner")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.evidenceSurface }]}>
                <Icon name="alt_route" size={20} color={colors.secondary} />
              </View>
              <Icon name="chevron_right" size={18} color={colors.textMuted} />
            </View>
            <View>
              <Text style={styles.tileTitle}>Plan route</Text>
              <Text style={styles.tileSubtitle}>Monsoon detours</Text>
            </View>
          </Pressable>

          {/* Action 4: My journeys */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="My journeys: Saved daily routes"
            onPress={() => router.push("/journeys")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="shield" size={20} color={colors.primary} />
              </View>
              <Text style={styles.tileBadgeGreen}>Saved</Text>
            </View>
            <View>
              <Text style={styles.tileTitle}>My journeys</Text>
              <Text style={styles.tileSubtitle}>Saved daily routes</Text>
            </View>
          </Pressable>
        </View>

        {/* Active Near You Section */}
        <View style={styles.activeSection}>
          <View style={styles.activeSectionHeader}>
            <View style={styles.activeTitleRow}>
              <Icon name="radar" size={20} color={colors.primary} />
              <Text style={styles.sectionHeading}>Active near you</Text>
            </View>
            <View style={styles.reportsCountBadge}>
              <Text style={styles.reportsCountText}>
                {incidents.length > 0 ? `${incidents.length} reports` : "3 reports"}
              </Text>
            </View>
          </View>

          {/* Render Active Incident Cards */}
          {incidents.length > 0 ? (
            incidents.slice(0, 4).map((incident) => {
              const freshness = describeFreshness(incident.last_confirmed_at);
              const label = evidenceLabel(incident.level);
              return (
                <Card key={incident.id} style={styles.incidentCard}>
                  <View style={styles.incidentHeader}>
                    <View style={styles.incidentIconAndTitle}>
                      <View style={[styles.incidentCategoryIconBox, { backgroundColor: colors.errorSurface }]}>
                        <Icon name="flood" size={22} color={colors.error} />
                      </View>
                      <View style={styles.incidentTitleCol}>
                        <Text style={styles.incidentCategoryLabel}>
                          {incident.category.toUpperCase()}
                        </Text>
                        <Text style={styles.incidentTitle} numberOfLines={1}>
                          {categoryLabel(incident.category)}
                        </Text>
                      </View>
                    </View>
                    <FreshnessChip label={freshness.label} stale={freshness.stale} />
                  </View>

                  <Text style={styles.incidentDesc}>
                    {incident.level_reason || "Reported obstacle affecting corridor passage."}
                  </Text>

                  <View style={styles.badgeRow}>
                    <EvidenceBadge
                      level={incident.level}
                      label={label}
                    />
                    <SimulatedBadge label="SIMULATED FLOW" />
                  </View>

                  <View style={styles.infoStrip}>
                    <View style={styles.infoLeft}>
                      <Icon name="help_center" size={14} color={colors.textMuted} />
                      <Text style={styles.infoText}>Free-flow estimate · No guaranteed delay</Text>
                    </View>
                    <Text style={styles.gpsAccuracyText}>GPS ±12m</Text>
                  </View>

                  <View style={styles.incidentFooter}>
                    <Text style={styles.stillThereText}>Still there?</Text>
                    <View style={styles.actionPillsRow}>
                      <Pressable style={styles.confirmPill}>
                        <Icon name="thumb_up" size={14} color={colors.primary} />
                        <Text style={styles.confirmPillText}>Confirmed</Text>
                      </Pressable>
                      <Pressable style={styles.denyPill}>
                        <Icon name="thumb_down" size={14} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              );
            })
          ) : (
            // Default 3 demo incidents matching DESIGN.md prototype
            <>
              {/* Card 1: Waterlogging near Jyothi Circle */}
              <Card style={styles.incidentCard}>
                <View style={styles.incidentHeader}>
                  <View style={styles.incidentIconAndTitle}>
                    <View style={[styles.incidentCategoryIconBox, { backgroundColor: colors.successSurface }]}>
                      <Icon name="flood" size={22} color={colors.success} />
                    </View>
                    <View style={styles.incidentTitleCol}>
                      <Text style={[styles.incidentCategoryLabel, { color: colors.error }]}>
                        WATERLOGGING
                      </Text>
                      <Text style={styles.incidentTitle} numberOfLines={1}>
                        Jyothi Circle to Ambedkar Circle
                      </Text>
                    </View>
                  </View>
                  <FreshnessChip label="4m ago" stale={false} />
                </View>

                <Text style={styles.incidentDesc}>
                  Accumulated rainwater along curbside lanes. 2-wheelers diverting to central flyover ramp.
                </Text>

                <View style={styles.badgeRow}>
                  <EvidenceBadge level="L3" label="Multiple independent reports" />
                  <SimulatedBadge label="SIMULATED FLOW" />
                </View>

                <View style={styles.infoStrip}>
                  <View style={styles.infoLeft}>
                    <Icon name="help_center" size={14} color={colors.textMuted} />
                    <Text style={styles.infoText}>Free-flow estimate · No guaranteed delay</Text>
                  </View>
                  <Text style={styles.gpsAccuracyText}>GPS ±12m</Text>
                </View>

                <View style={styles.incidentFooter}>
                  <Text style={styles.stillThereText}>Still there?</Text>
                  <View style={styles.actionPillsRow}>
                    <Pressable style={styles.confirmPill}>
                      <Icon name="thumb_up" size={14} color={colors.primary} />
                      <Text style={styles.confirmPillText}>Confirmed (7)</Text>
                    </Pressable>
                    <Pressable style={styles.denyPill}>
                      <Icon name="thumb_down" size={14} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              </Card>

              {/* Card 2: Heavy Volume at Bunts Hostel Junction */}
              <Card style={styles.incidentCard}>
                <View style={styles.incidentHeader}>
                  <View style={styles.incidentIconAndTitle}>
                    <View style={[styles.incidentCategoryIconBox, { backgroundColor: colors.warningSurface }]}>
                      <Icon name="traffic" size={22} color={colors.warning} />
                    </View>
                    <View style={styles.incidentTitleCol}>
                      <Text style={[styles.incidentCategoryLabel, { color: colors.warning }]}>
                        HEAVY VOLUME
                      </Text>
                      <Text style={styles.incidentTitle} numberOfLines={1}>
                        Bunts Hostel Junction
                      </Text>
                    </View>
                  </View>
                  <FreshnessChip label="28m ago" stale />
                </View>

                <Text style={styles.incidentDesc}>
                  Slow moving traffic approaching Kadri bypass signal. Queue tailing 180 meters back.
                </Text>

                <View style={styles.badgeRow}>
                  <EvidenceBadge level="L2" label="Corroborated observation" />
                </View>

                <View style={styles.infoStrip}>
                  <View style={styles.infoLeft}>
                    <Icon name="group" size={14} color={colors.textMuted} />
                    <Text style={styles.infoText}>Reported by 2 commuters</Text>
                  </View>
                  <Text style={[styles.gpsAccuracyText, { color: colors.warning, fontWeight: "600" }]}>
                    Verify
                  </Text>
                </View>

                <View style={styles.incidentFooter}>
                  <Text style={styles.stillThereText}>Still there?</Text>
                  <View style={styles.actionPillsRow}>
                    <Pressable style={styles.confirmPill}>
                      <Icon name="thumb_up" size={14} color={colors.primary} />
                      <Text style={styles.confirmPillText}>Yes (3)</Text>
                    </Pressable>
                    <Pressable style={styles.confirmPill}>
                      <Icon name="check" size={14} color={colors.primary} />
                      <Text style={styles.confirmPillText}>Cleared</Text>
                    </Pressable>
                  </View>
                </View>
              </Card>

              {/* Card 3: Road Repair near Bejai Church */}
              <Card style={styles.incidentCard}>
                <View style={styles.incidentHeader}>
                  <View style={styles.incidentIconAndTitle}>
                    <View style={[styles.incidentCategoryIconBox, { backgroundColor: colors.surfaceContainerHigh }]}>
                      <Icon name="construction" size={22} color={colors.text} />
                    </View>
                    <View style={styles.incidentTitleCol}>
                      <Text style={[styles.incidentCategoryLabel, { color: colors.outline }]}>
                        ROAD WORKS
                      </Text>
                      <Text style={styles.incidentTitle} numberOfLines={1}>
                        Road Repair near Bejai Church
                      </Text>
                    </View>
                  </View>
                  <FreshnessChip label="12m ago" stale={false} />
                </View>

                <Text style={styles.incidentDesc}>
                  Pavement patching work on north-bound lane. Narrow passage, cautious passing needed.
                </Text>

                <View style={styles.badgeRow}>
                  <EvidenceBadge level="L1" label="Single observation" />
                </View>

                <View style={styles.incidentFooter}>
                  <Text style={styles.stillThereText}>Still there?</Text>
                  <View style={styles.actionPillsRow}>
                    <Pressable style={styles.confirmPill}>
                      <Icon name="thumb_up" size={14} color={colors.primary} />
                      <Text style={styles.confirmPillText}>Confirm (1)</Text>
                    </Pressable>
                    <Pressable style={styles.denyPill}>
                      <Icon name="thumb_down" size={14} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            </>
          )}
        </View>

        {/* Mangaluru Monsoon & Coastal Driving Guide Banner */}
        <View style={styles.alertBanner}>
          <View style={styles.alertIconCircle}>
            <Icon name="beach_access" size={20} color="#ffffff" />
          </View>
          <View style={styles.alertTextCol}>
            <Text style={styles.alertTitle} numberOfLines={1}>
              High Tide Alert · Ullal & Bengre
            </Text>
            <Text style={styles.alertSubtitle} numberOfLines={1}>
              Peak surge expected at 14:20 · Drive with caution
            </Text>
          </View>
          <View style={styles.alertChevronBtn}>
            <Icon name="chevron_right" size={18} color={colors.primary} />
          </View>
        </View>

        {/* Bottom Privacy & Transparency Note */}
        <View style={styles.privacyBox}>
          <View style={styles.privacyContentRow}>
            <Icon name="lock" size={20} color={colors.primary} />
            <Text style={styles.privacyText}>
              Location is requested only when you submit a report. Browsing live traffic requires no sign-in or tracking. Your privacy is protected under civic zero-retention principles.
            </Text>
          </View>
          <View style={styles.privacyAttributionRow}>
            <View style={styles.openFreeMapRow}>
              <Icon name="explore" size={14} color={colors.outline} />
              <Text style={styles.attributionText}>OpenFreeMap</Text>
            </View>
            <Text style={styles.attributionText}>© OpenMapTiles · © OSM contributors</Text>
          </View>
        </View>

        {/* Bottom Spacer for fixed BottomNav */}
        <View style={{ height: layout.safeBottomPadding }} />
      </ScrollView>

      <BottomNav activeTab="home" />
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
    paddingTop: space.sm,
    gap: space.md,
  },
  statusBarSection: {
    gap: 6,
    paddingTop: 2,
  },
  liveMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pulsingDotWrapper: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pulsingHalo: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    opacity: 0.25,
  },
  pulsingCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  liveTimestampText: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  simulatedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  simulatedPillText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.evidence,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  greetingTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  greetingTitle: {
    ...typography.headlineSm,
    fontWeight: "700",
    color: colors.text,
  },
  greetingSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceContainerLow,
  },
  syncButtonPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  syncButtonText: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "600",
  },
  heroCard: {
    padding: space.md,
    gap: 12,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  heroTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  heroIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  heroSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  corridorBadge: {
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  corridorBadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.evidence,
    fontWeight: "700",
  },
  schematicContainer: {
    width: "100%",
    height: 128,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceContainerLow,
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  schematicGrid: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  gridLineH1: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  gridLineH2: {
    position: "absolute",
    top: 88,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  gridLineV1: {
    position: "absolute",
    left: 100,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.outlineVariant,
  },
  gridLineV2: {
    position: "absolute",
    right: 100,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.outlineVariant,
  },
  roadNetwork: {
    ...StyleSheet.absoluteFill,
  },
  roadGray: {
    position: "absolute",
    left: 20,
    top: 90,
    width: "85%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
  },
  roadTeal: {
    position: "absolute",
    left: 36,
    top: 46,
    width: 160,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  roadOrange: {
    position: "absolute",
    left: 196,
    top: 50,
    width: 110,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#d9531e",
  },
  pinHampankatta: {
    position: "absolute",
    left: 28,
    top: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    ...shadows.card,
  },
  pinDotTeal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  pinKadri: {
    position: "absolute",
    right: 28,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    ...shadows.card,
  },
  pinDotOrange: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#7d4200",
  },
  pinLabel: {
    ...typography.codeSm,
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
  },
  telemetryBubble: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(225, 226, 231, 0.92)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  telemetryText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  routeInputsStack: {
    gap: 8,
    paddingTop: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.control,
    gap: 10,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    ...typography.labelSm,
    fontSize: 9.5,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inputValue: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.text,
  },
  swapIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridTile: {
    width: "48%",
    flexGrow: 1,
    height: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    justifyContent: "space-between",
    ...shadows.card,
  },
  gridTilePressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: colors.surfaceContainerLow,
  },
  tileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeGray: {
    ...typography.codeSm,
    color: colors.textSecondary,
  },
  tileBadgeLive: {
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tileBadgeLiveText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.primary,
    fontWeight: "700",
  },
  tileBadgeGreen: {
    ...typography.codeSm,
    color: colors.success,
    fontWeight: "600",
  },
  tileTitle: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.text,
  },
  tileSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
    marginTop: -1,
  },
  activeSection: {
    gap: 10,
    paddingTop: 4,
  },
  activeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionHeading: {
    ...typography.headlineSm,
    fontWeight: "700",
    color: colors.text,
  },
  reportsCountBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  reportsCountText: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  incidentCard: {
    padding: space.md,
    gap: 10,
  },
  incidentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  incidentIconAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  incidentCategoryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  incidentTitleCol: {
    flex: 1,
  },
  incidentCategoryLabel: {
    ...typography.labelSm,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  incidentTitle: {
    ...typography.titleMd,
    fontWeight: "600",
    color: colors.text,
  },
  incidentDesc: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerLow,
    padding: 8,
    borderRadius: 8,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  infoText: {
    ...typography.bodySm,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  gpsAccuracyText: {
    ...typography.codeSm,
    color: colors.outline,
  },
  incidentFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainer,
  },
  stillThereText: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  actionPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confirmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
  },
  confirmPillText: {
    ...typography.labelSm,
    color: colors.text,
    fontWeight: "600",
  },
  denyPill: {
    height: 34,
    width: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadows.card,
  },
  alertIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTextCol: {
    flex: 1,
  },
  alertTitle: {
    ...typography.titleSm,
    fontWeight: "600",
    color: colors.text,
  },
  alertSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
  },
  alertChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
  },
  privacyContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  privacyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  privacyAttributionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainer,
  },
  openFreeMapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attributionText: {
    ...typography.codeSm,
    color: colors.textSecondary,
    fontSize: 9.5,
  },
});
