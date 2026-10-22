"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { lineChartDefaults } from "./chart-config";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

export function DetailActivityChart() {
  const labels = [
    "Oct 8",
    "Oct 9",
    "Oct 10",
    "Oct 11",
    "Oct 12",
    "Oct 13",
    "Oct 14",
    "Oct 15",
    "Oct 16",
    "Oct 17",
    "Oct 18",
    "Oct 19",
    "Oct 20",
    "Oct 21",
  ];
  return (
    <div style={{ height: 160 }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              data: [0, 10, 10, 10, 10, 0, 0, 10, 10, 10, 10, 10, 0, 0],
              borderColor: "#6366F1",
              backgroundColor: "rgba(99,102,241,.08)",
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: "#6366F1",
            },
          ],
        }}
        options={lineChartDefaults}
      />
    </div>
  );
}
