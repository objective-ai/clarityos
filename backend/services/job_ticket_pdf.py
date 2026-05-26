"""Phase 14 — Server-side reportlab job ticket PDF generator.

Pure sync function. Returns PDF bytes. NO disk persistence — caller
streams via FastAPI Response. Clone of ``_build_cms1500_pdf`` (billing.py
Phase 9 donor) with inverted aesthetic per 14-CONTEXT §F: black/white
only, monospaced data values (Courier), table grids — lab work order,
not marketing brochure.

Reads from the OpticalOrder + line items + Refractions + Lens reference
catalog rows the caller passes in. Refraction field names match the
Refraction ORM (``od_sphere`` / ``os_sphere`` / etc.).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _fmt_decimal(value: Any, fallback: str = "—") -> str:
    if value is None:
        return fallback
    try:
        return f"{Decimal(str(value)):+.2f}"
    except Exception:
        return str(value)


def _fmt_int(value: Any, fallback: str = "—") -> str:
    if value is None:
        return fallback
    try:
        return str(int(value))
    except Exception:
        return str(value)


def _settings(tenant: Any, key: str, fallback: str = "—") -> str:
    """Read clinic branding from Tenant.settings_jsonb (Open Q #2 resolution)."""
    s = getattr(tenant, "settings_jsonb", None) or {}
    value = s.get(key)
    return str(value) if value else fallback


def _section_style() -> TableStyle:
    return TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, -1), "Courier"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]
    )


def _eye_row(eye: str, rx: Any) -> list[str]:
    """One Rx row — [Eye, Sph, Cyl, Axis, Add] — pulls from Refraction.od_/os_ fields."""
    if rx is None:
        return [eye, "—", "—", "—", "—"]
    prefix = eye.lower()  # "od" or "os"
    return [
        eye,
        _fmt_decimal(getattr(rx, f"{prefix}_sphere", None)),
        _fmt_decimal(getattr(rx, f"{prefix}_cylinder", None)),
        _fmt_int(getattr(rx, f"{prefix}_axis", None)),
        _fmt_decimal(getattr(rx, f"{prefix}_add", None)),
    ]


def _build_rx_table_data(habitual: Any, final: Any) -> list[list[str]]:
    """Two-column Habitual | Final Rx table — 4 rows + 2 header rows."""
    return [
        ["", "Habitual", "", "", "", "", "Final", "", "", ""],
        ["Eye", "Sph", "Cyl", "Axis", "Add", "Eye", "Sph", "Cyl", "Axis", "Add"],
        _eye_row("OD", habitual) + _eye_row("OD", final),
        _eye_row("OS", habitual) + _eye_row("OS", final),
    ]


