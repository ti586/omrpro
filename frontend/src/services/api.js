// src/services/api.js — Axios API client with JWT interceptors
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: refresh });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// ── Auth ─────────────────────────────────────────────────────
export const authAPI = {
  login:   (email, password) => api.post('/auth/login', { email, password }),
  logout:  ()                => api.post('/auth/logout'),
  me:      ()                => api.get('/auth/me'),
  register:(data)            => api.post('/auth/register', data),
};

// ── Exams ─────────────────────────────────────────────────────
export const examAPI = {
  list:           (params)    => api.get('/exams', { params }),
  get:            (id)        => api.get(`/exams/${id}`),
  create:         (data)      => api.post('/exams', data),
  update:         (id, data)  => api.patch(`/exams/${id}`, data),
  publish:        (id)        => api.post(`/exams/${id}/publish`),
  nullifyQuestion:(id, qId)   => api.post(`/exams/${id}/nullify-question`, { questionId: qId }),
  generatePDF:    (id, params)=> api.get(`/exams/${id}/generate-pdf`, { params, responseType: 'blob' }),
};

// ── Cards / OMR ────────────────────────────────────────────────
export const cardAPI = {
  list:        (examId, params) => api.get(`/cards`, { params: { examId, ...params } }),
  upload:      (formData)       => api.post('/omr/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => e.loaded,
  }),
  uploadBatch: (formData, onProgress) => api.post('/omr/upload-batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  }),
  get:         (id)     => api.get(`/cards/${id}`),
  review:      (id, data) => api.patch(`/cards/${id}/review`, data),
  retry:       (id)     => api.post(`/cards/${id}/retry`),
};

// ── Reports ────────────────────────────────────────────────────
export const reportAPI = {
  examReport:    (id, params)   => api.get(`/reports/exam/${id}`, { params }),
  exportExcel:   (id, params)   => api.get(`/reports/exam/${id}/export-excel`, { params, responseType: 'blob' }),
  exportPDF:     (id, params)   => api.get(`/reports/exam/${id}/export-pdf`, { params, responseType: 'blob' }),
  dashboard:     ()              => api.get('/reports/dashboard'),
};

// ── Students ───────────────────────────────────────────────────
export const studentAPI = {
  list:   (params) => api.get('/students', { params }),
  get:    (id)     => api.get(`/students/${id}`),
  create: (data)   => api.post('/students', data),
  import: (file)   => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/students/import-csv', fd);
  },
};

// ── Schools ────────────────────────────────────────────────────
export const schoolAPI = {
  list:   ()         => api.get('/schools'),
  get:    (id)       => api.get(`/schools/${id}`),
  update: (id, data) => api.patch(`/schools/${id}`, data),
};

// ── Classes ────────────────────────────────────────────────────
export const classAPI = {
  list:   (params) => api.get('/classes', { params }),
  create: (data)   => api.post('/classes', data),
  update: (id, d)  => api.patch(`/classes/${id}`, d),
};

// ── Subjects ───────────────────────────────────────────────────
export const subjectAPI = {
  list: (params) => api.get('/subjects', { params }),
};
