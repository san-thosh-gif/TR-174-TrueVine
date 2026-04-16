from copy import deepcopy
from datetime import datetime
from typing import Dict
from uuid import uuid4

from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np

from modules.crack_detection import run_crack_detection
from modules.fusion import classify_health
from modules.fusion import run_fusion
from modules.prediction import run_ttf_prediction
from modules.assistant import generate_assistant_reply
from modules.report import generate_inspection_report
from modules.simulator import generate_all_simulated_data
from modules.timeseries import run_timeseries_analysis
from modules.vehicle import run_vehicle_analysis


app = Flask(__name__)
CORS(app)

LAST_ANALYSIS: Dict = {}
SPAN_IDS = ["Span-A", "Span-B", "Span-C", "Span-D"]


def _empty_manual_state() -> Dict:
    return {
        "sensor": {span: {} for span in SPAN_IDS},
        "drone": {span: {} for span in SPAN_IDS},
        "vehicle": {
            "events": [],
            "matched_vehicle_list": [],
            "per_span_damage_raw": {span: 0.0 for span in SPAN_IDS},
            "per_span_damage_normalized": {span: 0.0 for span in SPAN_IDS},
            "per_span_vehicle_counts": {span: {"heavy": 0, "medium": 0, "small": 0} for span in SPAN_IDS},
            "average_dwell_per_category": {"heavy": 0.0, "medium": 0.0, "small": 0.0},
        },
    }


MANUAL_STATE: Dict = _empty_manual_state()


def _zero_analysis() -> Dict:
    n = 300
    t = [i / 100.0 for i in range(n)]
    zero_sig = [0.0 for _ in range(n)]

    simulation = {
        "generation_seed": 0,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "spans": {
            span: {
                "damage_level": 0.0,
                "damage_label": "manual",
                "time": t,
                "accelerometer": zero_sig,
                "strain": zero_sig,
                "spike_indices": [],
                "sample_rate": 100,
            }
            for span in SPAN_IDS
        },
        "cracks": {span: {"frame_t1": {}, "frame_t2": {}} for span in SPAN_IDS},
        "vehicles": {"cam1": [], "cam2": []},
    }

    timeseries = {
        "window": 256,
        "step": 128,
        "threshold": 1.0,
        "model_mode": "manual",
        "per_span": {
            span: {
                "avg_health_index": 0.0,
                "flagged_window_count": 0,
                "anomaly_threshold": 1.0,
                "dominant_frequency_detected": 0.0,
                "sensor_anomaly_score": 1.0,
                "window_scores": [],
                "window_errors": [],
                "window_ranges": [],
                "feature_summary": {},
            }
            for span in SPAN_IDS
        },
    }

    crack = {
        "per_span": {
            span: {
                "crack_count": 0,
                "max_severity": 0,
                "severity_score": 0.0,
                "iou_mean": 0.0,
                "growth_rate": 0.0,
                "annotated_image_base64": "",
                "detections": [],
                "image_shape": [360, 640],
                "using_yolo": False,
            }
            for span in SPAN_IDS
        }
    }

    vehicle = {
        "matched_vehicle_list": [],
        "per_span_damage_raw": {span: 0.0 for span in SPAN_IDS},
        "per_span_damage_normalized": {span: 0.0 for span in SPAN_IDS},
        "per_span_vehicle_counts": {span: {"heavy": 0, "medium": 0, "small": 0} for span in SPAN_IDS},
        "average_dwell_per_category": {"heavy": 0.0, "medium": 0.0, "small": 0.0},
    }

    fusion = {
        "per_span": {
            span: {
                "health_index": 0.0,
                **classify_health(0.0),
                "sensor_anomaly_score": 1.0,
                "crack_severity": 0.0,
                "vehicle_damage_norm": 0.0,
                "combined_fault": 1.0,
            }
            for span in SPAN_IDS
        },
        "weights": {"sensor": 0.40, "crack": 0.35, "damage": 0.25},
    }

    ttf = {
        "per_span": {
            span: {
                "TTF_days": 0.0,
                "TTF_lower": 0.0,
                "TTF_upper": 0.0,
                "degradation_rate": 0.0,
                "trend_history": [0.0 for _ in range(30)],
            }
            for span in SPAN_IDS
        }
    }

    full_result = {
        "meta": {
            "run_id": str(uuid4()),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "simulation_seed": 0,
            "mode": "manual-reset",
        },
        "simulation": simulation,
        "timeseries": timeseries,
        "crack": crack,
        "vehicle": vehicle,
        "fusion": fusion,
        "ttf": ttf,
    }
    full_result["report"] = generate_inspection_report(full_result)
    return full_result


