package com.love.trafficsense.ui.workspace;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.love.trafficsense.R;
import com.love.trafficsense.data.model.DemoAccount;
import com.love.trafficsense.databinding.FragmentWorkspaceBinding;

import java.util.List;

public class WorkspaceFragment extends Fragment {

    private FragmentWorkspaceBinding binding;
    private List<DemoAccount> demoAccounts;
    private DemoAccount currentAccount;
    private boolean isJourneyActive = false;

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
        demoAccounts = DemoAccount.getPredefinedAccounts();
        String currentEmail = com.love.trafficsense.data.api.TrafficApiClient.getInstance().getCurrentAuthEmail();
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

        setupPersonaCards();
        setupJourneyLogging();
        renderAccountDetails();
        highlightCard(initialCard);
    }

    private void setupHeader() {
        binding.header.tvHeaderTitle.setText("Workspace");
        binding.header.tvHeaderSubtitle.setText("COMMUTER PROFILE");
        binding.header.badgeHeaderLive.setVisibility(View.GONE);
    }

    private void renderAccountDetails() {
        binding.tvUserName.setText(currentAccount.name);
        binding.tvUserRole.setText(String.format("%s · Mangaluru Hub", currentAccount.role));
        binding.tvWorkspaceSubtitle.setText("Signed in as " + currentAccount.email);

        boolean isAuthority = "authority".equalsIgnoreCase(currentAccount.role);
        binding.tvWorkspaceEyebrow.setText(isAuthority ? "CIVIC CONTROL ROOM ACCESS" : "AUTHENTICATED COMMUTER");
        binding.header.tvHeaderSubtitle.setText(isAuthority ? "AUTHORITY OPS" : "COMMUTER PROFILE");

        if (isAuthority) {
            binding.tvRoleExplanation.setText("You have municipal authorization to verify, confirm (L6), resolve, or reject reported road hazards across the Mangaluru coastal corridor.");
        } else {
            binding.tvRoleExplanation.setText("Your reports contribute directly to community verification levels (L1–L6). Selective journey sharing and employer delay certificates are active.");
        }
    }

    private void switchAccount(DemoAccount account, View cardView) {
        currentAccount = account;
        renderAccountDetails();
        highlightCard(cardView);
        Toast.makeText(requireContext(), "Switching to: " + account.name + "...", Toast.LENGTH_SHORT).show();

        com.love.trafficsense.data.api.TrafficApiClient.getInstance().login(account.email, account.password, new com.love.trafficsense.data.api.TrafficApiClient.ApiCallback<String>() {
            @Override
            public void onSuccess(String token) {
                if (isAdded()) {
                    Toast.makeText(requireContext(), "Signed in as: " + account.name, Toast.LENGTH_SHORT).show();
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

    private void highlightCard(View selectedCard) {
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

    private void setupJourneyLogging() {
        binding.btnToggleJourney.setOnClickListener(v -> {
            isJourneyActive = !isJourneyActive;
            if (isJourneyActive) {
                binding.tvJourneyStatus.setText("Journey Status: Active");
                binding.tvJourneyPill.setText("RECORDING");
                binding.tvJourneyPill.setBackgroundResource(R.drawable.bg_pill_green);
                binding.tvJourneyPill.setTextColor(ContextCompat.getColor(requireContext(), R.color.success));
                binding.tvJourneyDesc.setText("Logging GPS transit telemetry across State Bank ⇄ Pumpwell corridor.");
                binding.btnToggleJourney.setText("End Journey & Check Delay Receipt");
                binding.btnToggleJourney.setBackgroundTintList(ContextCompat.getColorStateList(requireContext(), R.color.secondary));
                Toast.makeText(requireContext(), "Commute journey recording started", Toast.LENGTH_SHORT).show();
            } else {
                binding.tvJourneyStatus.setText("Journey Status: Standby");
                binding.tvJourneyPill.setText("STANDBY");
                binding.tvJourneyPill.setBackgroundResource(R.drawable.bg_pill_violet);
                binding.tvJourneyPill.setTextColor(ContextCompat.getColor(requireContext(), R.color.secondary));
                binding.tvJourneyDesc.setText("Tap Start Journey to log corridor transit times and verify delay receipts.");
                binding.btnToggleJourney.setText("Start Commute Journey");
                binding.btnToggleJourney.setBackgroundTintList(ContextCompat.getColorStateList(requireContext(), R.color.primary));
                Toast.makeText(requireContext(), "Journey complete: 14m transit time recorded", Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
