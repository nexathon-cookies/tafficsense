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
}
