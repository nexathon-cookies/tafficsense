package com.love.trafficsense.ui.workspace;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.love.trafficsense.MainActivity;
import com.love.trafficsense.R;
import com.love.trafficsense.data.api.TrafficApiClient;
import com.love.trafficsense.data.model.DemoAccount;
import com.love.trafficsense.databinding.FragmentWorkspaceBinding;
import com.love.trafficsense.utils.PlacesData;

import java.util.List;
import java.util.Locale;

public class WorkspaceFragment extends Fragment {

    private FragmentWorkspaceBinding binding;
    private List<DemoAccount> demoAccounts;
    private DemoAccount currentAccount;
    private boolean isJourneyActive = false;

    private int elapsedSeconds = 0;
    private Handler timerHandler = new Handler(Looper.getMainLooper());
    private Runnable timerRunnable;

    private boolean corridor1Alerts = true;
    private boolean corridor2Alerts = true;
    private boolean corridor3Alerts = true;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentWorkspaceBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupHeader();
        initAccounts();
        setupTabSwitcher();
        setupSavedCorridors();
        setupAlertEngine();
        setupJourneyLogging();
        setupPersonaCards();
    }

    private void setupHeader() {
        binding.header.tvHeaderTitle.setText("Workspace & Alerts");
        binding.header.tvHeaderSubtitle.setText("COMMUTER HUB");
        binding.header.badgeHeaderLive.setVisibility(View.GONE);
    }

    private void initAccounts() {
        demoAccounts = TrafficApiClient.getInstance().getCachedDemoAccounts();
        String currentEmail = TrafficApiClient.getInstance().getCurrentAuthEmail();
        currentAccount = demoAccounts.get(0);
        View initialCard = binding.cardAccountCommuterA;

        for (int i = 0; i < demoAccounts.size(); i++) {
            DemoAccount acc = demoAccounts.get(i);
            if (acc.email.equalsIgnoreCase(currentEmail)) {
                currentAccount = acc;
                if (i == 1) initialCard = binding.cardAccountCommuterB;
                else if (i == 2) initialCard = binding.cardAccountAuthority;
                else if (i == 3) initialCard = binding.cardAccountEmployer;
                break;
            }
        }

        renderAccountDetails();
        highlightPersonaCard(initialCard);

        TrafficApiClient.getInstance().fetchDemoAccounts(new TrafficApiClient.ApiCallback<List<DemoAccount>>() {
            @Override
            public void onSuccess(List<DemoAccount> accounts) {
                if (!isAdded()) return;
                demoAccounts = accounts;
                String liveEmail = TrafficApiClient.getInstance().getCurrentAuthEmail();
                for (DemoAccount acc : accounts) {
                    if (acc.email != null && acc.email.equalsIgnoreCase(liveEmail)) {
                        currentAccount = acc;
                        renderAccountDetails();
                        break;
                    }
                }
            }

            @Override
            public void onError(String message) {}
        });
    }

    private void setupTabSwitcher() {
        binding.btnTabSavedAlerts.setOnClickListener(v -> switchTab(0));
        binding.btnTabJourney.setOnClickListener(v -> switchTab(1));
        binding.btnTabPersonas.setOnClickListener(v -> switchTab(2));
    }

    private void switchTab(int index) {
        int primaryColor = ContextCompat.getColor(requireContext(), R.color.primary);
        int onPrimaryColor = ContextCompat.getColor(requireContext(), R.color.on_primary);
        int textSecondary = ContextCompat.getColor(requireContext(), R.color.text_secondary);
        int transparent = ContextCompat.getColor(requireContext(), R.color.transparent);

        binding.btnTabSavedAlerts.setBackgroundColor(index == 0 ? primaryColor : transparent);
        binding.btnTabSavedAlerts.setTextColor(index == 0 ? onPrimaryColor : textSecondary);

        binding.btnTabJourney.setBackgroundColor(index == 1 ? primaryColor : transparent);
        binding.btnTabJourney.setTextColor(index == 1 ? onPrimaryColor : textSecondary);

        binding.btnTabPersonas.setBackgroundColor(index == 2 ? primaryColor : transparent);
        binding.btnTabPersonas.setTextColor(index == 2 ? onPrimaryColor : textSecondary);

        binding.layoutSectionSavedAlerts.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        binding.layoutSectionJourney.setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        binding.layoutSectionPersonas.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
    }

    private void setupSavedCorridors() {
        // Plan Corridor 1: Hampankatta (0) -> Pumpwell (2)
        binding.btnPlanCorridor1.setOnClickListener(v -> {
            MainActivity.navigateToPlannerWithEndpoints(requireContext(),
                    PlacesData.MANGALURU_PLACES.get(0),
                    PlacesData.MANGALURU_PLACES.get(2));
        });

        // Plan Corridor 2 (Detour): Lalbagh (3) -> Airport (7)
        binding.btnPlanCorridor2.setOnClickListener(v -> {
            MainActivity.navigateToPlannerWithEndpoints(requireContext(),
                    PlacesData.MANGALURU_PLACES.get(3),
                    PlacesData.MANGALURU_PLACES.get(7));
        });

        // Plan Corridor 3: Surathkal (8) -> Central Railway Station (5)
        binding.btnPlanCorridor3.setOnClickListener(v -> {
            MainActivity.navigateToPlannerWithEndpoints(requireContext(),
                    PlacesData.MANGALURU_PLACES.get(8),
                    PlacesData.MANGALURU_PLACES.get(5));
        });

        // Alert Toggles
        binding.btnAlertCorridor1.setOnClickListener(v -> {
            corridor1Alerts = !corridor1Alerts;
            updateAlertButton(binding.btnAlertCorridor1, corridor1Alerts, "Hampankatta ⇄ Pumpwell");
        });

        binding.btnAlertCorridor2.setOnClickListener(v -> {
            corridor2Alerts = !corridor2Alerts;
            updateAlertButton(binding.btnAlertCorridor2, corridor2Alerts, "Lalbagh ⇄ Int Airport");
        });

        binding.btnAlertCorridor3.setOnClickListener(v -> {
            corridor3Alerts = !corridor3Alerts;
            updateAlertButton(binding.btnAlertCorridor3, corridor3Alerts, "Surathkal ⇄ Central Station");
        });

        // Add Corridor dialog
        binding.btnAddCorridor.setOnClickListener(v -> {
            String[] places = new String[PlacesData.MANGALURU_PLACES.size()];
            for (int i = 0; i < PlacesData.MANGALURU_PLACES.size(); i++) {
                places[i] = PlacesData.MANGALURU_PLACES.get(i).name;
            }

            new MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Save Commute Corridor")
                    .setItems(places, (dialog, which) -> {
                        PlacesData.Place picked = PlacesData.MANGALURU_PLACES.get(which);
                        Toast.makeText(requireContext(), "Saved new corridor route to " + picked.name, Toast.LENGTH_SHORT).show();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });
    }

    private void updateAlertButton(MaterialButton button, boolean isEnabled, String routeName) {
        if (isEnabled) {
            button.setText("Alerts ON");
            button.setTextColor(ContextCompat.getColor(requireContext(), R.color.primary));
            button.setIconTint(ContextCompat.getColorStateList(requireContext(), R.color.primary));
            button.setStrokeColor(ContextCompat.getColorStateList(requireContext(), R.color.border));
            Toast.makeText(requireContext(), "Smart alerts enabled for " + routeName, Toast.LENGTH_SHORT).show();
        } else {
            button.setText("Alerts Muted");
            button.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_muted));
            button.setIconTint(ContextCompat.getColorStateList(requireContext(), R.color.text_muted));
            button.setStrokeColor(ContextCompat.getColorStateList(requireContext(), R.color.border));
            Toast.makeText(requireContext(), "Alerts muted for " + routeName, Toast.LENGTH_SHORT).show();
        }
    }

    private void setupAlertEngine() {
        binding.chipGroupAlertThreshold.setOnCheckedStateChangeListener((group, checkedIds) -> {
            if (checkedIds.contains(R.id.chip_alert_critical)) {
                Toast.makeText(requireContext(), "Filter: Critical Hazards Only (Full road closures & rollovers)", Toast.LENGTH_SHORT).show();
            } else if (checkedIds.contains(R.id.chip_alert_5min)) {
                Toast.makeText(requireContext(), "Filter: Delays > 5 mins (Standard TrafficSense boundary)", Toast.LENGTH_SHORT).show();
            } else if (checkedIds.contains(R.id.chip_alert_all)) {
                Toast.makeText(requireContext(), "Filter: All Incident Bulletins (Advisory & slowdowns)", Toast.LENGTH_SHORT).show();
            }
        });

        binding.switchRouteFilter.setOnCheckedChangeListener((btn, isChecked) -> {
            Toast.makeText(requireContext(), isChecked ? "Corridor filter ON: Alerts restricted to saved routes" : "Corridor filter OFF: All city alerts broadcasted", Toast.LENGTH_SHORT).show();
        });

        binding.switchEmployerSharing.setOnCheckedChangeListener((btn, isChecked) -> {
            Toast.makeText(requireContext(), isChecked ? "Employer sharing active: Consent token enabled" : "Employer sharing paused: Private mode", Toast.LENGTH_SHORT).show();
        });

        binding.switchHighCorroboration.setOnCheckedChangeListener((btn, isChecked) -> {
            Toast.makeText(requireContext(), isChecked ? "Audio chime active for L4–L6 events" : "Audio chime disabled", Toast.LENGTH_SHORT).show();
        });
    }

    private void setupJourneyLogging() {
        timerRunnable = new Runnable() {
            @Override
            public void run() {
                if (isJourneyActive) {
                    elapsedSeconds++;
                    int hours = elapsedSeconds / 3600;
                    int minutes = (elapsedSeconds % 3600) / 60;
                    int seconds = elapsedSeconds % 60;
                    if (binding != null) {
                        binding.tvJourneyTimer.setText(String.format(Locale.US, "Transit Time: %02d:%02d:%02d", hours, minutes, seconds));
                    }
                    timerHandler.postDelayed(this, 1000);
                }
            }
        };

        binding.btnToggleJourney.setOnClickListener(v -> {
            isJourneyActive = !isJourneyActive;
            if (isJourneyActive) {
                elapsedSeconds = 0;
                timerHandler.post(timerRunnable);
                binding.tvJourneyStatus.setText("Journey Status: Active");
                binding.tvJourneyPill.setText("RECORDING");
                binding.tvJourneyPill.setBackgroundResource(R.drawable.bg_pill_green);
                binding.tvJourneyPill.setTextColor(ContextCompat.getColor(requireContext(), R.color.success));
                binding.tvJourneyDesc.setText("Logging GPS transit telemetry across State Bank ⇄ Pumpwell corridor.");
                binding.btnToggleJourney.setText("End Journey & Check Delay Receipt");
                binding.btnToggleJourney.setBackgroundColor(ContextCompat.getColor(requireContext(), R.color.error));
                Toast.makeText(requireContext(), "Commute journey recording started", Toast.LENGTH_SHORT).show();
            } else {
                timerHandler.removeCallbacks(timerRunnable);
                binding.tvJourneyStatus.setText("Journey Status: Standby");
                binding.tvJourneyPill.setText("STANDBY");
                binding.tvJourneyPill.setBackgroundResource(R.drawable.bg_pill_violet);
                binding.tvJourneyPill.setTextColor(ContextCompat.getColor(requireContext(), R.color.secondary));
                binding.tvJourneyDesc.setText("Tap Start Journey to log corridor transit times and verify delay receipts.");
                binding.btnToggleJourney.setText("Start Commute Journey");
                binding.btnToggleJourney.setBackgroundColor(ContextCompat.getColor(requireContext(), R.color.primary));

                binding.cardDelayCertificate.setVisibility(View.VISIBLE);
                Toast.makeText(requireContext(), "Journey completed: Delay certificate generated", Toast.LENGTH_LONG).show();
            }
        });

        binding.btnShareDelayCert.setOnClickListener(v -> {
            new MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Export to Employer Desk")
                    .setMessage("Civic Delay Certificate #TS-MNG-9482-L4 has been transmitted to your employer's HR Verification Portal.\n\n• Corridor: Hampankatta ⇄ Pumpwell\n• Verified Delay: +14 mins (L4 Multi-Source Evidence)\n• Verification Hash: a7f8c02b9e1d")
                    .setPositiveButton("Done", null)
                    .show();
        });

        binding.btnPreviewCertQr.setOnClickListener(v -> {
            new MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Tamper-Evident QR Proof")
                    .setMessage("Scan this code on the Employer HR Portal to verify cryptographic timestamp validity and municipal corroboration record.")
                    .setPositiveButton("Close", null)
                    .show();
        });
    }

    private void renderAccountDetails() {
        if (binding == null || currentAccount == null) return;
        binding.tvUserName.setText(currentAccount.getName());
        binding.tvUserRole.setText(String.format("%s · Mangaluru Hub", currentAccount.getRole()));
        binding.tvWorkspaceSubtitle.setText("Signed in as " + currentAccount.email);
        binding.tvCertCommuter.setText(currentAccount.getName());

        boolean isAuthority = "authority".equalsIgnoreCase(currentAccount.getRole());
        binding.tvWorkspaceEyebrow.setText(isAuthority ? "CIVIC CONTROL ROOM ACCESS" : "AUTHENTICATED COMMUTER");
        binding.header.tvHeaderSubtitle.setText(isAuthority ? "AUTHORITY OPS" : "COMMUTER HUB");

        if (isAuthority) {
            binding.tvRoleExplanation.setText("You have municipal authorization to verify, confirm (L6), resolve, or reject reported road hazards across the Mangaluru coastal corridor.");
        } else {
            binding.tvRoleExplanation.setText("Your reports contribute directly to community verification levels (L1–L6). Selective journey sharing and employer delay certificates are active.");
        }
    }

    private void switchAccount(DemoAccount account, View cardView) {
        currentAccount = account;
        renderAccountDetails();
        highlightPersonaCard(cardView);
        Toast.makeText(requireContext(), "Switching to: " + account.getName() + "...", Toast.LENGTH_SHORT).show();

        TrafficApiClient.getInstance().syncDemoAccountsAndLogin(account.email, new TrafficApiClient.ApiCallback<String>() {
            @Override
            public void onSuccess(String token) {
                if (isAdded()) {
                    Toast.makeText(requireContext(), "Signed in as: " + account.getName(), Toast.LENGTH_SHORT).show();
                    renderAccountDetails();
                }
            }

            @Override
            public void onError(String message) {
                if (isAdded()) {
                    Toast.makeText(requireContext(), "Persona auth: " + message, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private void setupPersonaCards() {
        binding.cardAccountCommuterA.setOnClickListener(v -> switchAccount(demoAccounts.get(0), binding.cardAccountCommuterA));
        binding.cardAccountCommuterB.setOnClickListener(v -> switchAccount(demoAccounts.get(1), binding.cardAccountCommuterB));
        binding.cardAccountAuthority.setOnClickListener(v -> switchAccount(demoAccounts.get(2), binding.cardAccountAuthority));
        binding.cardAccountEmployer.setOnClickListener(v -> switchAccount(demoAccounts.get(3), binding.cardAccountEmployer));
    }

    private void highlightPersonaCard(View selectedCard) {
        int primaryColor = ContextCompat.getColor(requireContext(), R.color.primary);
        int borderColor = ContextCompat.getColor(requireContext(), R.color.border);

        binding.cardAccountCommuterA.setStrokeColor(borderColor);
        binding.cardAccountCommuterA.setStrokeWidth(1);

        binding.cardAccountCommuterB.setStrokeColor(borderColor);
        binding.cardAccountCommuterB.setStrokeWidth(1);

        binding.cardAccountAuthority.setStrokeColor(borderColor);
        binding.cardAccountAuthority.setStrokeWidth(1);

        binding.cardAccountEmployer.setStrokeColor(borderColor);
        binding.cardAccountEmployer.setStrokeWidth(1);

        if (selectedCard instanceof com.google.android.material.card.MaterialCardView) {
            ((com.google.android.material.card.MaterialCardView) selectedCard).setStrokeColor(primaryColor);
            ((com.google.android.material.card.MaterialCardView) selectedCard).setStrokeWidth(4);
        }
    }

    @Override
    public void onDestroyView() {
        timerHandler.removeCallbacks(timerRunnable);
        super.onDestroyView();
        binding = null;
    }
}
