package com.love.trafficsense.data.api;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.love.trafficsense.BuildConfig;
import com.love.trafficsense.data.model.DemoAccount;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;

import java.io.IOException;
import java.net.URI;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class TrafficApiClient {
    private static final String TAG = "TrafficApiClient";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
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

    private static String getSupabaseAuthUrl() {
        try {
            URI uri = URI.create(getBaseUrl());
            String host = uri.getHost();
            if (host == null) host = "10.0.2.2";
            return "http://" + host + ":54321/auth/v1/token?grant_type=password";
        } catch (Exception e) {
            return "http://10.0.2.2:54321/auth/v1/token?grant_type=password";
        }
    }

    private final OkHttpClient client;
    private final Gson gson;
    private final Handler mainHandler;

    private String currentAuthToken = null;
    private String currentAuthEmail = "commuter@demo.trafficsense.test";
    private String currentRole = "commuter";

    private List<DemoAccount> cachedDemoAccounts = DemoAccount.getPredefinedAccounts();

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
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build();
        this.gson = new Gson();
        this.mainHandler = new Handler(Looper.getMainLooper());

        // Perform initial dynamic credentials fetch and sign-in
        syncDemoAccountsAndLogin("commuter@demo.trafficsense.test", null);
    }

    public synchronized String getCurrentAuthToken() {
        return currentAuthToken;
    }

    public synchronized String getCurrentAuthEmail() {
        return currentAuthEmail;
    }

    public synchronized String getCurrentRole() {
        return currentRole;
    }

    public synchronized List<DemoAccount> getCachedDemoAccounts() {
        return new ArrayList<>(cachedDemoAccounts);
    }

    public void syncDemoAccountsAndLogin(String emailToLogin, ApiCallback<String> callback) {
        Log.i(TAG, "Syncing demo accounts from " + getBaseUrl() + "/api/demo-accounts...");
        fetchDemoAccounts(new ApiCallback<List<DemoAccount>>() {
            @Override
            public void onSuccess(List<DemoAccount> accounts) {
                cachedDemoAccounts = accounts;
                String targetEmail = emailToLogin != null ? emailToLogin : "commuter@demo.trafficsense.test";
                DemoAccount match = null;
                for (DemoAccount acc : accounts) {
                    if (acc.email != null && acc.email.equalsIgnoreCase(targetEmail)) {
                        match = acc;
                        break;
                    }
                }
                if (match != null && match.password != null && !match.password.isEmpty()) {
                    Log.i(TAG, "Found dynamic credentials for " + match.email + ", logging in...");
                    login(match.email, match.password, callback);
                } else if (!accounts.isEmpty()) {
                    DemoAccount first = accounts.get(0);
                    login(first.email, first.password, callback);
                } else if (callback != null) {
                    callback.onError("No valid demo accounts found");
                }
            }

            @Override
            public void onError(String message) {
                Log.w(TAG, "Failed to sync demo accounts: " + message + ", using predefined credentials");
                // fallback to predefined
                for (DemoAccount acc : cachedDemoAccounts) {
                    if (acc.email != null && acc.email.equalsIgnoreCase(emailToLogin)) {
                        login(acc.email, acc.password, callback);
                        return;
                    }
                }
                if (callback != null) callback.onError(message);
            }
        });
    }

    public void login(String email, String password, ApiCallback<String> callback) {
        String effectivePassword = password;
        if (effectivePassword == null || effectivePassword.isEmpty()) {
            for (DemoAccount acc : cachedDemoAccounts) {
                if (acc.email != null && acc.email.equalsIgnoreCase(email)) {
                    effectivePassword = acc.password;
                    break;
                }
            }
        }

        JsonObject payload = new JsonObject();
        payload.addProperty("email", email);
        payload.addProperty("password", effectivePassword != null ? effectivePassword : "");

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request request = new Request.Builder()
                .url(getSupabaseAuthUrl())
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .post(body)
                .build();

        Log.i(TAG, "Attempting Supabase login for: " + email + " at " + getSupabaseAuthUrl());

        final String finalEmail = email;
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Login failed network error: " + e.getMessage());
                if (callback != null) {
                    mainHandler.post(() -> callback.onError("Network error during sign-in"));
                }
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    String err = "Auth status: " + response.code();
                    String errBody = response.body() != null ? response.body().string() : "";
                    Log.e(TAG, "Login failed: " + err + " body: " + errBody);

                    // If invalid credentials, attempt refresh from /api/demo-accounts if we haven't already
                    if (response.code() == 400 && errBody.contains("invalid_credentials") && !finalEmail.endsWith(".refreshed")) {
                        Log.i(TAG, "Invalid credentials detected, re-syncing /api/demo-accounts...");
                        mainHandler.post(() -> syncDemoAccountsAndLogin(finalEmail + ".refreshed", callback));
                        return;
                    }

                    if (callback != null) {
                        mainHandler.post(() -> callback.onError(err));
                    }
                    return;
                }
                try {
                    String respStr = response.body().string();
                    JsonObject json = gson.fromJson(respStr, JsonObject.class);
                    if (json.has("access_token")) {
                        currentAuthToken = json.get("access_token").getAsString();
                        currentAuthEmail = finalEmail.replace(".refreshed", "");
                        if (currentAuthEmail.contains("authority")) {
                            currentRole = "authority";
                        } else if (currentAuthEmail.contains("employer")) {
                            currentRole = "employer";
                        } else {
                            currentRole = "commuter";
                        }
                        Log.i(TAG, "Successfully signed in as: " + currentAuthEmail + ", role: " + currentRole);
                        if (callback != null) {
                            mainHandler.post(() -> callback.onSuccess(currentAuthToken));
                        }
                    } else {
                        if (callback != null) {
                            mainHandler.post(() -> callback.onError("No access_token returned"));
                        }
                    }
                } catch (Exception ex) {
                    Log.e(TAG, "Parse login error: " + ex.getMessage());
                    if (callback != null) {
                        mainHandler.post(() -> callback.onError(ex.getMessage()));
                    }
                }
            }
        });
    }

    public void fetchActiveIncidents(ApiCallback<List<LiveIncident>> callback) {
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/incidents")
                .get()
                .build();

        Log.i(TAG, "GET " + getBaseUrl() + "/api/incidents");

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "fetchActiveIncidents failed: " + e.getMessage() + ", using fallback");
                mainHandler.post(() -> callback.onSuccess(getFallbackIncidents()));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    Log.w(TAG, "fetchActiveIncidents status " + response.code() + ", using fallback");
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
                    Log.i(TAG, "Loaded " + list.size() + " active incidents from backend");
                    final List<LiveIncident> finalList = list;
                    mainHandler.post(() -> callback.onSuccess(finalList));
                } catch (Exception ex) {
                    Log.e(TAG, "Error parsing active incidents: " + ex.getMessage());
                    mainHandler.post(() -> callback.onSuccess(getFallbackIncidents()));
                }
            }
        });
    }

    public void submitIncident(String category, double lat, double lng, String note, ApiCallback<Boolean> callback) {
        if (currentAuthToken == null) {
            Log.i(TAG, "No auth token for submitIncident, syncing demo accounts and logging in first...");
            syncDemoAccountsAndLogin(currentAuthEmail != null ? currentAuthEmail : "commuter@demo.trafficsense.test", new ApiCallback<String>() {
                @Override
                public void onSuccess(String token) {
                    executeSubmitIncident(category, lat, lng, note, true, callback);
                }

                @Override
                public void onError(String message) {
                    Log.e(TAG, "Auto-login before submit failed: " + message);
                    mainHandler.post(() -> callback.onError("Authentication required: " + message));
                }
            });
            return;
        }
        executeSubmitIncident(category, lat, lng, note, false, callback);
    }

    private void executeSubmitIncident(String category, double lat, double lng, String note, boolean hasRetried, ApiCallback<Boolean> callback) {
        JsonObject payload = new JsonObject();
        payload.addProperty("category", category);
        payload.addProperty("lat", lat);
        payload.addProperty("lng", lng);
        payload.addProperty("gps_accuracy_m", 15);

        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        isoFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        payload.addProperty("gps_fix_at", isoFormat.format(new Date()));
        payload.addProperty("note", note);

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request.Builder reqBuilder = new Request.Builder()
                .url(getBaseUrl() + "/api/incidents")
                .post(body);

        if (currentAuthToken != null) {
            reqBuilder.addHeader("Authorization", "Bearer " + currentAuthToken);
        }

        Log.i(TAG, "POST " + getBaseUrl() + "/api/incidents payload=" + payload.toString());

        client.newCall(reqBuilder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "submitIncident failed: " + e.getMessage());
                mainHandler.post(() -> callback.onError("Network error: " + e.getMessage()));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                boolean success = response.isSuccessful();
                String respBody = response.body() != null ? response.body().string() : "";
                Log.i(TAG, "submitIncident response code=" + response.code() + " body=" + respBody);

                if (response.code() == 401 && !hasRetried) {
                    Log.i(TAG, "401 Unauthorized during submit, refreshing session and retrying...");
                    currentAuthToken = null;
                    syncDemoAccountsAndLogin(currentAuthEmail, new ApiCallback<String>() {
                        @Override
                        public void onSuccess(String token) {
                            executeSubmitIncident(category, lat, lng, note, true, callback);
                        }

                        @Override
                        public void onError(String message) {
                            mainHandler.post(() -> callback.onError("Sign-in expired: " + message));
                        }
                    });
                    return;
                }

                if (success) {
                    mainHandler.post(() -> callback.onSuccess(true));
                } else {
                    String cleanError = "Server error " + response.code();
                    try {
                        JsonObject errJson = gson.fromJson(respBody, JsonObject.class);
                        if (errJson != null && errJson.has("error") && !errJson.get("error").isJsonNull()) {
                            cleanError = errJson.get("error").getAsString();
                        }
                    } catch (Exception ignored) {}
                    final String finalError = cleanError;
                    mainHandler.post(() -> callback.onError(finalError));
                }
            }
        });
    }

    public void fetchRoute(double startLat, double startLng, double destLat, double destLng, ApiCallback<List<RouteOption>> callback) {
        JsonObject payload = new JsonObject();
        // Backend expects [lng, lat] coordinate pairs
        JsonArray start = new JsonArray();
        start.add(startLng);
        start.add(startLat);

        JsonArray dest = new JsonArray();
        dest.add(destLng);
        dest.add(destLat);

        payload.add("start", start);
        payload.add("destination", dest);

        RequestBody body = RequestBody.create(payload.toString(), JSON);
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/route")
                .post(body)
                .build();

        Log.i(TAG, "POST " + getBaseUrl() + "/api/route: " + payload.toString());

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "fetchRoute failed: " + e.getMessage() + ", using fallback routes");
                mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    Log.w(TAG, "fetchRoute returned code " + response.code());
                    mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
                    return;
                }
                try {
                    String responseBody = response.body().string();
                    JsonObject json = gson.fromJson(responseBody, JsonObject.class);
                    List<RouteOption> routes = new ArrayList<>();
                    if (json.has("routes") && json.get("routes").isJsonArray()) {
                        for (JsonElement el : json.getAsJsonArray("routes")) {
                            RouteOption r = gson.fromJson(el, RouteOption.class);
                            // Process hazard warnings
                            JsonObject obj = el.getAsJsonObject();
                            if (obj.has("incidents_on_route") && obj.getAsJsonArray("incidents_on_route").size() > 0) {
                                r.hasHazards = true;
                                JsonArray incs = obj.getAsJsonArray("incidents_on_route");
                                StringBuilder warn = new StringBuilder("Active road incident affecting this corridor: ");
                                for (int i = 0; i < incs.size(); i++) {
                                    if (i > 0) warn.append(", ");
                                    JsonElement item = incs.get(i);
                                    if (item.isJsonObject()) {
                                        JsonObject incObj = item.getAsJsonObject();
                                        if (incObj.has("label")) {
                                            warn.append(incObj.get("label").getAsString());
                                        } else if (incObj.has("category")) {
                                            warn.append(incObj.get("category").getAsString());
                                        } else {
                                            warn.append("Hazard");
                                        }
                                    } else {
                                        warn.append(item.getAsString());
                                    }
                                }
                                r.warningNote = warn.toString();
                            } else {
                                r.hasHazards = false;
                            }
                            routes.add(r);
                        }
                    }
                    if (routes.isEmpty()) {
                        routes = getFallbackRoutes(startLat, startLng, destLat, destLng);
                    }
                    Log.i(TAG, "Computed " + routes.size() + " route options from OSRM backend");
                    final List<RouteOption> finalRoutes = routes;
                    mainHandler.post(() -> callback.onSuccess(finalRoutes));
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing route options: " + e.getMessage());
                    mainHandler.post(() -> callback.onSuccess(getFallbackRoutes(startLat, startLng, destLat, destLng)));
                }
            }
        });
    }

    public void fetchDemoAccounts(ApiCallback<List<DemoAccount>> callback) {
        Request request = new Request.Builder()
                .url(getBaseUrl() + "/api/demo-accounts")
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                mainHandler.post(() -> callback.onSuccess(DemoAccount.getPredefinedAccounts()));
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> callback.onSuccess(DemoAccount.getPredefinedAccounts()));
                    return;
                }
                try {
                    String resp = response.body().string();
                    JsonObject json = gson.fromJson(resp, JsonObject.class);
                    List<DemoAccount> list = new ArrayList<>();
                    if (json.has("accounts") && json.get("accounts").isJsonArray()) {
                        for (JsonElement el : json.getAsJsonArray("accounts")) {
                            list.add(gson.fromJson(el, DemoAccount.class));
                        }
                    }
                    if (list.isEmpty()) {
                        list = DemoAccount.getPredefinedAccounts();
                    }
                    final List<DemoAccount> finalList = list;
                    mainHandler.post(() -> callback.onSuccess(finalList));
                } catch (Exception ex) {
                    mainHandler.post(() -> callback.onSuccess(DemoAccount.getPredefinedAccounts()));
                }
            }
        });
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
