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
        {/* Top Greeting & Live-Status Indicator */}
        <View style={styles.statusBarSection}>
          <View style={styles.greetingHeaderRow}>
            <View style={styles.greetingTextCol}>
              <Text style={styles.radarEyebrow}>LIVE CORRIDOR RADAR</Text>
              <Text style={styles.greetingTitle}>Good morning, Commuter</Text>
            </View>

            <View style={styles.liveStatusPill}>
              <View style={styles.pulsingDotWrapper}>
                <View style={styles.pulsingHalo} />
                <View style={styles.pulsingCore} />
              </View>
              <Text style={styles.liveStatusPillText}>Live · {lastUpdated}</Text>
            </View>
          </View>
        </View>

        {/* Corridor Overview Card: Daily Commute */}
        <Card style={styles.heroCard}>
          <View style={styles.commuteHeaderRow}>
            <View style={styles.commuteTitleCol}>
              <View style={styles.commuteTag}>
                <Icon name="directions_car" size={16} color={colors.secondary} />
                <Text style={styles.commuteTagText}>Daily Commute</Text>
              </View>
              <Text style={styles.commuteTitle}>NH 66 / KPT Corridor</Text>
            </View>
            <View style={styles.commuteEtaCol}>
              <Text style={styles.commuteEtaValue}>
                24<Text style={styles.commuteEtaUnit}>min</Text>
              </Text>
              <Text style={styles.commuteEtaDelta}>3 min faster than usual</Text>
            </View>
          </View>

          {/* Live Density Progress Gauge */}
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeMetaRow}>
              <Text style={styles.gaugeMetaRoute}>Optimal route via Pumpwell</Text>
              <Text style={styles.gaugeMetaDist}>18.4 km</Text>
            </View>
            <View style={styles.gaugeBar}>
              <View style={[styles.gaugeSegment, { width: "72%", backgroundColor: colors.primary }]} />
              <View style={[styles.gaugeSegment, { width: "16%", backgroundColor: colors.warningAccent }]} />
              <View style={[styles.gaugeSegment, { width: "12%", backgroundColor: colors.surfaceContainerHighest }]} />
            </View>
            <View style={styles.gaugeLegendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Free flow (13.2 km)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.warningAccent }]} />
                <Text style={styles.legendText}>Moderate (2.9 km)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.surfaceContainerHighest }]} />
                <Text style={styles.legendText}>City merge</Text>
              </View>
            </View>
          </View>

          {/* Vector Map Schematic Visual */}
          <View style={styles.schematicContainer}>
            <View style={styles.schematicGrid}>
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
            </View>

            <View style={styles.roadNetwork}>
              <View style={styles.roadGray} />
              <View style={styles.roadTeal} />
              <View style={styles.roadOrange} />
            </View>

            <View style={styles.pinHampankatta}>
              <View style={styles.pinDotTeal} />
              <Text style={styles.pinLabel}>Hampankatta</Text>
            </View>

            <View style={styles.pinKadri}>
              <View style={styles.pinDotOrange} />
              <Text style={styles.pinLabel}>Kadri Hills</Text>
            </View>

            <View style={styles.telemetryBubble}>
              <Icon name="radar" size={13} color={colors.primary} />
              <Text style={styles.telemetryText}>Clear up to KPT</Text>
            </View>
          </View>

          {/* Primary Action Button */}
          <Button
            title="Plan my route"
            onPress={() => router.push("/planner")}
            variant="primary"
            icon={<Icon name="alt_route" size={20} color="#ffffff" />}
          />
        </Card>

        {/* 2x2 Quick Action Grid */}
        <View style={styles.actionGrid}>
          {/* Tile 1: Saved Places */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Saved Places: 3 saved"
            onPress={() => router.push("/planner")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="location_on" size={20} color={colors.primary} />
              </View>
              <Text style={styles.tileBadgeGray}>3 saved</Text>
            </View>
            <View>
              <Text style={styles.tileTitle}>Saved Places</Text>
              <Text style={styles.tileSubtitle}>Office: 24m • Gym: 12m</Text>
            </View>
          </Pressable>

          {/* Tile 2: Live Incidents */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live Incidents reported nearby"
            onPress={() => router.push("/traffic")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="warning" size={20} color={colors.warning} />
              </View>
              <Text style={[styles.tileBadgeGray, { color: colors.warning }]}>
                {incidents.length > 0 ? `${incidents.length} active` : "3 active"}
              </Text>
            </View>
            <View>
              <Text style={styles.tileTitle}>Incidents</Text>
              <Text style={styles.tileSubtitle}>Reported nearby</Text>
            </View>
          </Pressable>

          {/* Tile 3: Transit Sync */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Transit Sync: City Bus on time"
            onPress={() => router.push("/planner")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="directions_bus" size={20} color={colors.secondary} />
              </View>
              <Text style={[styles.tileBadgeGray, { color: colors.primary }]}>On time</Text>
            </View>
            <View>
              <Text style={styles.tileTitle}>Transit Sync</Text>
              <Text style={styles.tileSubtitle}>KSRTC / City Bus</Text>
            </View>
          </Pressable>

          {/* Tile 4: Live Map */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Traffic map: Live corridor feed"
            onPress={() => router.push("/traffic")}
            style={({ pressed }) => [styles.gridTile, pressed && styles.gridTilePressed]}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="explore" size={20} color={colors.primary} />
              </View>
              <View style={styles.tileDotLive} />
            </View>
            <View>
              <Text style={styles.tileTitle}>Traffic Map</Text>
              <Text style={styles.tileSubtitle}>Live corridor map</Text>
            </View>
          </Pressable>
        </View>

        {/* Live Corridor Feed Section */}
        <View style={styles.activeSection}>
          <View style={styles.activeSectionHeader}>
            <View style={styles.activeTitleRow}>
              <Text style={styles.sectionHeading}>Live Corridor Feed</Text>
              <View style={styles.realtimePill}>
                <Text style={styles.realtimePillText}>Real-time</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View map"
              onPress={() => router.push("/traffic")}
            >
              <Text style={styles.viewMapLink}>View map</Text>
            </Pressable>
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
              <Text style={styles.attributionText}>OpenStreetMap</Text>
            </View>
            <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
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
    ...typography.numeric,
    color: colors.textSecondary,
  },
  greetingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  radarEyebrow: {
    ...typography.labelSm,
    color: colors.secondary,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  liveStatusPillText: {
    ...typography.labelMd,
    color: colors.primary,
    fontWeight: "600",
  },
  commuteHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  commuteTitleCol: {
    flex: 1,
    paddingRight: 8,
  },
  commuteTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commuteTagText: {
    ...typography.labelMd,
    color: colors.secondary,
    fontWeight: "500",
  },
  commuteTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  commuteEtaCol: {
    alignItems: "flex-end",
  },
  commuteEtaValue: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    lineHeight: 32,
    ...typography.numeric,
  },
  commuteEtaUnit: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  commuteEtaDelta: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "500",
    marginTop: 2,
  },
  gaugeContainer: {
    gap: 6,
  },
  gaugeMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gaugeMetaRoute: {
    ...typography.labelSm,
    color: colors.textMuted,
  },
  gaugeMetaDist: {
    ...typography.labelSm,
    ...typography.numeric,
    color: colors.textMuted,
    fontWeight: "500",
  },
  gaugeBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainerHigh,
    flexDirection: "row",
    overflow: "hidden",
  },
  gaugeSegment: {
    height: "100%",
  },
  gaugeLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
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
    width: 36,
    height: 36,
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
    ...typography.labelSm,
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
    ...typography.labelSm,
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
    ...typography.labelSm,
    ...typography.numeric,
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
    paddingVertical: 10,
    borderRadius: radius.control,
    gap: 10,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    ...typography.labelSm,
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
    width: 36,
    height: 36,
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
    height: 144,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBadgeGray: {
    ...typography.labelSm,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    fontWeight: "600",
  },
  tileDotLive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  realtimePill: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  realtimePillText: {
    fontSize: 11,
    color: colors.outline,
    fontWeight: "600",
  },
  viewMapLink: {
    ...typography.labelMd,
    color: colors.primary,
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
    marginTop: 2,
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
    padding: 10,
    borderRadius: 8,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  infoText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  gpsAccuracyText: {
    ...typography.labelSm,
    color: colors.outline,
  },
  incidentFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmPillText: {
    ...typography.labelSm,
    color: colors.text,
    fontWeight: "600",
  },
  denyPill: {
    minHeight: 40,
    minWidth: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
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
  },
  alertChevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderTopColor: colors.border,
  },
  openFreeMapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attributionText: {
    ...typography.labelSm,
    color: colors.textSecondary,
  },
});