def build_job_ticket_pdf(
    *,
    order: Any,
    patient: Any,
    encounter: Any | None,
    final_refraction: Any | None,
    habitual_refraction: Any | None,
    products_by_id: dict[Any, Any],
    lens_types_by_id: dict[Any, Any],
    lens_materials_by_id: dict[Any, Any],
    lens_coatings_by_id: dict[Any, Any],
    tenant: Any,
    staff_name: str = "—",
) -> bytes:
    """Render a 7-section job ticket PDF and return the byte stream.

    Sections: clinic header, patient, two-column Rx (Habitual | Final),
    frame, lens, measurements, vision plan, footer. Single 8.5x11 page
    for the typical order.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "Header",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=colors.black,
        spaceAfter=4,
    )
    data_style = ParagraphStyle(
        "Data",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=9,
        textColor=colors.black,
    )

    flow: list[Any] = []

    # ---- 1. Clinic header --------------------------------------------------
    flow.append(
        Paragraph(
            f"<b>{getattr(tenant, 'name', '—')} — Optical Lab Job Ticket</b>",
            styles["Title"],
        )
    )
    flow.append(Paragraph(_settings(tenant, "clinic_address"), data_style))
    flow.append(
        Paragraph(
            f"Phone: {_settings(tenant, 'clinic_phone')}  |  "
            f"NPI: {_settings(tenant, 'clinic_npi')}",
            data_style,
        )
    )
    flow.append(
        HRFlowable(
            width="100%",
            thickness=1,
            color=colors.black,
            spaceBefore=4,
            spaceAfter=6,
        )
    )

    # ---- 2. Patient block --------------------------------------------------
    first = getattr(patient, "first_name", "") or ""
    last = getattr(patient, "last_name", "") or ""
    patient_name = f"{first} {last}".strip() or "—"
    dob = getattr(patient, "date_of_birth", None)
    encounter_date = getattr(encounter, "scheduled_for", None) if encounter else None
    flow.append(Paragraph("Patient", header_style))
    flow.append(
        Table(
            [
                [
                    "Name",
                    patient_name,
                    "Patient ID",
                    str(getattr(patient, "id", ""))[:8],
                ],
                [
                    "DOB",
                    str(dob) if dob else "—",
                    "Encounter",
                    str(encounter_date) if encounter_date else "Walk-in",
                ],
            ],
            colWidths=[1.0 * inch, 2.5 * inch, 1.0 * inch, 2.5 * inch],
            style=_section_style(),
        )
    )
    flow.append(Spacer(1, 6))

    # ---- 3. Two-column Rx (Habitual | Final) -------------------------------
    flow.append(Paragraph("Refraction (Habitual | Final)", header_style))
    flow.append(
        Table(
            _build_rx_table_data(habitual_refraction, final_refraction),
            colWidths=[
                0.5 * inch,
                0.8 * inch,
                0.8 * inch,
                0.8 * inch,
                0.6 * inch,
                0.6 * inch,
                0.8 * inch,
                0.8 * inch,
                0.8 * inch,
                0.6 * inch,
            ],
            style=_section_style(),
        )
    )
    flow.append(Spacer(1, 6))

    # ---- 4. Frame block ----------------------------------------------------
    frame_line = next(
        (
            li
            for li in order.line_items
            if products_by_id.get(li.product_id)
            and getattr(products_by_id[li.product_id], "product_type", None) == "frame"
        ),
        None,
    )
    if frame_line:
        product = products_by_id[frame_line.product_id]
        attrs = getattr(product, "attributes", None) or {}
        flow.append(Paragraph("Frame", header_style))
        flow.append(
            Table(
                [
                    [
                        "Brand",
                        str(getattr(product, "brand", "—")),
                        "Model",
                        str(getattr(product, "model", "—")),
                    ],
                    [
                        "Color",
                        str(attrs.get("color", "—")),
                        "SKU",
                        str(getattr(product, "sku", "—")),
                    ],
                    [
                        "Eye",
                        _fmt_int(attrs.get("eye_size")),
                        "Bridge",
                        _fmt_int(attrs.get("bridge_size")),
                    ],
                    [
                        "Temple",
                        _fmt_int(attrs.get("temple_size")),
                        "Material",
                        str(attrs.get("material", "—")),
                    ],
                ],
                colWidths=[1.0 * inch, 2.5 * inch, 1.0 * inch, 2.5 * inch],
                style=_section_style(),
            )
        )
        flow.append(Spacer(1, 6))

    # ---- 5. Lens block -----------------------------------------------------
    lens_line = next((li for li in order.line_items if li.lens_config_jsonb), None)
    if lens_line:
        lc = lens_line.lens_config_jsonb or {}
        lens_type = lens_types_by_id.get(lc.get("lens_type_id"))
        lens_material = lens_materials_by_id.get(lc.get("material_id"))
        coating_names = [
            lens_coatings_by_id[cid].name
            for cid in lc.get("coating_ids", [])
            if cid in lens_coatings_by_id
        ]
        flow.append(Paragraph("Lens", header_style))
        flow.append(
            Table(
                [
                    [
                        "Type",
                        getattr(lens_type, "name", "—"),
                        "Material",
                        getattr(lens_material, "name", "—"),
                    ],
                    [
                        "Refractive Index",
                        _fmt_decimal(getattr(lens_material, "refractive_index", None)),
                        "Coatings",
                        ", ".join(coating_names) if coating_names else "—",
                    ],
                    [
                        "Tint",
                        str((lc.get("tint") or {}).get("color", "—")),
                        "Notes",
                        str(lc.get("custom_notes", "—")),
                    ],
                ],
                colWidths=[1.0 * inch, 2.5 * inch, 1.0 * inch, 2.5 * inch],
                style=_section_style(),
            )
        )
        flow.append(Spacer(1, 6))

    # ---- 6. Measurements ---------------------------------------------------
    fitting = getattr(order, "fitting_jsonb", None) or {}
    flow.append(Paragraph("Measurements", header_style))
    flow.append(
        Table(
            [
                [
                    "PD Dist",
                    _fmt_decimal(fitting.get("pd_distance")),
                    "PD Near",
                    _fmt_decimal(fitting.get("pd_near")),
                ],
                [
                    "Mono PD OD",
                    _fmt_decimal(fitting.get("pd_monocular_od")),
                    "Mono PD OS",
                    _fmt_decimal(fitting.get("pd_monocular_os")),
                ],
                [
                    "Seg OD",
                    _fmt_decimal(fitting.get("seg_height_od")),
                    "Seg OS",
                    _fmt_decimal(fitting.get("seg_height_os")),
                ],
                [
                    "Vertex",
                    _fmt_decimal(fitting.get("vertex_distance")),
                    "Pantoscopic",
                    _fmt_decimal(fitting.get("pantoscopic_tilt")),
                ],
            ],
            colWidths=[1.0 * inch, 2.5 * inch, 1.0 * inch, 2.5 * inch],
            style=_section_style(),
        )
    )
    flow.append(Spacer(1, 6))

    # ---- 7. Vision plan ----------------------------------------------------
    vision_plan = getattr(order, "vision_plan_jsonb", None) or {}
    flow.append(Paragraph("Vision Plan", header_style))
    flow.append(
        Table(
            [
                [
                    "Plan",
                    str(vision_plan.get("name", "—")),
                    "Member ID",
                    str(vision_plan.get("member_id", "—")),
                ],
                [
                    "Group",
                    str(vision_plan.get("group_number", "—")),
                    "Auth #",
                    str(vision_plan.get("authorization_number", "—")),
                ],
                [
                    "Copay",
                    str(vision_plan.get("copay", "—")),
                    "Allowance",
                    str(vision_plan.get("allowance", "—")),
                ],
            ],
            colWidths=[1.0 * inch, 2.5 * inch, 1.0 * inch, 2.5 * inch],
            style=_section_style(),
        )
    )
    flow.append(Spacer(1, 6))

    # ---- Footer ------------------------------------------------------------
    flow.append(
        HRFlowable(
            width="100%",
            thickness=0.5,
            color=colors.grey,
            spaceBefore=4,
            spaceAfter=4,
        )
    )
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    flow.append(
        Paragraph(
            f"<i>Generated by ClarityOS — {staff_name}, {ts}</i>",
            data_style,
        )
    )

    doc.build(flow)
    return buffer.getvalue()
