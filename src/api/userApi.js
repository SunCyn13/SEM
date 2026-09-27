import api from "./axiosInstance";

export const getUser = (userId) => api.get(`/users/${userId}`);
export const createLineLinkCode = (userId) => api.post(`/users/${userId}/line/link-code`);
export const unlinkLine = (userId) => api.post(`/users/${userId}/line/unlink`);
export const updateLocation = (userId, payload) => api.patch(`/users/${userId}/location`, payload);