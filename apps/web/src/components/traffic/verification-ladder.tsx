"use client";

import { evaluateSegmentLadder } from "@/lib/evidence/verification-ladder";
import styles from "./verification-ladder.module.css";

type VerificationLadderProps = {
  segmentName: string;
  hasReport: boolean;
  isMultipleSources: boolean;
  isSlowdownSupported: boolean;
};

export function VerificationLadder({
  segmentName,
  hasReport,
  isMultipleSources,
  isSlowdownSupported,
}: VerificationLadderProps) {
  const ladder = evaluateSegmentLadder({
    hasReport,
    isMultipleSources,
    isSlowdownSupported,
  });

  return (
    <div className={styles.ladderContainer} aria-label="Verification Evidence Ladder">
      <div className={styles.headerRow}>
        <div>
          <h4 className={styles.title}>Verification Evidence Ladder (L1–L6)</h4>
          <p className={styles.subtitle}>Current qualification for {segmentName}</p>
        </div>
        <div className={styles.currentBadge}>
          <span className={styles.currentDot} aria-hidden="true" />
          <span>{ladder.currentLabel}</span>
        </div>
      </div>

      <div className={styles.ladderSteps}>
        {ladder.tiers.map((tier) => {
          const isAchieved = tier.achieved;
          const isPlanned = tier.status === "planned";

          return (
            <div
              key={tier.level}
              className={`${styles.ladderStep} ${
                isAchieved
                  ? styles.stepAchieved
                  : isPlanned
                  ? styles.stepPlanned
                  : styles.stepInactive
              }`}
            >
              <div className={styles.stepRail}>
                <div
                  className={`${styles.stepBadge} ${
                    isAchieved
                      ? styles.badgeAchieved
                      : isPlanned
                      ? styles.badgePlanned
                      : styles.badgeInactive
                  }`}
                >
                  {tier.level}
                </div>
                <div className={styles.railLine} />
              </div>

              <div className={styles.stepContent}>
                <div className={styles.stepTitleRow}>
                  <div className={styles.stepNameGroup}>
                    <strong className={styles.stepName}>{tier.name}</strong>
                    <span className={styles.stepSource}>· {tier.source}</span>
                  </div>

                  {isAchieved ? (
                    <span className={styles.pillAchieved}>● Active qualification</span>
                  ) : isPlanned ? (
                    <span className={styles.pillPlanned}>Planned specification</span>
                  ) : (
                    <span className={styles.pillInactive}>Threshold not reached</span>
                  )}
                </div>

                <p className={styles.stepDesc}>{tier.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
