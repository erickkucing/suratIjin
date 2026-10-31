import os
import io
import time
import json
import ctypes
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

# Proactively locate and preload NVIDIA pip libraries (cuDNN / cuBLAS) so dlopen finds them
try:
    _ocr_base = os.path.dirname(__file__)
    for _site_parent in [_ocr_base, "/opt/surat-ijin/services/ocr-service"]:
        _venv_site = os.path.join(_site_parent, "venv")
        if os.path.isdir(_venv_site):
            for _root, _dirs, _files in os.walk(_venv_site):
                if any(k in _root for k in ["cudnn", "cublas", "nvidia"]) and ("lib" in _dirs or any(f.startswith("lib") and ".so" in f for f in _files)):
                    _lib_dir = os.path.join(_root, "lib") if "lib" in _dirs else _root
                    _curr_ld = os.environ.get("LD_LIBRARY_PATH", "")
                    if _lib_dir not in _curr_ld:
                        os.environ["LD_LIBRARY_PATH"] = f"{_lib_dir}:{_curr_ld}" if _curr_ld else _lib_dir

                    # Proactively create unversioned symlinks if missing (e.g. libcublas.so.12 -> libcublas.so)
                    for f in os.listdir(_lib_dir):
                        if f.startswith(("libcudnn", "libcublas")) and ".so." in f:
                            base_so = f.split(".so.")[0] + ".so"
                            target_link = os.path.join(_lib_dir, base_so)
                            if not os.path.exists(target_link):
                                try:
                                    os.symlink(f, target_link)
                                except Exception:
                                    pass

                    for _so_name in [
                        "libcublasLt.so.12", "libcublasLt.so.11", "libcublasLt.so",
                        "libcublas.so.12", "libcublas.so.11", "libcublas.so",
                        "libcudnn_ops_infer.so.8", "libcudnn_ops_infer.so",
                        "libcudnn_cnn_infer.so.8", "libcudnn_cnn_infer.so",
                        "libcudnn_adv_infer.so.8", "libcudnn_adv_infer.so",
                        "libcudnn.so.8", "libcudnn.so",
                    ]:
                        _so_file = os.path.join(_lib_dir, _so_name)
                        if os.path.isfile(_so_file):
                            try:
                                ctypes.CDLL(_so_file, mode=ctypes.RTLD_GLOBAL)
                            except Exception:
                                pass
except Exception:
    pass

# Memory and compatibility flags for Pascal sm_61 architecture (Quadro P1000 4GB VRAM)
os.environ["FLAGS_allocator_strategy"] = "auto_growth"
os.environ["FLAGS_fraction_of_gpu_memory_to_use"] = "0.5"
os.environ["FLAGS_initial_gpu_memory_in_mb"] = "256"
os.environ["FLAGS_reallocate_gpu_memory_in_mb"] = "128"
os.environ["FLAGS_conv_workspace_size_limit"] = "64"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_cudnn_exhaustive_search"] = "0"
os.environ["FLAGS_cudnn_deterministic"] = "0"

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
try:
    import paddle
    from paddleocr import PaddleOCR

    # Intercept inference predictor creation to remove fused_conv2d_add_act pass for Pascal GPU (sm_61) compatibility
    try:
        import paddle.inference as _paddle_infer
        _orig_create_predictor = _paddle_infer.create_predictor

        def _safe_create_predictor(config):
            try:
                config.delete_pass("conv2d_add_act_fuse_pass")
                config.delete_pass("conv2d_add_fuse_pass")
                config.switch_ir_optim(False)
            except Exception:
                pass
            return _orig_create_predictor(config)

        _paddle_infer.create_predictor = _safe_create_predictor
    except Exception:
        pass
except ImportError:
    paddle = None
    PaddleOCR = None

from extractor import process_document_bytes
from letter_parser import process_letter_bytes

# Load .env file automatically if present in current dir or project root
try:
    from dotenv import load_dotenv
    for _p in [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        "/opt/surat-ijin/.env",
    ]:
        if os.path.isfile(_p):
            load_dotenv(_p)
            break
except Exception:
    pass

# Maximum allowed file size for OCR processing: 25 MB
MAX_FILE_SIZE = 25 * 1024 * 1024

# Internal security secret for microservice hardening (SEC-FINDING-04)
DEFAULT_INTERNAL_SECRET = "surat-ijin-internal-secret-2026"
PLACEHOLDER_INTERNAL_SECRET = "ganti_dengan_token_rahasia_internal_microservice_ocr_2026"

def get_allowed_internal_secrets() -> set:
    configured = (os.environ.get("OCR_INTERNAL_SECRET") or "").strip()
    secrets = {DEFAULT_INTERNAL_SECRET}
    if configured:
        secrets.add(configured)
        # If .env has the example placeholder, also allow default secret
        if configured == PLACEHOLDER_INTERNAL_SECRET:
            secrets.add(DEFAULT_INTERNAL_SECRET)
    return secrets

async def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    """Enforce shared-secret authentication for internal endpoints."""
    allowed = get_allowed_internal_secrets()
    token = (x_internal_secret or "").strip()
    if not token or token not in allowed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akses ditolak: Token autentikasi internal tidak valid atau tidak disertakan."
        )

_ocr_engine: Optional[PaddleOCR] = None
_active_device: str = "cpu"
_device_info: Dict[str, Any] = {}
_device_name: str = "CPU"
_gpu_fallback_error: Optional[str] = None

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

