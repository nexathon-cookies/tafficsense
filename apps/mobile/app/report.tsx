import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ReportCategory } from "@trafficsense/shared";
import { submitIncident } from "../src/lib/api";
import { MobileApiError } from "../src/lib/request";
import { verifyEvidence, type L5VerifyResult } from "../src/lib/verify-evidence";
import { mangaluruPlaces } from "../src/lib/places";
import { formatCoordinates, toReportLocationInput, type ReportLocation } from "../src/lib/report-location";
import { useAuth } from "../src/providers/auth-provider";
import {
  AppHeader,
  Button,
  Card,
  FeedbackBox,
  Icon,
  type IconName,
} from "../src/components/ui";
import { colors, layout, minTouchTarget, radius, shadows, space, typography } from "../src/theme/tokens";

type ReportState =
  | { kind: "idle" }
  | { kind: "error"; message: string; signInRequired?: boolean }
  | { kind: "success"; level: string; levelReason: string; l5Result?: L5VerifyResult };

const LOCATION_DENIED =
  "Location permission was denied. Allow location in your phone settings to submit a report.";
const LOCATION_UNAVAILABLE =
  "Your location could not be read. Turn on location services and try again.";

interface HazardOption {
  category: ReportCategory;
  title: string;
  subtitle: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
}

const HAZARD_OPTIONS: HazardOption[] = [
  {
    category: "accident",
    title: "Accident",
    subtitle: "Collisions, breakdown",
    icon: "car_crash",
    iconBg: colors.errorSurface,
    iconColor: colors.error,
  },
  {
    category: "road_closed",
    title: "Road closed",
    subtitle: "Barricades, diversion",
    icon: "do_not_disturb",
    iconBg: colors.surfaceContainerHighest,
    iconColor: colors.text,
  },
  {
    category: "heavy_traffic",
    title: "Heavy volume",
    subtitle: "Gridlock, crawling",
    icon: "traffic",
    iconBg: colors.surfaceContainerHighest,
    iconColor: colors.text,
  },
  {
    category: "flood",
    title: "Flood / Rain",
    subtitle: "Waterlogging, puddles",
    icon: "flood",
    iconBg: colors.primaryFixed,
    iconColor: colors.primary,
  },
  {
    category: "road_repair",
    title: "Road repair",
    subtitle: "Potholes, excavation",
    icon: "construction",
    iconBg: colors.warningSurface,
    iconColor: colors.warning,
  },
  {
    category: "other",
    title: "Other hazard",
    subtitle: "Fallen tree, wire, etc.",
    icon: "help_center",
    iconBg: colors.surfaceContainerHighest,
    iconColor: colors.text,
  },
];

export default function ReportScreen() {
  const { session } = useAuth();
  return <ReportForm key={session?.user.id ?? "guest"} />;
}

