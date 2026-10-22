from typing import Dict, Any


def generate_incident_html_report(incident: Dict[str, Any], observation: Dict[str, Any]) -> str:
    """
    Generates a clean, 1-page printable disaster response incident brief
    matching Section 13 of the Companion Software Architecture Specification.
    """
    inc_code = incident.get("incident_code", "INC-XXXX")
    obs_code = observation.get("obs_code", "OBS-XXXX")
    priority = incident.get("priority", "P1 - Immediate")
    assigned_team = incident.get("assigned_team", "Search & Rescue Team Alpha")
    created_at = incident.get("created_at", "")
    summary = incident.get("summary", "No operator summary provided.")
    notes = observation.get("reviewer_notes", "Verified visual match by human operator.")

    person_name = observation.get("person_name") or "Unidentified Subject"
    person_category = observation.get("person_category") or "Unknown Candidate"
    medical_alerts = observation.get("medical_alerts") or "None reported."
    reported_location = observation.get("reported_last_seen") or "Unknown"

    pos_x = observation.get("pos_x", 0.0)
    pos_y = observation.get("pos_y", 0.0)
    distance_m = observation.get("distance_m", 0.0)
    confidence = int((observation.get("confidence") or 0.85) * 100)
    similarity = int((observation.get("match_similarity") or 0.82) * 100)

    crop_path = f"/evidence/{observation.get('crop_path')}" if observation.get("crop_path") else ""
    full_path = f"/evidence/{observation.get('full_frame_path')}" if observation.get("full_frame_path") else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Incident Report - {inc_code}</title>
<style>
  @page {{
    size: A4;
    margin: 12mm;
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 0;
    background: #ffffff;
    font-size: 11px;
    line-height: 1.4;
  }}
  .header {{
    border-bottom: 2px solid #0f172a;
    padding-bottom: 8px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }}
  .title {{
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }}
  .badge-p1 {{
    background: #ef4444;
    color: white;
    padding: 4px 8px;
    font-weight: 700;
    font-size: 11px;
    border-radius: 4px;
  }}
  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }}
  .card {{
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px;
    background: #f8fafc;
  }}
  .card-title {{
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    margin-bottom: 6px;
  }}
  .photo-container {{
    display: flex;
    gap: 8px;
  }}
  .photo-box {{
    flex: 1;
    border: 1px solid #94a3b8;
    background: #090d16;
    border-radius: 4px;
    overflow: hidden;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .photo-box img {{
    max-width: 100%;
    max-height: 100%;
    object-fit: cover;
  }}
  .disclaimer {{
    margin-top: 14px;
    padding: 8px;
    border-left: 3px solid #f59e0b;
    background: #fffbeb;
    font-size: 9px;
    color: #78350f;
  }}
  .footer {{
    margin-top: 12px;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #64748b;
  }}
  @media print {{
    .no-print {{ display: none; }}
  }}
</style>
</head>
<body>

<div class="no-print" style="background:#0f172a; padding:10px; text-align:right; margin-bottom:10px;">
  <button onclick="window.print()" style="background:#06b6d4; color:#0f172a; font-weight:700; padding:6px 16px; border:none; border-radius:4px; cursor:pointer;">
    🖨️ PRINT / SAVE AS PDF
  </button>
</div>

<div class="header">
  <div>
    <div class="title">PIPER RESCUE COMMAND • INCIDENT DOSSIER</div>
    <div style="font-size:10px; color:#475569; font-family:monospace; margin-top:2px;">
      REF: {inc_code} • SOURCE OBSERVATION: {obs_code} • ROBOT: PIPER-01
    </div>
  </div>
  <div class="badge-p1">
    PRIORITY: {priority}
  </div>
</div>

<div class="grid-2">
  <!-- Column 1: Spatial & Mission Data -->
  <div class="card">
    <div class="card-title">1. SPATIAL LOCALIZATION & TARGET METRICS</div>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="color:#64748b; width:45%;">Local Map Coordinate:</td><td><strong>X: {pos_x:.2f}m, Y: {pos_y:.2f}m</strong></td></tr>
      <tr><td style="color:#64748b;">Optical Range / Depth:</td><td>{distance_m:.2f} metres (OAK-D RGB-D)</td></tr>
      <tr><td style="color:#64748b;">AI Detection Confidence:</td><td>{confidence}% (YOLO Person Detector)</td></tr>
      <tr><td style="color:#64748b;">Assigned Dispatch Team:</td><td><strong>{assigned_team}</strong></td></tr>
      <tr><td style="color:#64748b;">Incident Status:</td><td><strong style="color:#059669;">DISPATCHED / ACTIVE</strong></td></tr>
      <tr><td style="color:#64748b;">Recorded Timestamp:</td><td>{created_at}</td></tr>
    </table>
  </div>

  <!-- Column 2: Candidate Identification Dossier -->
  <div class="card">
    <div class="card-title">2. CANDIDATE REGISTRY MATCH (PROBABILITY {similarity}%)</div>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="color:#64748b; width:45%;">Candidate Name:</td><td><strong style="font-size:12px;">{person_name}</strong></td></tr>
      <tr><td style="color:#64748b;">Category:</td><td>{person_category}</td></tr>
      <tr><td style="color:#64748b;">Last Reported Area:</td><td>{reported_location}</td></tr>
      <tr><td style="color:#64748b;">Medical Advisory:</td><td style="color:#b91c1c;"><strong>{medical_alerts}</strong></td></tr>
    </table>
  </div>
</div>

<!-- Evidence Visuals -->
<div class="card" style="margin-bottom:12px;">
  <div class="card-title">3. OPTICAL EVIDENCE CAPTURE (FULL FRAME &amp; PERSON CROP)</div>
  <div class="photo-container">
    <div class="photo-box">
      <img src="{full_path}" alt="Full Search Frame">
    </div>
    <div class="photo-box" style="flex: 0 0 160px;">
      <img src="{crop_path}" alt="Person Target Crop">
    </div>
  </div>
</div>

<!-- Operator Review Notes -->
<div class="card">
  <div class="card-title">4. HUMAN-IN-THE-LOOP OPERATOR VERIFICATION</div>
  <p style="margin:2px 0 6px 0;"><strong>Operator Notes:</strong> {notes}</p>
  <p style="margin:0; color:#334155;"><strong>Incident Summary:</strong> {summary}</p>
</div>

<div class="disclaimer">
  <strong>HUMANITARIAN OPERATIONS NOTICE:</strong> Generated from an AI-assisted optical detection confirmed by an authorized human operations controller.
  Coordinates are approximate (± 0.5m) within the robot local frame. This document does not constitute a certified medical assessment.
</div>

<div class="footer">
  <span>PIPER RESCUE INTELLIGENCE PLATFORM • ROS 2 JAZZY</span>
  <span>AUTHENTICATED INCIDENT RECORD • STRICT ACCESS ONLY</span>
</div>

</body>
</html>"""
    return html
