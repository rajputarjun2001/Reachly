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

export function BestDaysChart() {
  return (
    <div style={{ height: 180 }}>
      <Bar
        data={{
          labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          datasets: [
            {
              data: [42, 38, 45, 41, 32, 5, 3],
              backgroundColor: [
                "#6366F1",
                "#818CF8",
                "#6366F1",
                "#818CF8",
                "#A5B4FC",
                "#C7D2FE",
                "#E0E7FF",
              ],
              borderRadius: 6,
            },
          ],
        }}
        options={barChartDefaults}
      />
    </div>
  );
}

export function ReplyByStepChart() {
  return (
    <div style={{ height: 180 }}>
      <Bar
        data={{
          labels: ["Connection Note", "Msg 1 (Day 3)", "Msg 2 (Day 7)"],
          datasets: [
            {
              data: [0, 24, 31],
              backgroundColor: ["#E0E7FF", "#818CF8", "#6366F1"],
              borderRadius: 6,
            },
          ],
        }}
        options={{ ...barChartDefaults, indexAxis: "y" as const }}
      />
    </div>
  );
}
