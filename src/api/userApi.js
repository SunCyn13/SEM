import api from "./axiosInstance";

export const getUser = (userId) => api.get(`/users/${userId}`);
export const createUser = (payload) => api.post("/users", payload);
export const createLineLinkCode = (userId) => api.post(`/users/${userId}/line/link-code`);
export const unlinkLine = (userId) => api.post(`/users/${userId}/line/unlink`);
export const updateLocation = (userId, payload) => api.patch(`/users/${userId}/location`, payload);
export const updateBudget = (userId, monthly_budget) =>
  api.patch(`/users/${userId}/budget`, { monthly_budget });
export const getBillPrediction = (userId) => api.get(`/users/${userId}/bill-prediction`);
