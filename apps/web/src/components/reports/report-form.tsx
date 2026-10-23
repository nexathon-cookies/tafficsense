"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareReport, submitReport, checkReport } from "@/app/reports/actions";
import { parseReportInput, reportCategories, reportCategoryIcons, reportInputFromForm, toReportLocalTime,
  type ReportInput, type ReportFailure, type PrepareResult, type SubmitResult } from "@/lib/reports/rules";
import type { DemoSegment } from "@/lib/traffic/simulator";
import { formatTrafficTime } from "@/lib/traffic/presentation";
import styles from "./reports.module.css";

const storageKey = "trafficsense-pending-demo-report";
const messages: Record<ReportFailure, string> = {
  invalid: "Check the segment, category and observation time. New observations must be within the last twenty minutes and not in the future.",
  disabled: "Demo reporting is disabled. An operator must enable it; browsing remains available.",
  expired: "The prepared identity has expired or is missing. We will not retry under a new identity. Check the public segment before preparing another report.",
  identity_changed: "Your reporting identity changed. This draft was not submitted under the new identity. Return to the original session to check its outcome.",
  conflict: "This request reference was already used with different content. Check its saved outcome; the existing report was not overwritten.",
  rate_limited: "The demo report limit has been reached. Wait before retrying; no additional report was accepted by this attempt.",
  unavailable_segment: "This segment is no longer in the active demo. Refresh the traffic page before preparing a new report.",
  denied: "This reporting identity is unavailable. Sign in again if you intended to use an account; we will not fall back to a guest identity.",
  unavailable: "The reporting service could not be reached. Keep this draft and try the status check again.",
  unknown: "Submission outcome is not confirmed. It may already have been saved. Check its status or retry the same unchanged request below.",
  not_found: "No saved report was found for this request and identity. Retry the unchanged request to submit it safely.",
  unconfigured: "Reporting is not configured in this environment. You can continue browsing the guest introduction.",
};

type FormProps = { segments: DemoSegment[]; selectedId: string };
const subscribeToHydration = () => () => {};

export function ReportForm(props: FormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  if (!hydrated) return <div className="panel"><p role="status">Checking for an interrupted draft…</p></div>;
  return <HydratedReportForm {...props} />;
}

function loadDraft(): { draft: ReportInput | null; message: string | null } {
  try {
    const stored = sessionStorage.getItem(storageKey);
    return { draft: stored ? parseReportInput(JSON.parse(stored)) : null, message: null };
  } catch {
    return { draft: null, message: "The saved draft could not be read. Check the public segment for an earlier report before starting again." };
  }
}

