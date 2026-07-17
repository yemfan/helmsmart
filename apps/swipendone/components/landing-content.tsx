"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/landing.module.css";
import { PhoneDemo } from "@/components/phone-demo";
import { WaitlistForm } from "@/components/waitlist-form";
import { Logo } from "@/components/logo";
import { SITE, type SiteLang } from "@/lib/landing-content";

export function LandingContent() {
  const [lang, setLang] = useState<SiteLang>("en");
  const c = SITE[lang];
  const zh = lang === "zh";

  // When Chinese, swap the page's body/display fonts to the SC stack.
  const pageStyle = zh
    ? ({
        ["--body" as string]: "var(--font-zh-body)",
        ["--disp" as string]: "var(--font-zh-display)",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={styles.page} style={pageStyle} lang={zh ? "zh" : "en"}>
      <div className={styles.wrap}>
        <nav className={styles.nav}>
          <Logo height={30} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => setLang(zh ? "en" : "zh")}
              className={styles.navCta}
              style={{ background: "transparent", color: "var(--ink)", border: "1.5px solid var(--line)", fontFamily: "var(--mono)" }}
              aria-label="Switch language"
            >
              🌐 {c.langToggle}
            </button>
            <Link className={styles.navCta} href="/app" style={{ background: "transparent", color: "var(--ink)", border: "1.5px solid var(--line)" }}>
              {c.nav.signin}
            </Link>
            <a className={styles.navCta} href="#waitlist">
              {c.nav.waitlist}
            </a>
          </div>
        </nav>

        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>{c.hero.eyebrow}</div>
            <h1>
              {c.hero.h1_pre}
              <span className="u" style={{ boxShadow: "inset 0 -0.28em 0 #F8D9CC" }}>
                {c.hero.h1_emph}
              </span>
              {c.hero.h1_post}
            </h1>
            <p className="sub">{c.hero.sub}</p>
            <WaitlistForm cta={c.hero.cta} messages={c.waitlistMsg} />
            <p className={styles.formNote}>{c.hero.note}</p>
          </div>
          <PhoneDemo />
        </header>

        <section className={styles.section} id="how">
          <div className={styles.secEyebrow}>{c.how.eyebrow}</div>
          <h2>{c.how.h2}</h2>
          <div className={styles.cols3}>
            {c.how.cards.map((card) => (
              <div className={styles.stepcard} key={card.n}>
                <span className="n">{card.n}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.diag}>
            <div>
              <div className={styles.secEyebrow}>{c.diag.eyebrow}</div>
              <h2>{c.diag.h2}</h2>
              <p>{c.diag.p}</p>
              <ul>
                {c.diag.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
            <div className={styles.chat} aria-label="Example diagnosis conversation">
              <span className={styles.lbl}>{c.diag.chat.label1}</span>
              <div className={`${styles.bub} ${styles.bubUser}`}>{c.diag.chat.user1}</div>
              <div className={`${styles.bub} ${styles.bubAi}`}>
                {c.diag.chat.ai_a}
                <b>{c.diag.chat.ai_b}</b>
                {c.diag.chat.ai_c}
              </div>
              <div className={`${styles.bub} ${styles.bubUser}`}>{c.diag.chat.user2}</div>
              <span className={styles.lbl}>{c.diag.chat.label2}</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secEyebrow}>{c.wedge.eyebrow}</div>
          <h2>{c.wedge.h2}</h2>
          <p className={styles.secSub}>{c.wedge.sub}</p>
          <div className={styles.biling}>
            <div className={styles.langCard} lang="en">
              <span className="tag">EN</span>
              <h3>Insert dowels into side panels</h3>
              <p>
                Push 4 wooden dowels into the pre-drilled holes on the inner face of
                each side panel. No glue needed.
              </p>
            </div>
            <div className={`${styles.langCard} ${styles.ja}`} lang="ja">
              <span className="tag">日本語</span>
              <h3>側板にダボを差し込む</h3>
              <p>各側板の内側の下穴に木製ダボを4本押し込みます。接着剤は不要です。</p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="waitlist">
          <div className={styles.waitlist}>
            <div className={styles.foundTag}>{c.waitlist.foundTag}</div>
            <h2>{c.waitlist.h2}</h2>
            <p className={styles.secSub}>{c.waitlist.sub}</p>
            <WaitlistForm cta={c.waitlist.cta} messages={c.waitlistMsg} />
          </div>
        </section>

        <footer className={styles.footer}>
          <Logo height={22} />
          <div>{c.footer}</div>
        </footer>
      </div>
    </div>
  );
}
