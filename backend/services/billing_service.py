"""
services/billing_service.py

Pure business logic for billing operations:
- MDM (Medical Decision Making) complexity calculation
- CPT-ICD pointer validation
- CPT line item auto-suggestion

No FastAPI / DB dependencies — all inputs are plain ORM objects or values.
"""

from __future__ import annotations

from decimal import Decimal

from backend.db.models.tenant.clinical import (
    Diagnosis,
    ExamFindings,
    PatientProblem,
)
from backend.schemas.billing import CptIcdWarning, MdmCalculationResult


# ---------------------------------------------------------------------------
# Common optometry CPT codes with default fees
# ---------------------------------------------------------------------------

CPT_CATALOG: dict[str, dict] = {
    # Comprehensive exams
    "92004": {"description": "Comprehensive new patient eye exam", "fee": Decimal("250.00")},
    "92014": {"description": "Comprehensive established patient eye exam", "fee": Decimal("175.00")},
    "92002": {"description": "Intermediate new patient eye exam", "fee": Decimal("150.00")},
    "92012": {"description": "Intermediate established patient eye exam", "fee": Decimal("100.00")},
    # E/M codes — New Patient (99202-99205)
    "99202": {"description": "Office visit, new patient — straightforward MDM", "fee": Decimal("100.00")},
    "99203": {"description": "Office visit, new patient — low MDM", "fee": Decimal("135.00")},
    "99204": {"description": "Office visit, new patient — moderate MDM", "fee": Decimal("190.00")},
    "99205": {"description": "Office visit, new patient — high MDM", "fee": Decimal("255.00")},
    # E/M codes — Established Patient (99212-99215)
    "99212": {"description": "Office visit, established patient — straightforward MDM", "fee": Decimal("75.00")},
    "99213": {"description": "Office visit, established patient — low MDM", "fee": Decimal("110.00")},
    "99214": {"description": "Office visit, established patient — moderate MDM", "fee": Decimal("165.00")},
    "99215": {"description": "Office visit, established patient — high MDM", "fee": Decimal("225.00")},
    # Ancillary procedures
    "92015": {"description": "Refraction", "fee": Decimal("45.00")},
    "92083": {"description": "Visual field test", "fee": Decimal("85.00")},
    "92250": {"description": "Fundus photography", "fee": Decimal("65.00")},
    "92134": {"description": "OCT retina scan", "fee": Decimal("75.00")},
}


# Industry-standard E/M crosswalk: (mdm_level, is_new_patient) → CPT code
EM_CROSSWALK: dict[tuple[str, bool], str] = {
    ("straightforward", False): "99212",
    ("straightforward", True): "99202",
    ("low", False): "99213",
    ("low", True): "99203",
    ("moderate", False): "99214",
    ("moderate", True): "99204",
    ("high", False): "99215",
    ("high", True): "99205",
}


# ---------------------------------------------------------------------------
# MDM Complexity Calculator
# ---------------------------------------------------------------------------


def calculate_mdm(
    diagnoses: list[Diagnosis],
    problems: list[PatientProblem],
    exam_findings: list[ExamFindings],
    is_new_patient: bool = False,
) -> MdmCalculationResult:
    """Calculate Medical Decision Making complexity from clinical data.

    Uses the 2021 E&M guidelines framework:
    1. Number and Complexity of Problems Addressed
    2. Amount and/or Complexity of Data Reviewed
    3. Risk of Complications and/or Morbidity
    """
    # --- 1. Problem complexity ---
    problem_points = 0
    active_dx = [dx for dx in diagnoses if not dx.is_deleted and dx.status == "active"]
    chronic_dx = [dx for dx in diagnoses if not dx.is_deleted and dx.status == "chronic"]
    active_problems = [p for p in problems if p.status == "active" and not p.is_deleted]

    for dx in active_dx:
        severity = (dx.severity or "").lower()
        if severity in ("severe", "acute"):
            problem_points += 3
        elif severity in ("moderate",):
            problem_points += 2
        else:
            problem_points += 1

    for dx in chronic_dx:
        severity = (dx.severity or "").lower()
        if severity in ("severe", "exacerbation", "worsening"):
            problem_points += 3
        else:
            problem_points += 2

    for p in active_problems:
        severity = (p.severity or "").lower()
        if severity in ("severe", "exacerbation"):
            problem_points += 3
        else:
            problem_points += 1

    # --- 2. Data complexity ---
    data_points = 0
    data_points += len(exam_findings)
    data_points += sum(1 for dx in active_dx if dx.notes)

    # --- 3. Risk assessment ---
    risk_keywords_high = {"glaucoma", "retinal detachment", "macular degeneration",
                          "diabetic retinopathy", "papilledema", "optic neuritis"}
    risk_keywords_moderate = {"cataract", "dry eye", "blepharitis", "conjunctivitis",
                              "keratoconus", "uveitis", "iritis"}

    all_descriptions = " ".join(
        (dx.description or "").lower() for dx in active_dx + chronic_dx
    )
    all_problem_desc = " ".join(
        (p.description or "").lower() for p in active_problems
    )
    combined_text = all_descriptions + " " + all_problem_desc

    risk_level = "minimal"
    if any(kw in combined_text for kw in risk_keywords_high):
        risk_level = "high"
    elif any(kw in combined_text for kw in risk_keywords_moderate):
        risk_level = "moderate"
    elif problem_points >= 2:
        risk_level = "low"

    # --- Determine MDM level ---
    # Using the "two of three" rule:
    scores = {"problems": 0, "data": 0, "risk": 0}

    if problem_points >= 4:
        scores["problems"] = 4
    elif problem_points >= 3:
        scores["problems"] = 3
    elif problem_points >= 2:
        scores["problems"] = 2
    else:
        scores["problems"] = 1

    if data_points >= 4:
        scores["data"] = 4
    elif data_points >= 3:
        scores["data"] = 3
    elif data_points >= 2:
        scores["data"] = 2
    else:
        scores["data"] = 1

    risk_map = {"high": 4, "moderate": 3, "low": 2, "minimal": 1}
    scores["risk"] = risk_map.get(risk_level, 1)

    # Two of three rule — take the second-highest score
    sorted_scores = sorted(scores.values(), reverse=True)
    mdm_score = sorted_scores[1]

    if mdm_score >= 4:
        mdm_level = "high"
    elif mdm_score >= 3:
        mdm_level = "moderate"
    else:
        mdm_level = "straightforward"

    # Use crosswalk to select correct E/M code based on patient type
    em_code = EM_CROSSWALK.get((mdm_level, is_new_patient), "99213")

    # Build reasoning
    parts = []
    parts.append(
        f"Problems addressed: {len(active_dx)} active diagnoses, "
        f"{len(chronic_dx)} chronic conditions, "
        f"{len(active_problems)} active problems ({problem_points} complexity points)."
    )
    parts.append(
        f"Data reviewed: {len(exam_findings)} exam sections, "
        f"{data_points} total data points."
    )
    parts.append(f"Risk level: {risk_level}.")
    parts.append(
        f"MDM level: {mdm_level} (2-of-3 rule: "
        f"problems={scores['problems']}, data={scores['data']}, risk={scores['risk']})."
    )
    patient_type_label = "new patient" if is_new_patient else "established patient"
    parts.append(f"Patient type: {patient_type_label}. Suggested E/M: {em_code}.")

    return MdmCalculationResult(
        mdm_level=mdm_level,
        suggested_em_code=em_code,
        reasoning=" ".join(parts),
        problem_points=problem_points,
        data_points=data_points,
        risk_level=risk_level,
        is_new_patient=is_new_patient,
    )


