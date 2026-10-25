"use client";

import { useState, useEffect } from "react";
import { X, Users, Plus, Upload, Edit2, Check, Archive, Loader2, AlertCircle } from "lucide-react";
import { Student } from "@/db/schema";
import {
  addStudentAction,
  updateStudentAction,
  toggleStudentActiveAction,
  bulkAddStudentsAction,
} from "@/actions/class-settings";

interface StudentRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  classNameTitle: string;
  studentsList: Student[];
  onSuccess: () => void;
}

export function StudentRosterModal({
  isOpen,
  onClose,
  classId,
  classNameTitle,
  studentsList,
  onSuccess,
}: StudentRosterModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "add" | "bulk">("list");
  const [search, setSearch] = useState("");

  // Single Add
  const [newName, setNewName] = useState("");
  const [newNis, setNewNis] = useState("");

  // Bulk Add
  const [bulkText, setBulkText] = useState("");

  // Edit Single
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editNis, setEditNis] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("list");
      setSearch("");
      setNewName("");
      setNewNis("");
      setBulkText("");
      setEditingStudentId(null);
      setMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await addStudentAction(classId, newName, newNis);
      if (!res.success) throw new Error(res.error);
      setMessage({ text: "Siswa berhasil ditambahkan.", isError: false });
      setNewName("");
      setNewNis("");
      onSuccess();
      setActiveTab("list");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal menambahkan siswa.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = bulkText
      .split(/[\r\n,]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      setMessage({ text: "Masukkan minimal 1 nama siswa.", isError: true });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await bulkAddStudentsAction(classId, names);
      if (!res.success) throw new Error(res.error);
      setMessage({ text: res.message || "Siswa berhasil diimpor.", isError: false });
      setBulkText("");
      onSuccess();
      setActiveTab("list");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal impor siswa.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (studentId: number) => {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      const res = await updateStudentAction(studentId, editName, editNis);
      if (!res.success) throw new Error(res.error);
      setEditingStudentId(null);
      onSuccess();
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal memperbarui siswa.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleArchive = async (student: Student) => {
    setLoading(true);
    try {
      const res = await toggleStudentActiveAction(student.id, !student.isActive);
      if (!res.success) throw new Error(res.error);
      onSuccess();
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal mengubah status siswa.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = studentsList.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.nis && s.nis.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-roster-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl my-6 bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[var(--board)] text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 id="student-roster-title" className="text-lg font-bold font-heading">
                Kelola Daftar Siswa: {classNameTitle}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Total {studentsList.length} siswa terdaftar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-[var(--surface)] px-6 pt-3 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
              activeTab === "list"
                ? "border-[var(--board)] text-[var(--board)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Daftar Siswa ({studentsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
              activeTab === "add"
                ? "border-[var(--board)] text-[var(--board)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            + Tambah Siswa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
              activeTab === "bulk"
                ? "border-[var(--board)] text-[var(--board)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Impor Massal (Excel/Teks)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          {message && (
            <div
              className={`p-3 rounded-xl border text-sm font-medium ${
                message.isError
                  ? "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* TAB 1: LIST */}
          {activeTab === "list" && (
            <div className="space-y-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau NIS siswa..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />

              <div className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] overflow-hidden">
                {filteredStudents.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                    Tidak ada siswa yang ditemukan.
                  </div>
                ) : (
                  filteredStudents.map((st, idx) => {
                    const isEditing = editingStudentId === st.id;
                    return (
                      <div
                        key={st.id}
                        className="flex items-center justify-between p-3 bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] transition-colors"
                      >
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2 mr-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 px-2.5 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                            />
                            <input
                              type="text"
                              value={editNis}
                              onChange={(e) => setEditNis(e.target.value)}
                              placeholder="NIS"
                              className="w-24 px-2.5 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(st.id)}
                              disabled={loading}
                              className="p-1.5 rounded bg-emerald-600 text-white"
                              title="Simpan"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStudentId(null)}
                              className="p-1.5 rounded border border-[var(--border)] text-[var(--ink-muted)]"
                              title="Batal"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-[var(--ink-subtle)] w-6 text-right">
                              {idx + 1}.
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-[var(--ink)]">
                                {st.name}
                              </p>
                              {st.nis && (
                                <p className="text-xs text-[var(--ink-muted)]">NIS: {st.nis}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStudentId(st.id);
                                setEditName(st.name);
                                setEditNis(st.nis || "");
                              }}
                              className="touch-target p-1.5 text-[var(--ink-muted)] hover:text-[var(--board)] rounded"
                              title="Edit Nama/NIS"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleArchive(st)}
                              className="touch-target p-1.5 text-[var(--ink-muted)] hover:text-red-500 rounded"
                              title={st.isActive ? "Arsipkan Siswa" : "Aktifkan Siswa"}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ADD SINGLE */}
          {activeTab === "add" && (
            <form onSubmit={handleAddSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1">
                  Nama Lengkap Siswa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Ahmad Dahlan"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1">
                  NIS (Nomor Induk Siswa) - Opsional
                </label>
                <input
                  type="text"
                  value={newNis}
                  onChange={(e) => setNewNis(e.target.value)}
                  placeholder="Contoh: 102938"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="touch-target flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Tambahkan Siswa</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: BULK IMPORT */}
          {activeTab === "bulk" && (
            <form onSubmit={handleBulkAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1">
                  Tempel Daftar Nama Siswa (1 Nama per Baris)
                </label>
                <textarea
                  rows={8}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Ahmad Dahlan&#10;Budi Santoso&#10;Citra Lestari&#10;Dedi Kurniawan"
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  required
                />
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Anda dapat menyalin kolom nama langsung dari Microsoft Excel atau Google Sheets.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="touch-target flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Impor Semua Siswa</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
