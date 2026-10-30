import { getSystemSettings } from "./system-settings";

export interface AiRouterConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

export interface AiConnectionTestResult {
  isConnected: boolean;
  latencyMs: number;
  models: string[];
  error?: string;
}

export interface LetterAiParseResult {
  studentId: number | null;
  studentName: string | null;
  candidateName: string | null;
  className: string | null;
  matchConfidence: number;
  status: "Sakit" | "Izin";
  startDate: string;
  endDate: string | null;
  isMultiDay: boolean;
  description: string;
}

export interface RosterAiStudent {
  name: string;
  nis?: string;
}

export async function getAiRouterConfig(): Promise<AiRouterConfig> {
  const settings = await getSystemSettings();
  const envUrl = process.env.AI_ROUTER_URL;
  const envKey = process.env.AI_ROUTER_API_KEY;
  const envModel = process.env.AI_ROUTER_MODEL;
  const envEnabled = process.env.AI_ROUTER_ENABLED;

  const enabled =
    settings.aiEnabled !== undefined
      ? Boolean(settings.aiEnabled)
      : envEnabled !== undefined
      ? envEnabled === "true" || envEnabled === "1"
      : false;

  const baseUrl = (settings.aiRouterUrl || envUrl || "http://127.0.0.1:20128/v1").replace(/\/+$/, "");
  const apiKey = settings.aiRouterApiKey || envKey || null;
  const model = settings.aiRouterModel || envModel || "gemini/gemini-3.8-flash";

  return {
    enabled,
    baseUrl,
    apiKey,
    model,
  };
}

