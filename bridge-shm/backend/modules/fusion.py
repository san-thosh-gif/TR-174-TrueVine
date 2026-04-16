from typing import Dict

import numpy as np


W_SENSOR = 0.40
W_CRACK = 0.35
W_DAMAGE = 0.25


def classify_health(health_index: float) -> Dict[str, str]:
    if health_index >= 75:
        return {"classification": "GOOD", "color_code": "#2ea043"}
    if health_index >= 50:
        return {"classification": "WARNING", "color_code": "#d29922"}
    if health_index >= 25:
        return {"classification": "CRITICAL", "color_code": "#fb8500"}
    return {"classification": "FAILURE IMMINENT", "color_code": "#da3633"}


def run_fusion(timeseries_result: Dict, crack_result: Dict, vehicle_result: Dict) -> Dict:
    spans = set(timeseries_result["per_span"].keys())
    spans.update(crack_result["per_span"].keys())
    spans.update(vehicle_result.get("per_span_damage_normalized", {}).keys())

    out = {}

    for span_id in sorted(spans):
        sensor_anomaly = float(timeseries_result["per_span"].get(span_id, {}).get("sensor_anomaly_score", 0.0))
        crack_severity = float(crack_result["per_span"].get(span_id, {}).get("severity_score", 0.0))
        vehicle_damage_norm = float(vehicle_result.get("per_span_damage_normalized", {}).get(span_id, 0.0))

        combined_fault = (
            W_SENSOR * sensor_anomaly
            + W_CRACK * crack_severity
            + W_DAMAGE * vehicle_damage_norm
        )
        health_index = float(np.clip((1.0 - combined_fault) * 100.0, 0.0, 100.0))
        state = classify_health(health_index)

        out[span_id] = {
            "health_index": health_index,
            **state,
            "sensor_anomaly_score": sensor_anomaly,
            "crack_severity": crack_severity,
            "vehicle_damage_norm": vehicle_damage_norm,
            "combined_fault": combined_fault,
        }

    return {"per_span": out, "weights": {"sensor": W_SENSOR, "crack": W_CRACK, "damage": W_DAMAGE}}
