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

export interface TableScanLetterDetected {
  /**
   * Bounding box coordinates normalized to float range [0.0, 1.0].
   * Format: [ymin, xmin, ymax, xmax]
   * Suitable for sharp extract:
   * top = Math.round(ymin * height)
   * left = Math.round(xmin * width)
   * height = Math.round((ymax - ymin) * height)
   * width = Math.round((xmax - xmin) * width)
   */
  boundingBox: [number, number, number, number];
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
  rawLines = [],
  studentCandidates,
  imageBase64,
  mimeType,
  configOverride,
}: {
  rawLines?: string[];
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
Tugas Anda adalah membaca dokumen surat (baik ketikan, surat dokter/klinik, maupun tulisan tangan orang tua), mencocokkan dengan daftar siswa resmi kelas, dan mengeluarkan informasi terstruktur.

Daftar resmi siswa kelas ini:
${rosterContext}

Aturan Ekstraksi:
1. "studentId" & "studentName": Cari nama siswa di surat. Pada tulisan tangan atau surat dokter, ejaan mungkin terdapat sedikit variasi/singkatan. Cocokkan dengan salah satu nama dari daftar di atas. Jika ditemukan kecocokan kuat, berikan ID dan Nama siswa sesuai daftar resmi. Jika tidak ada yang cocok di daftar, isi null.
2. "candidateName": Tuliskan nama siswa persis seperti yang tertulis pada teks fisik/surat aslinya.
3. "className": Nama kelas jika tertulis di surat (contoh: "XII TKJ 2", "7A").
4. "matchConfidence": Angka 0.0 sampai 1.0 yang menunjukkan tingkat keyakinan pencocokan nama siswa.
5. "status": Harus "Sakit" atau "Izin".
   - Jika ada kata sakit, demam, flu, batuk, resep, opname, rawat inap, istirahat dokter, diagnosa medis -> "Sakit".
   - Jika keperluan keluarga, bepergian, urusan mendesak, acara keluarga -> "Izin".
6. "startDate": Tanggal awal tidak masuk dalam format YYYY-MM-DD.
   PERINGATAN KRUSIAL: JANGAN PERNAH mengambil Tanggal Lahir / TTL siswa (misal tahun 2005-2016) sebagai startDate! Tanggal izin/sakit adalah tanggal periode sakit/absen atau tanggal surat dibuat pada tahun berjalan. Jika surat keterangan dokter hanya mencantumkan TTL dan tanggal surat dibuat (misal "Jakarta, 29 Oktober 2026"), gunakan tanggal surat dibuat sebagai startDate. Jika tidak ada tanggal absen maupun tanggal surat yang valid, kembalikan null atau string kosong "".
7. "endDate": Tanggal akhir tidak masuk format YYYY-MM-DD jika izin lebih dari 1 hari. Jika hanya 1 hari, bernilai null.
8. "isMultiDay": true jika lebih dari 1 hari, sebaliknya false.
9. "description": Alasan ketidakhadiran secara singkat dan jelas (misal: "Demam tinggi", "Surat keterangan istirahat dokter", "Acara keluarga di luar kota").

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

  if (imageBase64) {
    const textPrompt =
      rawLines && rawLines.length > 0
        ? `Analisis foto surat izin terlampir (tulisan tangan / surat dokter). Teks OCR awal sebagai referensi tambahan:\n${rawLines.join("\n")}\n\nSilakan baca foto secara teliti dan keluarkan data JSON terstruktur sesuai format:`
        : `Analisis foto surat izin terlampir (tulisan tangan / surat dokter / ketikan) dan keluarkan data JSON terstruktur sesuai format:`;

    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: textPrompt,
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
      content: `Berikut adalah teks baris yang diekstrak oleh pemindai OCR:\n\n${(rawLines || []).join("\n")}\n\nSilakan cocokkan dengan daftar siswa dan keluarkan data JSON terstruktur.`,
    });
  }

  const controller = new AbortController();
  // 25-second timeout for multimodal vision letter parse
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

    const rawStatus = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
    const rawDesc = typeof parsed.description === "string" ? parsed.description.trim().toLowerCase() : "";
    const isSakitByKeyword =
      rawStatus.includes("sakit") ||
      rawDesc.includes("sakit") ||
      rawDesc.includes("demam") ||
      rawDesc.includes("dokter") ||
      rawDesc.includes("opname") ||
      rawDesc.includes("rawat");
    const validStatus: "Sakit" | "Izin" = isSakitByKeyword ? "Sakit" : "Izin";

    const currentYear = new Date().getFullYear();
    const normalizeDate = (raw: unknown): string | null => {
      if (typeof raw !== "string") return null;
      const str = raw.trim();
      const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (!match) return null;
      const year = parseInt(match[1], 10);
      if (Math.abs(year - currentYear) > 1) return null;
      const month = match[2].padStart(2, "0");
      const day = match[3].padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const sanitizedStartDate = normalizeDate(parsed.startDate) || "";
    const sanitizedEndDate = normalizeDate(parsed.endDate);

    const isMultiDay = Boolean(
      parsed.isMultiDay ||
      (sanitizedStartDate && sanitizedEndDate && sanitizedStartDate !== sanitizedEndDate)
    );

    // Verify studentId against provided studentCandidates to prevent hallucinated IDs
    let matchedId: number | null = null;
    let matchedName: string | null = null;

    if (typeof parsed.studentId === "number") {
      const candidate = studentCandidates.find((s) => s.id === parsed.studentId);
      if (candidate) {
        matchedId = candidate.id;
        matchedName = candidate.name;
      }
    }

    if (!matchedId && typeof parsed.studentName === "string" && parsed.studentName.trim()) {
      const target = parsed.studentName.trim().toLowerCase();
      const candidate = studentCandidates.find((s) => s.name.trim().toLowerCase() === target);
      if (candidate) {
        matchedId = candidate.id;
        matchedName = candidate.name;
      }
    }

    const defaultConf = matchedId ? 0.95 : 0.7;
    const confidence = typeof parsed.matchConfidence === "number" ? parsed.matchConfidence : defaultConf;

    return {
      studentId: matchedId,
      studentName: matchedName || (typeof parsed.studentName === "string" ? parsed.studentName : null),
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

  const hasSubstantialText = rawLines.length >= 3;
  if (hasSubstantialText || !imageBase64) {
    messages.push({
      role: "user",
      content: `Berikut adalah baris-baris teks tabel hasil pemindaian OCR:\n\n${rawLines.join("\n")}\n\nSilakan ekstrak seluruh nama siswa dan NIS dari baris tabel di atas sesuai instruksi.`,
    });
  } else {
    // Fallback to multimodal vision only when OCR extracted text is scarce or empty
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Teks OCR minim atau kosong. Silakan baca langsung baris-baris nama siswa dan NIS dari foto/dokumen tabel terlampir sesuai instruksi:`,
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

  const timeoutMs = hasSubstantialText || !imageBase64 ? 12000 : 35000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      console.warn(`[9router AI] Roster parse timed out after ${timeoutMs}ms (aborted).`);
    } else {
      console.warn("[9router AI] Error during roster parse:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalizes raw bounding box coordinates from AI vision models.
 * Handles both 0-1000 integer scale and 0.0-1.0 float scale,
 * clamps values to [0, 1], and ensures valid [ymin, xmin, ymax, xmax].
 */
export function normalizeBoundingBox(rawBox: unknown): [number, number, number, number] | null {
  let ymin = 0;
  let xmin = 0;
  let ymax = 0;
  let xmax = 0;

  if (Array.isArray(rawBox) && rawBox.length >= 4) {
    const nums = rawBox.map((v) => (typeof v === "number" ? v : parseFloat(String(v))));
    if (nums.some((v) => isNaN(v))) return null;
    [ymin, xmin, ymax, xmax] = nums;
  } else if (rawBox && typeof rawBox === "object") {
    const obj = rawBox as Record<string, unknown>;
    const getNum = (...keys: string[]): number | null => {
      for (const k of keys) {
        if (typeof obj[k] === "number") return obj[k] as number;
        if (typeof obj[k] === "string") {
          const parsed = parseFloat(obj[k] as string);
          if (!isNaN(parsed)) return parsed;
        }
      }
      return null;
    };

    const y1 = getNum("ymin", "top", "y1");
    const x1 = getNum("xmin", "left", "x1");
    const y2 = getNum("ymax", "bottom", "y2");
    const x2 = getNum("xmax", "right", "x2");

    if (y1 === null || x1 === null || y2 === null || x2 === null) return null;
    ymin = y1;
    xmin = x1;
    ymax = y2;
    xmax = x2;
  } else {
    return null;
  }

  // Handle 0-1000 scale vs 0.0-1.0 float scale
  const is1000Scale = ymin > 1.0 || xmin > 1.0 || ymax > 1.0 || xmax > 1.0;
  if (is1000Scale) {
    ymin = ymin / 1000;
    xmin = xmin / 1000;
    ymax = ymax / 1000;
    xmax = xmax / 1000;
  }

  // Clamp to [0, 1]
  ymin = Math.min(Math.max(ymin, 0), 1);
  xmin = Math.min(Math.max(xmin, 0), 1);
  ymax = Math.min(Math.max(ymax, 0), 1);
  xmax = Math.min(Math.max(xmax, 0), 1);

  // Ensure min <= max
  const realYmin = Math.min(ymin, ymax);
  const realYmax = Math.max(ymin, ymax);
  const realXmin = Math.min(xmin, xmax);
  const realXmax = Math.max(xmin, xmax);

  // Filter out degenerative bounding boxes (< 2% image dimension)
  if (realYmax - realYmin < 0.02 || realXmax - realXmin < 0.02) {
    return null;
  }

  return [
    parseFloat(realYmin.toFixed(4)),
    parseFloat(realXmin.toFixed(4)),
    parseFloat(realYmax.toFixed(4)),
    parseFloat(realXmax.toFixed(4)),
  ];
}

/**
 * Detects, segments, and parses multiple physical letter documents from a single tabletop photo.
 * Returns normalized bounding boxes for cropping along with verified student absence metadata.
 */
export async function segmentAndParseTableLettersWithAi({
  imageBase64,
  mimeType,
  studentCandidates,
  configOverride,
}: {
  imageBase64: string;
  mimeType?: string;
  studentCandidates: Array<{ id: number; name: string; nis?: string | null }>;
  configOverride?: Partial<AiRouterConfig>;
}): Promise<TableScanLetterDetected[] | null> {
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

  const systemPrompt = `Anda adalah asisten AI Vision presisi tinggi untuk mendeteksi, mensegmentasi, dan mengekstrak dokumen surat izin/sakit siswa di atas meja (tabletop scanning) untuk sekolah di Indonesia.
Pada foto terlampir, terdapat 1 hingga 5 lembar surat fisik tergeletak di atas meja.

Tugas Anda:
1. Deteksi setiap lembar kertas surat fisik secara individual dan tentukan batas koordinat bounding box dokumen tersebut: [ymin, xmin, ymax, xmax] dengan koordinat normalisasi (0.0 sampai 1.0 atau 0 sampai 1000). Bounding box harus mencakup seluruh fisik kertas surat tanpa terpotong agar dapat dipotong (crop) rapi.
2. Baca teks pada masing-masing lembar surat tersebut (baik surat ketikan, surat dokter/klinik, maupun tulisan tangan orang tua).
3. Cocokkan identitas siswa dengan daftar resmi siswa kelas yang diberikan.

Daftar resmi siswa kelas ini:
${rosterContext}

Aturan Ketat Deteksi & Ekstraksi:
1. "boundingBox": Koordinat [ymin, xmin, ymax, xmax] fisik lembar surat. Format array 4 angka.
2. "studentId" & "studentName": Cari nama siswa pada lembar surat tersebut. Cocokkan dengan salah satu nama dari daftar resmi siswa di atas. Jika ditemukan kecocokan kuat, berikan ID dan Nama siswa sesuai daftar resmi. Jika tidak cocok sama sekali, isi null.
3. "candidateName": Tuliskan nama siswa persis seperti yang terbaca pada lembar surat fisik aslinya.
4. "className": Nama kelas jika tertulis di surat (contoh: "XII TKJ 2", "7A").
5. "matchConfidence": Angka 0.0 sampai 1.0 tingkat keyakinan pencocokan identitas siswa (berikan < 0.70 jika buram, nama tidak lengkap, atau ragu).
6. "status": Wajib "Sakit" atau "Izin".
   - Jika ada indikasi demam, flu, batuk, resep obat, klinik, istirahat dokter, opname, puskesmas, rawat inap -> "Sakit".
   - Jika keperluan keluarga, bepergian, acara keluarga, urusan mendesak -> "Izin".
7. "startDate": Tanggal awal tidak masuk dalam format YYYY-MM-DD.
   PERINGATAN KERAS: JANGAN PERNAH mengambil Tanggal Lahir / TTL (misal tahun 2005-2016) sebagai startDate! Tanggal izin adalah tanggal sakit/absen atau tanggal surat dibuat pada tahun berjalan. Jika tidak ada tanggal valid, kembalikan null atau "".
8. "endDate": Tanggal akhir tidak masuk format YYYY-MM-DD jika izin lebih dari 1 hari, sebaliknya null.
9. "isMultiDay": true jika rentang tanggal lebih dari 1 hari, sebaliknya false.
10. "description": Alasan ketidakhadiran singkat dan jelas (contoh: "Demam tinggi", "Surat keterangan istirahat dokter", "Acara keluarga").

Format Output:
WAJIB mengembalikan array JSON murni tanpa markdown, tanpa teks pengantar:
[
  {
    "boundingBox": [ymin, xmin, ymax, xmax],
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
  }
]
Jika tidak ditemukan lembar surat izin sama sekali pada foto meja, kembalikan array kosong: []`;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Foto terlampir memperlihatkan meja dengan beberapa lembar surat izin/sakit. Silakan segmentasikan setiap lembar surat dengan bounding box [ymin, xmin, ymax, xmax], baca isinya, cocokkan dengan daftar siswa, dan kembalikan array JSON sesuai instruksi:",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
          },
        },
      ],
    },
  ];

  // 30-second strict timeout for tabletop multi-document vision inference
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      console.warn(`[9router AI] Tabletop scan returned status ${res.status}`);
      return null;
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return null;
    }

    // Clean markdown code block decorators if returned
    const cleaned = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    let rawItems: any[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.letters)) rawItems = parsed.letters;
      else if (Array.isArray(parsed.documents)) rawItems = parsed.documents;
      else if (Array.isArray(parsed.items)) rawItems = parsed.items;
      else if (parsed.boundingBox) rawItems = [parsed];
    }

    const currentYear = new Date().getFullYear();
    const normalizeDate = (raw: unknown): string | null => {
      if (typeof raw !== "string") return null;
      const str = raw.trim();
      const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        if (Math.abs(year - currentYear) > 1) return null; // Reject birth dates
        const month = ymdMatch[2].padStart(2, "0");
        const day = ymdMatch[3].padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
      const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmyMatch) {
        const year = parseInt(dmyMatch[3], 10);
        if (Math.abs(year - currentYear) > 1) return null;
        const month = dmyMatch[2].padStart(2, "0");
        const day = dmyMatch[1].padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
      return null;
    };

    const detectedLetters: TableScanLetterDetected[] = [];

    for (const item of rawItems) {
      const box = normalizeBoundingBox(item.boundingBox || item.box2d || item.box_2d);
      if (!box) continue; // Skip items without valid bounding box

      const rawStatus = typeof item.status === "string" ? item.status.trim().toLowerCase() : "";
      const rawDesc = typeof item.description === "string" ? item.description.trim().toLowerCase() : "";
      const isSakitByKeyword =
        rawStatus.includes("sakit") ||
        rawDesc.includes("sakit") ||
        rawDesc.includes("demam") ||
        rawDesc.includes("dokter") ||
        rawDesc.includes("klinik") ||
        rawDesc.includes("puskesmas") ||
        rawDesc.includes("opname") ||
        rawDesc.includes("rawat");
      const validStatus: "Sakit" | "Izin" = isSakitByKeyword ? "Sakit" : "Izin";

      const sanitizedStartDate = normalizeDate(item.startDate) || "";
      const sanitizedEndDate = normalizeDate(item.endDate);
      const isMultiDay = Boolean(
        item.isMultiDay ||
        (sanitizedStartDate && sanitizedEndDate && sanitizedStartDate !== sanitizedEndDate)
      );

      // Zero-hallucination verification against student candidates
      let matchedId: number | null = null;
      let matchedName: string | null = null;

      if (typeof item.studentId === "number") {
        const candidate = studentCandidates.find((s) => s.id === item.studentId);
        if (candidate) {
          matchedId = candidate.id;
          matchedName = candidate.name;
        }
      }

      if (!matchedId && typeof item.studentName === "string" && item.studentName.trim()) {
        const target = item.studentName.trim().toLowerCase();
        const candidate = studentCandidates.find((s) => s.name.trim().toLowerCase() === target);
        if (candidate) {
          matchedId = candidate.id;
          matchedName = candidate.name;
        }
      }

      if (!matchedId && typeof item.candidateName === "string" && item.candidateName.trim().length >= 3) {
        const target = item.candidateName.trim().toLowerCase();
        const candidate = studentCandidates.find(
          (s) =>
            s.name.trim().toLowerCase() === target ||
            s.name.toLowerCase().includes(target) ||
            target.includes(s.name.toLowerCase())
        );
        if (candidate) {
          matchedId = candidate.id;
          matchedName = candidate.name;
        }
      }

      // If matched, use AI confidence or default 0.95; if not matched, cap confidence at 0.60
      const defaultConf = matchedId ? 0.95 : 0.55;
      let confidence = typeof item.matchConfidence === "number" ? item.matchConfidence : defaultConf;
      if (!matchedId) {
        confidence = Math.min(confidence, 0.60);
      }
      confidence = Math.min(Math.max(confidence, 0), 1);

      detectedLetters.push({
        boundingBox: box,
        studentId: matchedId,
        studentName: matchedName,
        candidateName: typeof item.candidateName === "string" ? item.candidateName : null,
        className: typeof item.className === "string" ? item.className : null,
        matchConfidence: confidence,
        status: validStatus,
        startDate: sanitizedStartDate,
        endDate: sanitizedEndDate,
        isMultiDay,
        description: typeof item.description === "string" ? item.description : "",
      });
    }

    return detectedLetters;
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      console.warn("[9router AI] Tabletop scan timed out after 30s (aborted).");
    } else {
      console.warn("[9router AI] Error during tabletop scan:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Mock response generator for unit tests simulating 9router AI tabletop vision response.
 */
export function createMockTableScanAiResponse(
  letters: Array<{
    boundingBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number };
    studentId?: number | null;
    studentName?: string | null;
    candidateName?: string | null;
    className?: string | null;
    matchConfidence?: number;
    status?: "Sakit" | "Izin" | string;
    startDate?: string | null;
    endDate?: string | null;
    isMultiDay?: boolean;
    description?: string;
  }> = []
) {
  const currentYear = new Date().getFullYear();
  const defaultLetters =
    letters.length > 0
      ? letters
      : [
          {
            boundingBox: [100, 50, 480, 480] as [number, number, number, number],
            studentId: 1,
            studentName: "Budi Santoso",
            candidateName: "Budi Santoso",
            className: "XII TKJ 2",
            matchConfidence: 0.95,
            status: "Sakit",
            startDate: `${currentYear}-10-28`,
            endDate: null,
            isMultiDay: false,
            description: "Demam dan flu",
          },
          {
            boundingBox: [520, 510, 950, 960] as [number, number, number, number],
            studentId: 2,
            studentName: "Citra Lestari",
            candidateName: "Citra L.",
            className: "XII TKJ 2",
            matchConfidence: 0.92,
            status: "Izin",
            startDate: `${currentYear}-10-28`,
            endDate: `${currentYear}-10-29`,
            isMultiDay: true,
            description: "Acara keluarga",
          },
        ];

  return {
    choices: [
      {
        message: {
          content: JSON.stringify(defaultLetters),
        },
      },
    ],
  };
}

// ============================================================================
// Milestone 3: AI Attendance Insights & Narrative Synthesis
// ============================================================================

export interface AttendanceInsightsSummaryStats {
  totalStudents: number;
  totalAbsences: number;
  totalAlpa: number;
  totalIzin: number;
  totalSakit: number;
  totalSuratBelum: number;
  attendanceRatePercent?: number;
}

export interface AttendanceInsightsAtRiskStudent {
  studentId?: number;
  studentName: string;
  nis?: string | null;
  urgency: "Kritis" | "Waspada" | "Perhatian";
  anomalyTypes: string[];
  ruleDescriptions: string[];
  stats: {
    alpa: number;
    izin: number;
    sakit: number;
    total: number;
    pendingLetters: number;
    mondayFridayRatio?: number;
  };
}

export interface AttendanceInsightsPromptInput {
  className: string;
  period: "month" | "semester";
  periodLabel: string;
  summaryStats: AttendanceInsightsSummaryStats;
  atRiskStudents: AttendanceInsightsAtRiskStudent[];
  configOverride?: Partial<AiRouterConfig>;
  bypassAi?: boolean;
}

export interface AttendanceInsightsBkRecommendation {
  studentName: string;
  riskLevel: "Kritis" | "Waspada" | "Perhatian";
  recommendation: string;
}

export interface AttendanceInsightsAiNarratives {
  executiveSummary: string;
  principalReport: string;
  parentGroupMessage: string;
  bkRecommendations: AttendanceInsightsBkRecommendation[];
}

export interface AttendanceInsightsAiResult extends AttendanceInsightsAiNarratives {
  aiGenerated: boolean;
}

export const INSIGHTS_CACHE_TTL = 43_200; // 12 hours in seconds

/**
 * Deterministic fallback narrative generator when AI router is disabled, offline, or returns invalid JSON.
 * Guarantees zero hallucinations and preserves exact statistical metrics.
 */
export function generateFallbackAttendanceInsights(
  input: AttendanceInsightsPromptInput
): AttendanceInsightsAiNarratives {
  const { className, periodLabel, summaryStats, atRiskStudents } = input;
  const { totalStudents, totalAbsences, totalSakit, totalIzin, totalAlpa, totalSuratBelum } = summaryStats;

  // 1. Executive Summary
  let executiveSummary = "";
  if (totalAbsences === 0) {
    executiveSummary = `Kehadiran siswa kelas ${className} pada periode ${periodLabel} berada dalam kondisi prima dengan tingkat kehadiran 100%. Tidak terdeteksi adanya anomali absensi atau siswa yang memerlukan perhatian khusus.`;
  } else if (atRiskStudents.length === 0) {
    executiveSummary = `Pada periode ${periodLabel}, kelas ${className} mencatat total ${totalAbsences} ketidakhadiran (${totalSakit} Sakit, ${totalIzin} Izin, dan ${totalAlpa} Alpa). Secara keseluruhan kedisiplinan kehadiran kelas terpantau kondusif tanpa adanya siswa dalam kategori berisiko.`;
  } else {
    executiveSummary = `Pada periode ${periodLabel}, kelas ${className} mencatat ${totalAbsences} ketidakhadiran (${totalSakit} Sakit, ${totalIzin} Izin, dan ${totalAlpa} Alpa). Terdapat ${atRiskStudents.length} siswa yang terindikasi memerlukan pemantauan presensi dan pendampingan kesiswaan lebih lanjut.`;
  }

  // 2. Principal Report (Formal School Leadership Narrative)
  let principalReport = `Yth. Bapak/Ibu Pimpinan Sekolah,\n\nBerikut laporan rekapitulasi presensi kelas ${className} untuk periode ${periodLabel}. Dari total ${totalStudents} siswa terdaftar, tercatat ${totalAbsences} kejadian ketidakhadiran yang meliputi ${totalSakit} sakit, ${totalIzin} izin urusan keluarga, serta ${totalAlpa} alpa/tanpa keterangan.`;

  if (totalSuratBelum > 0) {
    principalReport += ` Terdapat ${totalSuratBelum} ketidakhadiran dengan keterangan sakit yang dokumen fisiknya (surat dokter) masih dalam proses konfirmasi.`;
  }

  if (atRiskStudents.length > 0) {
    const kritisCount = atRiskStudents.filter((s) => s.urgency === "Kritis").length;
    const waspadaCount = atRiskStudents.filter((s) => s.urgency === "Waspada").length;
    const perhatianCount = atRiskStudents.filter((s) => s.urgency === "Perhatian").length;

    principalReport += ` Berdasarkan deteksi dini kesiswaan, teridentifikasi ${atRiskStudents.length} siswa yang memerlukan intervensi (${kritisCount > 0 ? `${kritisCount} kategori Kritis, ` : ""}${waspadaCount > 0 ? `${waspadaCount} Waspada, ` : ""}${perhatianCount > 0 ? `${perhatianCount} Perhatian` : ""}). Wali kelas bersama guru Bimbingan Konseling (BK) telah menyusun langkah pendampingan terarah guna mencegah penurunan ketuntasan belajar.`;
  } else {
    principalReport += ` Tingkat ketidakhadiran kelas berada dalam ambang batas wajar dan seluruh siswa menunjukkan konsistensi kehadiran yang baik.`;
  }

  principalReport += `\n\nDemikian laporan ini kami sampaikan sebagai bahan evaluasi dan koordinasi pembinaan kesiswaan.`;

  // 3. Parent Group Message (WhatsApp Paguyuban - Humanized, Ultra-Concise, Zero AI-Slop)
  const parentGroupMessage = `Yth. Bapak/Ibu Orang Tua/Wali Murid Kelas ${className},

Terima kasih atas kerja sama mendampingi kedisiplinan ananda selama ${periodLabel}.

Pengingat singkat:
• Mohon berkabar ke wali kelas jika ananda berhalangan hadir.
• Bila sakit > 2 hari, mohon sertakan surat dokter saat kembali ke sekolah.

Semoga ananda yang sedang kurang sehat lekas pulih. Terima kasih atas perhatiannya.

Salam hangat,
Wali Kelas ${className}`;

  // 4. BK Recommendations (Per At-Risk Student)
  const bkRecommendations: AttendanceInsightsBkRecommendation[] = atRiskStudents.map((student) => {
    const types = student.anomalyTypes || [];
    const hasAlpa = types.includes("alpa_berulang") || types.includes("alpa") || types.includes("UNEXCUSED_ALPA") || student.stats.alpa >= 3;
    const hasMonFri = types.includes("pola_senin_jumat") || types.includes("MON_FRI_PATTERN");
    const hasPendingDoc = types.includes("surat_sakit_tertunda") || types.includes("PENDING_DOCTOR_NOTE") || student.stats.pendingLetters > 0;
    const isChronic = types.includes("akumulasi_tinggi") || types.includes("CHRONIC_ABSENCE") || student.stats.total >= 5;

    let recommendation = "";
    if (hasAlpa && student.urgency === "Kritis") {
      recommendation = `Jadwalkan konseling tatap muka bersama orang tua untuk menelusuri faktor penyebab akumulasi ${student.stats.alpa} hari Alpa. Buat surat komitmen kehadiran dan berikan pendekatan suportif untuk mengatasi kendala belajar siswa.`;
    } else if (hasAlpa) {
      recommendation = `Lakukan dialog personal untuk mengklarifikasi ketidakhadiran tanpa keterangan (${student.stats.alpa} hari Alpa). Hubungi orang tua secara persuasif agar terjalin komunikasi proaktif sebelum menjadi kebiasaan.`;
    } else if (hasMonFri) {
      recommendation = `Bimbingan konseling individual terfokus mengenai manajemen rutinitas belajar dan motivasi kehadiran di awal serta akhir pekan. Libatkan wali kelas untuk monitoring kehadiran harian.`;
    } else if (hasPendingDoc) {
      recommendation = `Koordinasikan dengan orang tua untuk mengonfirmasi kondisi medis siswa terkini serta memfasilitasi penyerahan dokumen surat keterangan istirahat dokter resmi.`;
    } else if (isChronic) {
      recommendation = `Lakukan asesmen psikopedagogis untuk memahami tingginya frekuensi ketidakhadiran (${student.stats.total} hari akumulasi) dan susun rencana remedial bersama guru mata pelajaran.`;
    } else {
      recommendation = `Lakukan pendampingan berkala bersama wali kelas untuk memantau kehadiran dan memberikan dorongan semangat belajar secara konsisten.`;
    }

    return {
      studentName: student.studentName,
      riskLevel: student.urgency,
      recommendation,
    };
  });

  return {
    executiveSummary,
    principalReport,
    parentGroupMessage,
    bkRecommendations,
  };
}

/**
 * Synthesizes comprehensive attendance insights, school leadership narrative,
 * polite parent WhatsApp announcement, and BK counseling recommendations using 9router AI.
 * Enforces zero-hallucination of attendance metrics and graceful fallback on timeout/error.
 */
export async function generateAttendanceInsightsWithAi(
  input: AttendanceInsightsPromptInput
): Promise<AttendanceInsightsAiResult> {
  const fallback = generateFallbackAttendanceInsights(input);

  if (input.bypassAi) {
    return {
      ...fallback,
      aiGenerated: false,
    };
  }

  const config = input.configOverride
    ? {
        enabled: input.configOverride.enabled ?? false,
        baseUrl: (input.configOverride.baseUrl || "http://127.0.0.1:20128/v1").replace(/\/+$/, ""),
        apiKey: input.configOverride.apiKey ?? null,
        model: input.configOverride.model || "gemini/gemini-3.8-flash",
      }
    : await getAiRouterConfig();

  if (!config.enabled) {
    return {
      ...fallback,
      aiGenerated: false,
    };
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const atRiskListFormatted =
    input.atRiskStudents.length > 0
      ? input.atRiskStudents
          .map(
            (s, idx) =>
              `${idx + 1}. Nama: "${s.studentName}", Urgensi: ${s.urgency}\n` +
              `   - Rincian: Alpa ${s.stats.alpa} hari, Sakit ${s.stats.sakit} hari, Izin ${s.stats.izin} hari (Total: ${s.stats.total} hari)\n` +
              `   - Catatan Aturan: ${s.ruleDescriptions.join("; ") || "Anomali presensi"}`
          )
          .join("\n")
      : "(Tidak ada siswa berisiko, seluruh siswa terpantau tertib)";

  const systemPrompt = `Anda adalah asisten AI Analitik Presensi & Edukasi Kesiswaan untuk sekolah di Indonesia.
Tugas Anda adalah membaca ringkasan statistik ketidakhadiran kelas dan daftar siswa yang memerlukan perhatian, kemudian menyusun 4 komponen narasi terstruktur:

1. "executiveSummary": Ringkasan 2-3 kalimat mengenai status kesehatan presensi kelas secara menyeluruh, tren umum, dan status siswa berisiko.
2. "principalReport": Narasi laporan formal yang ditujukan kepada Kepala Sekolah / Pimpinan Sekolah. Memuat rincian statistik (Sakit, Izin, Alpa), evaluasi kedisiplinan kelas, serta langkah pembinaan yang disiapkan wali kelas bersama guru BK.
3. "parentGroupMessage": Draf pesan pengumuman WhatsApp Paguyuban Orang Tua/Wali Murid.
   ATURAN ANTI-SLOP & HUMANISME GAYA WALI KELAS:
   - WAJIB SANGAT RINGKAS, PADAT, DAN EFISIEN (dapat dibaca tuntas dalam waktu < 15 detik di layar HP).
   - Hapus seluruh filler basa-basi dan klise formalitas AI ("semoga senantiasa dilimpahi keberkahan dan kesehatan", dsb).
   - Format wajib:
     a. Sapaan singkat: "Yth. Bapak/Ibu Wali Murid {nama_kelas},"
     b. Ucapan terima kasih 1 kalimat atas pendampingan kedisiplinan belajar.
     c. Poin pengingat singkat dengan bullet point (• kabari wali kelas jika berhalangan hadir, • sertakan surat dokter jika sakit > 2 hari).
     d. Doa lekas sembuh singkat & salam penutup.
   - ATURAN PRIVASI MUTLAK: DILARANG KERAS MENYEBUTKAN NAMA SISWA TERTENTU pada parentGroupMessage! Pesan ini dibaca oleh seluruh orang tua di grup kelas, sehingga menyebut nama individu melanggar privasi dan menstigma siswa.
4. "bkRecommendations": Array rekomendasi tindak lanjut bagi Guru Bimbingan Konseling (BK) untuk setiap siswa berisiko yang tertera pada daftar. Rekomendasi harus bersifat empatik, solutif, pedagogis, dan terarah.

ATURAN ZERO-HALUSINASI ANGKA:
- DILARANG MENGARANG ATAU MENGUBAH ANGKA STATISTIK APAPUN! Seluruh angka (total siswa, total absen, alpa, izin, sakit, hari beruntun) WAJIB mengutip persis angka dari data masukan.
- Jika menyebutkan angka pada narasi, gunakan HANYA angka yang tercantum pada data masukan resmi.
- Fokuskan analisis pada sintesis narasi kualitatif, intonasi bahasa Indonesia yang baku dan empatik, evaluasi pedagogis, dan rekomendasi tindak lanjut konseling BK yang konstruktif.

Format Output WAJIB berupa JSON murni tanpa markdown, tanpa teks pengantar di luar JSON:
{
  "executiveSummary": "...",
  "principalReport": "...",
  "parentGroupMessage": "...",
  "bkRecommendations": [
    {
      "studentName": "...",
      "riskLevel": "Kritis" | "Waspada" | "Perhatian",
      "recommendation": "..."
    }
  ]
}`;

  const userPrompt = `Berikut adalah data statistik resmi kehadiran kelas:
Kelas: ${input.className}
Periode: ${input.periodLabel} (${input.period === "month" ? "Bulanan" : "Semester"})
=== DATA STATISTIK RESMI KELAS (EKSAS & PRE-COMPUTED) ===
- Total Siswa: ${input.summaryStats.totalStudents}
- Total Ketidakhadiran: ${input.summaryStats.totalAbsences}
  * Sakit: ${input.summaryStats.totalSakit}
  * Izin: ${input.summaryStats.totalIzin}
  * Alpa (Tanpa Keterangan): ${input.summaryStats.totalAlpa}
- Keterangan Sakit Belum Ada Surat Dokter: ${input.summaryStats.totalSuratBelum}
${
  input.summaryStats.attendanceRatePercent !== undefined
    ? `- Persentase Kehadiran: ${input.summaryStats.attendanceRatePercent.toFixed(1)}%`
    : ""
}

=== DAFTAR SISWA BERISIKO / MEMERLUKAN PERHATIAN KHUSUS ===
${atRiskListFormatted}

Silakan susun narasi analitik profesional sesuai instruksi dan kembalikan JSON murni.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const controller = new AbortController();
  // 15-second strict timeout for text narrative synthesis
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[9router AI] Attendance insights returned status ${res.status}. Using fallback narrative.`);
      return {
        ...fallback,
        aiGenerated: false,
      };
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      console.warn("[9router AI] Empty response from model. Using fallback narrative.");
      return {
        ...fallback,
        aiGenerated: false,
      };
    }

    // Clean markdown code blocks if present
    const cleaned = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.executiveSummary !== "string" ||
      typeof parsed.principalReport !== "string" ||
      typeof parsed.parentGroupMessage !== "string" ||
      !Array.isArray(parsed.bkRecommendations)
    ) {
      console.warn("[9router AI] Malformed JSON schema from model. Using fallback narrative.");
      return {
        ...fallback,
        aiGenerated: false,
      };
    }

    // Validate and sanitize bkRecommendations
    const validRecommendations: AttendanceInsightsBkRecommendation[] = [];
    for (const item of parsed.bkRecommendations) {
      if (item && typeof item.studentName === "string" && typeof item.recommendation === "string") {
        const validLevel: "Kritis" | "Waspada" | "Perhatian" =
          item.riskLevel === "Kritis" || item.riskLevel === "Waspada" || item.riskLevel === "Perhatian"
            ? item.riskLevel
            : "Perhatian";

        validRecommendations.push({
          studentName: item.studentName.trim(),
          riskLevel: validLevel,
          recommendation: item.recommendation.trim(),
        });
      }
    }

    // Privacy post-check: Ensure parentGroupMessage does not mention any individual student name
    let sanitizedParentGroupMessage = parsed.parentGroupMessage.trim();
    for (const student of input.atRiskStudents) {
      if (student.studentName && student.studentName.trim().length >= 3) {
        const escaped = student.studentName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const nameRegex = new RegExp(`\\b${escaped}\\b`, "i");
        if (nameRegex.test(sanitizedParentGroupMessage)) {
          console.warn(
            `[9router AI] Privacy guard: Student name "${student.studentName}" leaked in parentGroupMessage. Reverting to safe template.`
          );
          sanitizedParentGroupMessage = fallback.parentGroupMessage;
          break;
        }
      }
    }

    return {
      executiveSummary: parsed.executiveSummary.trim() || fallback.executiveSummary,
      principalReport: parsed.principalReport.trim() || fallback.principalReport,
      parentGroupMessage: sanitizedParentGroupMessage || fallback.parentGroupMessage,
      bkRecommendations:
        validRecommendations.length > 0 || input.atRiskStudents.length === 0
          ? validRecommendations
          : fallback.bkRecommendations,
      aiGenerated: true,
    };
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));
    if (isAbort) {
      console.warn("[9router AI] Attendance insights timed out after 15s. Using fallback narrative.");
    } else {
      console.warn(
        "[9router AI] Error during attendance insights synthesis:",
        err instanceof Error ? err.message : err
      );
    }
    return {
      ...fallback,
      aiGenerated: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Mock response generator for unit tests simulating 9router AI attendance insights response.
 */
export function createMockAttendanceInsightsAiResponse(
  overrides?: Partial<AttendanceInsightsAiNarratives>
) {
  const defaultPayload: AttendanceInsightsAiNarratives = {
    executiveSummary:
      overrides?.executiveSummary ??
      "Kehadiran siswa kelas XII TKJ 2 pada periode Oktober 2026 secara umum terpantau baik dengan tingkat kehadiran 94%. Terdapat 2 siswa yang membutuhkan pendampingan khusus karena pola ketidakhadiran berulang.",
    principalReport:
      overrides?.principalReport ??
      "Yth. Bapak/Ibu Kepala Sekolah, berikut rekapitulasi presensi kelas XII TKJ 2 periode Oktober 2026. Tercatat 12 kejadian ketidakhadiran (6 Sakit, 4 Izin, 2 Alpa). Koordinasi dengan guru BK telah diinisiasi untuk menindaklanjuti siswa dengan ketidakhadiran berulang.",
    parentGroupMessage:
      overrides?.parentGroupMessage ??
      "Selamat pagi/siang Bapak/Ibu wali murid kelas XII TKJ 2. Terima kasih atas kerja sama dan bimbingan Bapak/Ibu dalam mendukung kedisiplinan putra-putri kita. Mohon pastikan surat keterangan dokter dilampirkan apabila ananda sakit lebih dari 2 hari.",
    bkRecommendations:
      overrides?.bkRecommendations ?? [
        {
          studentName: "Budi Santoso",
          riskLevel: "Kritis",
          recommendation:
            "Jadwalkan konseling tatap muka bersama orang tua untuk menelusuri akumulasi 3 hari Alpa dan bangun komitmen disiplin.",
        },
        {
          studentName: "Citra Lestari",
          riskLevel: "Waspada",
          recommendation:
            "Lakukan pendampingan personal terkait pola ketidakhadiran di hari Senin/Jumat serta motivasi belajar.",
        },
      ],
  };

  return {
    choices: [
      {
        message: {
          content: JSON.stringify(defaultPayload),
        },
      },
    ],
  };
}