export async function testAiRouterConnection(
  customConfig?: Partial<AiRouterConfig>
): Promise<AiConnectionTestResult> {
  const resolvedConfig = customConfig
    ? {
        enabled: customConfig.enabled ?? false,
        baseUrl: (customConfig.baseUrl || "http://127.0.0.1:20128/v1").replace(/\/+$/, ""),
        apiKey: customConfig.apiKey ?? null,
        model: customConfig.model || "gemini/gemini-3.8-flash",
      }
    : await getAiRouterConfig();

  if (!resolvedConfig.enabled) {
    return {
      isConnected: false,
      latencyMs: 0,
      models: [],
      error: "Integrasi 9router AI sedang dinonaktifkan.",
    };
  }

  const endpoint = `${resolvedConfig.baseUrl}/models`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (resolvedConfig.apiKey) {
    headers["Authorization"] = `Bearer ${resolvedConfig.apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  const start = performance.now();

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const elapsed = Math.round(performance.now() - start);

    if (!res.ok) {
      let errorMsg = `Server mengembalikan status HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error?.message) {
          errorMsg = body.error.message;
        } else if (body?.detail) {
          errorMsg = body.detail;
        }
      } catch {
        // Ignore json parse error
      }
      return {
        isConnected: false,
        latencyMs: elapsed,
        models: [],
        error: errorMsg,
      };
    }

    const data = await res.json();
    const modelList: string[] = [];
    if (Array.isArray(data?.data)) {
      for (const item of data.data) {
        if (item?.id && typeof item.id === "string") {
          modelList.push(item.id);
        }
      }
    }

    return {
      isConnected: true,
      latencyMs: elapsed,
      models: modelList,
    };
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - start);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const errorMsg = isAbort
      ? "Koneksi ke 9router melebihi batas waktu (timeout 6 detik)."
      : err instanceof Error
      ? err.message
      : "Gagal terhubung ke 9router.";

    return {
      isConnected: false,
      latencyMs: elapsed,
      models: [],
      error: errorMsg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseLetterWithAi({
  rawLines,
  studentCandidates,
  imageBase64,
  mimeType,
  configOverride,
}: {
  rawLines: string[];
  studentCandidates: Array<{ id: number; name: string; nis?: string | null }>;
  imageBase64?: string;
  mimeType?: string;
  configOverride?: Partial<AiRouterConfig>;
}): Promise<LetterAiParseResult | null> {
  const config = configOverride
    ? {
        enabled: configOverride.enabled ?? false,
        baseUrl: (configOverride.baseUrl || "http://127.0.0.1:20128/v1").replace(/\/+$/, ""),
        apiKey: configOverride.apiKey ?? null,
        model: configOverride.model || "gemini/gemini-3.8-flash",
      }
    : await getAiRouterConfig();

  if (!config.enabled) {
    return null;
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const rosterContext =
    studentCandidates.length > 0
      ? studentCandidates
          .map((s) => `- ID: ${s.id}, Nama: "${s.name}"${s.nis ? `, NIS: "${s.nis}"` : ""}`)
          .join("\n")
      : "(Tidak ada daftar siswa)";

  const systemPrompt = `Anda adalah asisten AI ekstraksi presisi tinggi untuk surat izin ketidakhadiran siswa sekolah di Indonesia.
Tugas Anda adalah membaca teks surat, mencocokkan dengan daftar siswa kelas resmi, dan mengeluarkan informasi terstruktur.

Daftar resmi siswa kelas ini:
${rosterContext}

Aturan Ekstraksi:
1. "studentId" & "studentName": Cari nama siswa di surat. Cocokkan dengan salah satu nama dari daftar di atas. Jika ditemukan kecocokan kuat (misal variasi ejaan atau nama panggilan), berikan ID dan Nama siswa sesuai daftar.
2. "candidateName": Tuliskan nama siswa persis seperti yang tertulis pada surat fisik.
3. "className": Nama kelas jika tertulis (contoh: "XII TKJ 2", "7A").
4. "matchConfidence": Angka 0.0 sampai 1.0 yang menunjukkan tingkat keyakinan pencocokan nama siswa.
5. "status": Harus "Sakit" atau "Izin". Jika sakit/demam/opname -> "Sakit". Jika acara keluarga/keperluan/menikah -> "Izin".
6. "startDate": Tanggal awal tidak masuk dalam format YYYY-MM-DD.
   PERINGATAN KRUSIAL: JANGAN PERNAH mengambil Tanggal Lahir / TTL siswa (misal tahun 2005-2015) sebagai startDate! Tanggal izin/sakit adalah tanggal periode sakit/absen (tahun berjalan mendekati saat ini). Jika surat keterangan dokter hanya mencantumkan TTL dan tanggal surat dibuat (misal "Jakarta, 29 Oktober 2026"), gunakan tanggal surat dibuat sebagai startDate. Jika tidak ada tanggal absen maupun tanggal surat yang valid, kembalikan null atau string kosong "".
7. "endDate": Tanggal akhir tidak masuk format YYYY-MM-DD jika izin lebih dari 1 hari. Jika hanya 1 hari, bernilai null.
8. "isMultiDay": true jika lebih dari 1 hari, sebaliknya false.
9. "description": Alasan ketidakhadiran secara singkat dan jelas (misal: "Demam tinggi", "Menghadiri pernikahan keluarga di luar kota").

Output WAJIB berupa JSON murni tanpa markdown, tanpa penjelasan di luar JSON:
{
  "studentId": number | null,
  "studentName": string | null,
  "candidateName": string | null,
  "className": string | null,
  "matchConfidence": number,
  "status": "Sakit" | "Izin",
  "startDate": "YYYY-MM-DD" | null,
  "endDate": "YYYY-MM-DD" | null,
  "isMultiDay": boolean,
  "description": string
}`;

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  if (rawLines.length >= 3 || !imageBase64) {
    messages.push({
      role: "user",
      content: `Berikut adalah teks baris yang diekstrak oleh pemindai OCR:\n\n${rawLines.join("\n")}`,
    });
  } else {
    // Fallback to multimodal vision when text lines are scarce
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Teks OCR sangat minim: "${rawLines.join(" ")}". Silakan baca langsung dari foto surat terlampir dan isi format JSON:`,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
          },
        },
      ],
    });
  }

  const controller = new AbortController();
  // 12-second timeout according to agreed user preference
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[9router AI] Letter parse returned status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    // Clean markdown code blocks if present
    const cleaned = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const validStatus = parsed.status === "Sakit" ? "Sakit" : "Izin";
    const confidence = typeof parsed.matchConfidence === "number" ? parsed.matchConfidence : 0.8;

    const currentYear = new Date().getFullYear();
    let sanitizedStartDate = "";
    if (typeof parsed.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)) {
      const year = parseInt(parsed.startDate.split("-")[0], 10);
      if (Math.abs(year - currentYear) <= 1) {
        sanitizedStartDate = parsed.startDate;
      }
    }

    let sanitizedEndDate: string | null = null;
    if (typeof parsed.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)) {
      const year = parseInt(parsed.endDate.split("-")[0], 10);
      if (Math.abs(year - currentYear) <= 1) {
        sanitizedEndDate = parsed.endDate;
      }
    }

    const isMultiDay = Boolean(
      parsed.isMultiDay ||
      (sanitizedStartDate && sanitizedEndDate && sanitizedStartDate !== sanitizedEndDate)
    );

    return {
      studentId: typeof parsed.studentId === "number" ? parsed.studentId : null,
      studentName: typeof parsed.studentName === "string" ? parsed.studentName : null,
      candidateName: typeof parsed.candidateName === "string" ? parsed.candidateName : null,
      className: typeof parsed.className === "string" ? parsed.className : null,
      matchConfidence: Math.min(Math.max(confidence, 0), 1),
      status: validStatus,
      startDate: sanitizedStartDate,
      endDate: sanitizedEndDate,
      isMultiDay,
      description: typeof parsed.description === "string" ? parsed.description : "",
    };
  } catch (err: unknown) {
    console.warn("[9router AI] Error during letter parse:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseRosterWithAi({
  rawLines,
  imageBase64,
  mimeType,
  configOverride,
}: {
  rawLines: string[];
  imageBase64?: string;
  mimeType?: string;
  configOverride?: Partial<AiRouterConfig>;
}): Promise<RosterAiStudent[] | null> {
  const config = configOverride
    ? {
        enabled: configOverride.enabled ?? false,
        baseUrl: (configOverride.baseUrl || "http://127.0.0.1:20128/v1").replace(/\/+$/, ""),
        apiKey: configOverride.apiKey ?? null,
        model: configOverride.model || "gemini/gemini-3.8-flash",
      }
    : await getAiRouterConfig();

  if (!config.enabled) {
    return null;
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const systemPrompt = `Anda adalah asisten AI ekstraksi data tabel daftar nama siswa sekolah (roster/presensi).
Tugas Anda mengekstrak baris-baris nama siswa dan Nomor Induk/NIS dari teks atau gambar dokumen.

Format output WAJIB array JSON murni tanpa markdown, tanpa teks pengantar:
[
  { "name": "Nama Siswa", "nis": "9259/110/066" }
]

Aturan Ketat:
1. JANGAN sertakan judul dokumen / kop formulir (contoh: "DATA NAMA SISWA KELAS...", "TAHUN PELAJARAN...", dsb.).
2. JANGAN sertakan nama wali kelas, guru, atau gelar kehormatan/akademik (contoh: "Wali Kelas : Erick Kresnamurti, S.Kom. Gr.").
3. JANGAN sertakan catatan kaki, footer, atau tanggal revisi (contoh: "Update per 02 Desember 2024").
4. JANGAN sertakan header kolom tabel (seperti "No", "Nama", "L/P", "Nomor Induk", "Keterangan", "Tanda Tangan").
5. Format NIS: Jika di dokumen terdapat Nomor Induk majemuk bergaris miring (contoh: "9259 / 110 / 066"), simpan format lengkapnya tanpa spasi berlebih ("9259/110/066"). Jika hanya ada angka tunggal (contoh: "9259"), simpan angka tersebut.
6. Normalisasikan penulisan nama menjadi Title Case (huruf besar di awal setiap kata nama siswa).
7. Bersihkan angka urut di depan nama (misal "1. Adrian Manuel Hartono" -> "Adrian Manuel Hartono").
8. Hanya hasilkan data siswa yang sah pada baris tabel.`;

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  if (imageBase64) {
    const promptText = rawLines.length > 0
      ? `Berikut teks hasil OCR sebagai referensi pembacaan karakter:\n${rawLines.join("\n")}\n\nSilakan ekstrak seluruh nama siswa dan NIS dari baris tabel dokumen di bawah ini:`
      : `Silakan ekstrak seluruh nama siswa dan NIS dari baris tabel dokumen di bawah ini:`;

    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: promptText,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
          },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Berikut adalah baris-baris teks tabel hasil pemindaian OCR:\n\n${rawLines.join("\n")}`,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    const cleaned = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const students: RosterAiStudent[] = [];
    for (const item of parsed) {
      if (item?.name && typeof item.name === "string" && item.name.trim().length >= 2) {
        let cleanNis = item.nis ? String(item.nis).trim() : undefined;
        if (cleanNis) {
          cleanNis = cleanNis.replace(/\s*\/\s*/g, "/");
        }
        students.push({
          name: item.name.trim(),
          nis: cleanNis || undefined,
        });
      }
    }

    return students.length > 0 ? students : null;
  } catch (err: unknown) {
    console.warn("[9router AI] Error during roster parse:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
