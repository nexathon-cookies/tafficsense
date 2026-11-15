package com.love.trafficsense.data.model;

import java.io.Serializable;

public class L5VerificationResult implements Serializable {
    public boolean isGenuineIncident;
    public String detectedCategory;
    public boolean categoryMatchesReport;
    public String confidenceTier; // "high", "moderate", "low"
    public String severity; // "moderate", "severe", "critical"
    public String visualSummary;
    public String verificationTier; // "L5"
    public String source; // "gemini", "offline_fallback"

    public L5VerificationResult() {}

    public L5VerificationResult(boolean isGenuineIncident, String detectedCategory,
                                boolean categoryMatchesReport, String confidenceTier,
                                String severity, String visualSummary,
                                String verificationTier, String source) {
        this.isGenuineIncident = isGenuineIncident;
        this.detectedCategory = detectedCategory;
        this.categoryMatchesReport = categoryMatchesReport;
        this.confidenceTier = confidenceTier;
        this.severity = severity;
        this.visualSummary = visualSummary;
        this.verificationTier = verificationTier;
        this.source = source;
    }
}
