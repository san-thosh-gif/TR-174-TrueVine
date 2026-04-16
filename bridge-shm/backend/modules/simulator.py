import base64
import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

import cv2
import numpy as np


SPAN_CONFIG = {
    "Span-A": {"damage_level": 0.25, "label": "light"},
    "Span-B": {"damage_level": 0.85, "label": "severe"},
    "Span-C": {"damage_level": 0.0, "label": "healthy"},
    "Span-D": {"damage_level": 0.55, "label": "moderate"},
}

VEHICLE_CLASSES = {
    "heavy": {"ratio": 0.20, "dwell_mu": 48, "dwell_sigma": 10},
    "medium": {"ratio": 0.55, "dwell_mu": 22, "dwell_sigma": 6},
    "small": {"ratio": 0.25, "dwell_mu": 11, "dwell_sigma": 3},
}


@dataclass
class SpanSignal:
    time: np.ndarray
    accelerometer: np.ndarray
    strain: np.ndarray
    spike_indices: np.ndarray


def _clip01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _generate_spike_indices(length: int, rng: np.random.Generator, count: int = 5) -> np.ndarray:
    if length < count + 2:
        return np.array([], dtype=np.int32)
    return np.sort(rng.choice(np.arange(20, length - 20), size=count, replace=False)).astype(np.int32)


def simulate_span_signals(
    span_id: str,
    damage_level: float,
    sample_rate: int = 100,
    duration_seconds: int = 60,
    seed: int = 42,
) -> SpanSignal:
    rng = np.random.default_rng(seed)
    t = np.arange(0, duration_seconds, 1.0 / sample_rate)
    n = len(t)

    is_damaged = damage_level > 0.1
    freq = 2.5 - (0.4 * _clip01(damage_level)) if is_damaged else 2.5

    accel_noise = 0.08 + (0.25 * damage_level)
    accel = np.sin(2 * math.pi * freq * t) + rng.normal(0, accel_noise, n)

    spike_indices = _generate_spike_indices(n, rng, count=5 if is_damaged else 1)
    if is_damaged and len(spike_indices) > 0:
        for idx in spike_indices:
            amp = rng.uniform(4.0, 7.0)
            direction = -1 if rng.uniform() < 0.35 else 1
            accel[idx] += amp * direction

    thermal_drift = 0.002 * t
    strain_base = 0.35 * np.sin(2 * math.pi * 0.12 * t)
    strain_amp = 1.0 + (0.4 * damage_level)
    strain_noise = 0.03 + (0.08 * damage_level)
    strain = strain_amp * strain_base + thermal_drift + rng.normal(0, strain_noise, n)

    if is_damaged and len(spike_indices) > 0:
        for idx in spike_indices:
            strain[idx] += rng.uniform(0.9, 1.8)

    return SpanSignal(time=t, accelerometer=accel, strain=strain, spike_indices=spike_indices)


def _concrete_texture(height: int, width: int, rng: np.random.Generator) -> np.ndarray:
    base = np.full((height, width, 3), 132, dtype=np.uint8)
    grain = rng.normal(0, 16, (height, width, 1)).astype(np.int16)
    tint = rng.normal(0, 7, (height, width, 3)).astype(np.int16)
    img = np.clip(base.astype(np.int16) + grain + tint, 70, 190).astype(np.uint8)
    return cv2.GaussianBlur(img, (5, 5), 0)


def _draw_branching_crack(
    image: np.ndarray,
    rng: np.random.Generator,
    severity: int,
    growth_scale: float = 1.0,
) -> Tuple[Tuple[int, int, int, int], int]:
    h, w = image.shape[:2]
    thickness = int(max(1, round(severity * growth_scale)))
    x0 = int(rng.integers(30, w - 120))
    y0 = int(rng.integers(30, h - 120))

    points = [(x0, y0)]
    for _ in range(rng.integers(4, 8)):
        dx = int(rng.integers(-35, 35) * growth_scale)
        dy = int(rng.integers(20, 55) * growth_scale)
        last_x, last_y = points[-1]
        nx = int(np.clip(last_x + dx, 10, w - 10))
        ny = int(np.clip(last_y + dy, 10, h - 10))
        points.append((nx, ny))

    poly = np.array(points, dtype=np.int32)
    cv2.polylines(image, [poly], isClosed=False, color=(18, 18, 18), thickness=thickness)

    for branch_start in points[1:-1:2]:
        bx, by = branch_start
        end = (
            int(np.clip(bx + rng.integers(-35, 35), 10, w - 10)),
            int(np.clip(by + rng.integers(15, 40), 10, h - 10)),
        )
        cv2.line(image, (bx, by), end, (20, 20, 20), max(1, thickness - 1))

    x, y, bw, bh = cv2.boundingRect(poly)
    pad = 6
    bbox = (
        int(max(0, x - pad)),
        int(max(0, y - pad)),
        int(min(w - 1, x + bw + pad)),
        int(min(h - 1, y + bh + pad)),
    )
    return bbox, severity


