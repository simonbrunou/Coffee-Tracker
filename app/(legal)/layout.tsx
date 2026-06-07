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
          ⚠️ <strong>Template.</strong> This is draft content for review with qualified counsel before you rely on it.
        </div>
        <article className={styles.prose}>{children}</article>
      </main>
      <footer className={styles.footer}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cookies">Cookies</Link>
        <span className={styles.spacer} />
        <Link href="/">← Back to Cortado</Link>
        <span>© 2026 Cortado</span>
      </footer>
    </div>
  );
}
