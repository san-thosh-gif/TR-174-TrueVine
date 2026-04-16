from typing import Dict, List, Tuple

import numpy as np
from scipy.fft import rfft, rfftfreq
from scipy.stats import kurtosis

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim

    TORCH_AVAILABLE = True
except Exception:
    torch = None
    nn = None
    optim = None
    TORCH_AVAILABLE = False


if TORCH_AVAILABLE:
    class LSTMAutoencoder(nn.Module):
        def __init__(self, hidden_size: int = 64, bottleneck_size: int = 16):
            super().__init__()
            self.encoder = nn.LSTM(input_size=1, hidden_size=hidden_size, num_layers=2, batch_first=True)
            self.bottleneck = nn.Linear(hidden_size, bottleneck_size)
            self.expand = nn.Linear(bottleneck_size, hidden_size)
            self.decoder = nn.LSTM(input_size=hidden_size, hidden_size=hidden_size, num_layers=1, batch_first=True)
            self.output = nn.Linear(hidden_size, 1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            enc_out, _ = self.encoder(x)
            latent = self.bottleneck(enc_out[:, -1, :])
            expanded = self.expand(latent).unsqueeze(1).repeat(1, x.size(1), 1)
            dec_out, _ = self.decoder(expanded)
            return self.output(dec_out)
else:
    class LSTMAutoencoder:
        def __init__(self):
            self.template = None

        def fit(self, healthy_windows: np.ndarray):
            self.template = np.mean(healthy_windows, axis=0)


def sliding_windows(signal: np.ndarray, window: int = 256, step: int = 128) -> Tuple[np.ndarray, List[Tuple[int, int]]]:
    windows = []
    indices = []
    for i in range(0, max(1, len(signal) - window + 1), step):
        chunk = signal[i : i + window]
        if len(chunk) < window:
            break
        windows.append(chunk)
        indices.append((i, i + window))
    if not windows:
        return np.empty((0, window), dtype=np.float32), []
    return np.array(windows, dtype=np.float32), indices


def extract_window_features(window_signal: np.ndarray, sample_rate: int, baseline_freq: float = 2.5) -> Dict[str, float]:
    rms = float(np.sqrt(np.mean(window_signal**2)))
    peak = float(np.max(np.abs(window_signal)))
    krt = float(kurtosis(window_signal, fisher=False))

    fft_mag = np.abs(rfft(window_signal))
    freqs = rfftfreq(len(window_signal), d=1.0 / sample_rate)
    dom_idx = int(np.argmax(fft_mag[1:]) + 1) if len(fft_mag) > 1 else 0
    dom_freq = float(freqs[dom_idx]) if len(freqs) > dom_idx else 0.0
    spectral_energy = float(np.sum(fft_mag**2) / len(fft_mag))
    freq_shift = float(abs(dom_freq - baseline_freq))

    return {
        "rms": rms,
        "peak": peak,
        "kurtosis": krt,
        "dominant_fft_frequency": dom_freq,
        "spectral_energy": spectral_energy,
        "frequency_shift": freq_shift,
    }


def _prepare_tensor(windows: np.ndarray):
    return torch.tensor(windows, dtype=torch.float32).unsqueeze(-1)


def train_autoencoder(
    healthy_windows: np.ndarray,
    epochs: int = 30,
    lr: float = 1e-3,
    device: str = "cpu",
) -> LSTMAutoencoder:
    if TORCH_AVAILABLE:
        model = LSTMAutoencoder().to(device)
        criterion = nn.MSELoss()
        optimizer = optim.Adam(model.parameters(), lr=lr)

        x_train = _prepare_tensor(healthy_windows).to(device)
        batch_size = min(32, len(x_train)) if len(x_train) > 0 else 1

        model.train()
        for _ in range(epochs):
            perm = torch.randperm(x_train.size(0))
            for i in range(0, x_train.size(0), batch_size):
                idx = perm[i : i + batch_size]
                batch = x_train[idx]
                optimizer.zero_grad()
                recon = model(batch)
                loss = criterion(recon, batch)
                loss.backward()
                optimizer.step()

        return model

    # Fallback for environments without torch: template-based reconstruction.
    model = LSTMAutoencoder()
    model.fit(healthy_windows)
    return model


def reconstruction_errors(model: LSTMAutoencoder, windows: np.ndarray, device: str = "cpu") -> np.ndarray:
    if TORCH_AVAILABLE:
        model.eval()
        x = _prepare_tensor(windows).to(device)
        with torch.no_grad():
            recon = model(x)
            err = torch.mean((x - recon) ** 2, dim=(1, 2)).cpu().numpy()
        return err

    template = model.template
    if template is None:
        template = np.mean(windows, axis=0)
    recon = np.tile(template.reshape(1, -1), (windows.shape[0], 1))
    return np.mean((windows - recon) ** 2, axis=1)


def run_timeseries_analysis(sim_data: Dict, window: int = 256, step: int = 128) -> Dict:
    spans = sim_data["spans"]

    all_windows = {}
    all_indices = {}
    all_features = {}
    healthy_pool = []

    for span_id, record in spans.items():
        accel = np.array(record["accelerometer"], dtype=np.float32)
        sample_rate = int(record["sample_rate"])
        windows_arr, idx_pairs = sliding_windows(accel, window=window, step=step)
        all_windows[span_id] = windows_arr
        all_indices[span_id] = idx_pairs
        all_features[span_id] = [
            extract_window_features(w, sample_rate=sample_rate) for w in windows_arr
        ]
        if record["damage_level"] <= 0.05 and len(windows_arr) > 0:
            healthy_pool.append(windows_arr)

    if not healthy_pool:
        first_span = next(iter(all_windows.values()))
        healthy_pool.append(first_span)

    healthy_windows = np.concatenate(healthy_pool, axis=0)

    device = "cuda" if TORCH_AVAILABLE and torch.cuda.is_available() else "cpu"
    model = train_autoencoder(healthy_windows=healthy_windows, epochs=30, lr=1e-3, device=device)

    healthy_errors = reconstruction_errors(model, healthy_windows, device=device)
    threshold = float(np.mean(healthy_errors) + 2 * np.std(healthy_errors))
    threshold = max(threshold, 1e-6)

    per_span = {}

    for span_id, windows_arr in all_windows.items():
        if len(windows_arr) == 0:
            per_span[span_id] = {
                "avg_health_index": 100.0,
                "flagged_window_count": 0,
                "anomaly_threshold": threshold,
                "dominant_frequency_detected": 2.5,
                "sensor_anomaly_score": 0.0,
                "window_scores": [],
                "window_errors": [],
                "window_ranges": [],
                "feature_summary": {},
            }
            continue

        errs = reconstruction_errors(model, windows_arr, device=device)
        anomaly_scores = np.clip(errs / (threshold * 2.0), 0.0, 1.0)
        health = np.clip(100.0 - anomaly_scores * 100.0, 0.0, 100.0)

        dom_freqs = [f["dominant_fft_frequency"] for f in all_features[span_id]]
        dominant_freq = float(np.mean(dom_freqs)) if dom_freqs else 0.0

        feature_summary = {
            "rms_mean": float(np.mean([f["rms"] for f in all_features[span_id]])),
            "peak_mean": float(np.mean([f["peak"] for f in all_features[span_id]])),
            "kurtosis_mean": float(np.mean([f["kurtosis"] for f in all_features[span_id]])),
            "spectral_energy_mean": float(np.mean([f["spectral_energy"] for f in all_features[span_id]])),
            "frequency_shift_mean": float(np.mean([f["frequency_shift"] for f in all_features[span_id]])),
        }

        per_span[span_id] = {
            "avg_health_index": float(np.mean(health)),
            "flagged_window_count": int(np.sum(errs > threshold)),
            "anomaly_threshold": threshold,
            "dominant_frequency_detected": dominant_freq,
            "sensor_anomaly_score": float(np.mean(anomaly_scores)),
            "window_scores": anomaly_scores.tolist(),
            "window_errors": errs.tolist(),
            "window_ranges": all_indices[span_id],
            "feature_summary": feature_summary,
        }

    return {
        "window": window,
        "step": step,
        "threshold": threshold,
        "model_mode": "lstm-autoencoder" if TORCH_AVAILABLE else "template-fallback",
        "per_span": per_span,
    }
