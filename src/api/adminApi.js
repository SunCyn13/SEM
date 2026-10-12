import api from "./axiosInstance";

export const getAdminOverview = (adminId) =>
  api.get("/admin/overview", { params: { admin_id: adminId } });