def _compose_analysis_from_manual_state() -> Dict:
    simulation_spans = {}
    timeseries_per_span = {}
    crack_per_span = {}

    for span in SPAN_IDS:
        sensor = MANUAL_STATE["sensor"].get(span, {})
        crack_rec = MANUAL_STATE["drone"].get(span, {})

        sample_rate = int(sensor.get("sample_rate", 100))
        values = sensor.get("signal_values", [])
        if not values:
            values = [0.0 for _ in range(300)]
            sample_rate = 100

        t = [i / sample_rate for i in range(len(values))]
        strain = sensor.get("strain_values", [float(v) * 0.2 for v in values])

        simulation_spans[span] = {
            "damage_level": float(sensor.get("anomaly_score", 0.0)),
            "damage_label": "manual",
            "time": t,
            "accelerometer": values,
            "strain": strain,
            "spike_indices": sensor.get("spike_indices", []),
            "sample_rate": sample_rate,
        }

        anomaly_score = float(sensor.get("anomaly_score", 0.0))
        health = float(np.clip(100.0 - anomaly_score * 100.0, 0.0, 100.0))
        timeseries_per_span[span] = {
            "avg_health_index": health,
            "flagged_window_count": int(sensor.get("flagged_window_count", 0)),
            "anomaly_threshold": float(sensor.get("anomaly_threshold", 1.0)),
            "dominant_frequency_detected": float(sensor.get("dominant_frequency_detected", 0.0)),
            "sensor_anomaly_score": anomaly_score,
            "window_scores": sensor.get("window_scores", []),
            "window_errors": sensor.get("window_errors", []),
            "window_ranges": sensor.get("window_ranges", []),
            "feature_summary": sensor.get("feature_summary", {}),
        }

        crack_per_span[span] = {
            "crack_count": int(crack_rec.get("crack_count", 0)),
            "max_severity": int(crack_rec.get("max_severity", 0)),
            "severity_score": float(crack_rec.get("severity_score", 0.0)),
            "iou_mean": float(crack_rec.get("iou_mean", 0.0)),
            "growth_rate": float(crack_rec.get("growth_rate", 0.0)),
            "annotated_image_base64": crack_rec.get("annotated_image_base64", ""),
            "detections": crack_rec.get("detections", []),
            "image_shape": crack_rec.get("image_shape", [360, 640]),
            "using_yolo": bool(crack_rec.get("using_yolo", False)),
        }

    vehicle = deepcopy(MANUAL_STATE["vehicle"])
    if "matched_vehicle_list" not in vehicle:
        vehicle["matched_vehicle_list"] = vehicle.get("events", [])

    timeseries = {
        "window": 256,
        "step": 128,
        "threshold": 1.0,
        "model_mode": "manual",
        "per_span": timeseries_per_span,
    }
    crack = {"per_span": crack_per_span}
    fusion = run_fusion(timeseries, crack, vehicle)
    ttf = run_ttf_prediction(fusion)

    full_result = {
        "meta": {
            "run_id": str(uuid4()),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "simulation_seed": 0,
            "mode": "manual-input-driven",
        },
        "simulation": {
            "generation_seed": 0,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "spans": simulation_spans,
            "cracks": {span: {"frame_t1": {}, "frame_t2": {}} for span in SPAN_IDS},
            "vehicles": {
                "cam1": [],
                "cam2": [],
            },
        },
        "timeseries": timeseries,
        "crack": crack,
        "vehicle": vehicle,
        "fusion": fusion,
        "ttf": ttf,
    }
    full_result["report"] = generate_inspection_report(full_result)
    return full_result


def run_full_pipeline() -> Dict:
    sim_data = generate_all_simulated_data(sample_rate=100, duration_seconds=60)
    timeseries_result = run_timeseries_analysis(sim_data)
    crack_result = run_crack_detection(sim_data)
    vehicle_result = run_vehicle_analysis(sim_data)
    fusion_result = run_fusion(timeseries_result, crack_result, vehicle_result)
    ttf_result = run_ttf_prediction(fusion_result)

    full_result = {
        "meta": {
            "run_id": str(uuid4()),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "simulation_seed": sim_data.get("generation_seed"),
        },
        "simulation": sim_data,
        "timeseries": timeseries_result,
        "crack": crack_result,
        "vehicle": vehicle_result,
        "fusion": fusion_result,
        "ttf": ttf_result,
    }
    full_result["report"] = generate_inspection_report(full_result)
    return full_result


def ensure_analysis() -> Dict:
    global LAST_ANALYSIS
    if not LAST_ANALYSIS:
        LAST_ANALYSIS = run_full_pipeline()
    return LAST_ANALYSIS


# Prime startup data so the dashboard has immediate content even under WSGI hosts.
LAST_ANALYSIS = _zero_analysis()


