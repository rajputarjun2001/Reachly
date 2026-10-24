"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { barChartDefaults } from "./chart-config";
import { formatDayLabel } from "@/lib/insights/aggregations";
import type { DayCount, OutreachDay } from "@/lib/insights/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function LeadsTrendChart({ series, emptyLabel }: { series: DayCount[]; emptyLabel?: string }) {
  const total = series.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <p className="color-muted text-sm" style={{ padding: "48px 0", textAlign: "center" }}>
        {emptyLabel ?? "No leads added in this period."}
      </p>
    );
  }
  const labels = series.map((d) => formatDayLabel(d.date));
  return (
    <div style={{ height: 180 }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: "Leads added",
              data: series.map((d) => d.count),
              backgroundColor: "rgba(99,102,241,.25)",
              borderColor: "#6366F1",
              borderWidth: 1.5,
              borderRadius: 4,
            },
          ],
        }}
        options={{ ...barChartDefaults, plugins: { legend: { display: false } } }}
      />
    </div>
  );
}

export function OutreachTrendChart({ series, emptyLabel }: { series: OutreachDay[]; emptyLabel?: string }) {
  const total = series.reduce((s, d) => s + d.sent + d.accepted + d.replied, 0);
  if (total === 0) {
    return (
      <p className="color-muted text-sm" style={{ padding: "48px 0", textAlign: "center" }}>
        {emptyLabel ?? "No outreach activity in this period."}
      </p>
    );
  }
  const labels = series.map((d) => (series.length > 7 ? d.date.slice(5) : formatDayLabel(d.date)));
  return (
    <div style={{ height: 200 }}>
      <Bar
        data={{
          labels,
          datasets: [
            { label: "Requests sent", data: series.map((d) => d.sent), backgroundColor: "rgba(99,102,241,.35)", borderRadius: 4 },
            { label: "Accepted", data: series.map((d) => d.accepted), backgroundColor: "#10B981", borderRadius: 4 },
            { label: "Replies", data: series.map((d) => d.replied), backgroundColor: "#F59E0B", borderRadius: 4 },
          ],
        }}
        options={{ ...barChartDefaults, plugins: { legend: { display: true, position: "bottom" } } }}
      />
    </div>
  );
}

export function CountBarChart({
  labels,
  values,
  datasetLabel,
  emptyLabel,
}: {
  labels: string[];
  values: number[];
  datasetLabel: string;
  emptyLabel?: string;
}) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <p className="color-muted text-sm" style={{ padding: "48px 0", textAlign: "center" }}>
        {emptyLabel ?? "No data yet."}
      </p>
    );
  }
  return (
    <div style={{ height: 180 }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: datasetLabel,
              data: values,
              backgroundColor: "#818CF8",
              borderRadius: 6,
            },
          ],
        }}
        options={{ ...barChartDefaults, plugins: { legend: { display: false } } }}
      />
    </div>
  );
}
