import Link from "next/link";
import styles from "./simulated-banner.module.css";

type SimulatedBannerProps = {
  className?: string;
  context?: string;
};

export function SimulatedBanner({ className = "", context }: SimulatedBannerProps) {
  return (
    <div className={`${styles.banner} ${className}`} role="note" aria-label="Simulation Notice">
      <div className={styles.inner}>
        <div className={styles.badgeGroup}>
          <span className={styles.pill}>SIMULATED</span>
          <span className={styles.text}>
            Synthetic demonstration data · Not an official or real-time traffic authority service
            {context ? ` · ${context}` : ""}
          </span>
        </div>
        <Link href="/about" className={styles.link}>
          Methodology & Verification Rules →
        </Link>
      </div>
    </div>
  );
}
