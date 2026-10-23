-- The database maintenance role needs helper access for SQL-function inlining during lint.
grant traffic_report_executor to postgres;
grant execute on function public.report_request_claims() to postgres;
grant execute on function public.report_request_user_id() to postgres;
revoke traffic_report_executor from postgres;
