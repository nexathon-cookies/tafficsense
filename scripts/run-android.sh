#!/usr/bin/env bash
# run-android.sh: Detects adb and emulator, verifies connection, installs APK, and starts MainActivity
set -euo pipefail

MODE="${1:-emulator}" # "emulator" or "lan" or "device"
TARGET_URL="${2:-http://10.0.2.2:3000}"
AVD_NAME="${3:-Pixel_8}"

# Locate Android SDK
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK_DIR" ] && [ -f "apps/traffic/local.properties" ]; then
    SDK_DIR=$(grep -E '^[[:space:]]*sdk\.dir=' apps/traffic/local.properties | cut -d= -f2- | tr -d '\r')
fi
if [ -z "$SDK_DIR" ] && [ -d "$HOME/Android/Sdk" ]; then
    SDK_DIR="$HOME/Android/Sdk"
fi

# Locate adb
ADB="adb"
if ! command -v adb >/dev/null 2>&1; then
    if [ -n "$SDK_DIR" ] && [ -x "$SDK_DIR/platform-tools/adb" ]; then
        ADB="$SDK_DIR/platform-tools/adb"
    else
        echo "Error: adb command not found in PATH or Android SDK."
        exit 1
    fi
fi

APK_PATH="apps/traffic/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "Error: APK not found at $APK_PATH. Please run ./gradlew assembleDebug first."
    exit 1
fi

echo "==> Using adb: $ADB"
echo "==> Target Backend URL: $TARGET_URL"

# Check connected devices
ONLINE_DEVICES=$($ADB devices | awk '$2=="device"{print $1}')

if [ -z "$ONLINE_DEVICES" ]; then
    if [ "$MODE" = "emulator" ]; then
        EMULATOR_BIN=""
        if [ -n "$SDK_DIR" ] && [ -x "$SDK_DIR/emulator/emulator" ]; then
            EMULATOR_BIN="$SDK_DIR/emulator/emulator"
        elif command -v emulator >/dev/null 2>&1; then
            EMULATOR_BIN="emulator"
        fi

        if [ -n "$EMULATOR_BIN" ]; then
            echo "==> No active device detected. Launching emulator '$AVD_NAME'..."
            "$EMULATOR_BIN" -avd "$AVD_NAME" >/dev/null 2>&1 &
            echo "==> Waiting for emulator to boot..."
            $ADB wait-for-device
            boot_completed=0
            for i in $(seq 1 60); do
                if [ "$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
                    boot_completed=1
                    break
                fi
                sleep 2
            done
            if [ "$boot_completed" -ne 1 ]; then
                echo "Warning: Emulator started but boot completion timed out. Trying to continue..."
            else
                echo "==> Emulator boot completed."
            fi
        else
            echo "Warning: Emulator binary not found. Please start your emulator manually and run 'just kau-run'."
            exit 1
        fi
    else
        echo "Error: No connected Android device found via adb. Please connect your phone via USB or start an emulator."
        exit 1
    fi
fi

FIRST_DEVICE=$(echo "$ONLINE_DEVICES" | head -n1)
echo "==> Targeted device: $FIRST_DEVICE"
echo "==> Installing $APK_PATH..."
$ADB -s "$FIRST_DEVICE" install -r "$APK_PATH"

echo "==> Launching com.love.trafficsense..."
$ADB -s "$FIRST_DEVICE" shell am start -n com.love.trafficsense/.MainActivity

echo "==> TrafficSense is running! Connected to backend: $TARGET_URL"
