import React from "react";
import type { ReportCategory } from "@/lib/reports/rules";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

export function IncidentIcon({
  category,
  size = 18,
  className = "",
  ...props
}: {
  category: ReportCategory | string;
  size?: number | string;
  className?: string;
} & React.SVGProps<SVGSVGElement>) {
  switch (category) {
    case "accident":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Car crash / collision */}
          <path d="m14 14 3-3 3 3" />
          <path d="M4 14h6" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M6 14V9a2 2 0 0 1 2-2h4l2 4" />
          <path d="m10 2 2 4-4 2 3 4" />
        </svg>
      );
    case "road_repair":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Construction barrier / cone */}
          <path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9" />
          <path d="M15 13 9 7l4-4 6 6-4 4Z" />
          <path d="m18 10 3 3" />
        </svg>
      );
    case "festival":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Circus / Event Tent */}
          <path d="M12 2v4" />
          <path d="M4 21V10l8-6 8 6v11" />
          <path d="M12 4v17" />
          <path d="M4 21h16" />
        </svg>
      );
    case "strike":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Protest sign / Megaphone */}
          <path d="M12 18v4" />
          <rect width="18" height="12" x="3" y="4" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h6" />
        </svg>
      );
    case "vip_movement":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Siren / VIP Motorcade badge */}
          <path d="M12 4a5 5 0 0 0-5 5v5h10V9a5 5 0 0 0-5-5Z" />
          <path d="M4 18h16" />
          <path d="M12 2v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m19.1 4.9-1.4 1.4" />
        </svg>
      );
    case "landslide":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Mountain / Falling Rocks */}
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
          <circle cx="17" cy="8" r="1.5" />
          <circle cx="19" cy="13" r="1.5" />
        </svg>
      );
    case "heavy_rain":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Cloud with Rain */}
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="m8 19-2 3" />
          <path d="m12 19-2 3" />
          <path d="m16 19-2 3" />
        </svg>
      );
    case "flood":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Water Waves */}
          <path d="M2 12c1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0 1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0" />
          <path d="M2 17c1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0 1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0" />
        </svg>
      );
    case "signal_failure":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Traffic light */}
          <rect width="8" height="18" x="8" y="3" rx="2" />
          <circle cx="12" cy="7" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="17" r="1.5" />
          <line x1="2" x2="6" y1="12" y2="12" />
          <line x1="18" x2="22" y1="12" y2="12" />
        </svg>
      );
    case "breakdown":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Vehicle breakdown */}
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
          <path d="m14 3 2 3-3 2" />
        </svg>
      );
    case "road_closed":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Road Closed Barrier / No Entry */}
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      );
    case "bridge_maintenance":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Bridge maintenance */}
          <path d="M3 19h18" />
          <path d="M3 14c4-3 7-3 9 0 2 3 5 3 9 0" />
          <path d="M7 14v5" />
          <path d="M17 14v5" />
          <path d="M12 6v4" />
          <path d="m10 8 4 0" />
        </svg>
      );
    case "police_restriction":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Shield alert */}
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "fallen_tree":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Fallen tree / obstacle */}
          <path d="m8 10-5 7h10l-5-7z" />
          <path d="m16 14-3 5h6l-3-5z" />
          <path d="M4 21h16" />
        </svg>
      );
    case "heavy_traffic":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Heavy traffic congestion */}
          <rect x="2" y="8" width="8" height="6" rx="2" />
          <circle cx="4" cy="16" r="1.5" />
          <circle cx="8" cy="16" r="1.5" />
          <rect x="14" y="6" width="8" height="6" rx="2" />
          <circle cx="16" cy="14" r="1.5" />
          <circle cx="20" cy="14" r="1.5" />
        </svg>
      );
    case "other":
    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          aria-hidden="true"
          {...props}
        >
          {/* Warning / Alert Triangle */}
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
  }
}

/**
 * Returns raw inline SVG string for MapLibre HTML marker elements.
 */
export function getIncidentSvgString(category: string, size = 16): string {
  switch (category) {
    case "accident":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 14 3-3 3 3"/><path d="M4 14h6"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 14V9a2 2 0 0 1 2-2h4l2 4"/></svg>`;
    case "road_repair":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6-4 4Z"/></svg>`;
    case "road_closed":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
    case "flood":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0 1.5 1.5 3.5 1.5 5 0"/><path d="M2 17c1.5 1.5 3.5 1.5 5 0 1.5-1.5 3.5-1.5 5 0 1.5 1.5 3.5 1.5 5 0"/></svg>`;
    case "signal_failure":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="18" x="8" y="3" rx="2"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/></svg>`;
    case "heavy_traffic":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="8" height="6" rx="2"/><circle cx="4" cy="16" r="1.5"/><circle cx="8" cy="16" r="1.5"/><rect x="14" y="6" width="8" height="6" rx="2"/><circle cx="16" cy="14" r="1.5"/><circle cx="20" cy="14" r="1.5"/></svg>`;
    case "fallen_tree":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 10-5 7h10l-5-7z"/><path d="m16 14-3 5h6l-3-5z"/><path d="M4 21h16"/></svg>`;
    default:
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }
}
