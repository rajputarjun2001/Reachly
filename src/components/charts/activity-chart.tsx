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

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function ActivityChart() {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={{ height: 180 }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: "Sent",
              data: [10, 10, 10, 10, 10, 0, 0],
              backgroundColor: "rgba(99,102,241,.15)",
              borderColor: "#6366F1",
              borderWidth: 1.5,
              borderRadius: 4,
            },
            {
              label: "Accepted",
              data: [3, 4, 5, 4, 3, 0, 0],
              backgroundColor: "#6366F1",
              borderRadius: 4,
            },
          ],
        }}
        options={{
          ...barChartDefaults,
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              labels: {
                usePointStyle: true,
                padding: 16,
                font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
              },
            },
            tooltip: barChartDefaults.plugins?.tooltip,
          },
        }}
      />
    </div>
  );
}
