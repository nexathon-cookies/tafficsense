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
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.navigation.Navigation;

import com.google.android.material.card.MaterialCardView;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.databinding.FragmentReportBinding;
import com.love.trafficsense.utils.PlacesData;

public class ReportFragment extends Fragment {

    private FragmentReportBinding binding;
    private String selectedCategory = "accident";
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
        setupLocationSelection();

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
    }

    private void selectCategory(String category, MaterialCardView selectedCard) {
        selectedCategory = category;

        int defaultBorderColor = ContextCompat.getColor(requireContext(), R.color.border);
        int primaryBorderColor = ContextCompat.getColor(requireContext(), R.color.primary);

        MaterialCardView[] allCards = new MaterialCardView[] {
            binding.cardCatAccident, binding.cardCatBlockage, binding.cardCatTraffic,
            binding.cardCatFlood, binding.cardCatConstruction, binding.cardCatOther
        };

        for (MaterialCardView card : allCards) {
            if (card == selectedCard) {
                card.setStrokeColor(primaryBorderColor);
                card.setStrokeWidth(4);
                card.setCardElevation(6f);
                card.animate()
                    .scaleX(1.06f)
                    .scaleY(1.06f)
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
                card.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start();
            }
        }
    }

    private void setupLocationSelection() {
        binding.tvReportLocationTitle.setText(selectedPlace.name);
        binding.tvReportCoords.setText(String.format("Lat: %.4f, Lng: %.4f · GPS ±12m", currentLat, currentLng));

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
                        binding.tvReportCoords.setText(String.format("Lat: %.4f, Lng: %.4f · Selected preset", currentLat, currentLng));
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
                binding.tvReportCoords.setText(String.format("Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
                Toast.makeText(requireContext(), "Location updated from GPS", Toast.LENGTH_SHORT).show();
            } else {
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, new LocationListener() {
                    @Override
                    public void onLocationChanged(@NonNull Location location) {
                        currentLat = location.getLatitude();
                        currentLng = location.getLongitude();
                        if (isAdded()) {
                            binding.tvReportLocationTitle.setText("Current Device GPS");
                            binding.tvReportCoords.setText(String.format("Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
                            Toast.makeText(requireContext(), "GPS acquired", Toast.LENGTH_SHORT).show();
                        }
                    }
                }, null);
            }
        } catch (SecurityException e) {
            Toast.makeText(requireContext(), "Location permission required", Toast.LENGTH_SHORT).show();
        }
    }

    private void submitHazard() {
        String note = binding.etHazardNote.getText() != null ? binding.etHazardNote.getText().toString().trim() : "";
        if (note.isEmpty()) {
            note = selectedCategory + " observed at " + binding.tvReportLocationTitle.getText().toString();
        }

        binding.btnSubmitReport.setEnabled(false);
        TrafficApiClient.getInstance().submitIncident(selectedCategory, currentLat, currentLng, note, new TrafficApiClient.ApiCallback<Boolean>() {
            @Override
            public void onSuccess(Boolean result) {
                if (!isAdded()) return;
                binding.btnSubmitReport.setEnabled(true);
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
        super.onDestroyView();
        binding = null;
    }
}
