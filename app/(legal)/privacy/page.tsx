import styles from "../legal.module.css";
import { legal } from "@/lib/legal";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: 8 June 2026</p>

      <h2>1. Who we are</h2>
      <p>
        Cortado (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by <strong>{legal.entity()}</strong>.
        For any privacy question or request, contact <strong>{legal.contact()}</strong>.
      </p>

      <h2>2. What we collect</h2>
      <p><strong>Account data.</strong> Your email address; for email/password sign-ups, your password stored
        only as a bcrypt hash (never in plain text); your display name; your public handle (username); an avatar
        colour (not an image); your bio; an email-verification timestamp; your account-creation time; and an
        internal counter we use to sign you out everywhere when you ask. If you sign in with Google or GitHub we
        also store that provider&rsquo;s name for your account and your account ID at that provider — we do
        <strong> not</strong> store any OAuth access or refresh tokens, and any avatar URL the provider supplies is
        stored but never displayed.</p>
      <p><strong>Your content.</strong> The coffee bags, brews and tasting notes (ratings, brew parameters, free
        text), comments, likes, follows, saved tastings and wishlist entries you create.</p>
      <p><strong>Technical data.</strong> Your IP address and email address are used to rate-limit sign-in and
        sign-up and are held only briefly (target ~15 minutes). An authentication cookie keeps you signed in (see
        our <a href="/cookies">Cookie Notice</a>). Email-verification links are stored as a keyed hash alongside
        your email for a target of 24 hours.</p>

      <h2>3. What is public and what is private</h2>
      <p><strong>Public</strong> to anyone: your display name, handle, avatar, bio, your reviews and comments, and
        your follower/following/review counts. <strong>Private</strong> (only you can see it): your email address,
        your password, and your bag-inventory details (bag weight, purchase date, amount remaining, and
        owned/where-bought).</p>
      <p>You also have a <strong>public profile</strong> at <code>/u/your-handle</code>, viewable by anyone with the
        link. A <strong>&ldquo;discoverable&rdquo;</strong> setting (Settings &rarr; Public profile,{" "}
        <strong>off by default</strong>) controls whether search engines may index that profile page and whether it
        appears in our sitemap. Note that individual reviews and tasting notes you post are shown publicly on the
        relevant coffee&rsquo;s page and may be indexed by search engines independently of this setting.</p>

      <h2>4. Why we process your data</h2>
      <p>To provide the service, to authenticate you and keep the service secure (including rate-limiting), and to
        send you transactional verification email. <em>{legal.legalBases()}</em></p>

      <h2>5. Who we share data with</h2>
      <ul>
        <li><strong>Google / GitHub</strong> — only if you choose to sign in with them. They receive the sign-in
          request and return your profile (name, email, verified flag, avatar URL). For GitHub we additionally ask
          its API whether your primary email is verified.</li>
        <li><strong>Resend</strong> — our transactional email provider. It receives your email address and the
          message (e.g. a verification link) so we can deliver verification email. Used only when email sending is
          configured.</li>
        <li><strong>Hosting &amp; database</strong> — our application host <strong>{legal.hosting()}</strong> and
          our database <strong>{legal.dbHost()}</strong>.</li>
      </ul>
      <p>We do <strong>not</strong> use analytics, advertising, tracking or session-replay services. We self-host
        our web fonts and never load an external avatar or image CDN.</p>

      <h2>6. How long we keep it</h2>
      <p>We keep your account and content until you delete your account. Verification links target a 24-hour
        lifetime and rate-limit records target ~15 minutes; these short-lived records are cleared on a best-effort
        basis, so treat those windows as targets after which the data becomes eligible for deletion rather than a
        guaranteed deletion deadline. Server logs are kept for <strong>{legal.logRetention()}</strong>.</p>

      <h2>7. Your rights and deleting your account</h2>
      <p>You can delete your account at any time from <a href="/settings">Settings</a>. This permanently deletes
        your account and your linked sign-in providers, your bags and the tastings/likes/saves/comments on them,
        and your own tastings, likes, comments, follows, saved tastings, wishlist and verification links.</p>
      <p><strong>Please note:</strong> a few records are not removed by deletion — rate-limit records that
        briefly hold your email/IP persist until their short prune window passes, and our server logs may contain
        your email or IP and are kept under the log-retention period above. Deleting your account also removes
        other people&rsquo;s likes, saves and comments on the content you had shared. You can download a copy of
        your data any time from <a href="/settings">Settings</a>; for any other data request, contact us at{" "}
        <strong>{legal.dsarProcess()}</strong>.</p>

      <h2>8. Security</h2>
      <p>Passwords are bcrypt-hashed and your sessions are signed and encrypted. Your email and profile details
        are stored unencrypted at rest in our database. We enforce a strict Content-Security-Policy, HSTS and
        related security headers. <em>{legal.dbTls()}</em></p>

      <h2>9. Children</h2>
      <p>Cortado is not directed to children under <strong>{legal.minAge()}</strong>.</p>

      <h2>10. International transfers</h2>
      <p>{legal.dataTransfer()}</p>

      <h2>11. Changes</h2>
      <p>We may update this policy; we will revise the &ldquo;last updated&rdquo; date above.</p>

      <h2>12. Contact</h2>
      <p>{legal.contact()}.</p>
    </>
  );
}
