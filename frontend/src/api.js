import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const TOKEN_STORAGE_KEY = "noto_access_token";
export const USER_STORAGE_KEY = "noto_user";
export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export function getErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

export function getStoredUser() {
  try {
    const value = localStorage.getItem(USER_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}
