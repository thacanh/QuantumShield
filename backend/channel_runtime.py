"""Shared measured channel data and trained policy runtime (legacy and designer)."""
import os
from functools import lru_cache
import numpy as np
import torch
if __package__:
    from .model import PolicyNet
else:
    from model import PolicyNet

use_cpu = os.getenv("FORCE_CPU", "0") == "1" or "SPACE_ID" in os.environ
DEVICE = torch.device("cpu" if use_cpu else ("cuda" if torch.cuda.is_available() else "cpu"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
POLICY_WEIGHTS_FILENAME = "policy.pth"

CHANNEL_DATASETS = {
    "clearlowSI.csv": "Low Scintillation - kênh ổn định",
    "clearhighSI.csv": "High Scintillation - dao động mạnh",
    "lightrain.csv": "Light Rain - suy hao do mưa nhẹ",
}

@lru_cache(maxsize=len(CHANNEL_DATASETS))
def load_channel_dataset(filename: str) -> np.ndarray:
    """Load one published channel trace as compact uint8 values and cache it."""
    if filename not in CHANNEL_DATASETS:
        raise ValueError(f"Unsupported channel dataset: {filename}")

    path = os.path.join(DATA_DIR, filename)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Channel dataset is missing: {path}")

    binary_cache_path = f"{path}.uint8.npy"
    if os.path.isfile(binary_cache_path) and os.path.getmtime(binary_cache_path) >= os.path.getmtime(path):
        return np.load(binary_cache_path, mmap_mode="r", allow_pickle=False)

    values = np.fromfile(path, dtype=np.uint8, sep=",")
    if values.size < 1024:
        raise ValueError(f"Channel dataset {filename} has only {values.size} values")
    temporary_cache_path = f"{binary_cache_path}.tmp.npy"
    np.save(temporary_cache_path, values, allow_pickle=False)
    os.replace(temporary_cache_path, binary_cache_path)
    values.setflags(write=False)
    return values


def slice_channel_window(filename: str, start: int, size: int):
    """Return a normalized, wrap-safe window from a measured channel trace."""
    values = load_channel_dataset(filename)
    normalized_start = int(start) % int(values.size)
    end = normalized_start + size
    if end <= values.size:
        window = values[normalized_start:end]
    else:
        wrapped = end - values.size
        window = np.concatenate((values[normalized_start:], values[:wrapped]))
    return window.astype(np.float32) / 255.0, normalized_start, int(values.size)


policy = PolicyNet().to(DEVICE)
weights_path = os.path.join(WEIGHTS_DIR, POLICY_WEIGHTS_FILENAME)
if not os.path.isfile(weights_path):
    raise RuntimeError(f"Required trained policy is missing: {weights_path}")

try:
    state_dict = torch.load(weights_path, map_location=DEVICE, weights_only=True)
    policy.load_state_dict(state_dict, strict=True)
except Exception as exc:
    raise RuntimeError(f"Cannot load the trained QKD policy: {exc}") from exc

policy.eval()
print(
    f"[*] QuantumShield backend ready on {DEVICE}; "
    f"trained policy loaded from {POLICY_WEIGHTS_FILENAME}."
)
