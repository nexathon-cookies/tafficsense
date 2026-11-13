package com.love.trafficsense;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.love.trafficsense.data.model.DemoAccount;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;
import com.love.trafficsense.utils.MapHtmlBuilder;

import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class BackendIntegrationTest {

    private static final String BASE_URL = "http://192.168.0.224:3000";
    private static final String SUPABASE_AUTH_URL = "http://192.168.0.224:54321/auth/v1/token?grant_type=password";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private OkHttpClient client;
    private Gson gson;

    @Before
    public void setUp() {
        client = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(8, TimeUnit.SECONDS)
                .build();
        gson = new Gson();
    }

    @Test
    public void testMapHtmlBuilderGeneratesValidSyntax() {
        List<LiveIncident> incidents = new ArrayList<>();
        incidents.add(new LiveIncident("inc-test-1", "accident", "Hampankatta Signal", 12.8698, 74.8431, "L3", "Corroborated", "Accident test", 2));

        RouteOption primary = new RouteOption("route-1", "Primary Route", true, 3200, 480, true, "Hazard on route");
        primary.geometry = new RouteOption.RouteGeometry();
        primary.geometry.coordinates = new ArrayList<>();
        List<Double> p1 = new ArrayList<>(); p1.add(74.8431); p1.add(12.8698);
        List<Double> p2 = new ArrayList<>(); p2.add(74.8550); p2.add(12.8580);
        primary.geometry.coordinates.add(p1);
        primary.geometry.coordinates.add(p2);

        RouteOption alt = new RouteOption("route-2", "Detour Route", false, 4100, 600, false, null);
        alt.geometry = new RouteOption.RouteGeometry();
        alt.geometry.coordinates = new ArrayList<>();
        alt.geometry.coordinates.add(p1);
        alt.geometry.coordinates.add(p2);

        String html = MapHtmlBuilder.buildMapHtml(incidents, primary, alt, false, 12.8698, 74.8431);
        assertNotNull(html);
        assertTrue(html.contains("L.map('map'"));
        assertTrue(html.contains("primaryCoords"));
        assertTrue(html.contains("altCoords"));
        assertTrue(html.contains("leaflet-accident-pin"));
        assertTrue(html.contains("💥"));
        assertFalse(html.contains("; bounds.push")); // Ensures no broken JS array literal syntax
    }

    @Test
    public void testFullBackendEndToEndFlow() throws IOException {
        // Step 1: Fetch dynamic demo accounts
        Request demoReq = new Request.Builder()
                .url(BASE_URL + "/api/demo-accounts")
                .get()
                .build();

        String dynamicCommuterPassword = null;
        try (Response demoResp = client.newCall(demoReq).execute()) {
            assertTrue("Expected demo-accounts endpoint to return 200", demoResp.isSuccessful());
            String body = demoResp.body().string();
            JsonObject json = gson.fromJson(body, JsonObject.class);
            assertTrue(json.get("ok").getAsBoolean());
            JsonArray accounts = json.getAsJsonArray("accounts");
            assertTrue("Accounts array should not be empty", accounts.size() > 0);

            for (JsonElement el : accounts) {
                JsonObject acc = el.getAsJsonObject();
                if (acc.has("email") && "commuter@demo.trafficsense.test".equalsIgnoreCase(acc.get("email").getAsString())) {
                    dynamicCommuterPassword = acc.get("password").getAsString();
                    break;
                }
            }
        }

        assertNotNull("Dynamic commuter password should be found in /api/demo-accounts", dynamicCommuterPassword);
        assertFalse(dynamicCommuterPassword.isEmpty());

        // Step 2: Supabase Auth Login with dynamic credentials
        JsonObject authPayload = new JsonObject();
        authPayload.addProperty("email", "commuter@demo.trafficsense.test");
        authPayload.addProperty("password", dynamicCommuterPassword);

        Request authReq = new Request.Builder()
                .url(SUPABASE_AUTH_URL)
                .addHeader("apikey", SUPABASE_ANON_KEY)
                .post(RequestBody.create(authPayload.toString(), JSON))
                .build();

        String accessToken = null;
        try (Response authResp = client.newCall(authReq).execute()) {
            assertTrue("Supabase login should succeed with code 200", authResp.isSuccessful());
            String body = authResp.body().string();
            JsonObject authJson = gson.fromJson(body, JsonObject.class);
            assertTrue("Auth response should contain access_token", authJson.has("access_token"));
            accessToken = authJson.get("access_token").getAsString();
        }

        assertNotNull(accessToken);
        assertFalse(accessToken.isEmpty());

        // Step 3: Fetch Active Incidents
        Request incReq = new Request.Builder()
                .url(BASE_URL + "/api/incidents")
                .get()
                .build();

        try (Response incResp = client.newCall(incReq).execute()) {
            assertTrue("Incidents API should return 200", incResp.isSuccessful());
            String body = incResp.body().string();
            JsonObject incJson = gson.fromJson(body, JsonObject.class);
            assertTrue(incJson.get("ok").getAsBoolean());
            assertTrue(incJson.has("incidents"));
            JsonArray incArray = incJson.getAsJsonArray("incidents");
            assertTrue("Should return at least 1 active incident", incArray.size() >= 1);
        }

        // Step 4: Route calculation between State Bank & Pumpwell (OSRM)
        JsonObject routePayload = new JsonObject();
        JsonArray start = new JsonArray();
        start.add(74.8436); // lng
        start.add(12.8687); // lat
        JsonArray dest = new JsonArray();
        dest.add(74.8550); // lng
        dest.add(12.8580); // lat
        routePayload.add("start", start);
        routePayload.add("destination", dest);

        Request routeReq = new Request.Builder()
                .url(BASE_URL + "/api/route")
                .post(RequestBody.create(routePayload.toString(), JSON))
                .build();

        try (Response routeResp = client.newCall(routeReq).execute()) {
            assertTrue("Route API should return 200", routeResp.isSuccessful());
            String body = routeResp.body().string();
            JsonObject routeJson = gson.fromJson(body, JsonObject.class);
            assertTrue(routeJson.get("ok").getAsBoolean());
            assertTrue(routeJson.has("routes"));
            JsonArray routes = routeJson.getAsJsonArray("routes");
            assertTrue("Should return calculated route options", routes.size() >= 1);

            JsonObject firstRoute = routes.get(0).getAsJsonObject();
            assertTrue(firstRoute.has("distance_m"));
            assertTrue(firstRoute.has("duration_s"));
            assertTrue(firstRoute.has("geometry"));
        }

        // Step 5: Submit an authenticated Incident report
        JsonObject submitPayload = new JsonObject();
        submitPayload.addProperty("category", "accident");
        submitPayload.addProperty("lat", 12.8687);
        submitPayload.addProperty("lng", 74.8436);
        submitPayload.addProperty("gps_accuracy_m", 15);

        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        isoFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        submitPayload.addProperty("gps_fix_at", isoFormat.format(new Date()));
        submitPayload.addProperty("note", "Automated JVM Integration Test Report");

        Request submitReq = new Request.Builder()
                .url(BASE_URL + "/api/incidents")
                .addHeader("Authorization", "Bearer " + accessToken)
                .post(RequestBody.create(submitPayload.toString(), JSON))
                .build();

        try (Response submitResp = client.newCall(submitReq).execute()) {
            assertEquals("Authenticated incident submission should return 201 Created", 201, submitResp.code());
            String body = submitResp.body().string();
            JsonObject submitJson = gson.fromJson(body, JsonObject.class);
            assertTrue(submitJson.get("ok").getAsBoolean());
            assertTrue(submitJson.has("incident_id"));
            assertTrue("Report should be verified at least L1/L2", submitJson.has("level"));
        }
    }
}
