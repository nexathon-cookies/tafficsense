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
        binding.rvHomeIncidents.setLayoutAnimation(android.view.animation.AnimationUtils.loadLayoutAnimation(requireContext(), R.anim.layout_animation_fall_down));
        binding.rvHomeIncidents.setAdapter(adapter);

        adapter.setOnIncidentClickListener(incident -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_traffic);
        });
    }

    @Override
    public void onHiddenChanged(boolean hidden) {
        super.onHiddenChanged(hidden);
        if (!hidden && isAdded()) {
            loadIncidents();
        }
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
        webView.loadDataWithBaseURL("file:///android_asset/", initialHtml, "text/html", "UTF-8", null);
    }

    private void setupInteractions() {
        // Swap Origin & Destination with Elastic 180° Spin and Text Fade
        binding.btnHomeSwap.setOnClickListener(v -> {
            isSwapped = !isSwapped;
            binding.btnHomeSwap.animate()
                    .rotationBy(180f)
                    .setDuration(240)
                    .setInterpolator(new android.view.animation.DecelerateInterpolator())
                    .start();

            binding.tvHomeOrigin.animate().alpha(0.2f).setDuration(100).withEndAction(() -> {
                if (binding != null) {
                    binding.tvHomeOrigin.setText(isSwapped ? "Pumpwell Circle / Kankanady" : "State Bank / Ladyhill");
                    binding.tvHomeOrigin.animate().alpha(1.0f).setDuration(120).start();
                }
            }).start();

            binding.tvHomeDest.animate().alpha(0.2f).setDuration(100).withEndAction(() -> {
                if (binding != null) {
                    binding.tvHomeDest.setText(isSwapped ? "State Bank / Ladyhill" : "Pumpwell Circle / Kankanady");
                    binding.tvHomeDest.animate().alpha(1.0f).setDuration(120).start();
                }
            }).start();
        });

        // Clickable Route Inspection
        binding.btnInspectRoutes.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_planner);
        });

        binding.rowOriginPicker.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_planner);
        });

        binding.rowDestPicker.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_planner);
        });

        // Explore Full Map Button
        binding.btnExploreFullMap.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_traffic);
        });

        // 2x2 Quick Actions
        binding.actionReportIssue.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_report);
        });

        binding.actionLiveMap.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_traffic);
        });

        binding.actionPlanRoute.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_planner);
        });

        binding.actionMyJourneys.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_workspace);
        });

        // Header Avatar & Sync
        binding.header.ivHeaderAvatar.setOnClickListener(v -> {
            com.love.trafficsense.MainActivity.navigateTo(requireContext(), R.id.navigation_workspace);
        });

        binding.btnHomeSync.setOnClickListener(v -> {
            binding.swipeRefresh.setRefreshing(true);
            loadIncidents();
        });
    }

    private void loadIncidents() {
        List<LiveIncident> cached = TrafficApiClient.getInstance().getCachedIncidents();
        if (cached != null && !cached.isEmpty()) {
            adapter.setIncidents(cached);
            binding.rvHomeIncidents.scheduleLayoutAnimation();
            binding.tvReportsCount.setText(cached.size() + " reports");
            String cachedHtml = MapHtmlBuilder.buildMapHtml(cached, null, 12.8687, 74.8436);
            binding.webviewHeroMap.loadDataWithBaseURL("file:///android_asset/", cachedHtml, "text/html", "UTF-8", null);
        }

        TrafficApiClient.getInstance().fetchActiveIncidents(new TrafficApiClient.ApiCallback<List<LiveIncident>>() {
            @Override
            public void onSuccess(List<LiveIncident> incidents) {
                if (!isAdded()) return;
                binding.swipeRefresh.setRefreshing(false);
                adapter.setIncidents(incidents);
                binding.rvHomeIncidents.scheduleLayoutAnimation();
                binding.tvReportsCount.setText(incidents.size() + " reports");

                String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
                binding.tvLiveTimestamp.setText("Live · updated " + time + " · 30s auto-refresh");

                String mapHtml = MapHtmlBuilder.buildMapHtml(incidents, null, 12.8687, 74.8436);
                binding.webviewHeroMap.loadDataWithBaseURL("file:///android_asset/", mapHtml, "text/html", "UTF-8", null);
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
