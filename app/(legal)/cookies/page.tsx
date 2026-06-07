import styles from "../legal.module.css";

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Notice</h1>
      <p className={styles.updated}>Last updated: 7 June 2026</p>

      <p>Cortado uses only the cookies it needs to sign you in and keep the service secure, plus one functional
        preference stored in your browser. Because we set no analytics, advertising or tracking cookies, there is
        no consent banner. All of our cookies are first-party, host-only, and <code>HttpOnly</code>; in production
        they are <code>Secure</code> and their names carry <code>__Secure-</code>/<code>__Host-</code> prefixes
        (the names below are shown without the prefix, as used in local development).</p>

      <h2>Strictly-necessary cookies</h2>
      <ul>
        <li><strong>authjs.session-token</strong> — keeps you signed in (a signed, encrypted session). Expires
          about 30 minutes after your last activity, refreshed as you use the app; large sign-ins may split it
          across numbered cookies (<code>.0</code>, <code>.1</code>, …).</li>
        <li><strong>authjs.csrf-token</strong> — protects sign-in requests against cross-site forgery. Deleted
          when you close your browser.</li>
        <li><strong>authjs.callback-url</strong> — remembers where to return you after sign-in. Deleted when you
          close your browser.</li>
        <li><strong>authjs.pkce.code_verifier, authjs.state, authjs.nonce</strong> — set only while you are
          actively signing in with Google or GitHub, to secure that exchange. Short-lived (about 15 minutes or
          less).</li>
      </ul>
      <p>Signing out clears these cookies.</p>

      <h2>Functional preference (not a cookie)</h2>
      <p>We store your light/dark theme choice under a <code>theme</code> key in your browser&rsquo;s
        <strong> localStorage</strong>. It stays until you clear your browser storage and is never sent to us.</p>

      <h2>What we do not use</h2>
      <p>We use no analytics, advertising or tracking cookies or trackers. If you sign in with Google or GitHub,
        those providers set their own cookies on their own sites under their own policies.</p>

      <p>See our <a href="/privacy">Privacy Policy</a> for how we handle your data.</p>
    </>
  );
}
