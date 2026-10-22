/** Demo campaign data — illustrative only. */
export type CampaignStatus = "active" | "paused" | "draft" | "completed";

export type DemoCampaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  leads: number;
  sent: number;
  accepted: number;
  replies: number;
  meetings: number;
  startedLabel: string;
  sequenceSteps: number;
  accountName: string;
};

export const demoCampaigns: DemoCampaign[] = [
  {
    id: "saas-founders-india",
    name: "SaaS Founders India",
    status: "active",
    leads: 200,
    sent: 144,
    accepted: 52,
    replies: 14,
    meetings: 4,
    startedLabel: "Started Oct 8",
    sequenceSteps: 3,
    accountName: "Ashish Dhingra",
  },
  {
    id: "aec-decision-makers",
    name: "AEC Decision Makers",
    status: "active",
    leads: 350,
    sent: 157,
    accepted: 61,
    replies: 12,
    meetings: 3,
    startedLabel: "Started Oct 12",
    sequenceSteps: 2,
    accountName: "Ashish Dhingra",
  },
  {
    id: "interior-design-studios",
    name: "Interior Design Studio Owners",
    status: "paused",
    leads: 180,
    sent: 180,
    accepted: 69,
    replies: 18,
    meetings: 5,
    startedLabel: "Started Sep 20",
    sequenceSteps: 3,
    accountName: "Ashish Dhingra",
  },
];

export function getCampaignById(id: string): DemoCampaign | undefined {
  return demoCampaigns.find((c) => c.id === id);
}
