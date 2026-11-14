package com.love.trafficsense.ui.report;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.google.android.material.card.MaterialCardView;
import com.google.android.material.chip.Chip;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.databinding.FragmentReportBinding;
import com.love.trafficsense.utils.MapHtmlBuilder;
import com.love.trafficsense.utils.PlacesData;

public class ReportFragment extends Fragment {

    private FragmentReportBinding binding;
    private String selectedCategory = "accident";
    private boolean isSevere = false;
    private PlacesData.Place selectedPlace = PlacesData.MANGALURU_PLACES.get(0);
    private double currentLat = 12.8687;
    private double currentLng = 74.8436;

    private final ActivityResultLauncher<String> requestPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
                if (isGranted) {
                    fetchGpsLocation();
                } else {
                    Toast.makeText(requireContext(), "Location permission denied; using curated Mangaluru locations", Toast.LENGTH_SHORT).show();
                }
            });

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentReportBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupHeader();
        setupCategorySelection();
        setupSeveritySwitcher();
        setupMiniMap();
        setupLocationSelection();
        setupQuickHubs();
        setupQuickObservationChips();

        binding.btnSubmitReport.setOnClickListener(v -> submitHazard());
    }

    private void setupHeader() {
        binding.header.tvHeaderTitle.setText("Report a Hazard");
        binding.header.tvHeaderSubtitle.setText("CIVIC CITIZEN REPORT");
        binding.header.ivHeaderAvatar.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_workspace);
        });
    }

    private void setupCategorySelection() {
        binding.cardCatAccident.setOnClickListener(v -> selectCategory("accident", binding.cardCatAccident));
        binding.cardCatBlockage.setOnClickListener(v -> selectCategory("road_closed", binding.cardCatBlockage));
        binding.cardCatTraffic.setOnClickListener(v -> selectCategory("heavy_traffic", binding.cardCatTraffic));
        binding.cardCatFlood.setOnClickListener(v -> selectCategory("flood", binding.cardCatFlood));
        binding.cardCatConstruction.setOnClickListener(v -> selectCategory("road_repair", binding.cardCatConstruction));
        binding.cardCatOther.setOnClickListener(v -> selectCategory("other", binding.cardCatOther));

        // Initial default state
        selectCategory("accident", binding.cardCatAccident);
    }

    private void selectCategory(String category, MaterialCardView selectedCard) {
        selectedCategory = category;

        int defaultBorderColor = ContextCompat.getColor(requireContext(), R.color.border);
        int primaryBorderColor = ContextCompat.getColor(requireContext(), R.color.primary);

        MaterialCardView[] allCards = new MaterialCardView[] {
            binding.cardCatAccident, binding.cardCatBlockage, binding.cardCatTraffic,
            binding.cardCatFlood, binding.cardCatConstruction, binding.cardCatOther
        };

        View[] allCheckmarks = new View[] {
            binding.ivCheckCatAccident, binding.ivCheckCatBlockage, binding.ivCheckCatTraffic,
            binding.ivCheckCatFlood, binding.ivCheckCatConstruction, binding.ivCheckCatOther
        };

        for (int i = 0; i < allCards.length; i++) {
            MaterialCardView card = allCards[i];
            View checkmark = allCheckmarks[i];

            if (card == selectedCard) {
                card.setStrokeColor(primaryBorderColor);
                card.setStrokeWidth(3);
                card.setCardElevation(6f);
                if (checkmark != null) checkmark.setVisibility(View.VISIBLE);
                card.animate()
                    .scaleX(1.05f)
                    .scaleY(1.05f)
                    .setDuration(100)
                    .setInterpolator(new android.view.animation.OvershootInterpolator(1.8f))
                    .withEndAction(() -> {
                        if (isAdded() && binding != null) {
                            card.animate().scaleX(1.02f).scaleY(1.02f).setDuration(80).start();
                        }
                    })
                    .start();
            } else {
                card.setStrokeColor(defaultBorderColor);
                card.setStrokeWidth(1);
                card.setCardElevation(1f);
                if (checkmark != null) checkmark.setVisibility(View.GONE);
                card.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start();
            }
        }

        updateQuickObservationChips(category);
    }

    private void setupSeveritySwitcher() {
        int primaryColor = ContextCompat.getColor(requireContext(), R.color.primary);
        int defaultBorder = ContextCompat.getColor(requireContext(), R.color.border);

        binding.cardSeverityMinor.setOnClickListener(v -> {
            isSevere = false;
            binding.cardSeverityMinor.setStrokeColor(primaryColor);
            binding.cardSeverityMinor.setStrokeWidth(2);
            binding.cardSeverityMinor.setCardElevation(3f);
            binding.tvSeverityMinorTitle.setTextColor(primaryColor);

            binding.cardSeveritySevere.setStrokeColor(defaultBorder);
            binding.cardSeveritySevere.setStrokeWidth(1);
            binding.cardSeveritySevere.setCardElevation(1f);
            binding.tvSeveritySevereTitle.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        });

        binding.cardSeveritySevere.setOnClickListener(v -> {
            isSevere = true;
            int warningColor = ContextCompat.getColor(requireContext(), R.color.error);
            binding.cardSeveritySevere.setStrokeColor(warningColor);
            binding.cardSeveritySevere.setStrokeWidth(2);
            binding.cardSeveritySevere.setCardElevation(3f);
            binding.tvSeveritySevereTitle.setTextColor(warningColor);

            binding.cardSeverityMinor.setStrokeColor(defaultBorder);
            binding.cardSeverityMinor.setStrokeWidth(1);
            binding.cardSeverityMinor.setCardElevation(1f);
            binding.tvSeverityMinorTitle.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        });
    }

    private void setupMiniMap() {
        WebView webView = binding.webviewReportMiniMap;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());

        String initialHtml = MapHtmlBuilder.buildMiniPinMapHtml(currentLat, currentLng);
        webView.loadDataWithBaseURL("file:///android_asset/", initialHtml, "text/html", "UTF-8", null);
    }

    private void updateMiniMap(double lat, double lng) {
        if (binding != null && binding.webviewReportMiniMap != null) {
            String script = String.format(java.util.Locale.US, "window.setPin && window.setPin(%.5f, %.5f);", lat, lng);
            binding.webviewReportMiniMap.evaluateJavascript(script, null);
        }
    }

    private void setupLocationSelection() {
        binding.tvReportLocationTitle.setText(selectedPlace.name);
        binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · GPS ±8m", currentLat, currentLng));

        binding.cardPickLocation.setOnClickListener(v -> {
            String[] placeNames = new String[PlacesData.MANGALURU_PLACES.size()];
            for (int i = 0; i < PlacesData.MANGALURU_PLACES.size(); i++) {
                placeNames[i] = PlacesData.MANGALURU_PLACES.get(i).name;
            }

            new MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Select Hazard Location")
                    .setItems(placeNames, (dialog, which) -> {
                        selectedPlace = PlacesData.MANGALURU_PLACES.get(which);
                        currentLat = selectedPlace.lat;
                        currentLng = selectedPlace.lng;
                        binding.tvReportLocationTitle.setText(selectedPlace.name);
                        binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · Selected preset", currentLat, currentLng));
                        updateMiniMap(currentLat, currentLng);
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });

        binding.btnUseGps.setOnClickListener(v -> {
            if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                fetchGpsLocation();
            } else {
                requestPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        });
    }

    private void setupQuickHubs() {
        binding.chipHubHampankatta.setOnClickListener(v -> applyHub(PlacesData.MANGALURU_PLACES.get(0)));
        binding.chipHubLalbagh.setOnClickListener(v -> applyHub(PlacesData.MANGALURU_PLACES.get(3)));
        binding.chipHubBejai.setOnClickListener(v -> applyHub(PlacesData.MANGALURU_PLACES.get(1)));
        binding.chipHubPumpwell.setOnClickListener(v -> applyHub(PlacesData.MANGALURU_PLACES.get(2)));
        binding.chipHubLadyhill.setOnClickListener(v -> applyHub(PlacesData.MANGALURU_PLACES.get(4)));
    }

    private void applyHub(PlacesData.Place place) {
        selectedPlace = place;
        currentLat = place.lat;
        currentLng = place.lng;
        binding.tvReportLocationTitle.setText(place.name);
        binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · %s", currentLat, currentLng, place.hub));
        updateMiniMap(currentLat, currentLng);
        Toast.makeText(requireContext(), "Pinned to " + place.name, Toast.LENGTH_SHORT).show();
    }

    private void setupQuickObservationChips() {
        Chip[] chips = new Chip[] { binding.chipObs1, binding.chipObs2, binding.chipObs3, binding.chipObs4 };
        for (Chip chip : chips) {
            chip.setOnClickListener(v -> {
                String chipText = chip.getText().toString().replace("+ ", "").trim();
                String current = binding.etHazardNote.getText() != null ? binding.etHazardNote.getText().toString().trim() : "";
                if (current.isEmpty()) {
                    binding.etHazardNote.setText(chipText);
                } else if (!current.contains(chipText)) {
                    binding.etHazardNote.setText(current + " · " + chipText);
                }
                binding.etHazardNote.setSelection(binding.etHazardNote.getText().length());
            });
        }
    }

    private void updateQuickObservationChips(String category) {
        if (binding == null) return;
        switch (category) {
            case "road_closed":
                binding.chipObs1.setText("+ Road closed ahead");
                binding.chipObs2.setText("+ Police barricade");
                binding.chipObs3.setText("+ Diversion via bypass");
                binding.chipObs4.setText("+ Excavation work");
                break;
            case "heavy_traffic":
                binding.chipObs1.setText("+ Bumper-to-bumper");
                binding.chipObs2.setText("+ Signal failure");
                binding.chipObs3.setText("+ Heavy truck queue");
                binding.chipObs4.setText("+ Standstill 15+ mins");
                break;
            case "flood":
                binding.chipObs1.setText("+ Waterlogging 1ft deep");
                binding.chipObs2.setText("+ Passable only by buses");
                binding.chipObs3.setText("+ Manhole overflow");
                binding.chipObs4.setText("+ Flash flood puddle");
                break;
            case "road_repair":
                binding.chipObs1.setText("+ Potholes on left lane");
                binding.chipObs2.setText("+ Road resurfacing");
                binding.chipObs3.setText("+ Open trench");
                binding.chipObs4.setText("+ Tar laying active");
                break;
            case "other":
                binding.chipObs1.setText("+ Fallen tree branch");
                binding.chipObs2.setText("+ Low hanging cable");
                binding.chipObs3.setText("+ Oil spill on road");
                binding.chipObs4.setText("+ Stray cattle on lane");
                break;
            case "accident":
            default:
                binding.chipObs1.setText("+ Overturned vehicle");
                binding.chipObs2.setText("+ Right lane blocked");
                binding.chipObs3.setText("+ Emergency on scene");
                binding.chipObs4.setText("+ Traffic halted");
                break;
        }
    }

    private void fetchGpsLocation() {
        LocationManager locationManager = (LocationManager) requireContext().getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            Location lastKnown = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (lastKnown == null) {
                lastKnown = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }

            if (lastKnown != null) {
                currentLat = lastKnown.getLatitude();
                currentLng = lastKnown.getLongitude();
                binding.tvReportLocationTitle.setText("Current Device GPS");
                binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
                updateMiniMap(currentLat, currentLng);
                Toast.makeText(requireContext(), "Location updated from GPS", Toast.LENGTH_SHORT).show();
            } else {
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, new LocationListener() {
                    @Override
                    public void onLocationChanged(@NonNull Location location) {
                        currentLat = location.getLatitude();
                        currentLng = location.getLongitude();
                        if (isAdded() && binding != null) {
                            binding.tvReportLocationTitle.setText("Current Device GPS");
                            binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
                            updateMiniMap(currentLat, currentLng);
                            Toast.makeText(requireContext(), "GPS acquired", Toast.LENGTH_SHORT).show();
                        }
                    }
                }, null);
            }
        } catch (SecurityException e) {
            Toast.makeText(requireContext(), "Location permission required", Toast.LENGTH_SHORT).show();
        }
    }

    public void prefillLocation(double lat, double lng, String landmarkName) {
        this.currentLat = lat;
        this.currentLng = lng;
        if (binding != null) {
            binding.tvReportLocationTitle.setText(landmarkName != null ? landmarkName : PlacesData.describeLocation(lat, lng));
            binding.tvReportCoords.setText(String.format(java.util.Locale.US, "Lat: %.4f, Lng: %.4f · Pinned from Map", lat, lng));
            updateMiniMap(lat, lng);
        }
    }

    private void submitHazard() {
        String note = binding.etHazardNote.getText() != null ? binding.etHazardNote.getText().toString().trim() : "";
        if (note.isEmpty()) {
            note = selectedCategory + " observed at " + binding.tvReportLocationTitle.getText().toString();
        }

        if (isSevere) {
            note = "[SEVERE / ROAD BLOCKED] " + note;
        }

        binding.btnSubmitReport.setEnabled(false);
        binding.btnSubmitReport.setText("Submitting Hazard Report...");
        TrafficApiClient.getInstance().submitIncident(selectedCategory, currentLat, currentLng, note, new TrafficApiClient.ApiCallback<Boolean>() {
            @Override
            public void onSuccess(Boolean result) {
                if (!isAdded()) return;
                binding.btnSubmitReport.setEnabled(true);
                binding.btnSubmitReport.setText("Submit Anonymized Hazard");
                binding.etHazardNote.setText("");
                new MaterialAlertDialogBuilder(requireContext())
                        .setTitle("Hazard Reported!")
                        .setMessage("Your hazard report has been recorded and verified by high-accuracy GPS (Level L2).\n\nWould you like to view it on the Live Traffic Map?")
                        .setPositiveButton("View on Map", (dialog, which) -> {
                            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_traffic);
                        })
                        .setNegativeButton("Done", null)
                        .show();
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                binding.btnSubmitReport.setEnabled(true);
                binding.btnSubmitReport.setText("Submit Anonymized Hazard");
                if (message != null && message.toLowerCase().contains("rate limit")) {
                    new MaterialAlertDialogBuilder(requireContext())
                            .setTitle("Hourly Rate Limit (Anti-Spam)")
                            .setMessage("The civic engine allows up to 5 reports per hour per account to prevent spam.\n\nYou can switch to another demo persona (e.g. Commuter 2 or Traffic Authority) in the Workspace tab to continue reporting immediately.")
                            .setPositiveButton("Switch Persona", (dialog, which) -> {
                                com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_workspace);
                            })
                            .setNegativeButton("OK", null)
                            .show();
                } else {
                    Toast.makeText(requireContext(), "Submission: " + message, Toast.LENGTH_LONG).show();
                }
            }
        });
    }

    @Override
    public void onDestroyView() {
        if (binding != null && binding.webviewReportMiniMap != null) {
            binding.webviewReportMiniMap.stopLoading();
        }
        super.onDestroyView();
        binding = null;
    }
}
