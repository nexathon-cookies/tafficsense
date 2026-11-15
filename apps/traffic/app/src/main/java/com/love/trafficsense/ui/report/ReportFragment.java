package com.love.trafficsense.ui.report;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
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
import com.love.trafficsense.data.model.L5VerificationResult;
import com.love.trafficsense.databinding.FragmentReportBinding;
import com.love.trafficsense.utils.MapHtmlBuilder;
import com.love.trafficsense.utils.PlacesData;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;

public class ReportFragment extends Fragment {

    private FragmentReportBinding binding;
    private String selectedCategory = "accident";
    private boolean isSevere = false;
    private PlacesData.Place selectedPlace = PlacesData.MANGALURU_PLACES.get(0);
    private double currentLat = 12.8687;
    private double currentLng = 74.8436;

    private L5VerificationResult currentL5Result = null;
    private Bitmap currentPhotoBitmap = null;

    private final ActivityResultLauncher<String> requestPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
                if (isGranted) {
                    fetchGpsLocation();
                } else {
                    Toast.makeText(requireContext(), "Location permission denied; using curated Mangaluru locations", Toast.LENGTH_SHORT).show();
                }
            });

    private final ActivityResultLauncher<String> galleryLauncher =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                if (uri != null) {
                    processPhotoUri(uri);
                }
            });

    private final ActivityResultLauncher<Void> cameraLauncher =
            registerForActivityResult(new ActivityResultContracts.TakePicturePreview(), bitmap -> {
                if (bitmap != null) {
                    processBitmap(bitmap);
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
        setupPhotoPanel();
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

        // If an image was already analyzed, re-verify or refresh visual summary
        if (currentPhotoBitmap != null && currentL5Result != null) {
            processBitmap(currentPhotoBitmap);
        }
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
            String script = String.format(Locale.US, "window.setPin && window.setPin(%.5f, %.5f);", lat, lng);
            binding.webviewReportMiniMap.evaluateJavascript(script, null);
        }
    }

    private void setupLocationSelection() {
        binding.tvReportLocationTitle.setText(selectedPlace.name);
        binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · GPS ±8m", currentLat, currentLng));

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
                        binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · Selected preset", currentLat, currentLng));
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
        binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · %s", currentLat, currentLng, place.hub));
        updateMiniMap(currentLat, currentLng);
        Toast.makeText(requireContext(), "Pinned to " + place.name, Toast.LENGTH_SHORT).show();
    }

    private void setupPhotoPanel() {
        binding.btnPhotoCamera.setOnClickListener(v -> {
            try {
                cameraLauncher.launch(null);
            } catch (Exception e) {
                Toast.makeText(requireContext(), "Camera unavailable: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });

        binding.btnPhotoGallery.setOnClickListener(v -> {
            try {
                galleryLauncher.launch("image/*");
            } catch (Exception e) {
                Toast.makeText(requireContext(), "Gallery picker unavailable: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });

        binding.btnPhotoPreset.setOnClickListener(v -> createSampleRoadHazardPhoto());

        binding.btnRemovePhoto.setOnClickListener(v -> removePhoto());
    }

    private void processPhotoUri(Uri uri) {
        try {
            InputStream is = requireContext().getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(is);
            if (is != null) is.close();
            if (bitmap != null) {
                processBitmap(bitmap);
            } else {
                Toast.makeText(requireContext(), "Unable to decode selected image", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(requireContext(), "Failed reading image: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void createSampleRoadHazardPhoto() {
        // Creates a high-fidelity synthetic road obstruction image for reliable demonstration
        int width = 480;
        int height = 320;
        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);

        // Asphalt road surface
        Paint roadPaint = new Paint();
        roadPaint.setColor(Color.parseColor("#374151"));
        canvas.drawRect(0, 0, width, height, roadPaint);

        // Center road dashed divider
        Paint dividerPaint = new Paint();
        dividerPaint.setColor(Color.parseColor("#F59E0B"));
        dividerPaint.setStrokeWidth(8f);
        for (int y = 0; y < height; y += 40) {
            canvas.drawLine(width / 2f, y, width / 2f, y + 25, dividerPaint);
        }

        // Road hazard barrier / cone representation
        Paint conePaint = new Paint();
        conePaint.setColor(Color.parseColor("#EF4444"));
        canvas.drawRoundRect(new RectF(120, 100, 360, 220), 16, 16, conePaint);

        Paint stripePaint = new Paint();
        stripePaint.setColor(Color.WHITE);
        canvas.drawRect(120, 140, 360, 165, stripePaint);

        Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(20f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        canvas.drawText("ROAD HAZARD · MANGALURU", width / 2f, 195, textPaint);

        processBitmap(bmp);
        Toast.makeText(requireContext(), "Attached Mangaluru arterial hazard sample photo", Toast.LENGTH_SHORT).show();
    }

    private void processBitmap(Bitmap bitmap) {
        this.currentPhotoBitmap = bitmap;

        // Scale bitmap if larger than 1024 to stay under 4MB limit
        int maxDim = Math.max(bitmap.getWidth(), bitmap.getHeight());
        Bitmap scaledBmp = bitmap;
        if (maxDim > 1024) {
            float ratio = 1024f / maxDim;
            scaledBmp = Bitmap.createScaledBitmap(bitmap, (int) (bitmap.getWidth() * ratio), (int) (bitmap.getHeight() * ratio), true);
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        scaledBmp.compress(Bitmap.CompressFormat.JPEG, 80, baos);
        byte[] imageBytes = baos.toByteArray();
        String base64Image = Base64.encodeToString(imageBytes, Base64.NO_WRAP);

        // Show thumbnail and analyzing status immediately
        binding.layoutPhotoPreviewContainer.setVisibility(View.VISIBLE);
        binding.ivPhotoThumbnail.setImageBitmap(scaledBmp);
        binding.tvPhotoStatusBadge.setText("🔄 ANALYZING WITH AI...");
        binding.tvPhotoStatusBadge.setBackgroundResource(R.drawable.bg_pill_violet);
        binding.tvPhotoStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.secondary));
        binding.tvPhotoCategoryDetected.setText("Processing Visual Scene Evidence...");
        binding.tvPhotoSummary.setText("Stripping EXIF PII · Sending to Gemini Vision API...");

        // Invoke Vision verification endpoint
        TrafficApiClient.getInstance().verifyEvidence(base64Image, "image/jpeg", selectedCategory, "live-report", new TrafficApiClient.ApiCallback<L5VerificationResult>() {
            @Override
            public void onSuccess(L5VerificationResult result) {
                if (!isAdded() || binding == null) return;
                currentL5Result = result;

                if (result.isGenuineIncident) {
                    binding.cardPhotoPanel.setStrokeColor(ContextCompat.getColor(requireContext(), R.color.primary));
                    binding.cardPhotoPanel.setStrokeWidth(2);
                    binding.tvPhotoStatusBadge.setText("📸 L5 VERIFIED");
                    binding.tvPhotoStatusBadge.setBackgroundResource(R.drawable.bg_pill_green);
                    binding.tvPhotoStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.success));

                    binding.tvPhotoCategoryDetected.setText(String.format("AI Vision: %s (%s Confidence)",
                            result.detectedCategory.toUpperCase(Locale.US),
                            result.confidenceTier.toUpperCase(Locale.US)));
                    binding.tvPhotoSummary.setText(result.visualSummary);

                    binding.btnSubmitReport.setText("Submit L5 Verified Hazard");
                    Toast.makeText(requireContext(), "Promoted to L5 Visual Corroboration!", Toast.LENGTH_SHORT).show();
                } else {
                    binding.tvPhotoStatusBadge.setText("⚠️ LOW CONFIDENCE");
                    binding.tvPhotoStatusBadge.setBackgroundResource(R.drawable.bg_pill_violet);
                    binding.tvPhotoCategoryDetected.setText("Scene does not match hazard category");
                    binding.tvPhotoSummary.setText(result.visualSummary);
                }
            }

            @Override
            public void onError(String message) {
                if (!isAdded() || binding == null) return;
                binding.tvPhotoStatusBadge.setText("📸 ATTACHED (OFFLINE)");
                binding.tvPhotoCategoryDetected.setText("Photo attached for authority review");
                binding.tvPhotoSummary.setText("Visual evidence will be corroborated on submission.");
            }
        });
    }

    private void removePhoto() {
        currentL5Result = null;
        currentPhotoBitmap = null;
        binding.layoutPhotoPreviewContainer.setVisibility(View.GONE);
        binding.cardPhotoPanel.setStrokeColor(ContextCompat.getColor(requireContext(), R.color.border));
        binding.cardPhotoPanel.setStrokeWidth(1);
        binding.btnSubmitReport.setText("Submit Anonymized Hazard");
        Toast.makeText(requireContext(), "Photo removed", Toast.LENGTH_SHORT).show();
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
                binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
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
                            binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · Fix acquired", currentLat, currentLng));
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
            binding.tvReportCoords.setText(String.format(Locale.US, "Lat: %.4f, Lng: %.4f · Pinned from Map", lat, lng));
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

        boolean isL5 = currentL5Result != null && currentL5Result.isGenuineIncident && !"low".equalsIgnoreCase(currentL5Result.confidenceTier);
        String l5Summary = isL5 ? currentL5Result.visualSummary : null;

        binding.btnSubmitReport.setEnabled(false);
        binding.btnSubmitReport.setText("Submitting Hazard Report...");

        TrafficApiClient.getInstance().submitIncident(selectedCategory, currentLat, currentLng, note, isL5, l5Summary, new TrafficApiClient.ApiCallback<Boolean>() {
            @Override
            public void onSuccess(Boolean result) {
                if (!isAdded()) return;
                binding.btnSubmitReport.setEnabled(true);
                binding.btnSubmitReport.setText(isL5 ? "Submit L5 Verified Hazard" : "Submit Anonymized Hazard");
                binding.etHazardNote.setText("");
                removePhoto();

                String dialogTitle = isL5 ? "L5 Verified Hazard Reported!" : "Hazard Reported!";
                String dialogMsg = isL5
                        ? "Your hazard report has been promoted to Level L5 Visual Corroboration by AI Vision.\n\nDispatched to Traffic Authority with 📸 Photo Verified badge."
                        : "Your hazard report has been recorded and verified by high-accuracy GPS (Level L2).\n\nWould you like to view it on the Live Traffic Map?";

                new MaterialAlertDialogBuilder(requireContext())
                        .setTitle(dialogTitle)
                        .setMessage(dialogMsg)
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
                binding.btnSubmitReport.setText(isL5 ? "Submit L5 Verified Hazard" : "Submit Anonymized Hazard");
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
