import math
import os
from typing import Literal, Optional

os.environ["NUMPY_DISABLE_CPU_FEATURES"] = "1"

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

if __package__:
    from .designer.router import router as designer_router
else:
    from designer.router import router as designer_router

try:
    from backend.model import (
        Gen_AB,
        binary_entropy,
        Gen_Eve,
        gaussian_overlap,
        cascade_correct,
        compute_QBER,
        compute_QBER_AB,
        decode_threshold,
        decrypt_message_aes_gcm,
        encrypt_message_aes_gcm,
        extract_state,
        generate_toeplitz_seed,
        privacy_amplification,
    )
except ModuleNotFoundError:
    from model import (
        Gen_AB,
        binary_entropy,
        Gen_Eve,
        gaussian_overlap,
        cascade_correct,
        compute_QBER,
        compute_QBER_AB,
        decode_threshold,
        decrypt_message_aes_gcm,
        encrypt_message_aes_gcm,
        extract_state,
        generate_toeplitz_seed,
        privacy_amplification,
    )


if __package__:
    from .channel_runtime import DEVICE, BASE_DIR, DATA_DIR, WEIGHTS_DIR, POLICY_WEIGHTS_FILENAME, CHANNEL_DATASETS, load_channel_dataset, slice_channel_window, policy
else:
    from channel_runtime import DEVICE, BASE_DIR, DATA_DIR, WEIGHTS_DIR, POLICY_WEIGHTS_FILENAME, CHANNEL_DATASETS, load_channel_dataset, slice_channel_window, policy

QBER_ABORT_THRESHOLD = 0.11
AES_KEY_SIZE_BITS = 256
PREVIEW_BITS = 256

app = FastAPI(
    title="QuantumShield FinEdu Simulation API",
    version="2.0.0",
    description="Measured-channel CV-QKD/FSO simulation with AES-256-GCM protection.",
)
app.include_router(designer_router)

default_origins = "*"
raw_origins = os.getenv("QKD_ALLOWED_ORIGINS", default_origins).strip()

if raw_origins == "*":
    allowed_origins = ["*"]
    allow_credentials = False
else:
    allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulateRequest(BaseModel):
    channel_dataset: Literal[
        "clearlowSI.csv", "clearhighSI.csv", "lightrain.csv"
    ] = "clearlowSI.csv"
    window_start: int = Field(default=0, ge=0)
    sample_size: int = Field(default=8192, ge=1024, le=65536)
    mode: Literal["fixed", "adaptive"] = "adaptive"
    fixed_rho: float = Field(default=1.0, ge=0.0, le=5.0)
    Pt_dBm: float = Field(default=5.0, ge=-5.0, le=10.0)
    xi: float = Field(default=30.0, ge=0.0, le=60.0)
    eve_active: bool = False
    rE: float = Field(default=100.0, ge=0.0, le=200.0)
    document_name: str = Field(default="Bao_cao_tai_chinh_Q2.pdf", min_length=1, max_length=255)
    plaintext_payload: str = Field(
        default="Ngân hàng ABC: Doanh thu 5.000 tỷ, Lợi nhuận 600 tỷ, Giao dịch lớn Q2",
        max_length=2_000_000,
    )


class SimulateResponse(BaseModel):
    channel_dataset: str
    dataset_label: str
    model_weights: str
    window_start: int
    dataset_size: int
    sample_size: int
    channel_mean: float
    channel_std: float
    rho: float
    qber: float
    psift: float
    peve: float
    eve_interception_strength: float
    bits_preview: list[int]
    sifted_key_len: int
    ec_leaked_bits: int
    estimated_eve_information_bits: float
    final_key_len: int
    final_key_alice: list[int]
    final_key_bob: list[int]
    accepted: bool
    abort_reason: Optional[str]
    encryption_algorithm: str
    aes_key_bits_used: int
    ciphertext: str
    nonce: str
    authentication_tag: str
    decrypted_payload: str
    integrity_verified: bool


