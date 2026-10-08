const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) throw new Error("Set NEXT_PUBLIC_API_URL in frontend/.env.local before starting the frontend.");
export const API_URL = apiUrl.replace(/\/$/, "");
