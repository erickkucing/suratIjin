"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Users,
  Plus,
  Upload,
  Edit2,
  Check,
  Archive,
  Trash2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  AlertCircle,
  Download,
} from "lucide-react";
import { Student } from "@/db/schema";
import {
  addStudentAction,
  updateStudentAction,
  toggleStudentActiveAction,
  deleteStudentAction,
  bulkAddStudentsAction,
  bulkImportStudentsAction,
  deleteAllStudentsAction,
} from "@/actions/class-settings";
import { exportStudentRosterExcel, downloadStudentImportTemplate } from "@/lib/export-excel";
import { toTitleCase } from "@/lib/string-utils";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

interface StudentRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  classNameTitle: string;
  studentsList: Student[];
  logoUrl?: string | null;
  onSuccess: () => void;
}

export function StudentRosterModal({
  isOpen,
  onClose,
  classId,
  classNameTitle,
  studentsList,
  logoUrl,
  onSuccess,
}: StudentRosterModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "add" | "bulk">("list");
  const [search, setSearch] = useState("");

  // Single Add
  const [newName, setNewName] = useState("");
  const [newNis, setNewNis] = useState("");

  // Bulk Add (Text / Excel)
  const [bulkMode, setBulkMode] = useState<"file" | "text">("file");
  const [bulkText, setBulkText] = useState("");
  const [excelStudents, setExcelStudents] = useState<{ name: string; nis?: string }[]>([]);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);

  // Edit Single
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editNis, setEditNis] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Delete All Students Confirmation
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
  });

  useEffect(() => {
    if (isOpen) {
      setActiveTab("list");
      setSearch("");
      setNewName("");
      setNewNis("");
      setBulkText("");
      setExcelStudents([]);
      setExcelFileName(null);
      setEditingStudentId(null);
      setMessage(null);
      setShowDeleteAllModal(false);
      setDeleteConfirmInput("");
      setIsDeletingAll(false);
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

  const handleBulkTextAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = bulkText
      .split(/[\r\n,]+/)
      .map((n) => toTitleCase(n.trim()))
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

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);
    setExcelFileName(file.name);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("File Excel tidak memiliki lembar kerja (worksheet).");
      }

      let nameColIdx = -1;
      let nisColIdx = -1;
      let headerRowIdx = -1;

      // Scan first 5 rows for header row
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 5 && nameColIdx === -1) {
          row.eachCell((cell, colNumber) => {
            const val = String(cell.value || "").toLowerCase().trim();
            if (val.includes("nama") || val.includes("name") || val.includes("siswa")) {
              nameColIdx = colNumber;
              headerRowIdx = rowNumber;
            }
            if (val.includes("nis") || val.includes("induk")) {
              nisColIdx = colNumber;
            }
          });
        }
      });

      const extracted: { name: string; nis?: string }[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (headerRowIdx !== -1 && rowNumber <= headerRowIdx) {
          return;
        }

        let name = "";
        let nis = "";

        if (nameColIdx !== -1) {
          name = String(row.getCell(nameColIdx).value || "").trim();
          if (nisColIdx !== -1) {
            nis = String(row.getCell(nisColIdx).value || "").trim();
          }
        } else {
          const cells: string[] = [];
          row.eachCell((cell) => {
            const v = String(cell.value || "").trim();
            if (v) cells.push(v);
          });

          if (cells.length === 1) {
            name = cells[0];
          } else if (cells.length >= 2) {
            if (/^\d+$/.test(cells[0]) && cells[0].length >= 3 && isNaN(Number(cells[1]))) {
              nis = cells[0];
              name = cells[1];
            } else if (isNaN(Number(cells[0]))) {
              name = cells[0];
              if (/^\d+$/.test(cells[1])) nis = cells[1];
            } else if (cells.length >= 3 && isNaN(Number(cells[2]))) {
              nis = cells[1];
              name = cells[2];
            }
          }
        }

        name = name.replace(/^(\d+[\.\)]\s*)+/, "").trim();
        if (name.length >= 2 && !name.toLowerCase().startsWith("no") && !name.toLowerCase().startsWith("nama")) {
          extracted.push({ name: toTitleCase(name), nis: nis || undefined });
        }
      });

      if (extracted.length === 0) {
        throw new Error("Tidak dapat menemukan daftar nama siswa dari file Excel tersebut.");
      }

      setExcelStudents(extracted);
      setMessage({
        text: `Berhasil memindai ${extracted.length} siswa dari "${file.name}". Klik "Simpan Siswa ke Kelas" untuk menyimpan.`,
        isError: false,
      });
    } catch (err: unknown) {
      console.error("Excel parse error:", err);
      setMessage({
        text: err instanceof Error ? err.message : "Gagal membaca file Excel.",
        isError: true,
      });
      setExcelStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmExcelImport = async () => {
    if (excelStudents.length === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await bulkImportStudentsAction(classId, excelStudents);
      if (!res.success) throw new Error(res.error);
      setMessage({ text: res.message || "Data siswa berhasil diimpor.", isError: false });
      setExcelStudents([]);
      setExcelFileName(null);
      onSuccess();
      setActiveTab("list");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal mengimpor siswa.",
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

  const handleDeleteStudent = async (student: Student) => {
    if (confirm(`Yakin ingin menghapus siswa "${student.name}" secara permanen? Data ketidakhadiran terkait juga akan terhapus.`)) {
      setLoading(true);
      try {
        const res = await deleteStudentAction(student.id);
        if (!res.success) throw new Error(res.error);
        setMessage({ text: res.message || "Siswa berhasil dihapus.", isError: false });
        onSuccess();
      } catch (err: unknown) {
        setMessage({
          text: err instanceof Error ? err.message : "Gagal menghapus siswa.",
          isError: true,
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExportRoster = async () => {
    try {
      await exportStudentRosterExcel({
        classNameTitle,
        studentsList,
        logoUrl,
      });
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal mengunduh Excel daftar siswa.",
        isError: true,
      });
    }
  };

  const handleConfirmDeleteAll = async () => {
    if (deleteConfirmInput.trim() !== "HAPUS") return;
    setIsDeletingAll(true);
    try {
      const res = await deleteAllStudentsAction(classId);
      if (!res.success) throw new Error(res.error);
      setMessage({ text: res.message || "Seluruh data siswa berhasil dihapus.", isError: false });
      setShowDeleteAllModal(false);
      setDeleteConfirmInput("");
      onSuccess();
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal menghapus seluruh siswa.",
        isError: true,
      });
      setShowDeleteAllModal(false);
    } finally {
      setIsDeletingAll(false);
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col"
      >
        {/* Mobile Tactile Drag Handle */}
        <div data-drag-handle className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)]">
          <div className="w-10 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 id="student-roster-title" className="text-base sm:text-lg font-bold font-heading">
                Kelola Daftar Siswa: {classNameTitle}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {studentsList.filter((s) => s.isActive).length} Siswa Terdaftar
                {studentsList.some((s) => !s.isActive)
                  ? ` (${studentsList.filter((s) => !s.isActive).length} diarsipkan)`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 pt-2.5 sm:pt-3 gap-3 sm:gap-4 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
              activeTab === "list"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Daftar Siswa ({studentsList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
              activeTab === "add"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            + Tambah Siswa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
              activeTab === "bulk"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Impor Massal (Excel / Teks)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {message && (
            <div
              className={`p-3 rounded-xl border text-sm font-medium ${
                message.isError
                  ? "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                  : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* TAB 1: LIST */}
          {activeTab === "list" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau NIS siswa..."
                  className="flex-1 min-w-0 px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={handleExportRoster}
                  className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] shrink-0"
                  title="Unduh Daftar Siswa ke Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[var(--status-success-fg)]" />
                  <span className="hidden sm:inline">Export Excel</span>
                </button>
                {studentsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmInput("");
                      setShowDeleteAllModal(true);
                    }}
                    className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold text-red-700 dark:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 shrink-0"
                    title="Hapus semua data siswa di kelas ini"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Hapus Semua</span>
                  </button>
                )}
              </div>

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
                        className={`flex items-center justify-between p-3 transition-colors ${
                          st.isActive
                            ? "bg-[var(--surface)] hover:bg-[var(--canvas-subtle)]"
                            : "bg-amber-50/50 dark:bg-amber-950/20 opacity-75"
                        }`}
                      >
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2 mr-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(toTitleCase(e.target.value))}
                              className="flex-1 px-2.5 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            />
                            <input
                              type="text"
                              value={editNis}
                              onChange={(e) => setEditNis(e.target.value)}
                              placeholder="NIS"
                              className="w-24 px-2.5 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(st.id)}
                              disabled={loading}
                              className="p-1.5 rounded bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                              title="Simpan"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStudentId(null)}
                              className="p-1.5 rounded border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
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
                                {!st.isActive && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-normal">
                                    Diarsipkan
                                  </span>
                                )}
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
                              className="touch-target p-1.5 text-[var(--ink-muted)] hover:text-[var(--primary)] rounded"
                              title="Edit Nama/NIS"
                              aria-label={`Edit ${st.name}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleArchive(st)}
                              className="touch-target p-1.5 text-[var(--ink-muted)] hover:text-amber-600 rounded"
                              title={st.isActive ? "Arsipkan Siswa" : "Aktifkan Siswa"}
                              aria-label={st.isActive ? `Arsipkan ${st.name}` : `Aktifkan ${st.name}`}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(st)}
                              className="touch-target p-1.5 text-[var(--ink-muted)] hover:text-red-600 rounded"
                              title="Hapus Siswa Permanen"
                              aria-label={`Hapus ${st.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
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

          {activeTab === "add" && (
            <form onSubmit={handleAddSingle} className="space-y-4">
              <div>
                <label htmlFor="new-student-name" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Nama Lengkap Siswa <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-student-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(toTitleCase(e.target.value))}
                  placeholder="Contoh: Ahmad Dahlan"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  required
                />
              </div>

              <div>
                <label htmlFor="new-student-nis" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  NIS (Nomor Induk Siswa) - Opsional
                </label>
                <input
                  id="new-student-nis"
                  type="text"
                  value={newNis}
                  onChange={(e) => setNewNis(e.target.value)}
                  placeholder="Contoh: 102938"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="touch-target flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Tambahkan Siswa</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: BULK IMPORT (EXCEL / TEXT) */}
          {activeTab === "bulk" && (
            <div className="space-y-4">
              {/* Mode switch & Template Download */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkMode("file")}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      bulkMode === "file"
                        ? "bg-[var(--primary)] text-white shadow-xs"
                        : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Unggah File Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkMode("text")}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      bulkMode === "text"
                        ? "bg-[var(--primary)] text-white shadow-xs"
                        : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Tempel Salinan Teks
                  </button>
                </div>

                {bulkMode === "file" && (
                  <button
                    type="button"
                    onClick={() => downloadStudentImportTemplate(classNameTitle)}
                    className="touch-target inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--accent-slate)] hover:border-[var(--accent-slate)] transition-all shadow-xs"
                    title="Unduh format file Excel (.xlsx) kosong untuk impor massal siswa"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Format Excel (.xlsx)</span>
                  </button>
                )}
              </div>

              {bulkMode === "file" ? (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-xl p-6 text-center cursor-pointer bg-[var(--canvas-subtle)] hover:bg-[var(--surface)] transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelFileChange}
                      className="hidden"
                    />
                    <FileUp className="w-10 h-10 mx-auto text-[var(--primary)] mb-2 group-hover:scale-105 transition-transform" />
                    <p className="text-sm font-bold text-[var(--ink)]">
                      {excelFileName ? excelFileName : "Pilih File Excel Siswa (.xlsx)"}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)] mt-1">
                      Mendukung kolom Nama Siswa dan NIS otomatis
                    </p>
                  </div>

                  {/* Template Info & Quick Link */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3 py-2 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-xs text-[var(--ink-muted)]">
                    <span>
                      Kolom format: <strong>No</strong>, <strong>NIS</strong> (opsional), <strong>Nama Lengkap Siswa</strong> (wajib).
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadStudentImportTemplate(classNameTitle)}
                      className="inline-flex items-center gap-1 text-[var(--accent-slate)] hover:underline font-semibold shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh File Format</span>
                    </button>
                  </div>

                  {excelStudents.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--primary)]">
                          Pratinjau: {excelStudents.length} Siswa Siap Diimpor
                        </span>
                      </div>
                      <div className="border border-[var(--border)] rounded-xl max-h-48 overflow-y-auto divide-y divide-[var(--border)] bg-[var(--surface)]">
                        {excelStudents.slice(0, 10).map((st, i) => (
                          <div key={i} className="px-3 py-2 text-xs flex items-center justify-between">
                            <span className="font-semibold text-[var(--ink)]">
                              {i + 1}. {st.name}
                            </span>
                            {st.nis && (
                              <span className="text-[var(--ink-muted)] font-mono">NIS: {st.nis}</span>
                            )}
                          </div>
                        ))}
                        {excelStudents.length > 10 && (
                          <div className="px-3 py-2 text-xs text-center text-[var(--ink-muted)] italic bg-[var(--canvas-subtle)]">
                            ... dan {excelStudents.length - 10} siswa lainnya
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleConfirmExcelImport}
                          disabled={loading}
                          className="touch-target flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
                        >
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Simpan {excelStudents.length} Siswa ke Kelas</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleBulkTextAdd} className="space-y-4">
                  <div>
                    <label htmlFor="bulk-student-text" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                      Tempel Daftar Nama Siswa (1 Nama per Baris)
                    </label>
                    <textarea
                      id="bulk-student-text"
                      rows={8}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder="Ahmad Dahlan&#10;Budi Santoso&#10;Citra Lestari&#10;Dedi Kurniawan"
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                      className="touch-target flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
                    >
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>Impor Semua Siswa</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Danger Modal: Delete All Students */}
      {showDeleteAllModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-all-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-[var(--surface)] border border-red-300 dark:border-red-900/60 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 id="delete-all-title" className="text-base font-bold font-heading text-[var(--ink)]">
                  Hapus Seluruh Data Siswa?
                </h3>
                <p className="text-xs text-[var(--ink-muted)]">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="text-xs space-y-2 text-[var(--ink-muted)] bg-[var(--canvas-subtle)] p-3.5 rounded-xl border border-[var(--border)]">
              <p>
                Anda akan menghapus secara permanen seluruh <strong className="text-[var(--ink)]">{studentsList.length} siswa</strong> di kelas <strong className="text-[var(--ink)]">{classNameTitle}</strong>.
              </p>
              <p className="text-red-600 dark:text-red-400 font-semibold">
                Peringatan: Seluruh data catatan surat izin, sakit, dan alpa yang terkait dengan siswa di kelas ini juga akan terhapus otomatis!
              </p>
            </div>

            <div>
              <label htmlFor="confirm-delete-input" className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                Ketik kata <span className="font-mono font-bold text-red-600 bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900">HAPUS</span> di bawah ini untuk konfirmasi:
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder="Ketik HAPUS"
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-red-300 dark:border-red-800 bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setDeleteConfirmInput("");
                }}
                disabled={isDeletingAll}
                className="touch-target px-4 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)] transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deleteConfirmInput !== "HAPUS" || isDeletingAll}
                className="touch-target flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
              >
                {isDeletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>{isDeletingAll ? "Menghapus..." : "Hapus Semua Siswa"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
