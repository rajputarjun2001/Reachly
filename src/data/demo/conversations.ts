/** Demo Unibox conversations — illustrative only. */

export type DemoMessage = {
  id: string;
  type: "sent" | "recv" | "divider";
  text?: string;
  time?: string;
  divider?: string;
};

export type DemoConversation = {
  id: string;
  name: string;
  initials: string;
  avatarColor?: string;
  preview: string;
  time: string;
  unread?: boolean;
  title: string;
  company: string;
  campaign: string;
  messages: DemoMessage[];
};

export const demoConversations: DemoConversation[] = [
  {
    id: "rohan-kapoor",
    name: "Rohan Kapoor",
    initials: "RK",
    preview: "That sounds really interesting! I'd love to learn more about the…",
    time: "2h",
    unread: true,
    title: "Head of Sales",
    company: "ZoomInfo",
    campaign: "SaaS Founders India campaign",
    messages: [
      { id: "d1", type: "divider", divider: "Oct 8, 2026 · Connection request sent" },
      {
        id: "m1",
        type: "sent",
        text:
          "Hi Rohan, I noticed your work in the SaaS space and would love to connect. Building something in the AEC/PropTech intersection — would value your perspective.",
        time: "Oct 8",
      },
      {
        id: "d2",
        type: "divider",
        divider: "Oct 11, 2026 · Connection accepted · Follow-up message sent",
      },
      {
        id: "m2",
        type: "sent",
        text:
          "Thanks for connecting, Rohan! Quick context — I'm building iDesign.Market, an ERP for interior designers. Curious what tools your teams use for project ops?",
        time: "Oct 11",
      },
      {
        id: "m3",
        type: "recv",
        text:
          "That sounds really interesting! I'd love to learn more about the product. We actually work with a few architecture firms and they're always complaining about project management.",
        time: "Oct 11",
      },
      {
        id: "m4",
        type: "sent",
        text:
          "Great! Would you be open to a 20-min demo next week? Happy to show you how we cut invoicing time by 80% for a 50-person design firm.",
        time: "Oct 12",
      },
      { id: "m5", type: "recv", text: "Absolutely, send me a Calendly link!", time: "2h ago" },
    ],
  },
  {
    id: "priya-sharma",
    name: "Priya Sharma",
    initials: "PS",
    avatarColor: "#10B981",
    preview: "Hey Ashish, thanks for connecting. Yes I'm familiar with AEC…",
    time: "1d",
    title: "Product Manager",
    company: "Notion",
    campaign: "SaaS Founders India campaign",
    messages: [],
  },
  {
    id: "vikram-rao",
    name: "Vikram Rao",
    initials: "VR",
    avatarColor: "#F59E0B",
    preview: "We actually use something similar but it's not integrated…",
    time: "2d",
    unread: true,
    title: "Director",
    company: "Freshworks",
    campaign: "AEC Decision Makers",
    messages: [],
  },
  {
    id: "meera-gupta",
    name: "Meera Gupta",
    initials: "MG",
    avatarColor: "#6366F1",
    preview: "Would love a demo. Can we do Friday at 3pm?",
    time: "3d",
    title: "VP Sales",
    company: "HubSpot",
    campaign: "SaaS Founders India campaign",
    messages: [],
  },
  {
    id: "karan-singh",
    name: "Karan Singh",
    initials: "KS",
    avatarColor: "#EF4444",
    preview: "Not really the right fit for us right now, but will keep in…",
    time: "4d",
    title: "CEO",
    company: "Meesho",
    campaign: "Interior Design Studio Owners",
    messages: [],
  },
];
