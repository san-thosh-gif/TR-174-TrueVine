import json
import os
from datetime import datetime
from typing import Dict
from urllib import error, request


def _compact_summary(full_result: Dict) -> Dict:
    fusion = full_result.get("fusion", {}).get("per_span", {})
    crack = full_result.get("crack", {}).get("per_span", {})
    ttf = full_result.get("ttf", {}).get("per_span", {})
    vehicle = full_result.get("vehicle", {})

    spans = {}
    for span_id, rec in fusion.items():
        spans[span_id] = {
            "health_index": rec.get("health_index", 0),
            "classification": rec.get("classification", "UNKNOWN"),
            "sensor_anomaly_score": rec.get("sensor_anomaly_score", 0),
            "crack_severity": rec.get("crack_severity", 0),
            "vehicle_damage_norm": rec.get("vehicle_damage_norm", 0),
            "crack_count": crack.get(span_id, {}).get("crack_count", 0),
            "max_crack_severity": crack.get(span_id, {}).get("max_severity", 0),
            "ttf_days": ttf.get(span_id, {}).get("TTF_days", 0),
        }

    return {
        "generated_at": full_result.get("meta", {}).get("generated_at"),
        "run_id": full_result.get("meta", {}).get("run_id"),
        "spans": spans,
        "average_dwell_per_category": vehicle.get("average_dwell_per_category", {}),
    }


def _rule_based_assistant_reply(question: str, full_result: Dict) -> str:
    summary = _compact_summary(full_result)
    spans = summary.get("spans", {})
    if not spans:
        return "No analysis data is available yet. Please run or upload data first."

    ordered = sorted(spans.items(), key=lambda x: x[1].get("health_index", 0))
    worst_span, worst = ordered[0]

    q = (question or "").lower()
    if "worst" in q or "critical" in q or "risk" in q:
        return (
            f"Highest risk span is {worst_span} with health {worst['health_index']:.1f}/100, "
            f"classification {worst['classification']}, cracks {worst['crack_count']}, "
            f"and estimated TTF {worst['ttf_days']:.1f} days."
        )

    if "summary" in q or "overall" in q:
        lines = ["Current bridge status summary:"]
        for span_id, rec in ordered:
            lines.append(
                f"- {span_id}: health {rec['health_index']:.1f}, {rec['classification']}, "
                f"cracks {rec['crack_count']}, TTF {rec['ttf_days']:.1f} days"
            )
        return "\n".join(lines)

    return (
        "I can answer questions about span risk, crack severity, vehicle load impact, TTF, and maintenance priority. "
        f"Current worst span is {worst_span} ({worst['classification']})."
    )


def _anthropic_assistant_reply(question: str, full_result: Dict, api_key: str) -> str:
    payload = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 700,
        "system": "You are a bridge structural health monitoring assistant. Answer clearly and briefly.",
        "messages": [
            {
                "role": "user",
                "content": (
                    "Use this live bridge analysis JSON as ground truth and answer the question. "
                    "Do not fabricate values.\n\n"
                    + json.dumps(_compact_summary(full_result))
                    + "\n\nQuestion: "
                    + (question or "Give a quick status summary.")
                ),
            }
        ],
    }

    req = request.Request(
        url="https://api.anthropic.com/v1/messages",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )

    with request.urlopen(req, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))
        content = data.get("content", [])
        text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
        text = "\n".join(text_parts).strip()
        if not text:
            raise ValueError("No text returned from Anthropic")
        return text


def _openrouter_assistant_reply(question: str, full_result: Dict, api_key: str) -> str:
    model = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a bridge structural health monitoring assistant. Answer clearly and briefly.",
            },
            {
                "role": "user",
                "content": (
                    "Use this live bridge analysis JSON as ground truth and answer the question. "
                    "Do not fabricate values.\n\n"
                    + json.dumps(_compact_summary(full_result))
                    + "\n\nQuestion: "
                    + (question or "Give a quick status summary.")
                ),
            },
        ],
        "temperature": 0.2,
    }

    req = request.Request(
        url="https://openrouter.ai/api/v1/chat/completions",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    with request.urlopen(req, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("No choices returned from OpenRouter")
        text = choices[0].get("message", {}).get("content", "").strip()
        if not text:
            raise ValueError("Empty content returned from OpenRouter")
        return text


def _gemini_assistant_reply(question: str, full_result: Dict, api_key: str) -> str:
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    prompt = (
        "You are a bridge structural health monitoring assistant. Answer clearly and briefly. "
        "Use this live bridge analysis JSON as ground truth and do not fabricate values.\n\n"
        + json.dumps(_compact_summary(full_result))
        + "\n\nQuestion: "
        + (question or "Give a quick status summary.")
    )

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}],
            }
        ]
    }

    req = request.Request(
        url=f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    with request.urlopen(req, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError("No candidates returned from Gemini")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "\n".join([p.get("text", "") for p in parts]).strip()
        if not text:
            raise ValueError("Empty content returned from Gemini")
        return text


def generate_assistant_reply(question: str, full_result: Dict) -> Dict:
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        try:
            return {
                "answer": _anthropic_assistant_reply(question, full_result, anthropic_key),
                "source": "anthropic",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            pass

    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if openrouter_key:
        try:
            return {
                "answer": _openrouter_assistant_reply(question, full_result, openrouter_key),
                "source": "openrouter",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            pass

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            return {
                "answer": _gemini_assistant_reply(question, full_result, gemini_key),
                "source": "gemini",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            pass

    return {
        "answer": _rule_based_assistant_reply(question, full_result),
        "source": "rule-based",
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
