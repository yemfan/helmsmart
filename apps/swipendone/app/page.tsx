import Link from "next/link";
import styles from "./landing.module.css";
import { PhoneDemo } from "@/components/phone-demo";
import { WaitlistForm } from "@/components/waitlist-form";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <nav className={styles.nav}>
          <div className={styles.logo}>
            swipen<span className={styles.dot}>done</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className={styles.navCta} href="/app" style={{ background: "transparent", color: "var(--ink)", border: "1.5px solid var(--line)" }}>
              Sign in
            </Link>
            <a className={styles.navCta} href="#waitlist">
              Join the waitlist
            </a>
          </div>
        </nav>

        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>AI instruction decks · EN / 中文</div>
            <h1>
              Instructions your customers <span className="u">actually follow.</span>
            </h1>
            <p className="sub">
              Upload photos and rough notes. AI turns them into a swipeable,
              bilingual guide your customers scan from a QR code on the box — with
              built-in AI diagnosis when something goes wrong.
            </p>
            <WaitlistForm cta="Get early access" />
            <p className={styles.formNote}>
              Founding cohort: 20 accounts, AI diagnosis included.
            </p>
          </div>
          <PhoneDemo />
        </header>

        <section className={styles.section} id="how">
          <div className={styles.secEyebrow}>How it works</div>
          <h2>From a folder of photos to a printed QR code in one afternoon.</h2>
          <div className={styles.cols3}>
            <div className={styles.stepcard}>
              <span className="n">01</span>
              <h3>Upload anything</h3>
              <p>
                Product photos, bullet notes, even the messy factory manual. Word,
                PDF, photos of paper — AI reads it all.
              </p>
            </div>
            <div className={styles.stepcard}>
              <span className="n">02</span>
              <h3>AI builds the deck</h3>
              <p>
                Steps sequenced, captions written, parts list extracted, pro tips
                added — in English and 中文 simultaneously. You edit, then publish.
              </p>
            </div>
            <div className={styles.stepcard}>
              <span className="n">03</span>
              <h3>Ship the QR</h3>
              <p>
                One hosted link, one print-ready QR code for your packaging. Update
                the guide anytime — the printed QR never changes.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.diag}>
            <div>
              <div className={styles.secEyebrow}>AI Diagnosis</div>
              <h2>Every solved problem is a return that didn&apos;t happen.</h2>
              <p>
                When something goes wrong mid-assembly, your customer doesn&apos;t
                email support or start a return — they tap &ldquo;Something&apos;s
                wrong,&rdquo; snap a photo, and AI diagnoses it against your
                product&apos;s knowledge base.
              </p>
              <ul>
                <li>Instant fixes referenced to the exact step</li>
                <li>Unresolved issues arrive as structured tickets, not angry emails</li>
                <li>See which step causes 34% of your problems — then fix the product</li>
              </ul>
            </div>
            <div className={styles.chat} aria-label="Example diagnosis conversation">
              <span className={styles.lbl}>Live diagnosis</span>
              <div className={`${styles.bub} ${styles.bubUser}`}>
                The drawer won&apos;t close all the way 😤 [photo]
              </div>
              <div className={`${styles.bub} ${styles.bubAi}`}>
                I can see it in your photo — the <b>cam lock from Step 2</b> is only
                quarter-turned on the left side. Turn it clockwise another
                quarter-turn with the hex key, then try the drawer.
              </div>
              <div className={`${styles.bub} ${styles.bubUser}`}>That fixed it. Thanks!</div>
              <span className={styles.lbl}>Ticket avoided · logged to Step 2 analytics</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secEyebrow}>The bilingual wedge</div>
          <h2>One upload. Two languages. Zero translation cost.</h2>
          <p className={styles.secSub}>
            Built for sellers who source from China and serve customers in both
            languages — because &ldquo;please to insert the wood stick&rdquo;
            shouldn&apos;t be your brand&apos;s first impression.
          </p>
          <div className={styles.biling}>
            <div className={styles.langCard}>
              <span className="tag">EN</span>
              <h3>Insert dowels into side panels</h3>
              <p>
                Push 4 wooden dowels into the pre-drilled holes on the inner face of
                each side panel. No glue needed.
              </p>
            </div>
            <div className={`${styles.langCard} ${styles.zh}`} lang="zh">
              <span className="tag">中文</span>
              <h3>将木销插入侧板</h3>
              <p>将4个木销插入每块侧板内侧的预钻孔中。无需胶水，用手按入即可。</p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="waitlist">
          <div className={styles.waitlist}>
            <div className={styles.foundTag}>FOUNDING 20 — AI DIAGNOSIS INCLUDED</div>
            <h2>Be one of the first 20 sellers.</h2>
            <p className={styles.secSub}>
              Early access, founding pricing locked for life, and AI diagnosis
              included while the cohort lasts.
            </p>
            <WaitlistForm cta="Join the waitlist" />
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.logo}>
            swipen<span className={styles.dot}>done</span>
          </div>
          <div>© 2026 SwipenDone · Instructions, done right.</div>
        </footer>
      </div>
    </div>
  );
}
