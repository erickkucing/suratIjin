"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { MonthlyChartData } from "@/db/queries";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface MonthlyBarChartProps {
  data: MonthlyChartData[];
}

export function MonthlyBarChart({ data }: MonthlyBarChartProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-[var(--border)] rounded-xl">
        <p className="text-sm font-medium text-[var(--ink-muted)]">
          Belum ada riwayat ketidakhadiran tercatat untuk ditampilkan pada grafik bulanan.
        </p>
      </div>
    );
  }

  const textColor = isDark ? "#A6B5AE" : "#4A5651";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";

  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Izin",
        data: data.map((d) => d.izin),
        backgroundColor: "#3B82F6",
        borderRadius: 4,
      },
      {
        label: "Sakit",
        data: data.map((d) => d.sakit),
        backgroundColor: "#1F6F54",
        borderRadius: 4,
      },
      {
        label: "Alpa",
        data: data.map((d) => d.alpa),
        backgroundColor: "#EF4444",
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: textColor,
          font: { family: "var(--font-jakarta)", size: 12 },
          boxWidth: 14,
          boxHeight: 14,
        },
      },
      tooltip: {
        backgroundColor: isDark ? "#192420" : "#FFFFFF",
        titleColor: isDark ? "#F3EFE6" : "#1E2A26",
        bodyColor: isDark ? "#A6B5AE" : "#4A5651",
        borderColor: isDark ? "#2C3E37" : "#E5DDCB",
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: {
        ticks: { color: textColor, font: { family: "var(--font-jakarta)", size: 11 } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
          font: { family: "var(--font-jakarta)", size: 11 },
          stepSize: 1,
        },
        grid: { color: gridColor },
      },
    },
  };

  return (
    <div className="w-full h-72">
      <Bar data={chartData} options={options} />
    </div>
  );
}
