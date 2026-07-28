import React from 'react';
import styles from './OnboardingLayout.module.css';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoMark}>C</div>
        <span className={styles.brandName}>Coldingrod</span>
      </header>
      
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
