package com.love.trafficsense.data.model;

import com.google.gson.annotations.SerializedName;

public class LiveIncident {
    @SerializedName("id")
    public String id;

    @SerializedName("category")
    public String category;

    @SerializedName("landmark")
    public String landmark;

    @SerializedName("lat")
    public double lat;

    @SerializedName("lng")
    public double lng;

    @SerializedName(value = "evidence_level", alternate = {"level"})
    public String evidenceLevel = "L1";

    @SerializedName(value = "evidence_label", alternate = {"level_reason"})
    public String evidenceLabel = "Citizen Reported";

    @SerializedName(value = "created_at", alternate = {"first_reported_at"})
    public String createdAt;

    @SerializedName("freshness")
    public String freshness = "2m ago";

    @SerializedName(value = "notes", alternate = {"note"})
    public String notes;

    @SerializedName("verified")
    public boolean verified;

    @SerializedName("report_count")
    public int reportCount = 1;

    public LiveIncident() {}

    public LiveIncident(String id, String category, String landmark, double lat, double lng, String evidenceLevel, String evidenceLabel, String notes, int reportCount) {
        this.id = id;
        this.category = category;
        this.landmark = landmark;
        this.lat = lat;
        this.lng = lng;
        this.evidenceLevel = evidenceLevel;
        this.evidenceLabel = evidenceLabel;
        this.notes = notes;
        this.reportCount = reportCount;
    }

    public String getId() { return id != null ? id : ""; }
    public String getCategory() { return category != null ? category : "other"; }
    public String getLandmark() {
        if (landmark != null && !landmark.isEmpty()) return landmark;
        // Resolve closest landmark in Mangaluru
        if (lat > 12.870 && lat < 12.875 && lng > 74.844 && lng < 74.849) return "Ambedkar (Jyothi) Circle";
        if (lat > 12.866 && lat < 12.871 && lng > 74.841 && lng < 74.846) return "Hampankatta Signal";
        if (lat > 12.858 && lat < 12.865 && lng > 74.862 && lng < 74.870) return "Pumpwell Flyover";
        if (lat > 12.882 && lat < 12.888 && lng > 74.838 && lng < 74.845) return "Ladyhill / Lalbagh";
        if (lat > 12.895 && lat < 12.905 && lng > 74.845 && lng < 74.855) return "Kottara Chowki";
        if (lat > 12.875 && lat < 12.885 && lng > 74.850 && lng < 74.860) return "KSRTC / Bejai";
        return "Mangaluru Coastal Corridor";
    }
    public double getLat() { return lat; }
    public double getLng() { return lng; }
    public double getLon() { return lng; }
    public String getEvidenceLevel() { return evidenceLevel != null ? evidenceLevel : "L1"; }
    public String getEvidenceLabel() { return evidenceLabel != null ? evidenceLabel : "Citizen Reported"; }
    public String getFreshness() { return freshness != null ? freshness : "2m ago"; }
    public String getNotes() { return notes != null && !notes.isEmpty() ? notes : getEvidenceLabel(); }
    public int getReportCount() { return Math.max(1, reportCount); }

    public String getCategoryDisplayTitle() {
        switch (getCategory().toLowerCase()) {
            case "accident": return "Accident";
            case "road_closed": return "Road Closed";
            case "heavy_traffic": return "Heavy Volume";
            case "flood": return "Flood / Waterlogging";
            case "road_repair": return "Road Repair";
            default: return "Road Hazard";
        }
    }
}
