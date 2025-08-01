import { useState } from 'react';
import type { ReactNode } from 'react';

import styles from './Section.module.scss';

interface SectionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Section({ title, children, defaultOpen = true, className }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className ? `${styles.sectionCard} ${className}` : styles.sectionCard}>
      <div
        className={styles.collapseHeader}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Bereich zuklappen' : 'Bereich aufklappen'}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
      >
        <h2 className={styles.collapseHeadline}>
          {title}
          <span className={styles.collapseArrow} aria-hidden="true" />
        </h2>
      </div>
      <div
        className={open ? styles.collapseContentOpen : styles.collapseContent}
        aria-hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
