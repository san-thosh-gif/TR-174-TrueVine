import json
import os
from datetime import datetime
from typing import Dict
from urllib import error, request


def _build_span_summary(full_result: Dict) -> Dict:
    summary = {}
    fusion = full_result["fusion"]["per_span"]
    cracks = full_result["crack"]["per_span"]
    vehicle = full_result["vehicle"]
    ttf = full_result["ttf"]["per_span"]

    for span_id in fusion.keys():
        summary[span_id] = {
            "health_index": fusion[span_id]["health_index"],
            "classification": fusion[span_id]["classification"],
            "crack_count": cracks.get(span_id, {}).get("crack_count", 0),
            "max_crack_severity": cracks.get(span_id, {}).get("max_severity", 1),
            "vehicle_damage_norm": fusion[span_id]["vehicle_damage_norm"],
            "ttf_days": ttf.get(span_id, {}).get("TTF_days", 0),
            "ttf_ci": [
                ttf.get(span_id, {}).get("TTF_lower", 0),
                ttf.get(span_id, {}).get("TTF_upper", 0),
            ],
        }

    summary["fleet"] = {
        "average_dwell_per_category": vehicle.get("average_dwell_per_category", {}),
    }
    return summary


def _rule_based_report(full_result: Dict) -> str:
    fusion = full_result["fusion"]["per_span"]
    ttf = full_result["ttf"]["per_span"]
    cracks = full_result["crack"]["per_span"]

    ordered = sorted(fusion.items(), key=lambda x: x[1]["health_index"])

    lines = []
    lines.append("EXECUTIVE SUMMARY")
    worst_span, worst_rec = ordered[0]
    lines.append(
        f"Overall network status shows highest concern at {worst_span} with health {worst_rec['health_index']:.1f}/100 ({worst_rec['classification']})."
    )
    lines.append("\nPER-SPAN FINDINGS (MOST SEVERE FIRST)")

    for span_id, rec in ordered:
        crack_count = cracks[span_id]["crack_count"]
        max_sev = cracks[span_id]["max_severity"]
        ttf_days = ttf[span_id]["TTF_days"]
        lines.append(
            f"- {span_id}: health={rec['health_index']:.1f}, class={rec['classification']}, cracks={crack_count}, max crack severity={max_sev}, TTF={ttf_days:.1f} days"
        )

    lines.append("\nRECOMMENDED ACTIONS")
    for span_id, rec in ordered:
        ttf_days = ttf[span_id]["TTF_days"]
        if rec["health_index"] < 35 or ttf_days < 10:
            urgency = "IMMEDIATE"
            action = "Deploy on-site structural team, limit heavy vehicle access, and schedule emergency crack sealing + bearing inspection."
        elif rec["health_index"] < 60 or ttf_days < 25:
            urgency = "THIS WEEK"
            action = "Perform targeted NDT inspection, monitor vibration continuously, and patch moderate cracks."
        else:
            urgency = "THIS MONTH"
            action = "Maintain routine inspection cadence and continue predictive monitoring trend validation."

        lines.append(f"- {span_id} [{urgency}]: {action}")

    return "\n".join(lines)


def _anthropic_report(full_result: Dict, api_key: str) -> str:
    summary = _build_span_summary(full_result)
    payload = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 900,
        "system": "You are a structural engineering inspection AI. Generate concise, professional reports.",
        "messages": [
            {
                "role": "user",
                "content": (
                    "Use this JSON summary to produce: "
                    "(1) executive summary, "
                    "(2) per-span findings ordered by severity, "
                    "(3) recommended maintenance actions with urgency levels IMMEDIATE / THIS WEEK / THIS MONTH.\n\n"
                    + json.dumps(summary)
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
        if not content:
            raise ValueError("No content returned from Anthropic")
        text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
        return "\n".join(text_parts).strip()


def _openrouter_report(full_result: Dict, api_key: str) -> str:
    summary = _build_span_summary(full_result)
    model = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a structural engineering inspection AI. Generate concise, professional reports.",
            },
            {
                "role": "user",
                "content": (
                    "Use this JSON summary to produce: "
                    "(1) executive summary, "
                    "(2) per-span findings ordered by severity, "
                    "(3) recommended maintenance actions with urgency levels IMMEDIATE / THIS WEEK / THIS MONTH.\n\n"
                    + json.dumps(summary)
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


def _gemini_report(full_result: Dict, api_key: str) -> str:
    summary = _build_span_summary(full_result)
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    prompt = (
        "You are a structural engineering inspection AI. Generate concise, professional reports. "
        "Use this JSON summary to produce: "
        "(1) executive summary, "
        "(2) per-span findings ordered by severity, "
        "(3) recommended maintenance actions with urgency levels IMMEDIATE / THIS WEEK / THIS MONTH.\n\n"
        + json.dumps(summary)
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


def generate_inspection_report(full_result: Dict) -> Dict:
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        try:
            report = _anthropic_report(full_result, anthropic_key)
            return {
                "report": report,
                "source": "anthropic",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            # Fall back to local template mode for reliability in no-key or API-error scenarios.
            pass

    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if openrouter_key:
        try:
            report = _openrouter_report(full_result, openrouter_key)
            return {
                "report": report,
                "source": "openrouter",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            pass

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            report = _gemini_report(full_result, gemini_key)
            return {
                "report": report,
                "source": "gemini",
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        except (error.URLError, ValueError, TimeoutError, Exception):
            pass

    return {
        "report": _rule_based_report(full_result),
        "source": "rule-based",
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
