"""Measured-channel educational provider using external session states."""
import copy
import json
import math
from functools import lru_cache

import torch

from .ideal import RawMeasurements, derive_seed
from .schemas import SimulationConfig

if __package__.startswith('backend.'):
    from backend.model import decode_threshold, extract_state, receive_external_states
else:
    from model import decode_threshold, extract_state, receive_external_states


class FsoProviderUnavailable(RuntimeError):
    pass


def runtime():
    # Lazy import keeps ideal-only services independent of measured assets.
    if __package__.startswith('backend.'):
        from backend import channel_runtime
    else:
        import channel_runtime
    return channel_runtime


@lru_cache(maxsize=1)
def cpu_policy():
    return copy.deepcopy(runtime().policy).to('cpu').eval()


def measure_fso(states, bases, session, path):
    try:
        config = SimulationConfig.model_validate(path.providerConfig)
        channel, start, size = runtime().slice_channel_window(config.dataset, config.windowStart, len(states.bits))
        channel = channel * math.exp(-0.0001 * 10000 / math.cos(math.radians(config.xi)))
        power = 10 ** (config.Pt_dBm / 10) / 1000
        with torch.inference_mode():
            if config.thresholdMode == 'fixed':
                rho = config.fixedRho
            else:
                state = torch.tensor(extract_state(channel, power), dtype=torch.float32).unsqueeze(0)
                rho = float((torch.sigmoid(cpu_policy()(state)) * 5).item())
            namespace = json.dumps([session.id, 'channel_noise', path.id], ensure_ascii=False, separators=(',', ':'))
            generator = torch.Generator(device='cpu').manual_seed(derive_seed(session.config.masterSeed, namespace) & ((1 << 64) - 1))
            signal, amplitude = receive_external_states(torch.tensor(channel), power, torch.tensor(states.bits),
                                                        torch.tensor(states.bases), torch.tensor(bases), generator=generator)
            bits = tuple(int(b) for b in decode_threshold(signal, amplitude, rho).tolist())
        eve = None
        if path.viaEveId:
            from .eve import observe_fso
            eve = observe_fso(states, session, path, torch.tensor(channel), power, rho)
        return RawMeasurements(bits, tuple(bases), eve=eve), dict(dataset=config.dataset, windowStart=start, datasetSize=size,
            thresholdMode=config.thresholdMode, rho=rho, channelMean=float(channel.mean()), channelStd=float(channel.std()))
    except (OSError, ValueError, RuntimeError) as exc:
        raise FsoProviderUnavailable('FSO_PROVIDER_UNAVAILABLE') from exc
