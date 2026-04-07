/**
 * frontend/src/utils/apiClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client HTTP pentru comunicarea cu backend-ul VotSecure.
 * Responsabilitate: abstractizarea cererilor fetch, gestionarea token-ului JWT
 *                   și tratarea uniformă a erorilor.
 */

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// ─── Helper intern ────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("votsecure_token");
}

async function request(method, path, body = null, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Eroare ${response.status}`);
  }
  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authAPI = {
  register: (payload) => request("POST", "/auth/register", payload, false),
  login:    (payload) => request("POST", "/auth/login",    payload, false),
  logout:   ()        => request("POST", "/auth/logout"),
  me:       ()        => request("GET",  "/auth/me"),
};

// ─── Vote ────────────────────────────────────────────────────────────────────

export const voteAPI = {
  castVote:     (payload)    => request("POST", "/vote/cast", payload),
  getElections: ()           => request("GET",  "/vote/elections"),
  getElection:  (id)         => request("GET",  `/vote/elections/${id}`),
  getResults:   (id)         => request("GET",  `/vote/elections/${id}/results`),
  verifyReceipt:(payload)    => request("POST", "/vote/verify", payload),
};

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminAPI = {
  createElection: (payload) => request("POST",  "/admin/elections",      payload),
  closeElection:  (id)      => request("PATCH", `/admin/elections/${id}/close`),
  getUsers:       (search)  => request("GET",   `/admin/users?search=${search || ""}`),
  getAuditLog:    (limit)   => request("GET",   `/admin/audit?limit=${limit || 100}`),
  getStats:       ()        => request("GET",   "/admin/stats"),
};

// ─── Token management ────────────────────────────────────────────────────────

export function saveToken(token) {
  localStorage.setItem("votsecure_token", token);
}

export function clearToken() {
  localStorage.removeItem("votsecure_token");
}

export function hasToken() {
  return !!getToken();
}
