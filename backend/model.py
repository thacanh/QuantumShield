import os
os.environ["NUMPY_DISABLE_CPU_FEATURES"] = "1"
import base64
import torch
import torch.nn as nn
import math
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ==========================================
# PHYSICAL AND SYSTEM CONSTANTS
# ==========================================
R = 0.8
P_LO = 10**(-5/10)/1000

q = 1.6e-19
kB = 1.38e-23
T = 298.0
RL = 50.0
I_d = 3e-9
Rb = 1e9
Delta_f = Rb/2

omega_r = 200.0
Dr = 0.05
Ar = math.pi * (Dr/2)**2

lam = 1.55e-6
B0 = 250e9
c = 3e8
delta_lambda_um = (lam**2 * B0 / c)
P_b = omega_r * Ar * delta_lambda_um

SIGMA_SCALE = 250

sigma2 = 2*q*(R*P_LO + R*P_b + I_d)*Delta_f + (4*kB*T/RL)*Delta_f
sigma = math.sqrt(sigma2) * SIGMA_SCALE

# ==========================================
# POLICY NETWORK ARCHITECTURE
# ==========================================
class PolicyNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(8, 64),
            nn.LayerNorm(64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.LayerNorm(64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 32),
            nn.ReLU()
        )
        self.mu_head = nn.Linear(32, 1)
        self.log_std_head = nn.Linear(32, 1)

    def forward(self, s):
        x = self.net(s)
        mu = self.mu_head(x)
        return mu

# ==========================================
# HELPER FUNCTIONS FOR STATS & SIMULATION
# ==========================================
def binary_entropy(probability: float) -> float:
    probability = max(1e-9, min(1.0 - 1e-9, probability))
    return -probability * math.log2(probability) - (
        1.0 - probability
    ) * math.log2(1.0 - probability)



def extract_state(h, Pt_current):
    """
    Extracts an 8-dimensional state vector from the channel gain distribution
    and the current transmit power.
    """
    return np.array([
        h.mean(),
        h.std(),
        h.min(),
        h.max(),
        np.percentile(h, 25),
        np.percentile(h, 75),
        10*np.log10(Pt_current*1000+1e-20)/10,
        np.log10(h.mean()+1e-12)
    ], dtype=np.float32)

def Gen_AB(h, Pt_current, device):
    """
    Generates Alice's and Bob's received continuous signals (I_A, I_B) from
    Charlie's (Satellite's) transmitted bits, bases, and amplitude profiles.
    """
    N = h.numel()

    # Sử dụng generator riêng với seed cố định để giữ chuỗi bit phát và hệ cơ sở cố định
    g = torch.Generator(device=device)
    g.manual_seed(42)

    bits_Tx = torch.randint(0, 2, (N,), generator=g, device=device)
    C_basis = torch.randint(0, 2, (N,), generator=g, device=device)
    U_basis_A = torch.randint(0, 2, (N,), generator=g, device=device)
    U_basis_B = torch.randint(0, 2, (N,), generator=g, device=device)

    phiU_A = torch.where(U_basis_A == 0, 0.25, -0.25)
    phiU_B = torch.where(U_basis_B == 0, 0.25, -0.25)

    phiC = torch.zeros(N, device=device)
    m1 = C_basis == 0
    m2 = ~m1
    phiC[m1] = torch.where(bits_Tx[m1] == 0, 0.25, 1.25)
    phiC[m2] = torch.where(bits_Tx[m2] == 0, -0.25, 0.75)

    Pr = Pt_current * h
    A = R * torch.sqrt(Pr * P_LO)
    noise_A = torch.normal(0, sigma, (N,), generator=g, device=device)
    noise_B = torch.normal(0, sigma, (N,), generator=g, device=device)

    def cos_map(delta):
        delta = torch.where(delta > 1, delta - 2, delta)
        delta = torch.where(delta < -1, delta + 2, delta)
        cos = torch.zeros_like(delta)
        cos[delta == 0] = 1
        cos[(delta == 0.5) | (delta == -0.5)] = 0
        cos[(delta == 1) | (delta == -1)] = -1
        return cos

    I_A = A * cos_map(phiC - phiU_A) + noise_A
    I_B = A * cos_map(phiC - phiU_B) + noise_B
    return I_A, I_B, bits_Tx, C_basis, U_basis_A, U_basis_B, A


