-- submit_traffic_report calls report_source_status(), which remains deliberately
-- non-callable by API roles. Execute the public entry point as its restricted
-- traffic_report_executor owner, as it did before the category expansion.
set local role traffic_report_executor;

alter function public.submit_traffic_report(jsonb) security definer;
reset role;
