export interface ResourceItem {
  key: string;
  title: string;
  description: string;
  category: "sales" | "marketing" | "proof" | "brand" | "compliance";
  format: "deck" | "document" | "template" | "graphics" | "video" | "tool";
  productKey: string | null;
  isPartnerOnly: boolean;
}

export const RESOURCE_CATEGORIES: {
  key: ResourceItem["category"];
  name: string;
  detail: string;
}[] = [
  { key: "sales", name: "Sales materials", detail: "What you use in the conversation itself." },
  { key: "marketing", name: "Marketing materials", detail: "What you publish and send." },
  { key: "proof", name: "Proof", detail: "Evidence a business will actually read." },
  { key: "brand", name: "Brand", detail: "Correct logos, colours and usage." },
  { key: "compliance", name: "Compliance", detail: "Read this before you publish anything." },
];

/** Mirrors the `abw_resources` seed. The database is authoritative. */
export const RESOURCES: ResourceItem[] = [
  { key: "overview-deck", title: "AI Business Works Overview Deck", description: "The ecosystem, the three products, and where each one fits.", category: "sales", format: "deck", productKey: null, isPartnerOnly: true },
  { key: "closeboss-deck", title: "CloseBoss AI Sales Deck", description: "Positioning and proof points for real estate professionals.", category: "sales", format: "deck", productKey: "closeboss", isPartnerOnly: true },
  { key: "marketingboss-deck", title: "MarketingBoss AI Sales Deck", description: "Positioning for owners carrying marketing themselves.", category: "sales", format: "deck", productKey: "marketingboss", isPartnerOnly: true },
  { key: "helmsmart-deck", title: "HelmSmart AI Sales Deck", description: "Positioning for operators running multi-function businesses.", category: "sales", format: "deck", productKey: "helmsmart", isPartnerOnly: true },
  { key: "product-comparison", title: "Product Comparison Sheet", description: "Which product for which business, side by side.", category: "sales", format: "document", productKey: null, isPartnerOnly: true },
  { key: "demo-scripts", title: "Product Demo Scripts", description: "A demo structure per product, with the questions to ask first.", category: "sales", format: "document", productKey: null, isPartnerOnly: true },
  { key: "discovery-questions", title: "Customer Discovery Questions", description: "The questions that surface real operational pain.", category: "sales", format: "document", productKey: null, isPartnerOnly: true },
  { key: "product-demos", title: "Product Demos", description: "Recorded walkthroughs you can send or present live.", category: "sales", format: "video", productKey: null, isPartnerOnly: true },
  { key: "email-templates", title: "Email Templates", description: "Introduction, follow-up, demo recap and re-engagement.", category: "marketing", format: "template", productKey: null, isPartnerOnly: true },
  { key: "sms-templates", title: "SMS Templates", description: "Short, compliant follow-up messages.", category: "marketing", format: "template", productKey: null, isPartnerOnly: true },
  { key: "social-posts", title: "Social Media Post Library", description: "Professional posts about AI adoption you can publish as yourself.", category: "marketing", format: "template", productKey: null, isPartnerOnly: true },
  { key: "video-scripts", title: "Video Scripts", description: "Short explainer scripts for each product.", category: "marketing", format: "template", productKey: null, isPartnerOnly: true },
  { key: "promotional-graphics", title: "Promotional Graphics", description: "Brand-correct graphics sized for each channel.", category: "marketing", format: "graphics", productKey: null, isPartnerOnly: true },
  { key: "product-brochures", title: "Product Brochures", description: "Print and PDF one-pagers per product.", category: "marketing", format: "document", productKey: null, isPartnerOnly: true },
  { key: "referral-links", title: "Your Partner Links and QR Codes", description: "Your personal referral link, discount code and QR code, generated for you.", category: "marketing", format: "tool", productKey: null, isPartnerOnly: true },
  { key: "case-studies", title: "Customer Case Studies", description: "What businesses changed, and what happened after.", category: "proof", format: "document", productKey: null, isPartnerOnly: true },
  { key: "brand-kit", title: "Brand Kit", description: "Logos, colours and correct usage for AI Business Works and each product.", category: "brand", format: "graphics", productKey: null, isPartnerOnly: true },
  { key: "marketing-guidelines-doc", title: "Partner Marketing Guidelines", description: "What you may and may not claim. Read before you publish anything.", category: "compliance", format: "document", productKey: null, isPartnerOnly: false },
];