@app.route("/api/run-full-analysis", methods=["GET"])
def api_run_full_analysis():
    global LAST_ANALYSIS, MANUAL_STATE
    MANUAL_STATE = _empty_manual_state()
    LAST_ANALYSIS = _zero_analysis()
    return jsonify(LAST_ANALYSIS)


@app.route("/api/sensor/<span_id>", methods=["GET"])
def api_sensor(span_id: str):
    data = ensure_analysis()
    if span_id not in data["simulation"]["spans"]:
        return jsonify({"error": f"Unknown span_id '{span_id}'"}), 404

    sensor = data["simulation"]["spans"][span_id]
    ts = data["timeseries"]["per_span"].get(span_id, {})
    return jsonify(
        {
            "span_id": span_id,
            "time": sensor["time"],
            "accelerometer": sensor["accelerometer"],
            "strain": sensor["strain"],
            "spike_indices": sensor["spike_indices"],
            "timeseries_analysis": ts,
        }
    )


@app.route("/api/crack/<span_id>", methods=["GET"])
def api_crack(span_id: str):
    data = ensure_analysis()
    if span_id not in data["crack"]["per_span"]:
        return jsonify({"error": f"Unknown span_id '{span_id}'"}), 404
    return jsonify({"span_id": span_id, **data["crack"]["per_span"][span_id]})


@app.route("/api/vehicles", methods=["GET"])
def api_vehicles():
    data = ensure_analysis()
    return jsonify(data["vehicle"])


@app.route("/api/health", methods=["GET"])
def api_health():
    data = ensure_analysis()
    return jsonify(data["fusion"])


@app.route("/api/ttf", methods=["GET"])
def api_ttf():
    data = ensure_analysis()
    return jsonify(data["ttf"])


