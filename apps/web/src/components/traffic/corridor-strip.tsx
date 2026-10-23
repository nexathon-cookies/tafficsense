"use client";

import type { TrafficFixture } from "@/lib/traffic/simulator";
import type { SegmentStatus } from "@/lib/traffic/segment-status";
import styles from "./corridor-strip.module.css";

type CorridorStripProps = {
  fixture: TrafficFixture;
  statuses: Record<string, SegmentStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function CorridorStrip({ fixture, statuses, selectedId, onSelect }: CorridorStripProps) {
  const primarySegments = fixture.route_segments
    .filter(rs => rs.route_id === "primary")
    .sort((a, b) => a.position - b.position)
    .map(rs => fixture.segments.find(s => s.id === rs.segment_id))
    .filter((s): s is NonNullable<typeof s> => s != null);

  const alternativeSegments = fixture.route_segments
    .filter(rs => rs.route_id === "alternative")
    .sort((a, b) => a.position - b.position)
    .map(rs => fixture.segments.find(s => s.id === rs.segment_id))
    .filter((s): s is NonNullable<typeof s> => s != null);

  const inboundSegments = fixture.segments.filter(s => s.direction === "inbound");

  const renderSegmentItem = (segment: typeof fixture.segments[number]) => {
    const status = statuses[segment.id];
    const isSelected = selectedId === segment.id;
    if (!status) return null;

    return (
      <button
        key={segment.id}
        type="button"
        className={`${styles.stripNode} ${isSelected ? styles.stripNodeSelected : ""}`}
        style={{
          borderColor: isSelected ? "var(--primary)" : status.borderColor,
          backgroundColor: status.bgColor,
        }}
        onClick={() => onSelect(segment.id)}
        aria-pressed={isSelected}
      >
        <div className={styles.stripNodeHeader}>
          <span className={styles.stripNodeArrow}>{status.directionArrow}</span>
          <span className={styles.stripNodeName}>{segment.name.split("·")[0].trim()}</span>
        </div>
        <div className={styles.stripNodeMeta}>
          <span
            className={styles.chip}
            style={{ color: status.color, borderColor: status.borderColor }}
          >
            {status.chipLabel}
          </span>
          <span className={styles.delayText} style={{ color: status.color }}>
            {status.delayText}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className={styles.corridorStrip} aria-label="Corridor Overview Strip">
      <div className={styles.stripRow}>
        <div className={styles.routeHeader}>
          <span className={styles.routeBadge} style={{ backgroundColor: "#005c55" }}>Primary Route</span>
          <span className={styles.routeSub}>Outbound Corridor</span>
        </div>
        <div className={styles.nodesContainer}>
          {primarySegments.map((segment, index) => (
            <div key={segment.id} className={styles.nodeWithConnector}>
              {index > 0 && <span className={styles.connectorLine}>──→</span>}
              {renderSegmentItem(segment)}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.stripRow}>
        <div className={styles.routeHeader}>
          <span className={styles.routeBadge} style={{ backgroundColor: "#6616d7" }}>Fixed Alternative</span>
          <span className={styles.routeSub}>Bypass Route</span>
        </div>
        <div className={styles.nodesContainer}>
          {alternativeSegments.map((segment, index) => (
            <div key={segment.id} className={styles.nodeWithConnector}>
              {index > 0 && <span className={styles.connectorLine}>──→</span>}
              {renderSegmentItem(segment)}
            </div>
          ))}
        </div>
      </div>

      {inboundSegments.length > 0 && (
        <div className={styles.stripRow}>
          <div className={styles.routeHeader}>
            <span className={styles.routeBadge} style={{ backgroundColor: "#904d00" }}>Inbound Return</span>
            <span className={styles.routeSub}>Opposite Direction</span>
          </div>
          <div className={styles.nodesContainer}>
            {inboundSegments.map(segment => renderSegmentItem(segment))}
          </div>
        </div>
      )}
    </div>
  );
}