def switch_to_cpu(err_detail: Optional[str] = None) -> PaddleOCR:
    """Safely rebuild OCR engine on CPU after a GPU initialization or runtime failure."""
    global _ocr_engine, _active_device, _device_name, _gpu_fallback_error
    print(f"[OCR Service] Falling back OCR engine to CPU... Error: {err_detail}")
    _gpu_fallback_error = err_detail
    try:
        paddle.set_device("cpu")
    except Exception as e:
        print(f"[OCR Service] Warning setting CPU device: {e}")
    cpu_cores = min(4, os.cpu_count() or 4)
    _ocr_engine = PaddleOCR(
        use_angle_cls=False,
        lang="en",
        show_log=False,
        use_gpu=False,
        rec_batch_num=32,
        ir_optim=False,
        enable_mkldnn=True,
        cpu_threads=cpu_cores
    )
    _active_device = "cpu"
    _device_name = "CPU (Fallback)"
    return _ocr_engine

def get_ocr_engine() -> PaddleOCR:
    global _ocr_engine, _active_device, _device_info, _device_name, _gpu_fallback_error
    if _ocr_engine is None:
        _device_info = detect_device_capabilities()
        if _device_info["can_use_gpu"]:
            try:
                print(f"[OCR Service] CUDA GPU detected ({_device_info['device_name']}). Initializing with GPU priority...")
                paddle.set_device("gpu")
                _ocr_engine = PaddleOCR(
                    use_angle_cls=False,
                    lang="en",
                    show_log=False,
                    use_gpu=True,
                    rec_batch_num=6,
                    max_text_length=40,
                    det_limit_side_len=960,
                    det_limit_type="max",
                    gpu_mem=400,
                    ir_optim=False
                )
                _active_device = "gpu"
                _device_name = _device_info["device_name"]
                _gpu_fallback_error = None
                print(f"[OCR Service] Successfully loaded PaddleOCR on GPU: {_device_name}")
            except Exception as e:
                print(f"[OCR Service] GPU initialization failed ({e}). Auto-falling back to CPU...")
                switch_to_cpu(str(e))
        else:
            print("[OCR Service] No CUDA GPU available. Initializing PaddleOCR on CPU...")
            try:
                paddle.set_device("cpu")
            except Exception:
                pass
            cpu_cores = min(4, os.cpu_count() or 4)
            _ocr_engine = PaddleOCR(
                use_angle_cls=False,
                lang="en",
                show_log=False,
                use_gpu=False,
                rec_batch_num=16,
                max_text_length=40,
                ir_optim=False,
                enable_mkldnn=True,
                cpu_threads=cpu_cores
            )
            _active_device = "cpu"
            _device_name = "CPU"
            print("[OCR Service] Successfully loaded PaddleOCR on CPU.")
    return _ocr_engine

def prewarm_ocr_engine(ocr: PaddleOCR):
    """Run a single forward pass with text pixels so detector and recognizer (cuBLAS matmul) are pre-warmed."""
    try:
        import numpy as np
        import cv2
        # 64x256 RGB dummy image with clear text to trigger both detector and recognizer
        dummy_img = np.full((64, 256, 3), 255, dtype=np.uint8)
        cv2.putText(dummy_img, "WARMUP", (20, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
        ocr.ocr(dummy_img, cls=False)
        print(f"[OCR Service] Dummy forward pass successful on device: {_active_device}")
    except Exception as e:
        print(f"[OCR Service] Pre-warm forward pass encountered exception: {e}")
        if _active_device == "gpu":
            switch_to_cpu(str(e))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm PaddleOCR in memory and run warm-up inference pass
    print("[OCR Service] Pre-warming PaddleOCR model into memory and GPU context...")
    t0 = time.time()
    engine = get_ocr_engine()
    prewarm_ocr_engine(engine)
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
        "error_detail": _device_info.get("error_detail") or _gpu_fallback_error
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
        print(f"[OCR Timing] {filename} ({len(file_bytes)} B) -> {elapsed_sec}s ({_active_device}: {_device_name}, {result.get('total_students', 0)} students)")
        result["processing_time_seconds"] = elapsed_sec
        result["device"] = _active_device
        result["device_name"] = _device_name
        if _gpu_fallback_error:
            result["gpu_fallback_error"] = _gpu_fallback_error
        return JSONResponse(content=result)
    except Exception as err:
        if _active_device == "gpu":
            print(f"[OCR Error] GPU inference failed ({err}). Retrying with CPU fallback...")
            try:
                ocr = switch_to_cpu(str(err))
                result = process_document_bytes(file_bytes, filename, ocr)
                elapsed_sec = round(time.time() - t0, 3)
                result["processing_time_seconds"] = elapsed_sec
                result["device"] = _active_device
                result["device_name"] = _device_name
                result["gpu_fallback_error"] = str(err)
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
        print(f"[OCR Timing] {filename} ({len(file_bytes)} B) -> {elapsed_sec}s ({_active_device}: {_device_name}, {result.get('total_students', 0)} students)")
        result["processing_time_seconds"] = elapsed_sec
        result["device"] = _active_device
        result["device_name"] = _device_name
        if _gpu_fallback_error:
            result["gpu_fallback_error"] = _gpu_fallback_error
        return JSONResponse(content=result)
    except Exception as err:
        if _active_device == "gpu":
            print(f"[OCR Error] GPU letter analysis failed ({err}). Retrying with CPU fallback...")
            try:
                ocr = switch_to_cpu(str(err))
                result = process_letter_bytes(file_bytes, filename, students_list, ocr)
                elapsed_sec = round(time.time() - t0, 3)
                result["processing_time_seconds"] = elapsed_sec
                result["device"] = _active_device
                result["device_name"] = _device_name
                result["gpu_fallback_error"] = str(err)
                return JSONResponse(content=result)
            except Exception as retry_err:
                print(f"[OCR Error] CPU fallback also failed for letter {filename}: {retry_err}")
                err = retry_err
        print(f"[OCR Error] Failed to process letter {filename}: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menganalisis surat izin: {str(err)}"
        )

