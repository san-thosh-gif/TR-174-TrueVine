from collections import defaultdict
from datetime import datetime
from typing import Dict, List

import numpy as np


DAMAGE_WEIGHTS = {
    "heavy": 3.0,
    "medium": 1.5,
    "small": 0.5,
}


def _to_dt(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _hsv_distance(a: List[int], b: List[int]) -> float:
    return float(np.linalg.norm(np.array(a, dtype=np.float32) - np.array(b, dtype=np.float32)))


def run_vehicle_analysis(sim_data: Dict) -> Dict:
    cam1 = list(sim_data["vehicles"]["cam1"])
    cam2 = list(sim_data["vehicles"]["cam2"])

    cam1.sort(key=lambda x: x["timestamp"])
    cam2.sort(key=lambda x: x["timestamp"])

    used_cam2 = set()
    matches = []

    counts_by_span = defaultdict(lambda: {"heavy": 0, "medium": 0, "small": 0})
    dwell_by_class = defaultdict(list)
    span_damage_raw = defaultdict(float)

    for e in cam1:
        e_time = _to_dt(e["timestamp"])
        best_idx = None
        best_score = 1e9

        for idx, x in enumerate(cam2):
            if idx in used_cam2:
                continue
            if e["vehicle_class"] != x["vehicle_class"]:
                continue

            dt = (_to_dt(x["timestamp"]) - e_time).total_seconds()
            if dt < 0 or dt > 180:
                continue

            hsv_dist = _hsv_distance(e["hsv"], x["hsv"])
            if hsv_dist >= 40:
                continue

            score = hsv_dist + abs(dt - 30)
            if score < best_score:
                best_score = score
                best_idx = idx

        if best_idx is None:
            continue

        used_cam2.add(best_idx)
        x = cam2[best_idx]
        dwell_seconds = float((_to_dt(x["timestamp"]) - e_time).total_seconds())
        vehicle_class = e["vehicle_class"]
        span_id = e["span_id"]

        damage_contrib = DAMAGE_WEIGHTS[vehicle_class] * dwell_seconds
        span_damage_raw[span_id] += damage_contrib
        counts_by_span[span_id][vehicle_class] += 1
        dwell_by_class[vehicle_class].append(dwell_seconds)

        matches.append(
            {
                "vehicle_id": e["vehicle_id"],
                "vehicle_class": vehicle_class,
                "hsv": e["hsv"],
                "span_id": span_id,
                "entry_timestamp": e["timestamp"],
                "exit_timestamp": x["timestamp"],
                "dwell_seconds": dwell_seconds,
                "damage_contribution": damage_contrib,
            }
        )

    max_damage = max(span_damage_raw.values()) if span_damage_raw else 1.0
    span_damage_norm = {k: float(v / max_damage) for k, v in span_damage_raw.items()} if max_damage > 0 else {}

    avg_dwell = {
        k: float(np.mean(v)) if v else 0.0
        for k, v in {
            "heavy": dwell_by_class.get("heavy", []),
            "medium": dwell_by_class.get("medium", []),
            "small": dwell_by_class.get("small", []),
        }.items()
    }

    return {
        "matched_vehicle_list": matches,
        "per_span_damage_raw": dict(span_damage_raw),
        "per_span_damage_normalized": span_damage_norm,
        "per_span_vehicle_counts": {k: dict(v) for k, v in counts_by_span.items()},
        "average_dwell_per_category": avg_dwell,
    }
