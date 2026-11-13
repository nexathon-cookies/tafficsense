package com.love.trafficsense.ui.planner;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.navigation.Navigation;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;
import com.love.trafficsense.databinding.FragmentPlannerBinding;
import com.love.trafficsense.utils.MapHtmlBuilder;
import com.love.trafficsense.utils.PlacesData;

import java.util.ArrayList;
import java.util.List;

public class PlannerFragment extends Fragment {

    private static final String TAG = "PlannerFragment";

    private FragmentPlannerBinding binding;
    private PlacesData.Place origin = PlacesData.MANGALURU_PLACES.get(0);
    private PlacesData.Place destination = PlacesData.MANGALURU_PLACES.get(1);

    private RouteOption primaryRoute;
    private RouteOption alternativeRoute;
    private boolean isAlternativeSelected = false;
    private List<LiveIncident> activeIncidents = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentPlannerBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupHeader();
        setupMap();
        setupPresetChips();
        updatePlaceLabels();

        binding.cardSelectOrigin.setOnClickListener(v -> showPlacePicker(true));
        binding.cardSelectDest.setOnClickListener(v -> showPlacePicker(false));

        binding.btnPlannerSwap.setOnClickListener(v -> {
            PlacesData.Place temp = origin;
            origin = destination;
            destination = temp;
            updatePlaceLabels();
            checkRoute();
        });

        binding.btnCheckRoute.setOnClickListener(v -> checkRoute());

        binding.switchAlternative.setOnCheckedChangeListener((buttonView, isChecked) -> {
            isAlternativeSelected = isChecked;
            binding.cardAlternativeRoute.setVisibility(isChecked ? View.VISIBLE : View.GONE);
            updateCardHighlights();
            renderRouteMap();
            if (isChecked && alternativeRoute != null) {
                Toast.makeText(requireContext(), "Alternative detour active: " + alternativeRoute.name, Toast.LENGTH_SHORT).show();
            }
        });

        binding.btnSelectDetour.setOnClickListener(v -> {
            isAlternativeSelected = true;
            binding.switchAlternative.setChecked(true);
            updateCardHighlights();
            renderRouteMap();
            Toast.makeText(requireContext(), "Selected alternative detour: " + (alternativeRoute != null ? alternativeRoute.name : "Detour"), Toast.LENGTH_SHORT).show();
        });

