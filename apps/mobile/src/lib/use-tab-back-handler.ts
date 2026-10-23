import { useCallback } from "react";
import { BackHandler } from "react-native";
import { router, useFocusEffect } from "expo-router";

/**
 * On top-level non-home tabs (Traffic, Planner, Workspace), pressing
 * the Android hardware back button cleanly returns to Home rather than exiting
 * the application or creating duplicate history entries.
 */
export function useTabBackHandler(enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/");
        return true;
      });
      return () => subscription.remove();
    }, [enabled]),
  );
}