def receive_external_states(h, Pt_current, bits, prepared_bases, measurement_bases, *, generator):
    """Gen_AB receiver equation with caller-owned states and noise generator.

    Basis mismatch has zero signal; matching bases encode bit 0 as +A, 1 as -A.
    No state generation, sifting, or index compaction occurs here.
    """
    if not (h.ndim == bits.ndim == prepared_bases.ndim == measurement_bases.ndim == 1
            and h.numel() == bits.numel() == prepared_bases.numel() == measurement_bases.numel()):
        raise ValueError('MISALIGNED_MEASUREMENTS')
    amplitude = R * torch.sqrt(Pt_current * h * P_LO)
    sign = torch.where(prepared_bases == measurement_bases, 1 - 2 * bits, 0)
    noise = torch.normal(0, sigma, (h.numel(),), generator=generator, device=h.device)
    return amplitude * sign + noise, amplitude


def gaussian_overlap(rE):
    """Educational beam power overlap; offset and beam radius are in metres."""
    return math.exp(-2.0 * (float(rE) / 80.0) ** 2)


def Gen_Eve(h, rE, bits_Tx, C_basis, device, Pt_current, *, generator=None, measurement_bases=None):
    """
    Simulates an unauthorized optical receiver offset from the link receiver.
    Includes random shuffling and Gaussian beam attenuation.
    """
    N = h.numel()

    # Sử dụng generator riêng với seed cố định cho các hoạt động ngẫu nhiên của Eve
    g = generator if generator is not None else torch.Generator(device=device).manual_seed(42)

    # Gaussian beam attenuation
    hg = gaussian_overlap(rE)

    # Shuffle channel randomly to simulate atmospheric fading variation
    idx = torch.randint(0, N, (N,), generator=g, device=device)
    h_rand = h[idx]
    hE = h_rand * hg

    U_E = measurement_bases if measurement_bases is not None else torch.randint(0, 2, (N,), generator=g, device=device)
    phiU = torch.where(U_E == 0, 0.25, -0.25)

    phiC = torch.zeros(N, device=device)
    m1 = C_basis == 0
    m2 = ~m1
    phiC[m1] = torch.where(bits_Tx[m1] == 0, 0.25, 1.25)
    phiC[m2] = torch.where(bits_Tx[m2] == 0, -0.25, 0.75)

    Pr = Pt_current * hE
    A_E = R * torch.sqrt(Pr * P_LO)
    noise = torch.normal(0, sigma, (N,), generator=g, device=device)

    def cos_map(delta):
        delta = torch.where(delta > 1, delta - 2, delta)
        delta = torch.where(delta < -1, delta + 2, delta)
        cos = torch.zeros_like(delta)
        cos[delta == 0] = 1
        cos[(delta == 0.5) | (delta == -0.5)] = 0
        cos[(delta == 1) | (delta == -1)] = -1
        return cos

    I_E = A_E * cos_map(phiC - phiU) + noise
    return I_E, A_E


def apply_eve_disturbance(I_B, rE, device):
    """Legacy active-attack helper, NOT used by the receiver-side Eve model.

    A full-strength intercept-resend attack contributes at most 25% QBER.
    The Gaussian overlap term makes that contribution fall with Eve's
    distance from Bob. Kept for historical callers; passive optical collection
    in both current workspaces must never invoke this disturbance.
    """
    rE_tensor = torch.tensor(float(rE), dtype=torch.float32, device=device)
    beam_radius = 80.0
    interception_strength = torch.exp(-2.0 * (rE_tensor**2) / (beam_radius**2))
    disturbance_probability = 0.25 * interception_strength

    generator = torch.Generator(device=device)
    generator.manual_seed(2026)
    disturbed_mask = torch.rand(I_B.shape, generator=generator, device=device) < disturbance_probability
    disturbed_I_B = torch.where(disturbed_mask, -I_B, I_B)
    return disturbed_I_B, float(interception_strength.item())

def decode_threshold(I, A, rho):
    """
    Decodes received signal I into binary bits (0 or 1) based on amplitude A,
    scaling coefficient rho, and noise standard deviation sigma.
    Returns -1 for discarded/erased bits.
    """
    thr = rho * sigma

    bits = torch.full_like(I, -1)
    bits[I >= thr] = 0
    bits[I <= -thr] = 1
    return bits

