import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (error) => {
    const detail = error.response?.data?.detail;
    error.userMessage =
      typeof detail === "string"
        ? detail
        : error.response
        ? `Server error ${error.response.status}`
        : "เชื่อมต่อ backend ไม่ได้ (เช็คว่า uvicorn รันอยู่)";
    return Promise.reject(error);
  }
);

export default axiosInstance;