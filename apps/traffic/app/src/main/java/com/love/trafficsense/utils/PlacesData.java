package com.love.trafficsense.utils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PlacesData {
    public static class Place {
        public final String name;
        public final String hub;
        public final double lat;
        public final double lng;

        public Place(String name, String hub, double lat, double lng) {
            this.name = name;
            this.hub = hub;
            this.lat = lat;
            this.lng = lng;
        }

        @Override
        public String toString() {
            return name + " (" + hub + ")";
        }
    }

    public static final List<Place> MANGALURU_PLACES;

    static {
        List<Place> list = new ArrayList<>();
        list.add(new Place("Hampankatta Junction", "City Core", 12.8698, 74.8431));
        list.add(new Place("Bejai Circle", "KSRTC Hub", 12.8856, 74.8479));
        list.add(new Place("Pumpwell Circle", "South NH66", 12.8622, 74.8660));
        list.add(new Place("Lalbagh Junction", "North Hub", 12.8824, 74.8398));
        list.add(new Place("Ladyhill / Urwa", "Coastal West", 12.8912, 74.8322));
        list.add(new Place("Central Railway Station", "Transit Terminal", 12.8631, 74.8392));
        list.add(new Place("Kankanady Bypass", "East NH73", 12.8654, 74.8582));
        list.add(new Place("Mangaluru Int Airport", "Bajpe North", 12.9613, 74.8901));
        list.add(new Place("Surathkal Junction", "NITK North", 13.0089, 74.7943));
        MANGALURU_PLACES = Collections.unmodifiableList(list);
    }

    public static Place getNearestPlace(double lat, double lng) {
        Place nearest = MANGALURU_PLACES.get(0);
        double minDistance = Double.MAX_VALUE;
        for (Place p : MANGALURU_PLACES) {
            double dLat = (lat - p.lat) * 111000.0;
            double dLng = (lng - p.lng) * 108200.0;
            double dist = Math.sqrt(dLat * dLat + dLng * dLng);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = p;
            }
        }
        return nearest;
    }

    public static String describeLocation(double lat, double lng) {
        Place nearest = MANGALURU_PLACES.get(0);
        double minDistance = Double.MAX_VALUE;
        for (Place p : MANGALURU_PLACES) {
            double dLat = (lat - p.lat) * 111000.0;
            double dLng = (lng - p.lng) * 108200.0;
            double dist = Math.sqrt(dLat * dLat + dLng * dLng);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = p;
            }
        }
        if (minDistance < 300) {
            return "At " + nearest.name;
        } else if (minDistance < 1500) {
            return "Near " + nearest.name + " (" + ((int) minDistance) + "m)";
        } else {
            return nearest.name + " Corridor (~" + String.format(java.util.Locale.US, "%.1f", minDistance / 1000.0) + " km)";
        }
    }
}
