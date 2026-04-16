from typing import Dict, List

import numpy as np


def _simulate_trend(start_health: float, degradation_per_day: float, rng: np.random.Generator) -> List[float]:
    trend = []
    value = start_health
    for _ in range(30):
        value += degradation_per_day + rng.normal(0, 1.5)
        value = float(np.clip(value, 0, 100))
        trend.append(value)
    return trend


def run_ttf_prediction(fusion_result: Dict, seed: int = 77) -> Dict:
    rng = np.random.default_rng(seed)
    out = {}

    for span_id, rec in fusion_result["per_span"].items():
        health = float(rec["health_index"])
        severity_hint = 1.0 - (health / 100.0)

        degradation_rate = -0.25 - (1.2 * severity_hint)
        if health >= 80:
            degradation_rate = -0.18 - rng.uniform(0.03, 0.10)

        history = _simulate_trend(health + 8.0, degradation_rate, rng)
        days = np.arange(1, 31, dtype=np.float32)
        y = np.array(history, dtype=np.float32)

        slope, intercept = np.polyfit(days, y, deg=1)
        pred = slope * days + intercept
        residuals = y - pred
        residual_std = float(np.std(residuals))

        threshold = 20.0
        if abs(slope) < 1e-8 or slope >= 0:
            ttf_days = 365.0
            ci = 30.0
        else:
            t_cross = (threshold - intercept) / slope
            ttf_days = float(max(0.0, t_cross - 30.0))
            ci = float(1.645 * residual_std / abs(slope)) if abs(slope) > 1e-8 else 30.0

        out[span_id] = {
            "TTF_days": ttf_days,
            "TTF_lower": max(0.0, ttf_days - ci),
            "TTF_upper": ttf_days + ci,
            "degradation_rate": float(slope),
            "trend_history": history,
        }

    return {"per_span": out}
