package com.love.trafficsense;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;

import com.love.trafficsense.databinding.ActivityMainBinding;
import com.love.trafficsense.ui.home.HomeFragment;
import com.love.trafficsense.ui.planner.PlannerFragment;
import com.love.trafficsense.ui.report.ReportFragment;
import com.love.trafficsense.ui.traffic.TrafficFragment;
import com.love.trafficsense.ui.workspace.WorkspaceFragment;

public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding binding;
    private Fragment homeFragment;
    private Fragment trafficFragment;
    private Fragment reportFragment;
    private Fragment plannerFragment;
    private Fragment workspaceFragment;
    private Fragment activeFragment;

    public static void navigateTo(Context context, int navItemId) {
        if (context instanceof MainActivity) {
            ((MainActivity) context).selectTab(navItemId);
        }
    }

    public static void navigateToReportWithLocation(Context context, double lat, double lng, String landmarkName) {
        if (context instanceof MainActivity) {
            MainActivity activity = (MainActivity) context;
            if (activity.reportFragment instanceof ReportFragment) {
                ((ReportFragment) activity.reportFragment).prefillLocation(lat, lng, landmarkName);
            }
            activity.selectTab(R.id.navigation_report);
        }
    }

    public static void navigateToPlannerWithDestination(Context context, double lat, double lng, String landmarkName) {
        if (context instanceof MainActivity) {
            MainActivity activity = (MainActivity) context;
            if (activity.plannerFragment instanceof PlannerFragment) {
                ((PlannerFragment) activity.plannerFragment).setDestinationPoint(lat, lng, landmarkName);
            }
            activity.selectTab(R.id.navigation_planner);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // Apply Window Insets safely for status bar & display cutouts without swallowing keyboard (IME)
        ViewCompat.setOnApplyWindowInsetsListener(binding.mainRoot, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            binding.fragmentContainer.setPadding(0, insets.top, 0, 0);
            return windowInsets;
        });

        FragmentManager fm = getSupportFragmentManager();
        if (savedInstanceState == null) {
            homeFragment = new HomeFragment();
            trafficFragment = new TrafficFragment();
            reportFragment = new ReportFragment();
            plannerFragment = new PlannerFragment();
            workspaceFragment = new WorkspaceFragment();
            activeFragment = homeFragment;

            fm.beginTransaction()
                    .add(R.id.fragment_container, workspaceFragment, "workspace").hide(workspaceFragment)
                    .add(R.id.fragment_container, plannerFragment, "planner").hide(plannerFragment)
                    .add(R.id.fragment_container, reportFragment, "report").hide(reportFragment)
                    .add(R.id.fragment_container, trafficFragment, "traffic").hide(trafficFragment)
                    .add(R.id.fragment_container, homeFragment, "home")
                    .commit();
        } else {
            homeFragment = fm.findFragmentByTag("home");
            trafficFragment = fm.findFragmentByTag("traffic");
            reportFragment = fm.findFragmentByTag("report");
            plannerFragment = fm.findFragmentByTag("planner");
            workspaceFragment = fm.findFragmentByTag("workspace");

            if (homeFragment == null) homeFragment = new HomeFragment();
            if (trafficFragment == null) trafficFragment = new TrafficFragment();
            if (reportFragment == null) reportFragment = new ReportFragment();
            if (plannerFragment == null) plannerFragment = new PlannerFragment();
            if (workspaceFragment == null) workspaceFragment = new WorkspaceFragment();

            int selectedId = binding.bottomNav.getSelectedItemId();
            if (selectedId == R.id.navigation_traffic) activeFragment = trafficFragment;
            else if (selectedId == R.id.navigation_report) activeFragment = reportFragment;
            else if (selectedId == R.id.navigation_planner) activeFragment = plannerFragment;
            else if (selectedId == R.id.navigation_workspace) activeFragment = workspaceFragment;
            else activeFragment = homeFragment;
        }

        binding.bottomNav.setOnItemSelectedListener(item -> {
            int id = item.getItemId();
            Fragment target = homeFragment;
            if (id == R.id.navigation_traffic) target = trafficFragment;
            else if (id == R.id.navigation_report) target = reportFragment;
            else if (id == R.id.navigation_planner) target = plannerFragment;
            else if (id == R.id.navigation_workspace) target = workspaceFragment;

            if (target != activeFragment) {
                Fragment outgoing = activeFragment;
                Fragment incoming = target;

                fm.beginTransaction()
                        .hide(outgoing)
                        .show(incoming)
                        .commit();
                activeFragment = target;

                View incomingView = incoming.getView();
                if (incomingView != null) {
                    incomingView.setAlpha(0.6f);
                    incomingView.setScaleX(0.985f);
                    incomingView.setScaleY(0.985f);
                    incomingView.animate()
                            .alpha(1.0f)
                            .scaleX(1.0f)
                            .scaleY(1.0f)
                            .setDuration(160)
                            .setInterpolator(new android.view.animation.DecelerateInterpolator())
                            .start();
                }
            }
            return true;
        });
    }

    public void selectTab(int itemId) {
        binding.bottomNav.setSelectedItemId(itemId);
    }
}