import os
import io
import time
import json
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import paddle
from paddleocr import PaddleOCR

from extractor import process_document_bytes
from letter_parser import process_letter_bytes

# Maximum allowed file size for OCR processing: 25 MB
MAX_FILE_SIZE = 25 * 1024 * 1024

# Internal security secret for microservice hardening (SEC-FINDING-04)
OCR_INTERNAL_SECRET = os.environ.get("OCR_INTERNAL_SECRET", "surat-ijin-internal-secret-2026")

async def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    """Enforce shared-secret authentication for internal endpoints."""
    if OCR_INTERNAL_SECRET:
        if not x_internal_secret or x_internal_secret != OCR_INTERNAL_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Akses ditolak: Token autentikasi internal tidak valid atau tidak disertakan."
            )

_ocr_engine: Optional[PaddleOCR] = None
_active_device: str = "cpu"
_device_info: Dict[str, Any] = {}
_device_name: str = "CPU"

def detect_device_capabilities() -> Dict[str, Any]:
    """Detect available hardware acceleration (CUDA GPU vs CPU)."""
    cuda_available = False
    device_count = 0
    device_name = "CPU"
    error_detail = None
    try:
        cuda_available = bool(paddle.is_compiled_with_cuda())
        if cuda_available:
            device_count = paddle.device.cuda.device_count()
            if device_count > 0:
                try:
                    device_name = paddle.device.cuda.get_device_name(0)
                except Exception as ex:
                    device_name = "NVIDIA CUDA GPU"
                    error_detail = str(ex)
            else:
                error_detail = "Paddle dikompilasi dengan CUDA tetapi device_count == 0 (driver GPU mungkin belum siap)."
        else:
            error_detail = "Paket paddlepaddle saat ini adalah build CPU. Untuk GPU, instal paddlepaddle-gpu."
    except Exception as e:
        error_detail = str(e)
        print(f"[OCR Hardware] Device detection warning: {e}")

    return {
        "cuda_available": cuda_available,
        "device_count": device_count,
        "device_name": device_name,
        "can_use_gpu": cuda_available and device_count > 0,
        "error_detail": error_detail
    }

def switch_to_cpu() -> PaddleOCR:
    """Safely rebuild OCR engine on CPU after a GPU initialization or runtime failure."""
    global _ocr_engine, _active_device, _device_name
    print("[OCR Service] Falling back OCR engine to CPU...")
    try:
        paddle.set_device("cpu")
    except Exception as e:
        print(f"[OCR Service] Warning setting CPU device: {e}")
    _ocr_engine = PaddleOCR(use_angle_cls=False, lang="en", show_log=False, use_gpu=False)
    _active_device = "cpu"
    _device_name = "CPU (Fallback)"
    return _ocr_engine

def get_ocr_engine() -> PaddleOCR:
    global _ocr_engine, _active_device, _device_info, _device_name
    if _ocr_engine is None:
        _device_info = detect_device_capabilities()
        if _device_info["can_use_gpu"]:
            try:
                print(f"[OCR Service] CUDA GPU detected ({_device_info['device_name']}). Initializing with GPU priority...")
                paddle.set_device("gpu")
                _ocr_engine = PaddleOCR(use_angle_cls=False, lang="en", show_log=False, use_gpu=True)
                _active_device = "gpu"
                _device_name = _device_info["device_name"]
                print(f"[OCR Service] Successfully loaded PaddleOCR on GPU: {_device_name}")
            except Exception as e:
                print(f"[OCR Service] GPU initialization failed ({e}). Auto-falling back to CPU...")
                switch_to_cpu()
        else:
            print("[OCR Service] No CUDA GPU available. Initializing PaddleOCR on CPU...")
            try:
                paddle.set_device("cpu")
            except Exception:
                pass
            _ocr_engine = PaddleOCR(use_angle_cls=False, lang="en", show_log=False, use_gpu=False)
            _active_device = "cpu"
            _device_name = "CPU"
            print("[OCR Service] Successfully loaded PaddleOCR on CPU.")
    return _ocr_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm PaddleOCR in memory so first user request has minimal latency
    print("[OCR Service] Pre-warming PaddleOCR model into memory...")
    t0 = time.time()
    get_ocr_engine()
    print(f"[OCR Service] Model warmed up in {time.time() - t0:.2f}s")
    yield
    print("[OCR Service] Shutting down...")

app = FastAPI(
    title="Surat Ijin - PaddleOCR Microservice",
    description="Internal high-precision student roster extraction microservice using PaddleOCR",
    version="1.0.0",
    lifespan=lifespan
)