def compute_QBER(bits, ref):
    """
    Computes QBER between decoded bits and reference bits.
    Returns 0.5 (maximum uncertainty) if no bits are sifted.
    """
    mask = bits != -1
    if mask.sum() == 0:
        return 0.5
    return (bits[mask] != ref[mask]).float().mean().item()

def compute_QBER_AB(bits_A, bits_B):
    """
    Tính toán QBER và Psift giữa hai chuỗi bit đã qua sàng lọc (sifted).
    Trả về 0.0, 0.0 nếu không có cặp bit nào lọt qua bộ lọc (Zero-Sift).
    """
    mask = (bits_A != -1) & (bits_B != -1)
    if mask.sum() == 0:
        return 0.0, 0.0
    keptA = bits_A[mask]
    keptB = bits_B[mask]
    QBER = (keptA != keptB).float().mean().item()
    Psift = mask.float().mean().item()
    return QBER, Psift


def cascade_correct(alice_bits, bob_bits, qber, *, rng=None, metadata=None):
    """
    Mô phỏng giao thức sửa lỗi Cascade giữa Alice và Bob.
    Nhận vào alice_bits, bob_bits (có thể là tensor, numpy array hoặc list).
    Trả về:
        corrected_bob (list): Chuỗi bit của Bob sau khi đã sửa khớp với Alice.
        leaked_bits (int): Số bit chẵn lẻ bị lộ trên kênh cổ điển.
        success (bool): Trạng thái sửa lỗi thành công.
    """
    if metadata is not None:
        metadata['fallbackUsed'] = False
    # Chuyển đổi đầu vào sang danh sách kiểu int
    if hasattr(alice_bits, 'tolist'):
        alice = [int(x) for x in alice_bits.tolist()]
    else:
        alice = [int(x) for x in alice_bits]

    if hasattr(bob_bits, 'tolist'):
        bob = [int(x) for x in bob_bits.tolist()]
    else:
        bob = [int(x) for x in bob_bits]

    N = len(alice)
    if N == 0:
        return [], 0, True

    if qber == 0.0:
        return bob, 0, True

    # Công thức chọn độ rộng khối k ở Pass 1: k = ceil(0.73 / qber)
    k = max(4, min(N, int(math.ceil(0.73 / (qber + 1e-6)))))

    leaked_bits = 0

    # Hàm đệ quy tìm lỗi trong một khối bằng tìm kiếm nhị phân (Binary Search / Bisect)
    def bin_search(block):
        nonlocal leaked_bits
        if len(block) == 1:
            idx = block[0]
            bob[idx] = alice[idx]  # Sửa bit của Bob
            return idx

        mid = len(block) // 2
        left_half = block[:mid]
        right_half = block[mid:]

        # So sánh chẵn lẻ của nửa trái (Alice gửi parity của nửa trái cho Bob)
        p_alice = sum(alice[idx] for idx in left_half) % 2
        p_bob = sum(bob[idx] for idx in left_half) % 2
        leaked_bits += 1  # Lộ 1 bit parity

        if p_alice != p_bob:
            # Lỗi nằm ở nửa trái
            return bin_search(left_half)
        else:
            # Lỗi nằm ở nửa phải (hoặc số lỗi chẵn ở nửa trái, nhưng ta giả định tìm 1 lỗi trước)
            return bin_search(right_half)

    # Pass 1: Chia khối tuần tự
    num_blocks = int(math.ceil(N / k))
    blocks = []
    for i in range(num_blocks):
        blocks.append(list(range(i * k, min((i + 1) * k, N))))

    for block in blocks:
        p_alice = sum(alice[idx] for idx in block) % 2
        p_bob = sum(bob[idx] for idx in block) % 2
        leaked_bits += 1
        if p_alice != p_bob:
            bin_search(block)

    # Pass 2: Tráo ngẫu nhiên (Shuffle) các chỉ số và chia khối gấp đôi k
    g = rng if rng is not None else np.random.default_rng(42)  # Legacy default preserved
    shuffled_indices = list(range(N))
    g.shuffle(shuffled_indices)

    k2 = min(N, 2 * k)
    num_blocks2 = int(math.ceil(N / k2))
    blocks2 = []
    for i in range(num_blocks2):
        blocks2.append(shuffled_indices[i * k2 : min((i + 1) * k2, N)])

    for block in blocks2:
        if len(block) == 0:
            continue
        p_alice = sum(alice[idx] for idx in block) % 2
        p_bob = sum(bob[idx] for idx in block) % 2
        leaked_bits += 1
        if p_alice != p_bob:
            bin_search(block)

    # Kiểm tra xem đã sửa hết lỗi chưa
    success = (alice == bob)

    # Nếu còn sót lỗi do số lượng lỗi quá nhiều, ta thực hiện sửa trực tiếp
    # nhưng tính thêm chi phí rò rỉ thông tin tương đương số bit tìm kiếm
    if not success:
        if metadata is not None:
            metadata['fallbackUsed'] = True
        for idx in range(N):
            if alice[idx] != bob[idx]:
                bob[idx] = alice[idx]
                leaked_bits += int(math.ceil(math.log2(N)))
        success = True

    return bob, leaked_bits, success


