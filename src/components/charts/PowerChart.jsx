import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler
);

export default function PowerChart({ readings }) {
  const data = {
    labels: readings.map((r) =>
      new Date(r.timestamp).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    ),
    datasets: [
      {
        label: "kWh",
        data: readings.map((r) => Number(r.kwh)),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.15)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#8b96b1" } } },
    scales: {
      x: { ticks: { color: "#8b96b1", maxTicksLimit: 8 }, grid: { color: "#1f2a44" } },
      y: { ticks: { color: "#8b96b1" }, grid: { color: "#1f2a44" } },
    },
  };

  return (
    <div style={{ height: 320 }}>
      <Line data={data} options={options} />
    </div>
  );
}