package com.love.trafficsense.data.model;

import java.io.Serializable;

public class SavedCorridor implements Serializable {
    public String id;
    public String title;
    public String via;
    public String schedule;
    public String originName;
    public String destName;
    public double originLat;
    public double originLng;
    public double destLat;
    public double destLng;
    public int estimatedMinutes;
    public int delayMinutes;
    public String status; // NORMAL, MODERATE, HAZARD
    public String statusDetail;
    public boolean alertsEnabled;

    public SavedCorridor(String id, String title, String via, String schedule,
                         String originName, String destName,
                         double originLat, double originLng,
                         double destLat, double destLng,
                         int estimatedMinutes, int delayMinutes,
                         String status, String statusDetail, boolean alertsEnabled) {
        this.id = id;
        this.title = title;
        this.via = via;
        this.schedule = schedule;
        this.originName = originName;
        this.destName = destName;
        this.originLat = originLat;
        this.originLng = originLng;
        this.destLat = destLat;
        this.destLng = destLng;
        this.estimatedMinutes = estimatedMinutes;
        this.delayMinutes = delayMinutes;
        this.status = status;
        this.statusDetail = statusDetail;
        this.alertsEnabled = alertsEnabled;
    }
}
