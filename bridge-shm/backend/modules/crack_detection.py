import base64
from typing import Dict, List, Tuple

import cv2
import numpy as np


try:
    from ultralytics import YOLO  # type: ignore
except Exception:
    YOLO = None


SEVERITY_COLOR = {
    1: (0, 215, 255),
    2: (0, 140, 255),
    3: (0, 0, 255),
}


def _decode_base64_image(img_b64: str) -> np.ndarray:
    raw = base64.b64decode(img_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def _encode_base64_image(img: np.ndarray) -> str:
    ok, encoded = cv2.imencode(".jpg", img)
    if not ok:
        return ""
    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def _bbox_area(bbox: Tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = bbox
    return max(0, x2 - x1) * max(0, y2 - y1)


def _bbox_iou(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = _bbox_area(a) + _bbox_area(b) - inter
    if union <= 0:
        return 0.0
    return float(inter / union)


def _run_yolo_if_available(image: np.ndarray, conf: float = 0.4) -> List[Dict]:
    if YOLO is None:
        return []

    try:
        model = YOLO("yolov8n-seg.pt")
        results = model.predict(image, conf=conf, verbose=False)
        detections = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                xyxy = box.xyxy.cpu().numpy().astype(int)[0].tolist()
                score = float(box.conf.cpu().numpy()[0])
                bbox = (xyxy[0], xyxy[1], xyxy[2], xyxy[3])
                severity = 1 if score < 0.55 else (2 if score < 0.75 else 3)
                detections.append({"bbox": bbox, "severity": severity, "confidence": score})
        return detections
    except Exception:
        return []


def _annotate(image: np.ndarray, detections: List[Dict]) -> np.ndarray:
    annotated = image.copy()
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        sev = int(det["severity"])
        conf = float(det.get("confidence", 0.8))
        color = SEVERITY_COLOR.get(sev, (255, 255, 0))
        label = f"sev:{sev} conf:{conf:.2f}"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, label, (x1, max(15, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
    return annotated


def run_crack_detection(sim_data: Dict) -> Dict:
    crack_input = sim_data["cracks"]
    per_span = {}

    for span_id, payload in crack_input.items():
        frame1 = payload["frame_t1"]
        frame2 = payload["frame_t2"]

        image1 = _decode_base64_image(frame1["image_base64"])
        image2 = _decode_base64_image(frame2["image_base64"])
        h, w = image2.shape[:2]
        image_area = float(h * w)

        yolo_dets = _run_yolo_if_available(image2, conf=0.4)
        detections = yolo_dets if yolo_dets else frame2["annotations"]

        ann1 = frame1["annotations"]
        ann2 = frame2["annotations"]

        area_t1 = float(sum(_bbox_area(tuple(a["bbox"])) for a in ann1))
        area_t2 = float(sum(_bbox_area(tuple(a["bbox"])) for a in ann2))
        growth_rate = float((area_t2 - area_t1) / area_t1) if area_t1 > 0 else 0.0

        ious = []
        for idx in range(min(len(ann1), len(ann2))):
            ious.append(_bbox_iou(tuple(ann1[idx]["bbox"]), tuple(ann2[idx]["bbox"])))
        iou_mean = float(np.mean(ious)) if ious else 0.0

        crack_count = len(detections)
        max_severity = int(max([d.get("severity", 1) for d in detections], default=1))
        total_area = float(sum(_bbox_area(tuple(d["bbox"])) for d in detections))
        severity_score = float(np.clip((max_severity / 3.0) * 0.6 + (total_area / image_area) * 0.4, 0.0, 1.0))

        annotated = _annotate(image2, detections)

        per_span[span_id] = {
            "crack_count": crack_count,
            "max_severity": max_severity,
            "severity_score": severity_score,
            "iou_mean": iou_mean,
            "growth_rate": growth_rate,
            "annotated_image_base64": _encode_base64_image(annotated),
            "detections": detections,
            "image_shape": [h, w],
            "using_yolo": bool(yolo_dets),
        }

    return {"per_span": per_span}