def generate_toeplitz_seed(input_length, output_length, *, random_bytes=None):
    """Generate the public random seed used by a Toeplitz universal hash."""
    seed_length = input_length + output_length - 1
    seed_bytes = (random_bytes or os.urandom)((seed_length + 7) // 8)
    return np.unpackbits(np.frombuffer(seed_bytes, dtype=np.uint8))[:seed_length]


def privacy_amplification(key, K, toeplitz_seed=None):
    """Compress an N-bit reconciled key to K bits with a Toeplitz hash.

    The convolution is evaluated with an FFT, reducing the previous O(N*K)
    Python loop to O((N+K) log(N+K)).  Alice and Bob must use the same public
    Toeplitz seed.
    """
    key_array = np.asarray(key, dtype=np.uint8)
    N = int(key_array.size)
    K = min(int(K), N)
    if K <= 0 or N == 0:
        return []

    required_seed_length = K + N - 1
    if toeplitz_seed is None:
        toeplitz_seed = generate_toeplitz_seed(N, K)
    seed_array = np.asarray(toeplitz_seed, dtype=np.uint8)
    if seed_array.size != required_seed_length:
        raise ValueError(
            f"Toeplitz seed must contain {required_seed_length} bits, got {seed_array.size}"
        )

    convolution_length = N + required_seed_length - 1
    fft_size = 1 << (convolution_length - 1).bit_length()
    convolution = np.fft.irfft(
        np.fft.rfft(key_array.astype(np.float64), fft_size)
        * np.fft.rfft(seed_array.astype(np.float64), fft_size),
        fft_size,
    )
    output = np.rint(convolution[N - 1 : N - 1 + K]).astype(np.int64) & 1
    return output.astype(int).tolist()


def _aes_key_from_qkd_bits(key_bits, key_size_bits=256):
    """Pack QKD bits directly into an AES key without overstating entropy."""
    if len(key_bits) < key_size_bits:
        raise ValueError(
            f"AES-{key_size_bits} requires at least {key_size_bits} distilled QKD bits"
        )
    selected_bits = np.asarray(key_bits[:key_size_bits], dtype=np.uint8)
    if np.any((selected_bits != 0) & (selected_bits != 1)):
        raise ValueError("QKD key must contain only binary values")
    return np.packbits(selected_bits, bitorder="big").tobytes()


def encrypt_message_aes_gcm(message, key_bits, associated_data=""):
    """Encrypt UTF-8 text with AES-256-GCM and return Base64 components."""
    key = _aes_key_from_qkd_bits(key_bits, 256)
    nonce = os.urandom(12)
    aad_bytes = associated_data.encode("utf-8")
    encrypted_with_tag = AESGCM(key).encrypt(
        nonce,
        message.encode("utf-8"),
        aad_bytes,
    )
    ciphertext, authentication_tag = encrypted_with_tag[:-16], encrypted_with_tag[-16:]
    return (
        base64.b64encode(ciphertext).decode("ascii"),
        base64.b64encode(nonce).decode("ascii"),
        base64.b64encode(authentication_tag).decode("ascii"),
    )


def decrypt_message_aes_gcm(
    ciphertext_b64,
    nonce_b64,
    authentication_tag_b64,
    key_bits,
    associated_data="",
):
    """Authenticate and decrypt an AES-256-GCM payload as UTF-8 text."""
    key = _aes_key_from_qkd_bits(key_bits, 256)
    ciphertext = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    authentication_tag = base64.b64decode(authentication_tag_b64)
    plaintext = AESGCM(key).decrypt(
        nonce,
        ciphertext + authentication_tag,
        associated_data.encode("utf-8"),
    )
    return plaintext.decode("utf-8")
