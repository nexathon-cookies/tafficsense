package com.love.trafficsense.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class RouteOption {
    @SerializedName("id")
    public String id;

    @SerializedName("name")
    public String name;

    @SerializedName("is_recommended")
    public boolean isRecommended;

    @SerializedName("distance_meters")
    public double distanceMeters;

    @SerializedName("duration_seconds")
    public double durationSeconds;

    @SerializedName("has_hazards")
    public boolean hasHazards;

    @SerializedName("warning_note")
    public String warningNote;

    @SerializedName("warnings")
    public List<String> warnings = new ArrayList<>();

    public RouteOption() {}

    public RouteOption(String id, String name, boolean isRecommended, double distanceMeters, double durationSeconds, boolean hasHazards, String warningNote) {
        this.id = id;
        this.name = name;
        this.isRecommended = isRecommended;
        this.distanceMeters = distanceMeters;
        this.durationSeconds = durationSeconds;
        this.hasHazards = hasHazards;
        this.warningNote = warningNote;
    }

    public String getId() { return id != null ? id : ""; }
    public String getName() { return name != null ? name : "Corridor Route"; }
    public boolean isRecommended() { return isRecommended; }
    public double getDistanceMeters() { return distanceMeters; }
    public double getDurationSeconds() { return durationSeconds; }
    public boolean hasHazards() { return hasHazards; }
    public String getWarningNote() { return warningNote; }

    public String getFormattedDistance() {
        if (distanceMeters < 1000) {
            return String.format(Locale.getDefault(), "%d m", (int) distanceMeters);
        }
        return String.format(Locale.getDefault(), "%.1f km", distanceMeters / 1000.0);
    }

    public String getFormattedDuration() {
        int minutes = (int) Math.round(durationSeconds / 60.0);
        if (minutes < 1) return "1 min (baseline)";
        return String.format(Locale.getDefault(), "%d min (free-flow baseline)", minutes);
    }
}
