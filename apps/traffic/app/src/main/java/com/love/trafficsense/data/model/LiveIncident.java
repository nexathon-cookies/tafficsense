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

    @SerializedName("evidence_level")
    public String evidenceLevel = "L1";

    @SerializedName("evidence_label")
    public String evidenceLabel = "Citizen Reported";

    @SerializedName("created_at")
    public String createdAt;

    @SerializedName("freshness")
    public String freshness = "2m ago";

    @SerializedName("notes")
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
    public String getLandmark() { return landmark != null ? landmark : "Mangaluru Corridor"; }
    public double getLat() { return lat; }
    public double getLng() { return lng; }
    public double getLon() { return lng; }
    public String getEvidenceLevel() { return evidenceLevel != null ? evidenceLevel : "L1"; }
    public String getEvidenceLabel() { return evidenceLabel != null ? evidenceLabel : "Citizen Reported"; }
    public String getFreshness() { return freshness != null ? freshness : "2m ago"; }
    public String getNotes() { return notes != null ? notes : ""; }
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
