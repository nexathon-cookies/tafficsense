package com.love.trafficsense.ui.home;

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
import androidx.recyclerview.widget.LinearLayoutManager;

import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.databinding.FragmentHomeBinding;
import com.love.trafficsense.ui.traffic.IncidentAdapter;
import com.love.trafficsense.utils.MapHtmlBuilder;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class HomeFragment extends Fragment {

    private FragmentHomeBinding binding;
    private IncidentAdapter adapter;
    private boolean isSwapped = false;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentHomeBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupRecyclerView();
        setupMiniMap();
        setupInteractions();
        loadIncidents();

        binding.swipeRefresh.setOnRefreshListener(this::loadIncidents);
    }

    private void setupRecyclerView() {
        adapter = new IncidentAdapter();
        binding.rvHomeIncidents.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.rvHomeIncidents.setAdapter(adapter);

        adapter.setOnIncidentClickListener(incident -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_traffic);
        });
    }

    private void setupMiniMap() {
        WebView webView = binding.webviewHeroMap;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());

        String initialHtml = MapHtmlBuilder.buildMapHtml(null, null, 12.8687, 74.8436);
        webView.loadDataWithBaseURL("https://trafficsense.local", initialHtml, "text/html", "UTF-8", null);
    }

    private void setupInteractions() {
        // Swap Origin & Destination
        binding.btnHomeSwap.setOnClickListener(v -> {
            isSwapped = !isSwapped;
            if (isSwapped) {
                binding.tvHomeOrigin.setText("Pumpwell Circle / Kankanady");
                binding.tvHomeDest.setText("State Bank / Ladyhill");
            } else {
                binding.tvHomeOrigin.setText("State Bank / Ladyhill");
                binding.tvHomeDest.setText("Pumpwell Circle / Kankanady");
            }
        });

        // Clickable Route Inspection
        binding.btnInspectRoutes.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_planner);
        });

        binding.rowOriginPicker.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_planner);
        });

        binding.rowDestPicker.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_planner);
        });

        // Explore Full Map Button
        binding.btnExploreFullMap.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_traffic);
        });

        // 2x2 Quick Actions
        binding.actionReportIssue.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_report);
        });

        binding.actionLiveMap.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_traffic);
        });

        binding.actionPlanRoute.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_planner);
        });

        binding.actionMyJourneys.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_workspace);
        });

        // Header Avatar & Sync
        binding.header.ivHeaderAvatar.setOnClickListener(v -> {
            Navigation.findNavController(requireView()).navigate(R.id.navigation_workspace);
        });

        binding.btnHomeSync.setOnClickListener(v -> {
            binding.swipeRefresh.setRefreshing(true);
            loadIncidents();
        });
    }

    private void loadIncidents() {
        TrafficApiClient.getInstance().fetchActiveIncidents(new TrafficApiClient.ApiCallback<List<LiveIncident>>() {
            @Override
            public void onSuccess(List<LiveIncident> incidents) {
                if (!isAdded()) return;
                binding.swipeRefresh.setRefreshing(false);
                adapter.setIncidents(incidents);
                binding.tvReportsCount.setText(incidents.size() + " reports");

                String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
                binding.tvLiveTimestamp.setText("Live · updated " + time + " · 30s auto-refresh");

                String mapHtml = MapHtmlBuilder.buildMapHtml(incidents, null, 12.8687, 74.8436);
                binding.webviewHeroMap.loadDataWithBaseURL("https://trafficsense.local", mapHtml, "text/html", "UTF-8", null);
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                binding.swipeRefresh.setRefreshing(false);
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