def _encode_image_to_base64(image: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", image)
    if not ok:
        return ""
    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def generate_crack_frames(
    span_id: str,
    damage_level: float,
    size: Tuple[int, int] = (360, 640),
    seed: int = 99,
) -> Dict:
    rng = np.random.default_rng(seed)
    h, w = size

    frame_t1 = _concrete_texture(h, w, rng)
    frame_t2 = frame_t1.copy()

    crack_count = max(1, int(round(1 + damage_level * 5)))
    annotations_t1 = []
    annotations_t2 = []

    for _ in range(crack_count):
        sev = int(np.clip(rng.integers(1, 4) + int(damage_level > 0.65), 1, 3))
        bbox1, severity1 = _draw_branching_crack(frame_t1, rng, sev, growth_scale=1.0)
        growth = 1.0 + rng.uniform(0.05, 0.28) * (1.0 + damage_level)
        bbox2, severity2 = _draw_branching_crack(frame_t2, rng, sev, growth_scale=growth)
        annotations_t1.append({"bbox": bbox1, "severity": severity1, "confidence": float(rng.uniform(0.75, 0.96))})
        annotations_t2.append({"bbox": bbox2, "severity": severity2, "confidence": float(rng.uniform(0.78, 0.98))})

    return {
        "span_id": span_id,
        "image_shape": [h, w],
        "frame_t1": {
            "image_base64": _encode_image_to_base64(frame_t1),
            "annotations": annotations_t1,
        },
        "frame_t2": {
            "image_base64": _encode_image_to_base64(frame_t2),
            "annotations": annotations_t2,
        },
    }


def _pick_vehicle_class(rng: np.random.Generator) -> str:
    p = rng.uniform()
    if p < VEHICLE_CLASSES["heavy"]["ratio"]:
        return "heavy"
    if p < VEHICLE_CLASSES["heavy"]["ratio"] + VEHICLE_CLASSES["medium"]["ratio"]:
        return "medium"
    return "small"


def _random_hsv(rng: np.random.Generator) -> List[int]:
    return [int(rng.integers(0, 180)), int(rng.integers(60, 256)), int(rng.integers(60, 256))]


def simulate_vehicle_events(seed: int = 1234, total: int = 100, minutes: int = 60) -> Dict:
    rng = np.random.default_rng(seed)
    start = datetime.utcnow().replace(microsecond=0)

    spans = list(SPAN_CONFIG.keys())
    cam1 = []
    cam2 = []

    for i in range(total):
        cls = _pick_vehicle_class(rng)
        cfg = VEHICLE_CLASSES[cls]
        entry_offset_s = int(rng.uniform(0, minutes * 60))
        dwell = max(2, int(rng.normal(cfg["dwell_mu"], cfg["dwell_sigma"])))
        span_id = spans[int(rng.integers(0, len(spans)))]
        hsv = _random_hsv(rng)

        entry_time = start + timedelta(seconds=entry_offset_s)
        exit_time = entry_time + timedelta(seconds=dwell)

        record = {
            "vehicle_id": f"V{i + 1:03d}",
            "vehicle_class": cls,
            "hsv": hsv,
            "span_id": span_id,
        }

        cam1.append({
            **record,
            "timestamp": entry_time.isoformat() + "Z",
        })

        cam2.append({
            **record,
            "timestamp": exit_time.isoformat() + "Z",
        })

    cam1.sort(key=lambda x: x["timestamp"])
    cam2.sort(key=lambda x: x["timestamp"])

    return {
        "start_time": start.isoformat() + "Z",
        "cam1": cam1,
        "cam2": cam2,
    }


def generate_all_simulated_data(
    sample_rate: int = 100,
    duration_seconds: int = 60,
    seed_base: int | None = None,
) -> Dict:
    if seed_base is None:
        seed_base = int(time.time_ns() % (2**31 - 1))

    spans = {}
    crack_data = {}

    for idx, (span_id, cfg) in enumerate(SPAN_CONFIG.items()):
        signals = simulate_span_signals(
            span_id=span_id,
            damage_level=cfg["damage_level"],
            sample_rate=sample_rate,
            duration_seconds=duration_seconds,
            seed=seed_base + 101 + idx,
        )
        spans[span_id] = {
            "damage_level": cfg["damage_level"],
            "damage_label": cfg["label"],
            "time": signals.time.tolist(),
            "accelerometer": signals.accelerometer.tolist(),
            "strain": signals.strain.tolist(),
            "spike_indices": signals.spike_indices.tolist(),
            "sample_rate": sample_rate,
        }
        crack_data[span_id] = generate_crack_frames(
            span_id,
            cfg["damage_level"],
            seed=seed_base + 901 + idx,
        )

    vehicles = simulate_vehicle_events(seed=seed_base + 2024, total=100, minutes=60)

    return {
        "generation_seed": seed_base,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "spans": spans,
        "cracks": crack_data,
        "vehicles": vehicles,
    }
