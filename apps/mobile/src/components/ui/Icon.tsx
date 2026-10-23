import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type IconName =
  | "home"
  | "map"
  | "explore"
  | "add"
  | "plan"
  | "alt_route"
  | "account_circle"
  | "arrow_back"
  | "close"
  | "check"
  | "sync"
  | "search"
  | "mic"
  | "warning"
  | "car_crash"
  | "do_not_disturb"
  | "traffic"
  | "water_drop"
  | "flood"
  | "tsunami"
  | "construction"
  | "help_center"
  | "location_on"
  | "trip_origin"
  | "directions_car"
  | "directions_bus"
  | "thumb_up"
  | "thumb_down"
  | "verified"
  | "shield"
  | "lock"
  | "crop_free"
  | "my_location"
  | "layers"
  | "swap_vert"
  | "chevron_right"
  | "expand_more"
  | "edit_note"
  | "send"
  | "radar"
  | "beach_access"
  | "tune"
  | "fullscreen"
  | "group"
  | "visibility"
  | "camera_alt"
  | "check_circle"
  | "photo_camera"
  | "photo_library"
  | "smart_toy";

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, color = "#191c20", style }: IconProps) {
  const containerStyle = [{ width: size, height: size }, styles.center, style];

  switch (name) {
    case "home":
      return (
        <View style={containerStyle}>
          {/* Roof */}
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.45,
              borderRightWidth: size * 0.45,
              borderBottomWidth: size * 0.38,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderBottomColor: color,
            }}
          />
          {/* Base */}
          <View
            style={{
              width: size * 0.6,
              height: size * 0.42,
              backgroundColor: color,
              marginTop: -1,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
            }}
          />
        </View>
      );

    case "map":
    case "explore":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: size * 0.45,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Diamond compass pointer */}
            <View
              style={{
                width: size * 0.34,
                height: size * 0.34,
                backgroundColor: color,
                transform: [{ rotate: "45deg" }],
              }}
            />
          </View>
        </View>
      );

    case "add":
      return (
        <View style={containerStyle}>
          <View
            style={{
              position: "absolute",
              width: size * 0.65,
              height: Math.max(2.5, size * 0.12),
              backgroundColor: color,
              borderRadius: 2,
            }}
          />
          <View
            style={{
              position: "absolute",
              height: size * 0.65,
              width: Math.max(2.5, size * 0.12),
              backgroundColor: color,
              borderRadius: 2,
            }}
          />
        </View>
      );

    case "plan":
    case "alt_route":
      return (
        <View style={containerStyle}>
          {/* Main vertical line */}
          <View
            style={{
              position: "absolute",
              left: size * 0.3,
              bottom: size * 0.15,
              width: 2.2,
              height: size * 0.55,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
          {/* Branching curve line */}
          <View
            style={{
              position: "absolute",
              right: size * 0.22,
              top: size * 0.18,
              width: size * 0.42,
              height: size * 0.42,
              borderTopWidth: 2.2,
              borderRightWidth: 2.2,
              borderColor: color,
              borderTopRightRadius: size * 0.28,
            }}
          />
          {/* Top start dot */}
          <View
            style={{
              position: "absolute",
              left: size * 0.23,
              top: size * 0.14,
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
              backgroundColor: color,
            }}
          />
          {/* Branch end dot */}
          <View
            style={{
              position: "absolute",
              right: size * 0.12,
              bottom: size * 0.22,
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case "account_circle":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.9,
              height: size * 0.9,
              borderRadius: size * 0.45,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              overflow: "hidden",
            }}
          >
            {/* Head */}
            <View
              style={{
                width: size * 0.34,
                height: size * 0.34,
                borderRadius: size * 0.17,
                backgroundColor: color,
                marginTop: size * 0.12,
              }}
            />
            {/* Shoulders */}
            <View
              style={{
                width: size * 0.65,
                height: size * 0.4,
                borderRadius: size * 0.3,
                backgroundColor: color,
                marginTop: size * 0.06,
              }}
            />
          </View>
        </View>
      );

    case "arrow_back":
      return (
        <View style={containerStyle}>
          <View
            style={{
              position: "absolute",
              width: size * 0.55,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: size * 0.2,
              width: size * 0.3,
              height: size * 0.3,
              borderLeftWidth: 2,
              borderTopWidth: 2,
              borderColor: color,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        </View>
      );

    case "close":
      return (
        <View style={containerStyle}>
          <View
            style={{
              position: "absolute",
              width: size * 0.6,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: "45deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.6,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        </View>
      );

    case "check":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.55,
              height: size * 0.3,
              borderLeftWidth: 2.5,
              borderBottomWidth: 2.5,
              borderColor: color,
              transform: [{ rotate: "-45deg" }],
              marginTop: -size * 0.1,
            }}
          />
        </View>
      );

    case "search":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: size * 0.28,
              borderWidth: 2,
              borderColor: color,
              marginRight: size * 0.12,
              marginBottom: size * 0.12,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: size * 0.18,
              bottom: size * 0.18,
              width: size * 0.3,
              height: 2.2,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </View>
      );

    case "mic":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.32,
              height: size * 0.5,
              borderRadius: size * 0.16,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.52,
              height: size * 0.35,
              borderBottomLeftRadius: size * 0.26,
              borderBottomRightRadius: size * 0.26,
              borderWidth: 2,
              borderTopWidth: 0,
              borderColor: color,
              top: size * 0.32,
            }}
          />
        </View>
      );

    case "sync":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.7,
              borderRadius: size * 0.35,
              borderWidth: 2,
              borderColor: color,
              borderTopColor: "transparent",
              transform: [{ rotate: "45deg" }],
            }}
          />
        </View>
      );

    case "warning":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.42,
              borderRightWidth: size * 0.42,
              borderBottomWidth: size * 0.75,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderBottomColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 2,
              height: size * 0.24,
              backgroundColor: "#ffffff",
              bottom: size * 0.3,
              borderRadius: 1,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 2.5,
              height: 2.5,
              borderRadius: 1.25,
              backgroundColor: "#ffffff",
              bottom: size * 0.18,
            }}
          />
        </View>
      );

    case "car_crash":
    case "directions_car":
      return (
        <View style={containerStyle}>
          {/* Car body */}
          <View
            style={{
              width: size * 0.75,
              height: size * 0.45,
              backgroundColor: color,
              borderRadius: 4,
              alignItems: "center",
            }}
          >
            {/* Windshield */}
            <View
              style={{
                width: size * 0.5,
                height: size * 0.18,
                backgroundColor: "#ffffff",
                marginTop: 2,
                borderRadius: 2,
                opacity: 0.85,
              }}
            />
          </View>
          {/* Wheels */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              width: size * 0.65,
              marginTop: -2,
            }}
          >
            <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, backgroundColor: color }} />
            <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, backgroundColor: color }} />
          </View>
        </View>
      );

    case "directions_bus":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.7,
              backgroundColor: color,
              borderRadius: 4,
              padding: 2,
              alignItems: "center",
            }}
          >
            <View style={{ width: "90%", height: "35%", backgroundColor: "#ffffff", borderRadius: 2, opacity: 0.85 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: "80%", marginTop: 4 }}>
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#ffffff" }} />
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#ffffff" }} />
            </View>
          </View>
        </View>
      );

    case "do_not_disturb":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: 2.2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.5,
                height: 2.2,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
          </View>
        </View>
      );

    case "traffic":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.42,
              height: size * 0.85,
              borderRadius: size * 0.21,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "space-around",
              paddingVertical: 3,
            }}
          >
            <View style={{ width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: "#ffffff" }} />
            <View style={{ width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: "#ffffff", opacity: 0.6 }} />
            <View style={{ width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: "#ffffff", opacity: 0.6 }} />
          </View>
        </View>
      );

    case "water_drop":
    case "flood":
    case "tsunami":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.46,
              height: size * 0.46,
              backgroundColor: color,
              borderTopLeftRadius: 0,
              borderTopRightRadius: size * 0.23,
              borderBottomLeftRadius: size * 0.23,
              borderBottomRightRadius: size * 0.23,
              transform: [{ rotate: "-45deg" }],
            }}
          />
        </View>
      );

    case "construction":
      return (
        <View style={containerStyle}>
          {/* Crossed tools */}
          <View
            style={{
              position: "absolute",
              width: size * 0.65,
              height: 2.5,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: "45deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.65,
              height: 2.5,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: "-45deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              width: size * 0.25,
              height: size * 0.25,
              borderRadius: size * 0.125,
              borderWidth: 2,
              borderColor: color,
              top: size * 0.1,
              left: size * 0.1,
            }}
          />
        </View>
      );

    case "help_center":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 3, height: 5, backgroundColor: color, borderRadius: 1.5, marginBottom: 2 }} />
            <View style={{ width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: color }} />
          </View>
        </View>
      );

    case "location_on":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: size * 0.28,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11, backgroundColor: "#ffffff" }} />
          </View>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.18,
              borderRightWidth: size * 0.18,
              borderTopWidth: size * 0.28,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderTopColor: color,
              marginTop: -2,
            }}
          />
        </View>
      );

    case "trip_origin":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: 2.2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.28,
                height: size * 0.28,
                borderRadius: size * 0.14,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    case "verified":
    case "shield":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.8,
              borderTopLeftRadius: size * 0.35,
              borderTopRightRadius: size * 0.35,
              borderBottomLeftRadius: size * 0.35,
              borderBottomRightRadius: size * 0.35,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Small check inside shield */}
            <View
              style={{
                width: size * 0.3,
                height: size * 0.16,
                borderLeftWidth: 2,
                borderBottomWidth: 2,
                borderColor: "#ffffff",
                transform: [{ rotate: "-45deg" }],
                marginTop: -2,
              }}
            />
          </View>
        </View>
      );

    case "lock":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.42,
              height: size * 0.36,
              borderTopLeftRadius: size * 0.21,
              borderTopRightRadius: size * 0.21,
              borderWidth: 2,
              borderBottomWidth: 0,
              borderColor: color,
            }}
          />
          <View
            style={{
              width: size * 0.6,
              height: size * 0.45,
              borderRadius: 3,
              backgroundColor: color,
              marginTop: -1,
            }}
          />
        </View>
      );

    case "crop_free":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.7,
              borderWidth: 2,
              borderColor: color,
              borderStyle: "dashed",
              borderRadius: 2,
            }}
          />
        </View>
      );

    case "my_location":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.75,
              borderRadius: size * 0.38,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, backgroundColor: color }} />
          </View>
        </View>
      );

    case "layers":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.35,
              backgroundColor: color,
              borderRadius: 2,
              transform: [{ rotate: "-15deg" }],
            }}
          />
          <View
            style={{
              width: size * 0.65,
              height: size * 0.35,
              backgroundColor: color,
              borderRadius: 2,
              marginTop: -size * 0.15,
              transform: [{ rotate: "15deg" }],
              opacity: 0.7,
            }}
          />
        </View>
      );

    case "swap_vert":
      return (
        <View style={containerStyle}>
          <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 5, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color }} />
              <View style={{ width: 2, height: size * 0.45, backgroundColor: color }} />
            </View>
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 2, height: size * 0.45, backgroundColor: color }} />
              <View style={{ width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderTopWidth: 5, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color }} />
            </View>
          </View>
        </View>
      );

    case "chevron_right":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.32,
              height: size * 0.32,
              borderRightWidth: 2.2,
              borderTopWidth: 2.2,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
              marginLeft: -size * 0.1,
            }}
          />
        </View>
      );

    case "expand_more":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.32,
              height: size * 0.32,
              borderRightWidth: 2.2,
              borderBottomWidth: 2.2,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
              marginTop: -size * 0.1,
            }}
          />
        </View>
      );

    case "edit_note":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.75,
              borderRadius: 3,
              borderWidth: 2,
              borderColor: color,
              padding: 2,
              gap: 2,
            }}
          >
            <View style={{ width: "70%", height: 1.5, backgroundColor: color }} />
            <View style={{ width: "50%", height: 1.5, backgroundColor: color }} />
            <View style={{ width: "80%", height: 1.5, backgroundColor: color }} />
          </View>
        </View>
      );

    case "send":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.65,
              borderTopWidth: size * 0.35,
              borderBottomWidth: size * 0.35,
              borderLeftColor: color,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              transform: [{ rotate: "-25deg" }],
              marginLeft: 2,
            }}
          />
        </View>
      );

    case "radar":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: size * 0.425,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.45,
                height: size * 0.45,
                borderRadius: size * 0.225,
                borderWidth: 1.5,
                borderColor: color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
            </View>
          </View>
        </View>
      );

    case "beach_access":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.4,
              borderTopLeftRadius: size * 0.4,
              borderTopRightRadius: size * 0.4,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: 2,
              height: size * 0.4,
              backgroundColor: color,
              marginTop: -1,
            }}
          />
        </View>
      );

    case "tune":
      return (
        <View style={containerStyle}>
          <View style={{ width: size * 0.75, gap: 3 }}>
            <View style={{ height: 2, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ height: 2, backgroundColor: color, borderRadius: 1, width: "60%" }} />
            <View style={{ height: 2, backgroundColor: color, borderRadius: 1, width: "80%" }} />
          </View>
        </View>
      );

    case "fullscreen":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.7,
              borderWidth: 2,
              borderColor: color,
              borderRadius: 2,
            }}
          />
        </View>
      );

    case "thumb_up":
      return (
        <View style={containerStyle}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
            <View style={{ width: size * 0.18, height: size * 0.4, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: size * 0.45, height: size * 0.5, backgroundColor: color, borderTopRightRadius: 4, borderBottomRightRadius: 2 }} />
          </View>
        </View>
      );

    case "thumb_down":
      return (
        <View style={containerStyle}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 2, transform: [{ rotate: "180deg" }] }}>
            <View style={{ width: size * 0.18, height: size * 0.4, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: size * 0.45, height: size * 0.5, backgroundColor: color, borderTopRightRadius: 4, borderBottomRightRadius: 2 }} />
          </View>
        </View>
      );

    case "group":
      return (
        <View style={containerStyle}>
          <View style={{ flexDirection: "row", gap: -2, alignItems: "center" }}>
            <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175, backgroundColor: color }} />
            <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, backgroundColor: color, opacity: 0.75 }} />
          </View>
        </View>
      );

    case "visibility":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.45,
              borderRadius: size * 0.4,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11, backgroundColor: color }} />
          </View>
        </View>
      );

    case "camera_alt":
    case "photo_camera":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.6,
              borderRadius: 4,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.3,
                height: size * 0.3,
                borderRadius: size * 0.15,
                borderWidth: 2,
                borderColor: "#ffffff",
              }}
            />
          </View>
          <View
            style={{
              position: "absolute",
              top: size * 0.05,
              left: size * 0.28,
              width: size * 0.22,
              height: size * 0.12,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case "check_circle":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: size * 0.425,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.38,
                height: size * 0.2,
                borderLeftWidth: 2.2,
                borderBottomWidth: 2.2,
                borderColor: color,
                transform: [{ rotate: "-45deg" }],
                marginTop: -size * 0.06,
              }}
            />
          </View>
        </View>
      );

    case "photo_library":
      return (
        <View style={containerStyle}>
          <View
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: 3,
              borderWidth: 1.5,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: 3,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: size * 0.28,
                height: size * 0.28,
                borderRadius: size * 0.14,
                borderWidth: 1.5,
                borderColor: "#ffffff",
              }}
            />
          </View>
        </View>
      );

    case "smart_toy":
      return (
        <View style={containerStyle}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.55,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: color,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: size * 0.1,
            }}
          >
            <View style={{ width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: color }} />
            <View style={{ width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: color }} />
          </View>
          <View
            style={{
              position: "absolute",
              top: 0,
              width: 2,
              height: size * 0.22,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      );

    default:
      return <View style={containerStyle} />;
  }
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
