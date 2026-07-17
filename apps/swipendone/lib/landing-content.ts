// Bilingual copy for the public marketing site. The buyer-guide product supports
// six languages; the marketing site itself ships EN + 简体中文 (its core audience
// is sellers sourcing from China). zh is written as natural marketing copy.

export type SiteLang = "en" | "zh";

export interface StepCard {
  n: string;
  title: string;
  body: string;
}

export interface SiteContent {
  langToggle: string; // label to switch to the OTHER language
  nav: { signin: string; waitlist: string };
  hero: {
    eyebrow: string;
    h1_pre: string;
    h1_emph: string;
    h1_post: string;
    sub: string;
    cta: string;
    note: string;
  };
  waitlistMsg: { success: string; invalid: string; error: string };
  how: { eyebrow: string; h2: string; cards: [StepCard, StepCard, StepCard] };
  diag: {
    eyebrow: string;
    h2: string;
    p: string;
    bullets: [string, string, string];
    chat: {
      label1: string;
      user1: string;
      ai_a: string;
      ai_b: string;
      ai_c: string;
      user2: string;
      label2: string;
    };
  };
  wedge: { eyebrow: string; h2: string; sub: string };
  waitlist: { foundTag: string; h2: string; sub: string; cta: string };
  footer: string;
}

export const SITE: Record<SiteLang, SiteContent> = {
  en: {
    langToggle: "中文",
    nav: { signin: "Sign in", waitlist: "Join the waitlist" },
    hero: {
      eyebrow: "AI instruction decks · EN 中文 ES FR DE 日本語",
      h1_pre: "Instructions your customers ",
      h1_emph: "actually follow.",
      h1_post: "",
      sub: "Upload photos and rough notes. AI turns them into a swipeable, multilingual guide your customers scan from a QR code on the box — with built-in AI diagnosis when something goes wrong.",
      cta: "Get early access",
      note: "Founding cohort: 20 accounts, AI diagnosis included.",
    },
    waitlistMsg: {
      success: "You're on the list. We'll be in touch soon. ✓",
      invalid: "Enter a valid email address.",
      error: "Something went wrong — try again in a moment.",
    },
    how: {
      eyebrow: "How it works",
      h2: "From a folder of photos to a printed QR code in one afternoon.",
      cards: [
        { n: "01", title: "Upload anything", body: "Product photos, bullet notes, even the messy factory manual. Word, PDF, photos of paper — AI reads it all." },
        { n: "02", title: "AI builds the deck", body: "Steps sequenced, captions written, parts list extracted, pro tips added — in every language you choose. You edit, then publish." },
        { n: "03", title: "Ship the QR", body: "One hosted link, one print-ready QR code for your packaging. Update the guide anytime — the printed QR never changes." },
      ],
    },
    diag: {
      eyebrow: "AI Diagnosis",
      h2: "Every solved problem is a return that didn't happen.",
      p: "When something goes wrong mid-assembly, your customer doesn't email support or start a return — they tap “Something’s wrong,” snap a photo, and AI diagnoses it against your product’s knowledge base.",
      bullets: [
        "Instant fixes referenced to the exact step",
        "Unresolved issues arrive as structured tickets, not angry emails",
        "See which step causes 34% of your problems — then fix the product",
      ],
      chat: {
        label1: "Live diagnosis",
        user1: "The drawer won't close all the way 😤 [photo]",
        ai_a: "I can see it in your photo — the ",
        ai_b: "cam lock from Step 2",
        ai_c: " is only quarter-turned on the left side. Turn it clockwise another quarter-turn with the hex key, then try the drawer.",
        user2: "That fixed it. Thanks!",
        label2: "Ticket avoided · logged to Step 2 analytics",
      },
    },
    wedge: {
      eyebrow: "The multilingual wedge",
      h2: "One upload. Every language. Zero translation cost.",
      sub: "Built for sellers who source from China and ship worldwide. Pick your markets — English, 中文, Español, Français, Deutsch, 日本語 — and AI writes each guide natively, not word-for-word, so “please to insert the wood stick” is never your brand’s first impression.",
    },
    waitlist: {
      foundTag: "FOUNDING 20 — AI DIAGNOSIS INCLUDED",
      h2: "Be one of the first 20 sellers.",
      sub: "Early access, founding pricing locked for life, and AI diagnosis included while the cohort lasts.",
      cta: "Join the waitlist",
    },
    footer: "© 2026 SwipenDone · Instructions, done right.",
  },
  zh: {
    langToggle: "EN",
    nav: { signin: "登录", waitlist: "加入等候名单" },
    hero: {
      eyebrow: "AI 说明书 · EN 中文 ES FR DE 日本語",
      h1_pre: "让客户",
      h1_emph: "真正照着做",
      h1_post: "的说明书。",
      sub: "上传照片和简单备注，AI 自动生成可滑动、多语言的说明书，客户扫描包装上的二维码即可查看——遇到问题时还有内置 AI 诊断。",
      cta: "抢先体验",
      note: "创始名额：20 个账户，含 AI 诊断功能。",
    },
    waitlistMsg: {
      success: "已加入名单，我们会尽快与你联系。✓",
      invalid: "请输入有效的邮箱地址。",
      error: "出了点问题，请稍后再试。",
    },
    how: {
      eyebrow: "工作原理",
      h2: "从一堆照片到印好的二维码，一个下午就能搞定。",
      cards: [
        { n: "01", title: "上传任何素材", body: "产品照片、要点备注，甚至杂乱的工厂说明书。Word、PDF、纸质照片——AI 都能读懂。" },
        { n: "02", title: "AI 生成说明书", body: "自动排列步骤、撰写图注、提取零件清单、补充实用提示——你选的每种语言同时生成。审核后即可发布。" },
        { n: "03", title: "发布二维码", body: "一个托管链接，一个可打印的二维码贴在包装上。随时更新说明书——印好的二维码永远有效。" },
      ],
    },
    diag: {
      eyebrow: "AI 诊断",
      h2: "每解决一个问题，就避免一次退货。",
      p: "组装途中出问题时，客户不用发邮件求助，也不会直接退货——只需点击“遇到问题？”，拍张照片，AI 便会对照你的产品知识库给出诊断。",
      bullets: [
        "精准定位到具体步骤的即时解决方案",
        "未解决的问题会变成结构化工单，而非愤怒的邮件",
        "看清哪一步导致了 34% 的问题——再去改进产品",
      ],
      chat: {
        label1: "实时诊断",
        user1: "抽屉关不严 😤 [照片]",
        ai_a: "从照片能看出来——",
        ai_b: "第 2 步的偏心轮",
        ai_c: "在左侧只拧了四分之一圈。用六角扳手再顺时针拧四分之一圈，然后再试试抽屉。",
        user2: "搞定了，谢谢！",
        label2: "避免了一次工单 · 已记入第 2 步分析",
      },
    },
    wedge: {
      eyebrow: "多语言优势",
      h2: "一次上传。所有语言。零翻译成本。",
      sub: "专为从中国采购、销往全球的卖家打造。选择你的目标市场——English、中文、Español、Français、Deutsch、日本語——AI 会以母语级表达撰写每份说明书，而非逐字翻译，让“请插入木棒”永远不会成为你品牌的第一印象。",
    },
    waitlist: {
      foundTag: "创始 20 席 · 含 AI 诊断",
      h2: "成为首批 20 位卖家之一。",
      sub: "抢先体验、终身锁定创始价，创始名额期间还免费包含 AI 诊断。",
      cta: "加入等候名单",
    },
    footer: "© 2026 SwipenDone · 把说明书做好。",
  },
};