@app.route("/api/report", methods=["GET"])
def api_report():
    global LAST_ANALYSIS
    data = ensure_analysis()
    report = generate_inspection_report(data)
    LAST_ANALYSIS["report"] = report
    return jsonify(report)


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    global LAST_ANALYSIS, MANUAL_STATE
    payload = request.get_json(silent=True) or {}
    selected_span = payload.get("span_id", "")
    source = payload.get("source", "")

    if source == "sensor-ingestion-sim" and selected_span in SPAN_IDS:
        MANUAL_STATE["sensor"][selected_span] = {
            "sample_rate": int(payload.get("sampling_rate", 100)),
            "signal_values": payload.get("signal_values", []),
            "strain_values": payload.get("strain_values", []),
            "spike_indices": payload.get("spike_indices", []),
            "anomaly_score": float(payload.get("anomaly_score", 0.0)),
            "anomaly_threshold": float(payload.get("anomaly_threshold", 1.0)),
            "dominant_frequency_detected": float(payload.get("dominant_frequency_detected", 0.0)),
            "flagged_window_count": int(payload.get("flagged_window_count", 0)),
            "window_scores": payload.get("window_scores", []),
            "window_errors": payload.get("window_errors", []),
            "window_ranges": payload.get("window_ranges", []),
            "feature_summary": payload.get("feature_summary", {}),
        }

    if source == "sensor-ingestion-batch":
        sensor_by_span = payload.get("sensor_by_span", {})
        for span in SPAN_IDS:
            rec = sensor_by_span.get(span, {})
            if not rec:
                continue
            MANUAL_STATE["sensor"][span] = {
                "sample_rate": int(rec.get("sample_rate", 100)),
                "signal_values": rec.get("signal_values", []),
                "strain_values": rec.get("strain_values", []),
                "spike_indices": rec.get("spike_indices", []),
                "anomaly_score": float(rec.get("anomaly_score", 0.0)),
                "anomaly_threshold": float(rec.get("anomaly_threshold", 1.0)),
                "dominant_frequency_detected": float(rec.get("dominant_frequency_detected", 0.0)),
                "flagged_window_count": int(rec.get("flagged_window_count", 0)),
                "window_scores": rec.get("window_scores", []),
                "window_errors": rec.get("window_errors", []),
                "window_ranges": rec.get("window_ranges", []),
                "feature_summary": rec.get("feature_summary", {}),
            }

    if source == "drone-capture-sim" and selected_span in SPAN_IDS:
        MANUAL_STATE["drone"][selected_span] = {
            "crack_count": int(payload.get("crack_count", 0)),
            "max_severity": int(payload.get("max_severity", 0)),
            "severity_score": float(payload.get("severity_score", 0.0)),
            "iou_mean": float(payload.get("iou_mean", 0.0)),
            "growth_rate": float(payload.get("growth_rate", 0.0)),
            "annotated_image_base64": payload.get("annotated_image_base64", ""),
            "detections": payload.get("detections", []),
            "image_shape": payload.get("image_shape", [360, 640]),
            "using_yolo": bool(payload.get("using_yolo", False)),
        }

    if source == "drone-capture-batch":
        crack_by_span = payload.get("crack_by_span", {})
        for span in SPAN_IDS:
            rec = crack_by_span.get(span, {})
            if not rec:
                continue
            MANUAL_STATE["drone"][span] = {
                "crack_count": int(rec.get("crack_count", 0)),
                "max_severity": int(rec.get("max_severity", 0)),
                "severity_score": float(rec.get("severity_score", 0.0)),
                "iou_mean": float(rec.get("iou_mean", 0.0)),
                "growth_rate": float(rec.get("growth_rate", 0.0)),
                "annotated_image_base64": rec.get("annotated_image_base64", ""),
                "detections": rec.get("detections", []),
                "image_shape": rec.get("image_shape", [360, 640]),
                "using_yolo": bool(rec.get("using_yolo", False)),
            }

    if source == "vehicle-monitor-sim":
        raw = payload.get("per_span_damage_raw", {})
        counts = payload.get("per_span_vehicle_counts", {})
        avg_dwell = payload.get("average_dwell_per_category", {})
        events = payload.get("events", [])

        for span in SPAN_IDS:
            MANUAL_STATE["vehicle"]["per_span_damage_raw"][span] = float(raw.get(span, 0.0))
            MANUAL_STATE["vehicle"]["per_span_vehicle_counts"][span] = {
                "heavy": int(counts.get(span, {}).get("heavy", 0)),
                "medium": int(counts.get(span, {}).get("medium", 0)),
                "small": int(counts.get(span, {}).get("small", 0)),
            }

        max_raw = max(MANUAL_STATE["vehicle"]["per_span_damage_raw"].values()) if raw else 0.0
        for span in SPAN_IDS:
            val = MANUAL_STATE["vehicle"]["per_span_damage_raw"][span]
            MANUAL_STATE["vehicle"]["per_span_damage_normalized"][span] = float(val / max_raw) if max_raw > 0 else 0.0

        MANUAL_STATE["vehicle"]["average_dwell_per_category"] = {
            "heavy": float(avg_dwell.get("heavy", 0.0)),
            "medium": float(avg_dwell.get("medium", 0.0)),
            "small": float(avg_dwell.get("small", 0.0)),
        }
        MANUAL_STATE["vehicle"]["events"] = events
        MANUAL_STATE["vehicle"]["matched_vehicle_list"] = events

    LAST_ANALYSIS = _compose_analysis_from_manual_state()

    fusion = LAST_ANALYSIS["fusion"]["per_span"]
    response = {
        "message": "Analysis complete",
        "meta": LAST_ANALYSIS.get("meta", {}),
        "fusion": LAST_ANALYSIS["fusion"],
        "report": LAST_ANALYSIS.get("report", {}),
    }
    if selected_span and selected_span in fusion:
        response["selected_span"] = {
            "span_id": selected_span,
            "health_index": fusion[selected_span].get("health_index", 0),
            "anomaly_score": fusion[selected_span].get("sensor_anomaly_score", 0),
            "classification": fusion[selected_span].get("classification", "UNKNOWN"),
        }

    return jsonify(response)


@app.route("/api/crack-sim/<span_id>", methods=["GET"])
def api_crack_sim(span_id: str):
    if span_id not in SPAN_IDS:
        return jsonify({"error": f"Unknown span_id '{span_id}'"}), 404
    sim_data = generate_all_simulated_data(sample_rate=100, duration_seconds=60)
    crack_result = run_crack_detection(sim_data)
    return jsonify({"span_id": span_id, **crack_result["per_span"][span_id]})


@app.route("/api/crack-sim-all", methods=["GET"])
def api_crack_sim_all():
    sim_data = generate_all_simulated_data(sample_rate=100, duration_seconds=60)
    crack_result = run_crack_detection(sim_data)
    return jsonify(crack_result)


@app.route("/api/full", methods=["GET"])
def api_full():
    data = ensure_analysis()
    return jsonify(deepcopy(data))


@app.route("/", methods=["GET"])
def api_root():
    return jsonify(
        {
            "service": "bridge-shm-backend",
            "status": "running",
            "ui_url": "http://127.0.0.1:5173",
            "note": "Open ui_url for the dashboard. Backend API routes are under /api/*.",
            "sample_endpoints": [
                "/api/health",
                "/api/full",
                "/api/report",
                "/api/assistant/chat",
            ],
        }
    )


@app.route("/api/assistant/chat", methods=["POST"])
def api_assistant_chat():
    data = ensure_analysis()
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400

    response = generate_assistant_reply(question=question, full_result=data)
    return jsonify(response)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
