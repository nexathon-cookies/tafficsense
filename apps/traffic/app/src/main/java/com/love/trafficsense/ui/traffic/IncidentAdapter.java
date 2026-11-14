package com.love.trafficsense.ui.traffic;

import android.view.LayoutInflater;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.love.trafficsense.R;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.databinding.ItemIncidentBinding;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class IncidentAdapter extends RecyclerView.Adapter<IncidentAdapter.IncidentViewHolder> {

    private final List<LiveIncident> incidents = new ArrayList<>();
    private final Map<String, Integer> confirmedCounts = new HashMap<>();
    private final Map<String, Boolean> clearedStates = new HashMap<>();
    private OnIncidentClickListener listener;

    public interface OnIncidentClickListener {
        void onIncidentClick(LiveIncident incident);
    }

    public void setOnIncidentClickListener(OnIncidentClickListener listener) {
        this.listener = listener;
    }

    public void setIncidents(List<LiveIncident> newIncidents) {
        this.incidents.clear();
        if (newIncidents != null) {
            this.incidents.addAll(newIncidents);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public IncidentViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemIncidentBinding binding = ItemIncidentBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false);
        return new IncidentViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull IncidentViewHolder holder, int position) {
        holder.bind(incidents.get(position));
    }

    @Override
    public int getItemCount() {
        return incidents.size();
    }

    class IncidentViewHolder extends RecyclerView.ViewHolder {
        private final ItemIncidentBinding binding;

        public IncidentViewHolder(@NonNull ItemIncidentBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        public void bind(LiveIncident incident) {
            if (incident == null) return;
            String category = incident.category != null ? incident.category : "HAZARD";
            binding.tvCategoryCaps.setText(category.toUpperCase());
            binding.tvCategoryTitle.setText(formatCategory(category));
            binding.tvFreshness.setText(incident.freshness != null ? incident.freshness : "2m ago");
            binding.tvNotes.setText(incident.notes != null && !incident.notes.isEmpty() ? incident.notes : "Reported obstacle affecting corridor passage.");

            // Evidence Badge
            String levelStr = incident.evidenceLevel != null ? incident.evidenceLevel : "L1";
            binding.tvEvidenceBadge.setText((levelStr.startsWith("L") ? "" : "L") + levelStr + " " + (incident.evidenceLabel != null ? incident.evidenceLabel : "Citizen Reported"));

            // Icon mapping
            String catLower = category.toLowerCase();
            if (catLower.contains("water") || catLower.contains("flood")) {
                binding.ivHazardIcon.setImageResource(R.drawable.ic_flood);
                binding.ivHazardIcon.setColorFilter(ContextCompat.getColor(itemView.getContext(), R.color.primary));
            } else if (catLower.contains("construction") || catLower.contains("repair")) {
                binding.ivHazardIcon.setImageResource(R.drawable.ic_construction);
                binding.ivHazardIcon.setColorFilter(ContextCompat.getColor(itemView.getContext(), R.color.warning));
            } else if (catLower.contains("traffic") || catLower.contains("congestion")) {
                binding.ivHazardIcon.setImageResource(R.drawable.ic_traffic);
                binding.ivHazardIcon.setColorFilter(ContextCompat.getColor(itemView.getContext(), R.color.secondary));
            } else if (catLower.contains("close") || catLower.contains("block")) {
                binding.ivHazardIcon.setImageResource(R.drawable.ic_road_closed);
                binding.ivHazardIcon.setColorFilter(ContextCompat.getColor(itemView.getContext(), R.color.error));
            } else {
                binding.ivHazardIcon.setImageResource(R.drawable.ic_car_crash);
                binding.ivHazardIcon.setColorFilter(ContextCompat.getColor(itemView.getContext(), R.color.error));
            }

            // Confirm / Deny State handling
            int baseCount = incident.reportCount > 0 ? incident.reportCount : 1;
            int currentCount = confirmedCounts.containsKey(incident.id) ? confirmedCounts.get(incident.id) : baseCount;
            boolean isConfirmed = confirmedCounts.containsKey(incident.id);
            boolean isCleared = Boolean.TRUE.equals(clearedStates.get(incident.id));

            binding.btnConfirmIncident.setText(isConfirmed ? "Confirmed (" + currentCount + ")" : "Confirm (" + currentCount + ")");
            binding.btnConfirmIncident.setSelected(isConfirmed);

            binding.btnConfirmIncident.setOnClickListener(v -> {
                if (isConfirmed) {
                    confirmedCounts.remove(incident.id);
                } else {
                    confirmedCounts.put(incident.id, baseCount + 1);
                    clearedStates.remove(incident.id);
                }
                notifyItemChanged(getAdapterPosition());
            });

            binding.btnClearIncident.setOnClickListener(v -> {
                if (isCleared) {
                    clearedStates.remove(incident.id);
                } else {
                    clearedStates.put(incident.id, true);
                    confirmedCounts.remove(incident.id);
                }
                notifyItemChanged(getAdapterPosition());
            });

            binding.btnClearIncident.setColorFilter(isCleared ?
                    ContextCompat.getColor(itemView.getContext(), R.color.error) :
                    ContextCompat.getColor(itemView.getContext(), R.color.text_secondary));

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onIncidentClick(incident);
                }
            });
        }

        private String formatCategory(String category) {
            if (category == null) return "Traffic Hazard";
            switch (category.toLowerCase()) {
                case "flooding":
                case "waterlogging":
                    return "Waterlogging on Roadway";
                case "heavy_congestion":
                    return "Heavy Traffic Congestion";
                case "construction":
                    return "Road Maintenance Work";
                case "road_blocked":
                    return "Road Passage Blocked";
                default:
                    return "Accident / Obstruction";
            }
        }
    }
}