@app.get("/api/health")
@app.get("/v1/health")
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": app.version,
        "device": str(DEVICE),
        "policy_loaded": True,
        "policy_weights": POLICY_WEIGHTS_FILENAME,
        "datasets": list(CHANNEL_DATASETS),
    }


@app.get("/api/datasets")
@app.get("/v1/datasets")
@app.get("/datasets")
async def datasets():
    result = []
    for filename, label in CHANNEL_DATASETS.items():
        path = os.path.join(DATA_DIR, filename)
        result.append(
            {
                "filename": filename,
                "label": label,
                "available": os.path.isfile(path),
                "file_size_bytes": os.path.getsize(path) if os.path.isfile(path) else 0,
            }
        )
    return result




@app.post("/api/simulate", response_model=SimulateResponse)
@app.post("/v1/simulate", response_model=SimulateResponse)
@app.post("/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest):
    try:
        h_raw, window_start, dataset_size = slice_channel_window(
            req.channel_dataset, req.window_start, req.sample_size
        )
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    xi_rad = math.radians(req.xi)
    reference_distance_m = 10_000.0
    attenuation_coefficient = 0.0001
    effective_path_length = reference_distance_m / math.cos(xi_rad)
    zenith_attenuation = math.exp(-attenuation_coefficient * effective_path_length)
    h = h_raw * zenith_attenuation

    transmit_power_watts = 10 ** (req.Pt_dBm / 10.0) / 1000.0
    state = extract_state(h, transmit_power_watts)

    if req.mode == "fixed":
        rho = float(req.fixed_rho)
    else:
        state_tensor = torch.tensor(
            state, dtype=torch.float32, device=DEVICE
        ).unsqueeze(0)
        with torch.no_grad():
            policy_mean = policy(state_tensor)
            rho = float(torch.sigmoid(policy_mean).item() * 5.0)

    h_tensor = torch.tensor(h, dtype=torch.float32, device=DEVICE)
    (
        I_A,
        I_B,
        bits_transmitted,
        charlie_basis,
        alice_basis,
        bob_basis,
        signal_amplitude,
    ) = Gen_AB(h_tensor, transmit_power_watts, DEVICE)

    eve_interception_strength = 0.0
    if req.eve_active:
        eve_interception_strength = gaussian_overlap(req.rE)

    bits_alice = decode_threshold(I_A, signal_amplitude, rho)
    bits_bob = decode_threshold(I_B, signal_amplitude, rho)

    sift_mask = (alice_basis == bob_basis) & (alice_basis == charlie_basis)
    erased_value = torch.tensor(-1, device=DEVICE)
    sifted_alice = torch.where(sift_mask, bits_alice, erased_value)
    sifted_bob = torch.where(sift_mask, bits_bob, erased_value)
    qber, psift = compute_QBER_AB(sifted_alice, sifted_bob)

    eve_detected_count = 0
    if req.eve_active:
        I_E, A_E = Gen_Eve(
            h_tensor,
            req.rE,
            bits_transmitted,
            charlie_basis,
            DEVICE,
            transmit_power_watts,
        )
        eve_bits_orientation_1 = decode_threshold(I_E, A_E, rho)
        eve_bits_orientation_2 = decode_threshold(-I_E, A_E, rho)
        retained = sift_mask & (bits_alice != -1) & (bits_bob != -1) & (eve_bits_orientation_1 != -1)
        eve_detected_count = int(retained.sum().item())
        peve = min(
            compute_QBER(eve_bits_orientation_1[retained], bits_alice[retained]),
            compute_QBER(eve_bits_orientation_2[retained], bits_alice[retained]),
        ) if eve_detected_count else 0.5
    else:
        peve = 0.5

    bits_preview = sifted_bob[:PREVIEW_BITS].cpu().tolist()
    valid_mask = (sifted_alice != -1) & (sifted_bob != -1)
    sifted_key_alice = sifted_alice[valid_mask].cpu().tolist()
    sifted_key_bob = sifted_bob[valid_mask].cpu().tolist()
    sifted_key_len = len(sifted_key_alice)

    final_key_alice: list[int] = []
    final_key_bob: list[int] = []
    ec_leaked_bits = 0
    estimated_eve_information_bits = 0.0
    abort_reason: Optional[str] = None

    if sifted_key_len == 0:
        abort_reason = "ZERO_SIFTED_BITS"
    elif qber >= QBER_ABORT_THRESHOLD:
        abort_reason = "QBER_ABOVE_11_PERCENT"
    else:
        corrected_bob, ec_leaked_bits, ec_success = cascade_correct(
            sifted_key_alice, sifted_key_bob, qber
        )
        if not ec_success:
            abort_reason = "ERROR_CORRECTION_FAILED"
        else:
            estimated_eve_information_bits = eve_detected_count * (
                1.0 - binary_entropy(peve)
            )
            security_margin_bits = 32
            secure_key_length = max(
                0,
                int(
                    math.floor(
                        sifted_key_len
                        - estimated_eve_information_bits
                        - ec_leaked_bits
                        - security_margin_bits
                    )
                ),
            )
            if secure_key_length == 0:
                abort_reason = "NO_SECURE_KEY_AFTER_PRIVACY_AMPLIFICATION"
            else:
                toeplitz_seed = generate_toeplitz_seed(
                    sifted_key_len, secure_key_length
                )
                final_key_alice = privacy_amplification(
                    sifted_key_alice, secure_key_length, toeplitz_seed
                )
                final_key_bob = privacy_amplification(
                    corrected_bob, secure_key_length, toeplitz_seed
                )
                if final_key_alice != final_key_bob:
                    abort_reason = "FINAL_KEYS_DO_NOT_MATCH"
                elif secure_key_length < AES_KEY_SIZE_BITS:
                    abort_reason = "INSUFFICIENT_AES_256_KEY_MATERIAL"

    ciphertext = ""
    nonce = ""
    authentication_tag = ""
    decrypted_payload = ""
    integrity_verified = False

    if abort_reason is None:
        associated_data = (
            f"QuantumShield|{req.document_name}|{req.channel_dataset}|"
            f"{window_start}|{req.sample_size}"
        )
        try:
            ciphertext, nonce, authentication_tag = encrypt_message_aes_gcm(
                req.plaintext_payload,
                final_key_alice,
                associated_data,
            )
            decrypted_payload = decrypt_message_aes_gcm(
                ciphertext,
                nonce,
                authentication_tag,
                final_key_bob,
                associated_data,
            )
            integrity_verified = decrypted_payload == req.plaintext_payload
            if not integrity_verified:
                abort_reason = "AES_GCM_INTEGRITY_CHECK_FAILED"
        except Exception as exc:
            abort_reason = f"AES_GCM_ERROR: {type(exc).__name__}"

    accepted = abort_reason is None and integrity_verified
    return SimulateResponse(
        channel_dataset=req.channel_dataset,
        dataset_label=CHANNEL_DATASETS[req.channel_dataset],
        model_weights=POLICY_WEIGHTS_FILENAME,
        window_start=window_start,
        dataset_size=dataset_size,
        sample_size=req.sample_size,
        channel_mean=float(h_raw.mean()),
        channel_std=float(h_raw.std()),
        rho=rho,
        qber=qber,
        psift=psift,
        peve=peve,
        eve_interception_strength=eve_interception_strength,
        bits_preview=bits_preview,
        sifted_key_len=sifted_key_len,
        ec_leaked_bits=ec_leaked_bits,
        estimated_eve_information_bits=estimated_eve_information_bits,
        final_key_len=len(final_key_alice),
        final_key_alice=final_key_alice,
        final_key_bob=final_key_bob,
        accepted=accepted,
        abort_reason=abort_reason,
        encryption_algorithm="AES-256-GCM",
        aes_key_bits_used=AES_KEY_SIZE_BITS if accepted else 0,
        ciphertext=ciphertext,
        nonce=nonce,
        authentication_tag=authentication_tag,
        decrypted_payload=decrypted_payload,
        integrity_verified=integrity_verified,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
