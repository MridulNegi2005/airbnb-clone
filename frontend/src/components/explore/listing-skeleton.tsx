import styles from "./explore.module.css";

export function ListingSkeleton({ count = 12 }: { count?: number }) {
  return <div className={styles.grid} aria-label="Loading stays" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonCard}>
      <div className={`skeleton ${styles.skeletonImage}`} />
      <div className={`skeleton ${styles.skeletonLine}`} />
      <div className={`skeleton ${styles.skeletonLine}`} style={{ width: "45%" }} />
      <div className={`skeleton ${styles.skeletonLine}`} style={{ width: "30%" }} />
    </div>)}
  </div>;
}

export function HomepageSkeleton(){
  return <div role="status" aria-label="Loading homes" aria-busy="true">{[0,1].map(row=><section className={styles.homeRow} key={row} aria-hidden="true"><div className={`skeleton ${styles.skeletonHeading}`}/><div className={styles.homeTrack}>{Array.from({length:8},(_,index)=><div className={styles.skeletonCard} key={index}><div className={`skeleton ${styles.homeSkeletonImage}`}/><div className={`skeleton ${styles.skeletonLine}`}/><div className={`skeleton ${styles.skeletonLine}`} style={{width:"80%"}}/></div>)}</div></section>)}</div>;
}
