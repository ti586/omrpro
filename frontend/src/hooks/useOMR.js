// src/hooks/useOMR.js
// Real-time OMR processing hook with Socket.IO progress tracking

import { useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { cardAPI } from '../services/api.js';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000';

/**
 * useOMR(examId)
 *
 * Returns:
 *   - upload(files)   → triggers batch upload + OMR processing
 *   - cards           → real-time list of processed cards
 *   - progress        → { total, done, errors, percent }
 *   - isProcessing    → boolean
 *   - reset()         → clear state
 */
export function useOMR(examId) {
  const [cards, setCards]           = useState([]);
  const [progress, setProgress]     = useState({ total: 0, done: 0, errors: 0, percent: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const socketRef = useRef(null);
  const totalRef  = useRef(0);
  const doneRef   = useRef(0);
  const errRef    = useRef(0);

  // Connect WebSocket and join exam room
  useEffect(() => {
    if (!examId) return;

    const socket = io(WS_URL, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.emit('join:exam', examId);

    socket.on('card_processing', ({ cardId }) => {
      setCards((prev) =>
        prev.map((c) => c.id === cardId ? { ...c, status: 'processing' } : c),
      );
    });

    socket.on('card_graded', ({ cardId, totalScore, percentage, confidence, warnings }) => {
      doneRef.current += 1;
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, status: 'graded', totalScore, percentage, confidence, warnings }
            : c,
        ),
      );
      const percent = Math.round((doneRef.current / totalRef.current) * 100);
      setProgress({ total: totalRef.current, done: doneRef.current, errors: errRef.current, percent });
      if (doneRef.current + errRef.current >= totalRef.current) {
        setIsProcessing(false);
      }
    });

    socket.on('card_error', ({ cardId, error }) => {
      errRef.current += 1;
      setCards((prev) =>
        prev.map((c) => c.id === cardId ? { ...c, status: 'error', error } : c),
      );
      const percent = Math.round((doneRef.current / totalRef.current) * 100);
      setProgress({ total: totalRef.current, done: doneRef.current, errors: errRef.current, percent });
    });

    return () => socket.disconnect();
  }, [examId]);

  const upload = useCallback(
    async (files) => {
      if (!files?.length || !examId) return;

      setIsProcessing(true);
      totalRef.current = files.length;
      doneRef.current  = 0;
      errRef.current   = 0;
      setProgress({ total: files.length, done: 0, errors: 0, percent: 0 });

      // Add pending cards to state immediately for UI feedback
      const pendingCards = Array.from(files).map((f, i) => ({
        id:       `pending-${i}`,
        fileName: f.name,
        status:   'pending',
      }));
      setCards(pendingCards);

      const formData = new FormData();
      formData.append('examId', examId);
      Array.from(files).forEach((f) => formData.append('images', f));

      try {
        const { data } = await cardAPI.uploadBatch(formData, (evt) => {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setUploadProgress(pct);
        });

        // Replace pending cards with real card IDs from server
        setCards(
          data.cards.map((c) => ({
            id:         c.id,
            fileName:   c.fileName,
            studentName:c.studentName,
            status:     'queued',
          })),
        );
        totalRef.current = data.cards.length;
      } catch (err) {
        setIsProcessing(false);
        setCards([]);
        throw err;
      }
    },
    [examId],
  );

  const reset = useCallback(() => {
    setCards([]);
    setProgress({ total: 0, done: 0, errors: 0, percent: 0 });
    setIsProcessing(false);
    setUploadProgress(0);
    totalRef.current = 0;
    doneRef.current  = 0;
    errRef.current   = 0;
  }, []);

  return { upload, cards, progress, isProcessing, uploadProgress, reset };
}

/**
 * useExamReport(examId)
 * Fetches exam report data and provides export helpers.
 */
export function useExamReport(examId) {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const fetchReport = useCallback(async (classId) => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    try {
      const { reportAPI } = await import('../services/api.js');
      const { data } = await reportAPI.examReport(examId, { classId });
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Erro ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportExcel = useCallback(async (classId) => {
    const { reportAPI } = await import('../services/api.js');
    const { data } = await reportAPI.exportExcel(examId, { classId });
    downloadBlob(data, `relatorio-${examId.slice(0, 8)}.xlsx`);
  }, [examId]);

  const exportPDF = useCallback(async (classId) => {
    const { reportAPI } = await import('../services/api.js');
    const { data } = await reportAPI.exportPDF(examId, { classId });
    downloadBlob(data, `relatorio-${examId.slice(0, 8)}.pdf`);
  }, [examId]);

  return { report, loading, error, fetchReport, exportExcel, exportPDF };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
