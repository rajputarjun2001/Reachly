import type { ChartOptions } from "chart.js";

const scaleDefaults = {
  x: {
    grid: { display: false },
    border: { display: false },
    ticks: {
      font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
      color: "#9CA3AF",
    },
  },
  y: {
    grid: { color: "rgba(0,0,0,.05)" },
    border: { display: false },
    ticks: {
      font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
      color: "#9CA3AF",
    },
  },
};

export const barChartDefaults: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { cornerRadius: 8, padding: 10 },
  },
  scales: scaleDefaults,
};

export const lineChartDefaults: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { cornerRadius: 8, padding: 10 },
  },
  scales: scaleDefaults,
};
