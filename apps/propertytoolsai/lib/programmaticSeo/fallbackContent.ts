import type { ProgrammaticSeoLocation, ProgrammaticSeoPayload, ProgrammaticSeoTool } from "./types";

function locality(tool: ProgrammaticSeoTool, loc: ProgrammaticSeoLocation) {
  return `${loc.city}, ${loc.state}`;
}

/**
 * Deterministic, SEO-complete copy when OpenAI is off or fails.
 * Targets ~800–1,000 words across sections + FAQs.
 */
export function buildFallbackPayload(tool: ProgrammaticSeoTool, loc: ProgrammaticSeoLocation): ProgrammaticSeoPayload {
  const L = locality(tool, loc);
  const name = tool.name;
  const lower = name.toLowerCase();

  const insights = [
    `Use our free ${lower} with ${L} in mind—adjust assumptions to match your neighborhood, taxes, and insurance.`,
    `Cap rates, payments, and cash flow change by market. ${loc.city} buyers and investors often compare multiple scenarios before making an offer.`,
    `Start with conservative numbers (vacancy, repairs, rate buffers). If the deal still works, you have more confidence to move forward.`,
  ];

  const sections: ProgrammaticSeoPayload["sections"] = [
    {
      heading: `Why ${name} matters in ${L}`,
      paragraphs: [
        `Whether you are buying your first home, adding a rental, or refinancing in ${loc.city}, numbers drive better decisions. Our ${lower} helps you translate list prices, rents, and monthly costs into clear outcomes you can discuss with a lender or agent.`,
        `National averages rarely match ${loc.state} neighborhoods. Taxes, insurance, HOA fees, and rent growth vary block by block. This page is built to pair local intent (${L}) with a tool you can run in minutes on mobile.`,
      ],
    },
    {
      heading: `How to use this tool`,
      paragraphs: [
        `Open the full ${name} using the button below. Enter the numbers you know today—purchase price, down payment, interest rate, rent, or operating expenses depending on the calculator. Leave blanks only where you truly do not have data; rough estimates still beat guessing.`,
        `Run at least two scenarios: a “base case” and a “stress case” with higher expenses or lower rent. If the stress case still meets your goals, you have margin. If not, revisit price, terms, or the property itself.`,
        `Save or screenshot your results if you are touring homes in ${loc.city} this weekend. Consistent inputs make it easier to compare listings apples to apples.`,
      ],
    },
    {
      heading: `Tips for ${loc.state} buyers and investors`,
      paragraphs: [
        `Insurance and property tax assumptions move outcomes quickly—especially in markets with higher replacement costs or special assessments. Build a small repair reserve for older inventory common in urban ${loc.state} submarkets.`,
        `If you are investing, pair yield metrics with liquidity: how fast could you lease the unit at market rent? Check recent rentals near your target ZIP in ${loc.city} before trusting pro-forma rent.`,
        `For financing, confirm whether you are quoting APR vs. rate, and whether PMI applies. Small rate changes alter affordability more than many buyers expect.`,
      ],
    },
    {
      heading: `${loc.city} market context`,
      paragraphs: [
        `Local rules and costs move outcomes more than national headlines. If you are evaluating ${L} specifically, stress-test for anything that applies in your market—rent regulation where it exists, special assessments or bonds baked into the tax bill, and HOA budgets on condos and townhomes.`,
        `High-demand submarkets often trade at lower cap rates but hold long-term demand; more affordable areas may show higher yields with a different risk profile. For current ${loc.state} figures—typical home value, median sale price, days on market—see our local market data for ${loc.city}. Use the calculator and real numbers, not headlines, to judge your deal.`,
      ],
    },
    {
      heading: `When to talk to a professional`,
      paragraphs: [
        `Calculators educate; they do not replace licensed advice. For offers, disclosures, and loan approval, work with a local real estate agent and mortgage professional who knows ${L}.`,
        `If you need a deeper valuation narrative, explore our home value and CMA tools after you run this ${lower}.`,
      ],
    },
  ];

  const faqs: ProgrammaticSeoPayload["faqs"] = [
    {
      question: `Is the ${name} free?`,
      answer: `Yes. PropertyTools AI offers free calculators you can use without signing up. Optional features may prompt you to save results or request a report.`,
    },
    {
      question: `Does this replace an appraisal or loan approval?`,
      answer: `No. Outputs are estimates for planning. Lenders use their own underwriting; appraisers determine value for the transaction.`,
    },
    {
      question: `How local is the math for ${L}?`,
      answer: `You enter the numbers that reflect your property and ${loc.city} market. The tool does not auto-pull private tax bills—use your best estimate or ask your agent for comps.`,
    },
    {
      question: `Can investors use this for rentals?`,
      answer: `Yes. Investors often combine cap rate, cash flow, and ROI calculators. Start here, then open related tools linked on this page.`,
    },
    {
      question: `What if interest rates change?`,
      answer: `Re-run the calculator. Small rate moves change buying power; modeling helps you set limits before you shop.`,
    },
    {
      question: `How do I share results?`,
      answer: `Use your browser share tools or copy inputs into a note. Some flows support shareable links where enabled.`,
    },
    {
      question: `Where can I get a full property report?`,
      answer: `Use the “Get a report” call-to-action to request a richer breakdown when available, or explore our home value and CMA tools.`,
    },
  ];

  return { insights, sections, faqs, source: "fallback" };
}
