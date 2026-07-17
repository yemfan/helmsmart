import type { Locale } from "@/lib/locales";

// Static buyer-guide UI labels (not product data) in every supported language.
export interface UiStrings {
  start: string;
  parts: string;
  partsHint: string;
  allFound: string;
  missing: string;
  tipWord: string;
  back: string;
  next: string;
  finish: string;
  doneTitle: string;
  doneBody: string;
  register: string;
  emailPlaceholder: string;
  skip: string;
  registered: string;
  powered: string;
  toolsPrefix: string;
  invalidEmail: string;
  language: string;
}

export const UI: Record<Locale, UiStrings> = {
  en: {
    start: "Start assembly",
    parts: "Check your parts",
    partsHint: "Tap each part as you find it in the box.",
    allFound: "All parts found — continue",
    missing: "Missing a part? Tap here — we'll ship it free.",
    tipWord: "TIP",
    back: "Back",
    next: "Next",
    finish: "Finish",
    doneTitle: "You're done.",
    doneBody: "Register your product to activate the warranty and get free replacement parts.",
    register: "Register warranty",
    emailPlaceholder: "you@email.com",
    skip: "Skip for now",
    registered: "Registered — thank you!",
    powered: "Made with SwipenDone",
    toolsPrefix: "You need: ",
    invalidEmail: "Enter a valid email address.",
    language: "Language",
  },
  zh: {
    start: "开始安装",
    parts: "核对零件",
    partsHint: "从箱中找到零件后，逐一点选。",
    allFound: "零件齐全 — 继续",
    missing: "缺少零件？点此免费补寄。",
    tipWord: "提示",
    back: "上一步",
    next: "下一步",
    finish: "完成",
    doneTitle: "安装完成。",
    doneBody: "注册您的产品，激活质保并享受免费零件补寄服务。",
    register: "注册质保",
    emailPlaceholder: "you@email.com",
    skip: "暂时跳过",
    registered: "注册成功 — 谢谢！",
    powered: "由 SwipenDone 生成",
    toolsPrefix: "所需工具：",
    invalidEmail: "请输入有效的电子邮箱。",
    language: "语言",
  },
  es: {
    start: "Comenzar el montaje",
    parts: "Verifica tus piezas",
    partsHint: "Toca cada pieza a medida que la encuentres en la caja.",
    allFound: "Todas las piezas encontradas — continuar",
    missing: "¿Falta una pieza? Toca aquí — te la enviamos gratis.",
    tipWord: "CONSEJO",
    back: "Atrás",
    next: "Siguiente",
    finish: "Finalizar",
    doneTitle: "¡Listo!",
    doneBody: "Registra tu producto para activar la garantía y recibir piezas de repuesto gratis.",
    register: "Registrar garantía",
    emailPlaceholder: "tu@email.com",
    skip: "Omitir por ahora",
    registered: "Registrado — ¡gracias!",
    powered: "Hecho con SwipenDone",
    toolsPrefix: "Necesitas: ",
    invalidEmail: "Introduce un correo electrónico válido.",
    language: "Idioma",
  },
  fr: {
    start: "Commencer le montage",
    parts: "Vérifiez vos pièces",
    partsHint: "Touchez chaque pièce à mesure que vous la trouvez dans la boîte.",
    allFound: "Toutes les pièces trouvées — continuer",
    missing: "Une pièce manque ? Touchez ici — envoi gratuit.",
    tipWord: "ASTUCE",
    back: "Retour",
    next: "Suivant",
    finish: "Terminer",
    doneTitle: "C'est terminé !",
    doneBody: "Enregistrez votre produit pour activer la garantie et recevoir des pièces de rechange gratuites.",
    register: "Enregistrer la garantie",
    emailPlaceholder: "vous@email.com",
    skip: "Ignorer pour l'instant",
    registered: "Enregistré — merci !",
    powered: "Créé avec SwipenDone",
    toolsPrefix: "Il vous faut : ",
    invalidEmail: "Saisissez une adresse e-mail valide.",
    language: "Langue",
  },
  de: {
    start: "Montage starten",
    parts: "Teile überprüfen",
    partsHint: "Tippe jedes Teil an, sobald du es in der Verpackung findest.",
    allFound: "Alle Teile gefunden — weiter",
    missing: "Ein Teil fehlt? Hier tippen — wir senden es kostenlos.",
    tipWord: "TIPP",
    back: "Zurück",
    next: "Weiter",
    finish: "Fertig",
    doneTitle: "Fertig!",
    doneBody: "Registriere dein Produkt, um die Garantie zu aktivieren und kostenlose Ersatzteile zu erhalten.",
    register: "Garantie registrieren",
    emailPlaceholder: "du@email.com",
    skip: "Vorerst überspringen",
    registered: "Registriert — danke!",
    powered: "Erstellt mit SwipenDone",
    toolsPrefix: "Du brauchst: ",
    invalidEmail: "Gib eine gültige E-Mail-Adresse ein.",
    language: "Sprache",
  },
  ja: {
    start: "組み立てを開始",
    parts: "部品を確認",
    partsHint: "箱の中で見つけた部品を一つずつタップしてください。",
    allFound: "すべての部品が揃いました — 続ける",
    missing: "部品が足りない？ここをタップ — 無料でお送りします。",
    tipWord: "ヒント",
    back: "戻る",
    next: "次へ",
    finish: "完了",
    doneTitle: "完成です。",
    doneBody: "製品を登録して保証を有効にし、無料の交換部品を受け取りましょう。",
    register: "保証を登録",
    emailPlaceholder: "you@email.com",
    skip: "今はスキップ",
    registered: "登録しました — ありがとうございます！",
    powered: "SwipenDone で作成",
    toolsPrefix: "必要な工具： ",
    invalidEmail: "有効なメールアドレスを入力してください。",
    language: "言語",
  },
};
