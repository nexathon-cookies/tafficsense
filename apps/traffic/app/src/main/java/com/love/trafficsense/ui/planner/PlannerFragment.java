package com.love.trafficsense.ui.planner;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.navigation.Navigation;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.data.model.RouteOption;
import com.love.trafficsense.databinding.FragmentPlannerBinding;
import com.love.trafficsense.utils.MapHtmlBuilder;
import com.love.trafficsense.utils.PlacesData;

import java.util.List;

public class PlannerFragment extends Fragment {

    private FragmentPlannerBinding binding;
    private PlacesData.Place origin = PlacesData.MANGALURU_PLACES.get(0);
    private PlacesData.Place destination = PlacesData.MANGALURU_PLACES.get(1);

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
            binding.cardAlternativeRoute.setVisibility(isChecked ? View.VISIBLE : View.GONE);
            if (isChecked) {
                Toast.makeText(requireContext(), "Alternative detour displayed (commuter choice)", Toast.LENGTH_SHORT).show();
            }
        });

        binding.btnSelectDetour.setOnClickListener(v -> {
            Toast.makeText(requireContext(), "Alternative bypass route selected for navigation", Toast.LENGTH_SHORT).show();
        });

        checkRoute();
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
        webView.setWebViewClient(new WebViewClient());

        renderRouteMap(null);
    }

    private void renderRouteMap(RouteOption route) {
        String html = MapHtmlBuilder.buildMapHtml(null, route, origin.lat, origin.lng);
        binding.webviewPlannerMap.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
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

    private void checkRoute() {
        binding.btnCheckRoute.setEnabled(false);
        TrafficApiClient.getInstance().fetchRoute(origin.lat, origin.lng, destination.lat, destination.lng, new TrafficApiClient.ApiCallback<List<RouteOption>>() {
            @Override
            public void onSuccess(List<RouteOption> routes) {
                if (!isAdded() || routes == null || routes.isEmpty()) return;
                binding.btnCheckRoute.setEnabled(true);

                RouteOption route = routes.get(0);
                binding.tvPrimaryTitle.setText(route.name);
                binding.tvPrimaryTelemetry.setText(String.format("%s · %s", route.getFormattedDistance(), route.getFormattedDuration()));

                if (route.hasHazards && route.warningNote != null && !route.warningNote.isEmpty()) {
                    binding.layoutRouteWarning.setVisibility(View.VISIBLE);
                    binding.tvRouteWarning.setText(route.warningNote);
                } else {
                    binding.layoutRouteWarning.setVisibility(View.GONE);
                }

                renderRouteMap(route);
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
