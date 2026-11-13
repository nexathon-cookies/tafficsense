package com.love.trafficsense.ui.traffic;

import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.navigation.Navigation;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.databinding.FragmentTrafficBinding;
import com.love.trafficsense.utils.MapHtmlBuilder;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class TrafficFragment extends Fragment {

    private FragmentTrafficBinding binding;
    private IncidentAdapter adapter;
    private List<LiveIncident> allIncidents = new ArrayList<>();
    private LiveIncident selectedIncident = null;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentTrafficBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupHeader();
        setupToggleBar();
        setupWebView();
        setupRecyclerView();
        setupSearchFilter();
        loadIncidents();
    }

    private void setupHeader() {
        binding.header.tvHeaderTitle.setText("Live Traffic Map");
        binding.header.tvHeaderSubtitle.setText("MANGALURU · CORRIDORS");
        binding.header.ivHeaderAvatar.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_workspace);
        });
    }

    private void setupToggleBar() {
        binding.toggleViewMode.addOnButtonCheckedListener((group, checkedId, isChecked) -> {
            if (!isChecked) return;
            if (checkedId == R.id.btn_view_map) {
                binding.webViewMap.setVisibility(View.VISIBLE);
                binding.rvTrafficList.setVisibility(View.GONE);
            } else {
                binding.webViewMap.setVisibility(View.GONE);
                binding.rvTrafficList.setVisibility(View.VISIBLE);
                binding.bottomSheetIncident.setVisibility(View.GONE);
            }
        });

        String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
        binding.tvClock.setText(time);
    }

    private void setupWebView() {
        WebSettings settings = binding.webViewMap.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        binding.webViewMap.setWebViewClient(new WebViewClient());
        binding.webViewMap.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                android.util.Log.d("TrafficMap", "Map JS: " + cm.message() + " -- Line " + cm.lineNumber());
                return true;
            }
        });

        // JavaScript Interface bridge to receive clicks from Leaflet markers
        binding.webViewMap.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onIncidentSelected(String incidentId) {
                requireActivity().runOnUiThread(() -> {
                    for (LiveIncident inc : allIncidents) {
                        if (inc.id != null && inc.id.equals(incidentId)) {
                            showIncidentDetails(inc);
                            break;
                        }
                    }
                });
            }
        }, "AndroidBridge");
    }

    private void setupRecyclerView() {
        adapter = new IncidentAdapter();
        binding.rvTrafficList.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.rvTrafficList.setAdapter(adapter);

        adapter.setOnIncidentClickListener(this::showIncidentDetails);
    }

    private void setupSearchFilter() {
        binding.etSearchTraffic.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                filterIncidents(s.toString());
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });
    }

    private void filterIncidents(String query) {
        if (query == null || query.trim().isEmpty()) {
            adapter.setIncidents(allIncidents);
            return;
        }
        String lower = query.toLowerCase().trim();
        List<LiveIncident> filtered = new ArrayList<>();
        for (LiveIncident inc : allIncidents) {
            if ((inc.category != null && inc.category.toLowerCase().contains(lower)) ||
                (inc.landmark != null && inc.landmark.toLowerCase().contains(lower)) ||
                (inc.notes != null && inc.notes.toLowerCase().contains(lower))) {
                filtered.add(inc);
            }
        }
        adapter.setIncidents(filtered);
    }

    private void showIncidentDetails(LiveIncident inc) {
        this.selectedIncident = inc;
        binding.bottomSheetIncident.setVisibility(View.VISIBLE);
        binding.tvSheetTitle.setText(inc.landmark != null ? inc.landmark : "Traffic Incident");
        binding.tvSheetLandmark.setText("Category: " + (inc.category != null ? inc.category.toUpperCase() : "HAZARD"));
        binding.tvSheetNotes.setText(inc.notes != null && !inc.notes.isEmpty() ? inc.notes : "Reported obstacle affecting corridor passage.");

        String levelStr = inc.evidenceLevel != null ? inc.evidenceLevel : "L3";
        binding.tvSheetBadge.setText((levelStr.startsWith("L") ? "" : "L") + levelStr + " " + (inc.evidenceLabel != null ? inc.evidenceLabel : "Corroborated"));

        // Detour navigation button
        binding.btnSheetPlanDetour.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_planner);
        });

        // Corroborate button
        binding.btnSheetCorroborate.setOnClickListener(v -> {
            binding.btnSheetCorroborate.setEnabled(false);
            Toast.makeText(requireContext(), "Submitting corroboration to backend...", Toast.LENGTH_SHORT).show();
            TrafficApiClient.getInstance().submitIncident(inc.category, inc.lat, inc.lng,
                    "Corroborated by active commuter at " + (inc.landmark != null ? inc.landmark : "corridor"),
                    new TrafficApiClient.ApiCallback<Boolean>() {
                        @Override
                        public void onSuccess(Boolean result) {
                            if (!isAdded()) return;
                            binding.btnSheetCorroborate.setEnabled(true);
                            binding.bottomSheetIncident.setVisibility(View.GONE);
                            Toast.makeText(requireContext(), "Corroboration verified! Evidence level updated.", Toast.LENGTH_SHORT).show();
                            loadIncidents();
                        }

                        @Override
                        public void onError(String message) {
                            if (!isAdded()) return;
                            binding.btnSheetCorroborate.setEnabled(true);
                            if (message != null && message.toLowerCase().contains("rate limit")) {
                                Toast.makeText(requireContext(), "Rate limit reached (5 reports/hr). Switch persona in Workspace to submit more.", Toast.LENGTH_LONG).show();
                            } else {
                                Toast.makeText(requireContext(), "Corroboration: " + message, Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
        });
    }

    private void loadIncidents() {
        TrafficApiClient.getInstance().fetchActiveIncidents(new TrafficApiClient.ApiCallback<List<LiveIncident>>() {
            @Override
            public void onSuccess(List<LiveIncident> incidents) {
                if (!isAdded()) return;
                allIncidents = incidents;
                adapter.setIncidents(incidents);
                binding.btnViewList.setText("List (" + incidents.size() + ")");

                // Build & Render OpenStreetMap
                String mapHtml = MapHtmlBuilder.buildMapHtml(incidents, null, 12.8687, 74.8436);
                binding.webViewMap.loadDataWithBaseURL("https://trafficsense.local", mapHtml, "text/html", "UTF-8", null);
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                Toast.makeText(requireContext(), message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
