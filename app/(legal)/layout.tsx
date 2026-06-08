import Link from "next/link";
import type { Metadata } from "next";
import styles from "./legal.module.css";

export const metadata: Metadata = {
  title: "Legal — Cortado",
};

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>Cortado</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.disclaimer} role="note">
          <span aria-hidden="true">⚠️</span> <strong>Template.</strong> This is draft content for review with qualified counsel before you rely on it.
        </div>
        <article className={styles.prose}>{children}</article>
      </main>
      <footer className={styles.footer}>
        <nav aria-label="Legal">
          <ul style={{ display: "flex", gap: 16, listStyle: "none", margin: 0, padding: 0 }}>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/cookies">Cookies</Link></li>
          </ul>
        </nav>
        <span className={styles.spacer} />
        <Link href="/">← Back to Cortado</Link>
        <span>© 2026 Cortado</span>
      </footer>
    </div>
  );
}
