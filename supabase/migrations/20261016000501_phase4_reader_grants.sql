grant incident_lifecycle_reader, traversal_reader, traffic_evidence_reader to postgres;
grant execute on function public.read_report_assessments(), public.project_incident_lifecycle(timestamptz),
  public.project_completed_traversal(uuid,text,text,timestamptz) to phase4_snapshot_reader;
revoke incident_lifecycle_reader, traversal_reader, traffic_evidence_reader from postgres;