function HydratedReportForm({ segments, selectedId }: FormProps) {
  const router = useRouter();
  const [initial] = useState(loadDraft);
  const [prepared, setPrepared] = useState<Extract<PrepareResult, { status: "ready" }> | null>(null);
  const [draft, setDraft] = useState<ReportInput | null>(initial.draft);
  const [result, setResult] = useState<SubmitResult | null>(initial.draft ? { status: "unknown" } : null);
  const [message, setMessage] = useState<string | null>(initial.message);
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);

  function perform(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try { await work(); }
      finally { busy.current = false; }
    });
  }
  function begin(mode: "account" | "guest") {
    perform(async () => {
      setMessage(null);
      try {
        const response = await prepareReport(mode);
        if (response.status !== "ready") { setMessage(messages[response.status]); return; }
        setPrepared(response);
        requestId.current = crypto.randomUUID();
      } catch { setMessage("Preparing the identity could not be confirmed. Try again before submitting a report."); }
    });
  }
  async function send(input: ReportInput) {
    try {
      const response = await submitReport(input);
      setResult(response);
      if (response.status === "accepted") router.refresh();
    } catch { setResult({ status: "unknown" }); }
  }
  function submit(form: FormData) {
    if (!prepared || !requestId.current || draft) return;
    let input: ReportInput;
    try {
      input = reportInputFromForm(form, prepared.source.id, requestId.current);
      sessionStorage.setItem(storageKey, JSON.stringify(input));
    } catch {
      setMessage("Check all fields. This browser must also allow session storage so an interrupted submission can be retried safely.");
      return;
    }
    setMessage(null); setDraft(input); setResult({ status: "unknown" });
    perform(() => send(input));
  }
  function check() {
    if (!draft) return;
    perform(async () => {
      try {
        const response = await checkReport({ source_id: draft.source_id, request_id: draft.request_id });
        setResult(response);
        if (response.status === "accepted") router.refresh();
      } catch { setResult({ status: "unavailable" }); }
    });
  }
  function startNew() {
    if (result?.status !== "accepted") return;
    try { sessionStorage.removeItem(storageKey); }
    catch { setMessage("The saved draft could not be cleared. Keep this page open and use the saved report link."); return; }
    setDraft(null); setPrepared(null); setResult(null); setMessage(null); requestId.current = null;
  }

  function discardDraft() {
    if (!window.confirm("Discard this local retry reference? This does not delete or cancel a report that may already have been saved. Review the public segment before submitting another report.")) return;
    try { sessionStorage.removeItem(storageKey); }
    catch { setMessage("The saved draft could not be cleared. Keep this page open and try again."); return; }
    setDraft(null); setPrepared(null); setResult(null); setMessage(null); requestId.current = null;
  }

  function correctRejectedDraft() {
    if (!draft || !result || !["invalid", "rate_limited", "unavailable_segment"].includes(result.status)) return;
    try { sessionStorage.removeItem(storageKey); }
    catch { setMessage("The saved draft could not be cleared. Keep this page open and try again."); return; }
    requestId.current = draft.request_id;
    setDraft(null); setResult(null); setMessage(null);
  }

  const failure = result && result.status !== "accepted" ? result.status : null;
  const saved = result?.status === "accepted" ? result.report : null;
  return <div className={`panel ${styles.formPanel}`} data-report-form>
    <h2>{saved ? "Demo report saved" : draft ? "Keep this request for a safe retry" : "Prepare a demo report"}</h2>
    <p>
      Submit synthetic reports to evaluate L1–L4 evidence ladders. Locations are manually selected; no GPS or personal data is collected.{" "}
      <Link href="/about#privacy-title" className="text-primary underline">
        Learn about verification & privacy →
      </Link>
    </p>
    {!prepared && !draft ? <div className="actions">
      <button type="button" className="button" disabled={pending} onClick={() => begin("guest")}>Continue as guest</button>
      <button type="button" className="button secondary" disabled={pending} onClick={() => begin("account")}>Use current account</button>
      <Link href="/login">Sign in — optional</Link>
    </div> : null}
    {prepared && !draft && <form action={submit} className={styles.fields}>
      <p role="status">Prepared as {prepared.source.kind === "guest" ? "a temporary guest" : "your current account"}.
        {prepared.source.expires_at && <> Expires: {formatTrafficTime(prepared.source.expires_at)}.</>}
        {" "}If you change accounts, prepare again before submitting.</p>
      <label>Segment and direction
        <select name="segment_id" defaultValue={selectedId} required disabled={pending}>
          {segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name} · {segment.direction}</option>)}
        </select>
      </label>
      <label>Reported category — unconfirmed
        <select name="category" defaultValue="unknown" required disabled={pending}>
          {Object.entries(reportCategories).map(([id, label]) => (
            <option key={id} value={id}>
              {reportCategoryIcons[id as keyof typeof reportCategoryIcons] ?? ""} {label}
            </option>
          ))}
        </select>
      </label>
      <label>Observation time — Asia/Kolkata
        <input name="observed_local" type="datetime-local" step="60" defaultValue={toReportLocalTime(prepared.read_at)} required disabled={pending} aria-describedby="report-time-help" />
      </label>
      <p id="report-time-help">The initial time comes from the database. Enter a time within the last twenty minutes, not in the future. This is a manually entered observation, separate from when the server receives it.</p>
      <button className="button" disabled={pending} type="submit">Submit simulated report</button>
    </form>}
    {draft && <div className={styles.draft} data-report-draft>
      <p><strong>{reportCategoryIcons[draft.category]} {reportCategories[draft.category]}</strong> · {draft.segment_id} · {draft.direction}</p>
      <p>Observation: {formatTrafficTime(draft.observed_at)}. The submitted fields and request reference stay unchanged while its outcome is checked.</p>
    </div>}
    {saved && <div role="status" data-report-saved={saved.id}>
      <p><strong>SIMULATED · L1 — Reported, unconfirmed.</strong> The database confirmed persistence{result?.status === "accepted" && result.replayed ? " of the original request; no duplicate was created" : ""}.</p>
      <p>Reported category: {reportCategoryIcons[saved.category]} {reportCategories[saved.category]}. Cause remains unconfirmed. Received: {formatTrafficTime(saved.received_at)}.</p>
      <p data-report-episode={saved.episode_id}>Report episode: <code>{saved.episode_id}</code>. This is a durable grouping reference, not a confirmed incident.</p>
      <div className="actions">
        <Link className="button" href={`/traffic?segment=${encodeURIComponent(saved.segment_id)}#segment-reports`}>View report on traffic page</Link>
        <button type="button" className="button secondary" disabled={pending} onClick={startNew}>Prepare another report</button>
      </div>
    </div>}
    {failure && <p role="alert" data-report-failure={failure}>{messages[failure]}</p>}
    {draft && !saved && <div className="actions">
      <button type="button" className="button secondary" disabled={pending} onClick={check}>Check saved status</button>
      <button type="button" className="button" disabled={pending} onClick={() => perform(() => send(draft))}>Retry unchanged report</button>
      {failure && ["invalid", "rate_limited", "unavailable_segment"].includes(failure) &&
        <button type="button" className="button secondary" disabled={pending} onClick={correctRejectedDraft}>Correct rejected draft</button>}
      <Link href={`/traffic?segment=${encodeURIComponent(draft.segment_id)}`}>Review the public segment</Link>
      <button type="button" className="button secondary" disabled={pending} onClick={discardDraft}>Discard local draft — report may remain saved</button>
    </div>}
    {message && <p role="alert">{message}</p>}
    {pending && <p role="status">Waiting for the server… This is not a confirmation that the report was saved.</p>}
    <p className={styles.limit}>Demo limits: 5 new reports per source in 15 minutes, 300 per hour across demo. See <Link href="/about#episodes-title" className="underline">rate limiting rules</Link>.</p>
  </div>;
}