function ReportForm() {
  const { session } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<ReportState>({ kind: "idle" })
  const [submitting, setSubmitting] = useState(false);
  const [capturedImage, setCapturedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  const useCurrentLocation = async () => {
    setState({ kind: "idle" });
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setState({ kind: "error", message: LOCATION_DENIED });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({
        source: "device",
        label: "Current device location",
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        gpsAccuracyM: position.coords.accuracy ?? null,
        gpsFixAt: new Date(position.timestamp).toISOString(),
      });
    } catch {
      setState({ kind: "error", message: LOCATION_UNAVAILABLE });
    } finally {
      setLocating(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      setState({ kind: "error", message: "Camera permission is required to attach a photo." });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (!asset.base64) return;
      // Guard: ~4 MB base64 limit (4MB * 0.75 = 3MB raw; base64 is ~1.33x)
      if (asset.base64.length > 5_600_000) {
        setState({ kind: "error", message: "Photo is too large. Choose a smaller image (max 4 MB)." });
        return;
      }
      setCapturedImage({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" });
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      setState({ kind: "error", message: "Gallery permission is required to attach a photo." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (!asset.base64) return;
      if (asset.base64.length > 5_600_000) {
        setState({ kind: "error", message: "Photo is too large. Choose a smaller image (max 4 MB)." });
        return;
      }
      setCapturedImage({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" });
    }
  };

  const submit = async () => {
    setState({ kind: "idle" });
    if (!session) {
      setState({
        kind: "error",
        message: "Sign in with a commuter account before submitting a report.",
        signInRequired: true,
      });
      return;
    }
    if (!selectedCategory) {
      setState({ kind: "error", message: "Select the hazard you observed before submitting." });
      return;
    }
    if (!location) {
      setState({ kind: "error", message: "Choose the report location before submitting." });
      return;
    }

    setSubmitting(true);
    let l5Result: L5VerifyResult | undefined;

    // Optional L5 vision verification if image is attached
    if (capturedImage) {
      setVerifying(true);
      try {
        const verifyResponse = await verifyEvidence(
          {
            imageBase64: capturedImage.base64,
            mimeType: capturedImage.mimeType,
            userSelectedCategory: selectedCategory,
            lat: location.lat,
            lng: location.lng,
          },
          session.access_token,
        );
        if (verifyResponse.ok) {
          l5Result = verifyResponse.result;
        }
        // If verify fails (ok: false), we proceed without L5 — never block submission
      } catch {
        // Vision errors are non-fatal — submit the report regardless
      } finally {
        setVerifying(false);
      }
    }

    try {
      const result = await submitIncident(
        {
          category: selectedCategory,
          ...toReportLocationInput(location),
          note: note.trim() || null,
        },
        session.access_token,
      );

      setState({
        kind: "success",
        level: result.level,
        levelReason: result.level_reason,
        l5Result,
      });
      setNote("");
      setCapturedImage(null);
    } catch (reason) {
      if (reason instanceof MobileApiError && reason.authRequired) {
        setState({
          kind: "error",
          message: "Your session has ended. Sign in again to submit.",
          signInRequired: true,
        });
      } else if (reason instanceof MobileApiError && reason.status === 429) {
        setState({
          kind: "error",
          message: "You have reported too often. Wait a few minutes and try again.",
        });
      } else {
        setState({
          kind: "error",
          message:
            reason instanceof Error
              ? reason.message
              : "Report submission is unavailable. Try again later.",
        });
      }
    } finally {
      setSubmitting(false);
      setVerifying(false);
    }
  };

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Report"
        canGoBack
        onBack={() => router.back()}
        showLive={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Unauthenticated Commuter Note */}
          {!session ? (
            <FeedbackBox
              variant="warning"
              title="Sign in required to submit"
              message="Anyone can browse the traffic map, but submitting road hazard reports requires an authenticated commuter account."
              actionText="Sign in now"
              onAction={() => router.push("/auth/login?next=/report")}
            />
          ) : null}

          {/* Error Feedback */}
          {state.kind === "error" ? (
            <FeedbackBox
              variant="error"
              message={state.message}
              actionText={state.signInRequired ? "Sign in" : undefined}
              onAction={
                state.signInRequired
                  ? () => router.push("/auth/login?next=/report")
                  : undefined
              }
            />
          ) : null}

          {/* Stepper Flow */}
          <Card style={styles.stepperCard}>
            <View style={styles.stepperHeader}>
              <View style={styles.stepperStepRow}>
                <View style={styles.stepperDot} />
                <Text style={styles.stepperStepText}>Step 1 of 3: Select category</Text>
              </View>
              <View style={styles.civicFeedBadge}>
                <Text style={styles.civicFeedBadgeText}>Civic Feed</Text>
              </View>
            </View>
            {/* 3-segment progress track */}
            <View style={styles.stepperTrack}>
              <View style={[styles.stepperBar, styles.stepperBarActive]} />
              <View style={styles.stepperBar} />
              <View style={styles.stepperBar} />
            </View>
            <Text style={styles.stepperSubtitle}>
              Tap the primary obstacle currently affecting coastal transit.
            </Text>
          </Card>

          {/* 1. Observed Hazard Grid */}
          <View style={styles.hazardSection}>
            <View style={styles.hazardSectionHeader}>
              <Text style={styles.hazardSectionTitle}>1. Observed Hazard</Text>
              <Text style={styles.singleSelectionText}>Single selection</Text>
            </View>

            <View style={styles.hazardGrid}>
              {HAZARD_OPTIONS.map((opt) => {
                const isSelected = selectedCategory === opt.category;
                return (
                  <Pressable
                    key={opt.category}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${opt.title}: ${opt.subtitle}`}
                    onPress={() => setSelectedCategory(opt.category)}
                    style={[
                      styles.hazardCard,
                      isSelected && styles.hazardCardActive,
                    ]}
                  >
                    {/* Top Row: Icon and Active Check */}
                    <View style={styles.hazardCardTop}>
                      <View
                        style={[
                          styles.hazardIconBox,
                          {
                            backgroundColor: isSelected
                              ? colors.primary
                              : opt.iconBg,
                          },
                        ]}
                      >
                        <Icon
                          name={opt.icon}
                          size={22}
                          color={isSelected ? "#ffffff" : opt.iconColor}
                        />
                      </View>

                      {isSelected ? (
                        <View style={styles.checkBadge}>
                          <Icon name="check" size={12} color="#ffffff" />
                        </View>
                      ) : null}
                    </View>

                    {/* Bottom Row: Title and Subtitle */}
                    <View style={styles.hazardCardBottom}>
                      <Text
                        style={[
                          styles.hazardCardTitle,
                          isSelected && styles.hazardCardTitleActive,
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text
                        style={[
                          styles.hazardCardSubtitle,
                          isSelected && styles.hazardCardSubtitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {opt.subtitle}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 2. Observation Note */}
          <Card style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Icon name="edit_note" size={20} color={colors.primary} />
              <Text style={styles.noteTitle}>
                Optional note (e.g., landmark or lane affected)
              </Text>
            </View>
            <Text style={styles.noteSubtitle}>
              Details help fellow Mangaloreans gauge clear passage through monsoons.
            </Text>

            <View style={styles.textInputBox}>
              <TextInput
                placeholder="e.g. Left lane submerged under railway bridge near Pumpwell Circle"
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={(val) => setNote(val.slice(0, 300))}
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />
            </View>

            <View style={styles.noteFooter}>
              <View style={styles.noteFooterLeft}>
                <Icon name="visibility" size={14} color={colors.textMuted} />
                <Text style={styles.noteFooterText}>Public to active commuters</Text>
              </View>
              <Text style={styles.noteFooterCounter}>
                {note.length} / 300 characters
              </Text>
            </View>
          </Card>

          {/* 3. Photo Evidence (optional) */}
          <Card style={styles.photoCard}>
            <View style={styles.photoHeader}>
              <Icon name="camera_alt" size={20} color={colors.evidence} />
              <Text style={styles.photoTitle}>Optional photo evidence (L5 upgrade)</Text>
            </View>
            <Text style={styles.photoSubtitle}>
              Attach a clear photo to enable AI vision verification. This may upgrade your report to a higher trust tier.
            </Text>

            {capturedImage ? (
              <View style={styles.photoPreviewBox}>
                <Image source={{ uri: capturedImage.uri }} style={styles.photoPreview} resizeMode="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove attached photo"
                  onPress={() => setCapturedImage(null)}
                  style={styles.photoRemoveBtn}
                >
                  <Icon name="close" size={16} color="#ffffff" />
                </Pressable>
                <View style={styles.photoAttachedBadge}>
                  <Icon name="check_circle" size={13} color={colors.success} />
                  <Text style={styles.photoAttachedText}>Photo ready for AI analysis</Text>
                </View>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo with camera"
                  onPress={() => void pickFromCamera()}
                  style={styles.photoActionBtn}
                >
                  <Icon name="photo_camera" size={20} color={colors.primary} />
                  <Text style={styles.photoActionText}>Camera</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick a photo from gallery"
                  onPress={() => void pickFromGallery()}
                  style={styles.photoActionBtn}
                >
                  <Icon name="photo_library" size={20} color={colors.primary} />
                  <Text style={styles.photoActionText}>Gallery</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.photoPrivacyRow}>
              <Icon name="lock" size={13} color={colors.textMuted} />
              <Text style={styles.photoPrivacyText}>
                EXIF location is not captured. Image is analyzed server-side and not stored permanently.
              </Text>
            </View>
          </Card>

          {/* 2. Location and trust */}
          <View style={styles.trustSection}>
            <Text style={styles.trustSectionTitle}>2. Report location</Text>

            {/* Sub-card 1: Location Corridor */}
            <Card style={styles.trustCard}>
              <View style={styles.trustCardTop}>
                <View style={[styles.trustIconCircle, { backgroundColor: colors.primaryFixed }]}>
                  <Icon name="location_on" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.trustRowBetween}>
                    <Text style={styles.trustRoadName}>{location?.label ?? "Choose where this hazard is"}</Text>
                    <View style={styles.autoDetectedBadge}>
                      <Text style={styles.autoDetectedText}>{location?.source === "device" ? "Device GPS" : location?.source === "reference" ? "Reference point" : "Required"}</Text>
                    </View>
                  </View>
                  <Text style={styles.trustCoords}>
                    {location ? formatCoordinates(location) : "Use current device location or choose an approximate Mangaluru reference point."}
                  </Text>
                </View>
              </View>
              <View style={styles.trustNoticePill}>
                <Icon name="lock" size={13} color={colors.textSecondary} />
                <Text style={styles.trustNoticePillText}>{location?.source === "device" ? "GPS was requested only after your tap" : "Reference points are approximate and are not GPS"}</Text>
              </View>
              <View style={styles.locationActions}>
                <Button title={locating ? "Getting current location…" : "Use current location"} loading={locating} onPress={() => void useCurrentLocation()} variant="outline" />
                <Button title="Choose reference point" onPress={() => setLocationPickerOpen(true)} variant="outline" />
              </View>
            </Card>

            {/* Tier assignment */}
            <Card style={styles.trustCard}>
              <View style={styles.trustCardTop}>
                <View style={[styles.trustIconCircle, { backgroundColor: colors.evidenceSurface }]}>
                  <Icon name="verified" size={18} color={colors.evidence} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.trustRowBetween}>
                    <Text style={styles.trustRoadName}>3. Verification & Trust Tier</Text>
                    <View style={styles.tierL1Badge}>
                      <Text style={styles.tierL1BadgeText}>L1 Tier</Text>
                    </View>
                  </View>
                  <Text style={styles.trustCoords}>
                    Your report will be recorded as L1 (Single observation) until corroborated by other commuters.
                  </Text>
                </View>
              </View>
            </Card>

            {/* Sub-card 3: Honesty Notice */}
            <View style={styles.honestyBanner}>
              <View style={styles.honestyIconCircle}>
                <Icon name="shield" size={18} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.honestyTitle}>Honesty notice</Text>
                <Text style={styles.honestyBody}>
                  A report is a subjective observation, not proof of its cause. Civic trust keeps Mangaluru flowing safely.
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsStack}>
            <Button
              title={verifying ? "Analysing photo…" : submitting ? "Submitting observation…" : "Submit report"}
              loading={submitting || verifying}
              onPress={() => void submit()}
              variant="primary"
              icon={<Icon name="send" size={18} color="#ffffff" />}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel report"
              onPress={() => router.back()}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>

          <View style={{ height: layout.safeBottomPadding }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={locationPickerOpen} transparent animationType="slide" onRequestClose={() => setLocationPickerOpen(false)}>
        <View style={styles.locationModalBackdrop}>
          <Card style={styles.locationModalCard}>
            <View style={styles.locationModalHeader}>
              <View><Text style={styles.locationModalTitle}>Choose a reference point</Text><Text style={styles.locationModalBody}>Use this when you cannot use device GPS. It submits an approximate point.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close reference-point picker" onPress={() => setLocationPickerOpen(false)} style={styles.locationModalClose}><Icon name="close" size={20} color={colors.text} /></Pressable>
            </View>
            <ScrollView style={styles.locationList}>
              {mangaluruPlaces.map((place) => (
                <Pressable key={place.name} accessibilityRole="button" onPress={() => { setLocation({ source: "reference", label: place.name, lat: place.coords[1], lng: place.coords[0], gpsAccuracyM: null, gpsFixAt: null }); setLocationPickerOpen(false); }} style={styles.locationOption}>
                  <Icon name="location_on" size={18} color={colors.primary} />
                  <Text style={styles.locationOptionText}>{place.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={state.kind === "success"}
        transparent
        animationType="fade"
      >
        <View style={styles.successBackdrop}>
          <Card style={styles.successModalCard}>
            <View style={[
              styles.successIconCircle,
              state.kind === "success" && state.l5Result?.upgradeEligible
                ? { backgroundColor: colors.evidence }
                : undefined
            ]}>
              <Icon
                name={state.kind === "success" && state.l5Result?.upgradeEligible ? "verified" : "check"}
                size={28}
                color="#ffffff"
              />
            </View>
            <Text style={styles.successTitle}>Report Recorded</Text>
            <Text style={styles.successSubtitle}>
              {state.kind === "success"
                ? `Assigned tier: ${state.level}. ${state.levelReason} Dispatched to the Civic Traffic Authority dashboard for verification.`
                : ""}
            </Text>

            {state.kind === "success" && state.l5Result ? (
              <View style={styles.l5ResultBox}>
                <View style={styles.l5ResultHeader}>
                  <Icon name="smart_toy" size={16} color={colors.evidence} />
                  <Text style={styles.l5ResultTitle}>AI Vision Analysis</Text>
                  {state.l5Result.upgradeEligible ? (
                    <View style={styles.l5UpgradeBadge}>
                      <Text style={styles.l5UpgradeBadgeText}>Upgrade eligible</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.l5ResultSummary}>{state.l5Result.summary}</Text>
                <View style={styles.l5ResultRow}>
                  <Text style={styles.l5ResultLabel}>Detected:</Text>
                  <Text style={styles.l5ResultValue}>{state.l5Result.detectedCategory}</Text>
                </View>
                <View style={styles.l5ResultRow}>
                  <Text style={styles.l5ResultLabel}>Confidence:</Text>
                  <Text style={styles.l5ResultValue}>{Math.round(state.l5Result.confidence * 100)}%</Text>
                </View>
                <View style={styles.l5ResultRow}>
                  <Text style={styles.l5ResultLabel}>Category match:</Text>
                  <Text style={[
                    styles.l5ResultValue,
                    { color: state.l5Result.matchesUserCategory ? colors.success : colors.warning }
                  ]}>
                    {state.l5Result.matchesUserCategory ? "✓ Confirmed" : "⚠ Differs"}
                  </Text>
                </View>
              </View>
            ) : null}

            <Button
              title="View on Live Traffic Map"
              onPress={() => {
                setState({ kind: "idle" });
                router.replace("/traffic");
              }}
              variant="primary"
            />
            <Pressable
              onPress={() => {
                setState({ kind: "idle" });
              }}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>Close</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
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
  previewStateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.control,
    padding: 8,
    ...shadows.card,
  },
  previewStateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewStateText: {
    ...typography.labelMd,
    fontWeight: "600",
    color: colors.text,
  },
  previewStateButtons: {
    flexDirection: "row",
    gap: 6,
  },
  previewSmallBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    ...shadows.card,
  },
  previewSmallBtnText: {
    ...typography.labelSm,
    fontSize: 10.5,
    color: colors.text,
  },
  previewSuccessBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  previewSuccessBtnText: {
    ...typography.labelSm,
    fontSize: 10.5,
    color: "#ffffff",
    fontWeight: "600",
  },
  permissionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffdcc3",
    borderRadius: radius.control,
    padding: 14,
    gap: 12,
    ...shadows.card,
  },
  permissionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 183, 124, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTextCol: {
    flex: 1,
    gap: 4,
  },
  permissionTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: "#2f1500",
  },
  permissionSubtitle: {
    ...typography.bodySm,
    color: "#6e3900",
    fontSize: 12,
    lineHeight: 16,
  },
  permissionActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  allowBtn: {
    backgroundColor: "#5b2f00",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  allowBtnText: {
    ...typography.labelMd,
    color: "#ffffff",
    fontWeight: "600",
  },
  dismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dismissBtnText: {
    ...typography.labelMd,
    color: "#5b2f00",
    fontWeight: "600",
  },
  stepperCard: {
    padding: space.md,
    gap: 8,
  },
  stepperHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepperDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  stepperStepText: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.primary,
  },
  civicFeedBadge: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  civicFeedBadgeText: {
    ...typography.codeSm,
    color: colors.textSecondary,
    fontSize: 9.5,
  },
  stepperTrack: {
    flexDirection: "row",
    gap: 6,
    height: 6,
    width: "100%",
  },
  stepperBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHighest,
  },
  stepperBarActive: {
    backgroundColor: colors.primary,
  },
  stepperSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  hazardSection: {
    gap: 8,
  },
  hazardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hazardSectionTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  singleSelectionText: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "600",
  },
  hazardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  hazardCard: {
    width: "48%",
    flexGrow: 1,
    height: 128,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: "space-between",
    ...shadows.card,
  },
  hazardCardActive: {
    backgroundColor: colors.primaryFixed,
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  hazardCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hazardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  hazardCardBottom: {
    gap: 2,
  },
  hazardCardTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  hazardCardTitleActive: {
    color: colors.onPrimaryFixed,
  },
  hazardCardSubtitle: {
    ...typography.bodySm,
    fontSize: 11,
    color: colors.textSecondary,
  },
  hazardCardSubtitleActive: {
    color: colors.onPrimaryFixedVariant,
  },
  noteCard: {
    padding: space.md,
    gap: 8,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteTitle: {
    ...typography.titleSm,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  noteSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
  },
  textInputBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.control,
    padding: 10,
    minHeight: 74,
  },
  textArea: {
    ...typography.bodyMd,
    color: colors.text,
    minHeight: 54,
    textAlignVertical: "top",
  },
  noteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  noteFooterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noteFooterText: {
    ...typography.codeSm,
    color: colors.textMuted,
  },
  noteFooterCounter: {
    ...typography.codeSm,
    color: colors.textMuted,
  },
  trustSection: {
    gap: 10,
  },
  trustSectionTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  trustCard: {
    padding: 12,
    gap: 8,
  },
  trustCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trustIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  trustRowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trustRoadName: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  autoDetectedBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  autoDetectedText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  tierL1Badge: {
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tierL1BadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.evidence,
    fontWeight: "700",
  },
  trustCoords: {
    ...typography.codeSm,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  trustNoticePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    padding: 6,
    borderRadius: radius.control,
  },
  trustNoticePillText: {
    ...typography.codeSm,
    color: colors.textSecondary,
    fontSize: 10.5,
  },
  honestyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.evidenceSurface,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
  },
  honestyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.evidence,
    alignItems: "center",
    justifyContent: "center",
  },
  honestyTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.evidence,
  },
  honestyBody: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  actionsStack: {
    gap: 10,
    paddingTop: 6,
  },
  locationActions: { gap: space.sm, marginTop: space.sm },
  locationModalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)", padding: space.gutter },
  locationModalCard: { maxHeight: "78%", padding: space.md, gap: space.md },
  locationModalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.sm },
  locationModalTitle: { ...typography.titleMd, color: colors.text, fontWeight: "700" },
  locationModalBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: 4, maxWidth: 290 },
  locationModalClose: { width: minTouchTarget, height: minTouchTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceContainer },
  locationList: { maxHeight: 420 },
  locationOption: { minHeight: minTouchTarget, flexDirection: "row", alignItems: "center", gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: space.sm },
  locationOptionText: { ...typography.bodyMd, color: colors.text, flex: 1 },
  cancelBtn: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    ...typography.labelLg,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.gutter,
  },
  successModalCard: {
    width: "100%",
    padding: 24,
    alignItems: "center",
    gap: 14,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    ...typography.headlineMd,
    fontWeight: "700",
    color: colors.text,
  },
  successSubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  doneBtn: {
    paddingVertical: 8,
  },
  doneBtnText: {
    ...typography.labelMd,
    color: colors.textSecondary,
    fontWeight: "600",
  },
photoCard: {
    padding: space.md,
    gap: 10,
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  photoTitle: {
    ...typography.titleSm,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  photoSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
  },
  photoActions: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.control,
    borderStyle: "dashed",
    backgroundColor: colors.primaryFixed,
  },
  photoActionText: {
    ...typography.labelMd,
    color: colors.primary,
    fontWeight: "700",
  },
  photoPreviewBox: {
    borderRadius: radius.card,
    overflow: "hidden",
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: radius.card,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAttachedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 6,
  },
  photoAttachedText: {
    ...typography.labelSm,
    color: colors.success,
  },
  photoPrivacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  photoPrivacyText: {
    ...typography.bodySm,
    fontSize: 10.5,
    color: colors.textMuted,
    flex: 1,
  },
  l5ResultBox: {
    backgroundColor: colors.evidenceSurface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.evidence + "33",
    padding: space.md,
    gap: 8,
    width: "100%",
  },
  l5ResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  l5ResultTitle: {
    ...typography.labelMd,
    color: colors.evidence,
    fontWeight: "700",
    flex: 1,
  },
  l5UpgradeBadge: {
    backgroundColor: colors.evidence,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  l5UpgradeBadgeText: {
    ...typography.codeSm,
    color: "#ffffff",
    fontSize: 9.5,
  },
  l5ResultSummary: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  l5ResultRow: {
    flexDirection: "row",
    gap: 6,
  },
  l5ResultLabel: {
    ...typography.labelSm,
    color: colors.textMuted,
    minWidth: 80,
  },
  l5ResultValue: {
    ...typography.labelSm,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },

});
