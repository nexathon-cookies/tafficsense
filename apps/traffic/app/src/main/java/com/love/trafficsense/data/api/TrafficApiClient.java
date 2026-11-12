package com.love.trafficsense.data.api;

import android.os.Handler;
import android.os.Looper;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.love.trafficsense.data.model.DemoAccount;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import com.love.trafficsense.BuildConfig;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class TrafficApiClient {
    private static String baseUrl = BuildConfig.BASE_URL;
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    public static synchronized String getBaseUrl() {
        return baseUrl != null ? baseUrl : "http://10.0.2.2:3000";
    }

    public static synchronized void setBaseUrl(String url) {
        if (url != null && !url.trim().isEmpty()) {
            baseUrl = url.trim().replaceAll("/+$", "");
        }
    }

    private final OkHttpClient client;
    private final Gson gson;
    private final Handler mainHandler;

    public interface ApiCallback<T> {
        void onSuccess(T result);
        void onError(String message);
    }

    private static TrafficApiClient instance;

    public static synchronized TrafficApiClient getInstance() {
        if (instance == null) {
            instance = new TrafficApiClient();
        }
        return instance;
    }

    private TrafficApiClient() {
        this.client = new OkHttpClient.Builder()
                .connectTimeout(6, TimeUnit.SECONDS)
                .readTimeout(8, TimeUnit.SECONDS)
                .build();
        this.gson = new Gson();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public void fetchActiveIncidents(ApiCallback<List<LiveIncident>> callback) {
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/incidents")
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(getFallbackIncidents()));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> callback.onSuccess(getFallbackIncidents()));
                    return;
                }
                try {
                    String body = response.body().string();
                    JsonObject json = gson.fromJson(body, JsonObject.class);
                    List<LiveIncident> list = new ArrayList<>();
                    if (json.has("incidents") && json.get("incidents").isJsonArray()) {
                        for (JsonElement el : json.getAsJsonArray("incidents")) {
                            list.add(gson.fromJson(el, LiveIncident.class));
                        }
                    }
                    if (list.isEmpty()) {
                        list = getFallbackIncidents();
                    }
                    final List<LiveIncident> finalList = list;
                    mainHandler.post(() -> callback.onSuccess(finalList));
                } catch (Exception ex) {
                    mainHandler.post(() -> callback.onSuccess(getFallbackIncidents()));
                }
            }
        });
    }

    public void submitIncident(String category, double lat, double lng, String note, ApiCallback<Boolean> callback) {
        JsonObject payload = new JsonObject();
        payload.addProperty("category", category);
        payload.addProperty("lat", lat);
        payload.addProperty("lng", lng);
        payload.addProperty("note", note);

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/incidents")
                .post(body)
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                // Return success optimistically in offline mode
                mainHandler.post(() -> callback.onSuccess(true));
            }

            @Override
            public void onResponse(Call call, Response response) {
                mainHandler.post(() -> callback.onSuccess(response.isSuccessful()));
            }
        });
    }

    public void fetchRoute(double startLat, double startLng, double destLat, double destLng, ApiCallback<List<RouteOption>> callback) {
        JsonObject payload = new JsonObject();
        JsonArray start = new JsonArray();
        start.add(startLat);
        start.add(startLng);
        JsonArray dest = new JsonArray();
        dest.add(destLat);
        dest.add(destLng);
        payload.add("start", start);
        payload.add("destination", dest);

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/route")
                .post(body)
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
                    return;
                }
                try {
                    String responseBody = response.body().string();
                    JsonObject json = gson.fromJson(responseBody, JsonObject.class);
                    List<RouteOption> routes = new ArrayList<>();
                    if (json.has("routes") && json.get("routes").isJsonArray()) {
                        for (JsonElement el : json.getAsJsonArray("routes")) {
                            routes.add(gson.fromJson(el, RouteOption.class));
                        }
                    }
                    if (routes.isEmpty()) {
                        routes = getFallbackRoutes(startLat, startLng, destLat, destLng);
                    }
                    final List<RouteOption> finalRoutes = routes;
                    mainHandler.post(() -> callback.onSuccess(finalRoutes));
                } catch (Exception e) {
                    mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
                }
            }
        });
    }

    public void fetchDemoAccounts(ApiCallback<List<DemoAccount>> callback) {
        mainHandler.post(() -> callback.onSuccess(DemoAccount.getPredefinedAccounts()));
    }

    public List<LiveIncident> getFallbackIncidents() {
        List<LiveIncident> list = new ArrayList<>();
        list.add(new LiveIncident("inc-1", "accident", "Pumpwell Flyover Service Road", 12.8622, 74.8660, "L3", "Corroborated by 2 drivers", "2-wheeler collision near Pumpwell Flyover lower service road", 2));
        list.add(new LiveIncident("inc-2", "flood", "Hampankatta Signal", 12.8698, 74.8431, "L2", "Sensor Verified", "Waterlogging 15cm deep near Hampankatta signal", 1));
        list.add(new LiveIncident("inc-3", "heavy_traffic", "KSRTC Bejai Bus Stand", 12.8856, 74.8479, "L4", "Speed Slowdown Detected", "Slow-moving traffic crawl towards KSRTC Bejai bus stand", 4));
        list.add(new LiveIncident("inc-4", "road_repair", "Ladyhill Church Road", 12.8912, 74.8322, "L5", "Authority Dispatch", "Pipeline excavation at Ladyhill Church road", 5));
        return list;
    }

    public List<RouteOption> getFallbackRoutes(double startLat, double startLng, double destLat, double destLng) {
        List<RouteOption> routes = new ArrayList<>();
        RouteOption primary = new RouteOption("route-primary", "Primary Corridor (NH 66 / Kankanady)", true, 4200, 720, true, "Active incident: 2-wheeler collision near Pumpwell Flyover");
        routes.add(primary);

        RouteOption alt = new RouteOption("route-alt", "Alternative Bypass (Kadri Hills)", false, 5600, 840, false, null);
        routes.add(alt);
        return routes;
    }
}
