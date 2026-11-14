package com.love.trafficsense;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
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
    private final Fragment homeFragment = new HomeFragment();
    private final Fragment trafficFragment = new TrafficFragment();
    private final Fragment reportFragment = new ReportFragment();
    private final Fragment plannerFragment = new PlannerFragment();
    private final Fragment workspaceFragment = new WorkspaceFragment();
    private Fragment activeFragment = homeFragment;

    public static void navigateTo(Context context, int navItemId) {
        if (context instanceof MainActivity) {
            ((MainActivity) context).selectTab(navItemId);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // Apply Window Insets for Camera Cutout, Status Bar & Gesture Navigation
        ViewCompat.setOnApplyWindowInsetsListener(binding.mainRoot, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            binding.fragmentContainer.setPadding(0, insets.top, 0, 0);
            binding.bottomNav.setPadding(0, 0, 0, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        FragmentManager fm = getSupportFragmentManager();
        if (savedInstanceState == null) {
            fm.beginTransaction()
                    .add(R.id.fragment_container, workspaceFragment, "workspace").hide(workspaceFragment)
                    .add(R.id.fragment_container, plannerFragment, "planner").hide(plannerFragment)
                    .add(R.id.fragment_container, reportFragment, "report").hide(reportFragment)
                    .add(R.id.fragment_container, trafficFragment, "traffic").hide(trafficFragment)
                    .add(R.id.fragment_container, homeFragment, "home")
                    .commit();
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