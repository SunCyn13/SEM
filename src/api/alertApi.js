import api from "./axiosInstance";

export const getAlertsByUser = (userId) => api.get(`/alerts/${userId}`);
export const resolveAlert = (alertId) => api.patch(`/alerts/${alertId}/resolve`);