package com.love.trafficsense.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.ArrayList;
import java.util.List;

public class DemoAccount {
    @SerializedName("name")
    public String name;

    @SerializedName("label")
    public String label;

    @SerializedName("role")
    public String role;

    @SerializedName("email")
    public String email;

    @SerializedName("password")
    public String password;

    @SerializedName("badge")
    public String badge;

    @SerializedName("description")
    public String description;

    public DemoAccount() {}

    public DemoAccount(String name, String role, String email, String password, String badge, String description) {
        this.name = name;
        this.label = name;
        this.role = role;
        this.email = email;
        this.password = password;
        this.badge = badge;
        this.description = description;
    }

    public static List<DemoAccount> getPredefinedAccounts() {
        List<DemoAccount> list = new ArrayList<>();
        list.add(new DemoAccount("Commuter (Primary)", "commuter", "commuter@demo.trafficsense.test", "z0F-KxD2BGwcyxyIyAGTXjxYCyLVzI2K", "COMMUTER", "Standard road user · Submit & verify reports"));
        list.add(new DemoAccount("Commuter B", "commuter", "commuter-b@demo.trafficsense.test", "bdK8uR3z220uhgd8_C3c-9O05Gzhh-X2", "CORROBORATOR", "Second driver · Independent corridor verification"));
        list.add(new DemoAccount("Traffic Authority", "authority", "authority@demo.trafficsense.test", "VCdoERM1tewQgPG9Kob9L-voyE0Z2aAK", "AUTHORITY", "Control room · Verify, confirm & clear hazards"));
        list.add(new DemoAccount("Employer A", "employer", "employer-a@demo.trafficsense.test", "H4PyuaLaJBtYBzTjo6FmDExYaGLCxx2d", "EMPLOYER", "Workplace coordinator · Commute delay receipts"));
        return list;
    }

    public String getName() {
        if (name != null && !name.isEmpty()) return name;
        if (label != null && !label.isEmpty()) {
            if ("commuter".equalsIgnoreCase(label)) return "Commuter (Primary)";
            if ("commuter-b".equalsIgnoreCase(label)) return "Commuter B";
            if ("commuter-c".equalsIgnoreCase(label)) return "Commuter C";
            if ("authority".equalsIgnoreCase(label)) return "Traffic Authority";
            if ("employer-a".equalsIgnoreCase(label)) return "Employer A";
            if ("employer-b".equalsIgnoreCase(label)) return "Employer B";
            return label;
        }
        return email != null ? email : "Demo User";
    }

    public String getRole() { return role != null ? role : "commuter"; }
    public String getEmail() { return email != null ? email : ""; }
    public String getPassword() { return password != null ? password : ""; }

    public String getBadge() {
        if (badge != null && !badge.isEmpty()) return badge;
        if ("authority".equalsIgnoreCase(role)) return "AUTHORITY";
        if ("employer".equalsIgnoreCase(role)) return "EMPLOYER";
        if (label != null && (label.contains("b") || label.contains("c"))) return "CORROBORATOR";
        return "COMMUTER";
    }

    public String getDescription() {
        if (description != null && !description.isEmpty()) return description;
        if ("authority".equalsIgnoreCase(role)) return "Control room · Verify, confirm & clear hazards";
        if ("employer".equalsIgnoreCase(role)) return "Workplace coordinator · Commute delay receipts";
        if (label != null && (label.contains("b") || label.contains("c"))) return "Second driver · Independent corridor verification";
        return "Standard road user · Submit & verify reports";
    }
}
