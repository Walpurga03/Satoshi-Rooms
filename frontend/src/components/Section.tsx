import { useState, useCallback } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';

import styles from './Section.module.scss';

/**
 * Props für die Section-Komponente
 */
interface SectionProps {
  /** Titel der Sektion - kann Text oder JSX sein */
  title: ReactNode;
  /** Inhalt der Sektion */
  children: ReactNode;
  /** Standardzustand - offen oder geschlossen */
  defaultOpen?: boolean;
  /** Zusätzliche CSS-Klassen */
  className?: string;
  /** Optional: Eindeutige ID für bessere Accessibility */
  id?: string;
  /** Optional: Callback wenn Sektion geöffnet/geschlossen wird */
  onToggle?: (isOpen: boolean) => void;
}

/**
 * Section-Komponente mit Collapse-Funktionalität
 *
 * Bietet eine zusammenklappbare Sektion mit:
 * - Accessibility-Support (ARIA, Keyboard Navigation)
 * - Smooth Animations
 * - Responsive Design
 * - Custom Styling Support
 */
export function Section({
  title,
  children,
  defaultOpen = true,
  className,
  id,
  onToggle
}: SectionProps) {
  // State für Collapse-Status
  const [open, setOpen] = useState<boolean>(defaultOpen);

  /**
   * Handler für das Öffnen/Schließen der Sektion
   * Optimiert mit useCallback für bessere Performance
   */
  const handleToggle = useCallback(() => {
    setOpen(prevOpen => {
      const newOpen = !prevOpen;
      // Optional: Callback für Parent-Komponenten
      onToggle?.(newOpen);
      return newOpen;
    });
  }, [onToggle]);

  /**
   * Keyboard Event Handler für Accessibility
   * Unterstützt Enter und Spacebar
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // Nur bei Enter und Spacebar reagieren
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Verhindert Scrollen bei Spacebar
      handleToggle();
    }
  }, [handleToggle]);

  // Generiere eindeutige IDs für bessere Accessibility
  const sectionId = id || `section-${title}`;
  const contentId = `${sectionId}-content`;
  const headerId = `${sectionId}-header`;

  return (
    <section
      className={className ? `${styles.sectionCard} ${className}` : styles.sectionCard}
      id={sectionId}
      aria-labelledby={headerId}
    >
      {/* Collapse Header - Clickable Area */}
      <div
        className={styles.collapseHeader}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={`${open ? 'Bereich zuklappen' : 'Bereich aufklappen'}: ${title}`}
        id={headerId}
      >
        <h2 className={styles.collapseHeadline}>
          {title}
          <span
            className={`${styles.collapseArrow} ${open ? styles.collapseArrowOpen : ''}`}
            aria-hidden="true"
          />
        </h2>
      </div>

      {/* Collapse Content - Collapsible Area */}
      <div
        className={open ? styles.collapseContentOpen : styles.collapseContent}
        id={contentId}
        aria-hidden={!open}
        role="region"
        aria-labelledby={headerId}
      >
        <div className={styles.collapseContentInner}>
          {children}
        </div>
      </div>
    </section>
  );
}