        loadIncidentsAndRoute();
    }

    private void setupHeader() {
        binding.header.tvHeaderTitle.setText("Route Planner");
        binding.header.tvHeaderSubtitle.setText("MANGALURU · HUBS");
        binding.header.ivHeaderAvatar.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_workspace);
        });
    }

    private void setupMap() {
        WebView webView = binding.webviewPlannerMap;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, "Map JS: " + cm.message() + " -- From line " + cm.lineNumber());
                return true;
            }
        });

        renderRouteMap();
    }

    private void updateCardHighlights() {
        int primaryBorderColor = ContextCompat.getColor(requireContext(), R.color.primary);
        int secondaryBorderColor = ContextCompat.getColor(requireContext(), R.color.secondary);
        int defaultBorderColor = ContextCompat.getColor(requireContext(), R.color.border);

        if (isAlternativeSelected) {
            binding.cardPrimaryRoute.setStrokeColor(defaultBorderColor);
            binding.cardPrimaryRoute.setStrokeWidth(1);
            binding.cardAlternativeRoute.setStrokeColor(secondaryBorderColor);
            binding.cardAlternativeRoute.setStrokeWidth(3);
        } else {
            binding.cardPrimaryRoute.setStrokeColor(primaryBorderColor);
            binding.cardPrimaryRoute.setStrokeWidth(3);
            binding.cardAlternativeRoute.setStrokeColor(defaultBorderColor);
            binding.cardAlternativeRoute.setStrokeWidth(1);
        }
    }

    private void renderRouteMap() {
        String html = MapHtmlBuilder.buildMapHtml(activeIncidents, primaryRoute, alternativeRoute, isAlternativeSelected, origin.lat, origin.lng);
        binding.webviewPlannerMap.loadDataWithBaseURL("https://trafficsense.local", html, "text/html", "UTF-8", null);
    }

    private void setupPresetChips() {
        binding.chipPreset1.setOnClickListener(v -> {
            origin = PlacesData.MANGALURU_PLACES.get(0);
            destination = PlacesData.MANGALURU_PLACES.get(1);
            updatePlaceLabels();
            checkRoute();
        });

        binding.chipPreset2.setOnClickListener(v -> {
            origin = PlacesData.MANGALURU_PLACES.get(1); // Pumpwell
            destination = PlacesData.MANGALURU_PLACES.get(2); // State Bank
            updatePlaceLabels();
            checkRoute();
        });

        binding.chipPreset3.setOnClickListener(v -> {
            origin = PlacesData.MANGALURU_PLACES.get(3); // Ladyhill
            destination = PlacesData.MANGALURU_PLACES.get(4); // Kadri
            updatePlaceLabels();
            checkRoute();
        });
    }

    private void updatePlaceLabels() {
        binding.tvOriginName.setText(origin.name);
        binding.tvDestName.setText(destination.name);
    }

    private void showPlacePicker(boolean isOrigin) {
        String[] placeNames = new String[PlacesData.MANGALURU_PLACES.size()];
        for (int i = 0; i < PlacesData.MANGALURU_PLACES.size(); i++) {
            placeNames[i] = PlacesData.MANGALURU_PLACES.get(i).name;
        }

        new MaterialAlertDialogBuilder(requireContext())
                .setTitle(isOrigin ? "Select Origin Hub" : "Select Destination Hub")
                .setItems(placeNames, (dialog, which) -> {
                    PlacesData.Place selected = PlacesData.MANGALURU_PLACES.get(which);
                    if (isOrigin) {
                        origin = selected;
                    } else {
                        destination = selected;
                    }
                    updatePlaceLabels();
                    checkRoute();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void loadIncidentsAndRoute() {
        TrafficApiClient.getInstance().fetchActiveIncidents(new TrafficApiClient.ApiCallback<List<LiveIncident>>() {
            @Override
            public void onSuccess(List<LiveIncident> incidents) {
                if (isAdded()) {
                    activeIncidents = incidents;
                }
                checkRoute();
            }

            @Override
            public void onError(String message) {
                checkRoute();
            }
        });
    }

    private void checkRoute() {
        binding.btnCheckRoute.setEnabled(false);
        TrafficApiClient.getInstance().fetchRoute(origin.lat, origin.lng, destination.lat, destination.lng, new TrafficApiClient.ApiCallback<List<RouteOption>>() {
            @Override
            public void onSuccess(List<RouteOption> routes) {
                if (!isAdded() || routes == null || routes.isEmpty()) return;
                binding.btnCheckRoute.setEnabled(true);

                primaryRoute = routes.get(0);
                binding.tvPrimaryTitle.setText(primaryRoute.name);
                binding.tvPrimaryTelemetry.setText(String.format("%s · %s", primaryRoute.getFormattedDistance(), primaryRoute.getFormattedDuration()));

                if (primaryRoute.hasHazards && primaryRoute.warningNote != null && !primaryRoute.warningNote.isEmpty()) {
                    binding.layoutRouteWarning.setVisibility(View.VISIBLE);
                    binding.tvRouteWarning.setText(primaryRoute.warningNote);
                } else {
                    binding.layoutRouteWarning.setVisibility(View.GONE);
                }

                if (routes.size() > 1) {
                    alternativeRoute = routes.get(1);
                    binding.tvAlternativeTitle.setText(alternativeRoute.name);
                    binding.tvAlternativeTelemetry.setText(String.format("%s · %s · Avoids reported corridor hazard",
                            alternativeRoute.getFormattedDistance(), alternativeRoute.getFormattedDuration()));
                    binding.switchAlternative.setVisibility(View.VISIBLE);
                } else {
                    alternativeRoute = null;
                    isAlternativeSelected = false;
                    binding.switchAlternative.setChecked(false);
                    binding.cardAlternativeRoute.setVisibility(View.GONE);
                }

                updateCardHighlights();
                renderRouteMap();
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                binding.btnCheckRoute.setEnabled(true);
                Toast.makeText(requireContext(), "Route calculation: " + message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