# Restricted CORS origins (localhost only by default)
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if os.environ.get("ALLOWED_ORIGINS"):
    allowed_origins.extend([o.strip() for o in os.environ.get("ALLOWED_ORIGINS").split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/health")
def health_check():
    global _device_info
    if not _device_info:
        _device_info = detect_device_capabilities()
    return {
        "status": "ok",
        "service": "paddleocr-roster-service",
        "version": "1.0.0",
        "model_loaded": _ocr_engine is not None,
        "device": _active_device,
        "cuda_available": _device_info.get("cuda_available", False),
        "device_name": _device_name,
        "error_detail": _device_info.get("error_detail")
    }

@app.post("/extract", dependencies=[Depends(verify_internal_secret)])
async def extract_roster(file: UploadFile = File(...)):
    filename = file.filename or "uploaded_file"
    content_type = file.content_type or ""

    # Validate file extension / mime type
    allowed_exts = (".jpg", ".jpeg", ".png", ".webp", ".pdf", ".heic")
    if not filename.lower().endswith(allowed_exts) and not any(
        t in content_type for t in ["image/", "application/pdf"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format file tidak didukung. Harap unggah foto (JPG, PNG, WebP) atau file PDF."
        )

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gagal membaca file upload: {str(e)}"
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File kosong tidak dapat diproses."
        )

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ukuran file terlalu besar. Maksimal 25 MB."
        )

    t0 = time.time()
    try:
        ocr = get_ocr_engine()
        result = process_document_bytes(file_bytes, filename, ocr)
        elapsed_sec = round(time.time() - t0, 3)
        result["processing_time_seconds"] = elapsed_sec
        return JSONResponse(content=result)
    except Exception as err:
        if _active_device == "gpu":
            print(f"[OCR Error] GPU inference failed ({err}). Retrying with CPU fallback...")
            try:
                ocr = switch_to_cpu()
                result = process_document_bytes(file_bytes, filename, ocr)
                elapsed_sec = round(time.time() - t0, 3)
                result["processing_time_seconds"] = elapsed_sec
                return JSONResponse(content=result)
            except Exception as retry_err:
                print(f"[OCR Error] CPU fallback also failed for {filename}: {retry_err}")
                err = retry_err
        print(f"[OCR Error] Failed to process {filename}: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengekstrak data dari dokumen: {str(err)}"
        )

@app.post("/extract-letter", dependencies=[Depends(verify_internal_secret)])
async def extract_letter(
    file: UploadFile = File(...),
    students: Optional[str] = Form(None)
):
    filename = file.filename or "uploaded_letter"
    content_type = file.content_type or ""

    # Validate file extension / mime type
    allowed_exts = (".jpg", ".jpeg", ".png", ".webp", ".pdf", ".heic")
    if not filename.lower().endswith(allowed_exts) and not any(
        t in content_type for t in ["image/", "application/pdf"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format file tidak didukung. Harap unggah foto surat izin (JPG, PNG, WebP) atau file PDF."
        )

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gagal membaca file upload: {str(e)}"
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File kosong tidak dapat diproses."
        )

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ukuran file terlalu besar. Maksimal 25 MB."
        )

    # Parse students list JSON
    students_list = []
    if students:
        try:
            parsed = json.loads(students)
            if isinstance(parsed, list):
                students_list = parsed
        except Exception as e:
            print(f"[OCR Warning] Failed to parse students JSON: {e}")

    t0 = time.time()
    try:
        ocr = get_ocr_engine()
        result = process_letter_bytes(file_bytes, filename, students_list, ocr)
        elapsed_sec = round(time.time() - t0, 3)
        result["processing_time_seconds"] = elapsed_sec
        return JSONResponse(content=result)
    except Exception as err:
        if _active_device == "gpu":
            print(f"[OCR Error] GPU letter analysis failed ({err}). Retrying with CPU fallback...")
            try:
                ocr = switch_to_cpu()
                result = process_letter_bytes(file_bytes, filename, students_list, ocr)
                elapsed_sec = round(time.time() - t0, 3)
                result["processing_time_seconds"] = elapsed_sec
                return JSONResponse(content=result)
            except Exception as retry_err:
                print(f"[OCR Error] CPU fallback also failed for letter {filename}: {retry_err}")
                err = retry_err
        print(f"[OCR Error] Failed to process letter {filename}: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menganalisis surat izin: {str(err)}"
        )

