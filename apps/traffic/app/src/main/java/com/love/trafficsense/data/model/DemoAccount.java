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

    public DemoAccount(String name, String role, String email, String badge, String description) {
        this.name = name;
        this.label = name;
        this.role = role;
        this.email = email;
        this.badge = badge;
        this.description = description;
    }

    public static List<DemoAccount> getPredefinedAccounts() {
        List<DemoAccount> list = new ArrayList<>();
        list.add(new DemoAccount("Demo Commuter (A)", "commuter", "commuter-a@trafficsense.local", "ACTIVE", "Commuter with daily Mangaluru corridor pass."));
        list.add(new DemoAccount("Demo Commuter (B)", "commuter", "commuter-b@trafficsense.local", "VERIFIED", "Commuter traveling via Kankanady Bypass."));
        list.add(new DemoAccount("Traffic Authority Dispatcher", "authority", "authority@trafficsense.local", "AUTHORITY", "Municipal operations & hazard clearance dispatcher."));
        list.add(new DemoAccount("Employer Verification Desk", "employer", "hr@company.local", "EMPLOYER", "HR & employer verification desk."));
        return list;
    }

    public String getName() { return name != null ? name : ""; }
    public String getRole() { return role != null ? role : "commuter"; }
    public String getEmail() { return email != null ? email : ""; }
    public String getBadge() { return badge != null ? badge : "COMMUTER"; }
    public String getDescription() { return description != null ? description : ""; }
}
