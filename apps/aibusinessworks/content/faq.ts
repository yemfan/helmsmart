export interface FaqItem {
  id: string;
  question: string;
  answer: string[];
}

export interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}

/**
 * Rates and durations are deliberately absent from these answers. Anywhere a
 * number belongs, the page injects the live configured value from the
 * compensation plan so the FAQ can never drift from the plan.
 */
export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "program",
    title: "The Program",
    items: [
      {
        id: "what-is-it",
        question: "What is the AI Business Works Partner Program?",
        answer: [
          "It is a professional partner program for people who help businesses adopt AI. Partners learn the AI Business Works products, identify which businesses have a problem those products solve, make the introduction, and earn recurring commissions on qualifying customer subscriptions.",
          "AI Business Works is the master brand. CloseBoss AI, MarketingBoss AI and HelmSmart AI are the products a Partner can recommend today, and the ecosystem is built to add more.",
        ],
      },
      {
        id: "who-is-it-for",
        question: "Who is this for?",
        answer: [
          "People who already talk to business owners: consultants, agents, marketers, operators, technology resellers, and professionals with a network in a specific industry.",
          "It is not for people looking for passive income. Commissions follow customers, and customers follow real work: understanding a business, showing the right product, and helping it get adopted.",
        ],
      },
      {
        id: "technical",
        question: "Do I need to be technical?",
        answer: [
          "No. You need to understand what the products do and which business problems they address. The Partner Academy covers exactly that, product by product, and the resource library gives you the demos and materials to use.",
        ],
      },
      {
        id: "inventory",
        question: "Is there inventory, a purchase requirement, or a monthly minimum?",
        answer: [
          "No. There is no inventory, and Partners are not required to purchase a product in order to participate or to be paid on qualifying customer revenue. Program requirements are set out in the Partner Program Terms.",
        ],
      },
      {
        id: "cost",
        question: "What does it cost to become a Partner?",
        answer: [
          "Registration is free. If any fee is ever introduced for an optional service, it will be disclosed before you are asked to pay anything.",
        ],
      },
    ],
  },
  {
    id: "compensation",
    title: "Commissions",
    items: [
      {
        id: "how-paid",
        question: "How do commissions work?",
        answer: [
          "When a customer you referred subscribes to an AI Business Works product, you may receive a percentage of that customer's qualifying subscription revenue, at a rate that steps down over the commission period defined in the current plan.",
          "Commissions are calculated by the platform from actual billed revenue, not from list prices, and every calculation records the exact plan version and inputs used.",
        ],
      },
      {
        id: "qualifying-revenue",
        question: "What is qualifying revenue?",
        answer: [
          "Qualifying revenue is the portion of a customer's payment the plan makes commissionable. Under the current plan that means subscription revenue net of any customer discount, excluding taxes and account credits.",
          "Refunds and chargebacks reduce qualifying revenue and produce a corresponding reversal.",
        ],
      },
      {
        id: "when-paid",
        question: "When am I paid?",
        answer: [
          "Commissions post to your ledger as pending as soon as the underlying revenue is recorded. They become payable once approved and once your account clears the payout threshold and schedule set in the Commission Policy.",
        ],
      },
      {
        id: "cancel",
        question: "What happens if a customer cancels or refunds?",
        answer: [
          "Commission on the cancelled or refunded revenue is reversed under the applicable plan rules. Nothing is deleted: a reversal is posted as its own ledger entry so the history stays intact and explainable.",
        ],
      },
      {
        id: "changes",
        question: "Can the compensation plan change?",
        answer: [
          "Yes. Plans are versioned with effective dates, and administrators must state a transition rule when they introduce a new version.",
          "Under the default policy, a customer stays on the plan version in effect when they subscribed. Historical commissions are never recalculated under a newer plan.",
        ],
      },
    ],
  },
  {
    id: "leadership",
    title: "Leadership",
    items: [
      {
        id: "what-is-leadership",
        question: "What is the Leadership Override?",
        answer: [
          "A qualified Leader can earn an override on qualifying customer revenue generated by the Partners they personally developed, for a limited period per qualifying customer.",
          "The override is paid on customer revenue. Developing Partners who never produce customers produces no override.",
        ],
      },
      {
        id: "generations",
        question: "How many levels deep does the override go?",
        answer: [
          "One generation under the default plan. If your Direct Partner develops their own Partner, you do not receive an override on that third Partner's customers.",
        ],
      },
      {
        id: "qualify",
        question: "How do I qualify as a Leader?",
        answer: [
          "You need a minimum number of personally referred active paying customers, at least one active Direct Partner, the required Academy leadership training, good standing, and compliance with the Partner Program Terms. The current thresholds are shown on the Leadership page and are set by the active compensation plan.",
        ],
      },
    ],
  },
  {
    id: "customers",
    title: "Customers and Attribution",
    items: [
      {
        id: "attribution",
        question: "How is a customer attributed to me?",
        answer: [
          "Each Partner gets a personal referral link, a discount code and a QR code. A customer who arrives through your link or applies your code is attributed to you, and the attribution record stores which code, which visit and which subscription produced it.",
        ],
      },
      {
        id: "discount",
        question: "Do my customers get anything?",
        answer: [
          "Yes. Your code can carry a promotional customer discount set by the program. The customer receives the applicable discount and you receive commission on the qualifying revenue actually billed.",
        ],
      },
      {
        id: "existing",
        question: "What if the business is already an AI Business Works customer?",
        answer: [
          "An existing customer is not re-attributed. Attribution applies to new qualifying customers introduced by a Partner, as defined in the Partner Program Terms.",
        ],
      },
    ],
  },
  {
    id: "earnings",
    title: "Earnings and Claims",
    items: [
      {
        id: "typical",
        question: "What can I expect to earn?",
        answer: [
          "AI Business Works does not publish expected or typical earnings, and no one representing the program is permitted to promise you an income.",
          "Every figure shown on this site is an arithmetic illustration of the compensation structure applied to an assumed customer, price and retention period. Your results depend on the customers you actually introduce and retain.",
        ],
      },
      {
        id: "claims",
        question: "What am I allowed to say when I promote the program?",
        answer: [
          "You may describe the products, the compensation structure and your own verifiable experience. You may not make income claims, guarantee results, describe examples as typical, or imply that AI Business Works endorses a claim it has not reviewed.",
          "The Partner Marketing Guidelines set this out in full and apply to every Partner.",
        ],
      },
    ],
  },
];
