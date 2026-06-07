import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className={styles.updated}>Last updated: 7 June 2026</p>

      <h2>1. Acceptance and eligibility</h2>
      <p>By creating an account or using Cortado you agree to these Terms. You must be at least
        <strong> [PLACEHOLDER: minimum age]</strong> years old to use the service.</p>

      <h2>2. Your account</h2>
      <p>Provide accurate information, keep your credentials secure, and you are responsible for activity under
        your account.</p>

      <h2>3. Acceptable use</h2>
      <p>Do not post illegal or infringing content in your reviews, notes or photos; do not scrape, automate
        abuse of, or disrupt the service or other users.</p>

      <h2>4. Your content</h2>
      <p>You keep ownership of the content you create. You grant us a non-exclusive licence to host and display
        your content within the service so it works as intended. You are responsible for what you post.</p>

      <h2>5. Availability</h2>
      <p>The service is provided &ldquo;as is&rdquo; and we may change, suspend or discontinue features.</p>

      <h2>6. Termination</h2>
      <p>We may suspend or remove accounts that violate these Terms. You may delete your account at any time from
        <a href="/settings"> Settings</a>.</p>

      <h2>7. Disclaimers and liability</h2>
      <p>[PLACEHOLDER: disclaimers and limitation of liability — confirm with counsel.]</p>

      <h2>8. Governing law</h2>
      <p>[PLACEHOLDER: governing law and jurisdiction.]</p>

      <h2>9. Changes</h2>
      <p>We may update these Terms; we will revise the &ldquo;last updated&rdquo; date above.</p>

      <h2>10. Contact</h2>
      <p>[PLACEHOLDER: contact email].</p>
    </>
  );
}