# ---------------------------------------------------------------------------
# CPT-ICD Pointer Validation
# ---------------------------------------------------------------------------


def validate_cpt_icd_pointers(
    line_items: list,
    diagnoses: list[Diagnosis],
) -> list[CptIcdWarning]:
    """Check that every CPT code has at least one supporting diagnosis pointer."""
    warnings: list[CptIcdWarning] = []
    active_icd_codes = {
        dx.icd10_code for dx in diagnoses if not dx.is_deleted
    }

    for item in line_items:
        if not item.diagnosis_pointers:
            warnings.append(CptIcdWarning(
                cpt_code=item.cpt_code,
                description=item.description,
                warning=f"CPT {item.cpt_code} has no diagnosis pointer. "
                        "A supporting ICD-10 code is required for claim submission.",
            ))
        else:
            missing = [
                code for code in item.diagnosis_pointers
                if code not in active_icd_codes
            ]
            if missing:
                warnings.append(CptIcdWarning(
                    cpt_code=item.cpt_code,
                    description=item.description,
                    warning=f"CPT {item.cpt_code} references ICD-10 codes not on this encounter: "
                            f"{', '.join(missing)}.",
                ))

    return warnings


# ---------------------------------------------------------------------------
# CPT Line Item Auto-Suggestion
# ---------------------------------------------------------------------------


def suggest_line_items(
    diagnoses: list[Diagnosis],
    has_refraction: bool,
    mdm_result: MdmCalculationResult,
    is_new_patient: bool = False,
) -> list[dict]:
    """Auto-suggest CPT line items based on encounter data."""
    items: list[dict] = []
    active_dx = [dx for dx in diagnoses if not dx.is_deleted]
    icd_codes = [dx.icd10_code for dx in active_dx]

    # Add suggested E&M code from MDM calculation
    em_code = mdm_result.suggested_em_code
    if em_code in CPT_CATALOG:
        items.append({
            "cpt_code": em_code,
            "description": CPT_CATALOG[em_code]["description"],
            "fee": CPT_CATALOG[em_code]["fee"],
            "units": 1,
            "diagnosis_pointers": icd_codes[:4],
            "modifiers": [],
        })

    # Add comprehensive exam code if multiple diagnoses
    if len(active_dx) >= 2:
        exam_code = "92014"
        if exam_code in CPT_CATALOG and not any(i["cpt_code"] == exam_code for i in items):
            exam_item = {
                "cpt_code": exam_code,
                "description": CPT_CATALOG[exam_code]["description"],
                "fee": CPT_CATALOG[exam_code]["fee"],
                "units": 1,
                "diagnosis_pointers": icd_codes[:4],
                "modifiers": [],
            }
            # Add laterality modifier for 92xxx codes based on primary diagnosis
            if icd_codes and icd_codes[0]:
                primary_dx = icd_codes[0]
                last_char = primary_dx[-1]
                if last_char == "1":
                    exam_item["modifiers"].append("-RT")
                elif last_char == "2":
                    exam_item["modifiers"].append("-LT")
            items.append(exam_item)

    # Add refraction if performed
    if has_refraction:
        refraction_item = {
            "cpt_code": "92015",
            "description": CPT_CATALOG["92015"]["description"],
            "fee": CPT_CATALOG["92015"]["fee"],
            "units": 1,
            "diagnosis_pointers": icd_codes[:4],
            "modifiers": [],
            "fee_source": "patient_responsibility",  # Medicare/most insurers don't cover refraction
        }
        # Add laterality modifier for 92015 if indicated
        if icd_codes and icd_codes[0]:
            primary_dx = icd_codes[0]
            last_char = primary_dx[-1]
            if last_char == "1":
                refraction_item["modifiers"].append("-RT")
            elif last_char == "2":
                refraction_item["modifiers"].append("-LT")
        items.append(refraction_item)

    return items
