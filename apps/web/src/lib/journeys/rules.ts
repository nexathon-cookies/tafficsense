export type CommuterJourney = {
  id: string;
  corridor_id: string;
  corridor_name: string;
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
  provenance: "simulated";
  shares?: JourneyShare[];
};

export type JourneyShare = {
  id: string;
  journey_id: string;
  org_id: string;
  org_name?: string;
  status: "active" | "stopped";
  shared_at: string;
  stopped_at: string | null;
  provenance: "simulated";
};

export type EmployerSharedJourney = {
  journey_id: string;
  corridor_name: string;
  status: "active" | "ended";
  shared_at: string;
  provenance: "simulated";
};
