"""
Unit tests for backend/services/billing_service.py

Tests MDM calculation, E/M crosswalk, laterality modifiers, and refraction guard logic.
Uses minimal mock objects to avoid ORM DB initialization.
"""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from backend.schemas.billing import MdmCalculationResult
from backend.services.billing_service import (
    EM_CROSSWALK,
    calculate_mdm,
    suggest_line_items,
)


# ===========================================================================
# Fixtures — Minimal Mock Objects
# ===========================================================================


def make_diagnosis(icd10_code: str, severity: str, description: str = None, status: str = "active") -> MagicMock:
    """Create a minimal mock Diagnosis object."""
    dx = MagicMock()
    dx.icd10_code = icd10_code
    dx.severity = severity
    dx.status = status
    dx.is_deleted = False
    dx.description = description or f"Test diagnosis {icd10_code}"
    dx.notes = "Test notes"
    return dx


def make_exam_finding() -> MagicMock:
    """Create a minimal mock ExamFindings object."""
    ef = MagicMock()
    ef.is_deleted = False
    return ef


@pytest.fixture
def diagnosis_moderate_right_eye():
    """Diagnosis with H25.11 (right eye laterality marker)."""
    return make_diagnosis("H25.11", "moderate")


@pytest.fixture
def diagnosis_moderate_left_eye():
    """Diagnosis with H25.12 (left eye laterality marker)."""
    return make_diagnosis("H25.12", "moderate")


@pytest.fixture
def diagnosis_severe_glaucoma():
    """Severe diagnosis with glaucoma (high risk keyword)."""
    return make_diagnosis("H40.1130", "severe", description="Primary angle-closure glaucoma, acute")


@pytest.fixture
def diagnosis_mild():
    """Mild diagnosis."""
    return make_diagnosis("H52.13", "mild")


# ===========================================================================
# Test E/M Crosswalk Mapping
# ===========================================================================


def test_em_crosswalk_established_straightforward():
    """Established patient + straightforward MDM → 99212."""
    assert EM_CROSSWALK[("straightforward", False)] == "99212"


def test_em_crosswalk_established_low():
    """Established patient + low MDM → 99213."""
    assert EM_CROSSWALK[("low", False)] == "99213"


def test_em_crosswalk_established_moderate():
    """Established patient + moderate MDM → 99214."""
    assert EM_CROSSWALK[("moderate", False)] == "99214"


def test_em_crosswalk_established_high():
    """Established patient + high MDM → 99215."""
    assert EM_CROSSWALK[("high", False)] == "99215"


def test_em_crosswalk_new_straightforward():
    """New patient + straightforward MDM → 99202."""
    assert EM_CROSSWALK[("straightforward", True)] == "99202"


def test_em_crosswalk_new_low():
    """New patient + low MDM → 99203."""
    assert EM_CROSSWALK[("low", True)] == "99203"


def test_em_crosswalk_new_moderate():
    """New patient + moderate MDM → 99204."""
    assert EM_CROSSWALK[("moderate", True)] == "99204"


def test_em_crosswalk_new_high():
    """New patient + high MDM → 99205."""
    assert EM_CROSSWALK[("high", True)] == "99205"


# ===========================================================================
# Test calculate_mdm() with patient type
# ===========================================================================


def test_calculate_mdm_moderate_new_patient(diagnosis_moderate_right_eye, diagnosis_moderate_left_eye):
    """Moderate MDM + new patient → 99204 E/M code."""
    diagnoses = [diagnosis_moderate_right_eye, diagnosis_moderate_left_eye]
    problems = []
    exam_findings = [make_exam_finding()]

    result = calculate_mdm(diagnoses, problems, exam_findings, is_new_patient=True)

    assert result.is_new_patient is True
    assert result.suggested_em_code == "99204"
    assert result.mdm_level == "moderate"
    assert "new patient" in result.reasoning.lower()


def test_calculate_mdm_moderate_established_patient(diagnosis_moderate_right_eye, diagnosis_moderate_left_eye):
    """Moderate MDM + established patient → 99214 E/M code."""
    diagnoses = [diagnosis_moderate_right_eye, diagnosis_moderate_left_eye]
    problems = []
    exam_findings = [make_exam_finding()]

    result = calculate_mdm(diagnoses, problems, exam_findings, is_new_patient=False)

    assert result.is_new_patient is False
    assert result.suggested_em_code == "99214"
    assert result.mdm_level == "moderate"
    assert "established patient" in result.reasoning.lower()


def test_calculate_mdm_straightforward_established(diagnosis_mild):
    """Straightforward MDM + established patient → 99212 E/M code."""
    diagnoses = [diagnosis_mild]
    problems = []
    exam_findings = []

    result = calculate_mdm(diagnoses, problems, exam_findings, is_new_patient=False)

    assert result.suggested_em_code == "99212"
    assert result.mdm_level == "straightforward"


def test_calculate_mdm_high_new_patient(diagnosis_moderate_right_eye, diagnosis_severe_glaucoma):
    """High MDM + new patient → 99205 E/M code."""
    diagnoses = [diagnosis_moderate_right_eye, diagnosis_severe_glaucoma]
    problems = []
    exam_findings = []

    result = calculate_mdm(diagnoses, problems, exam_findings, is_new_patient=True)

    assert result.suggested_em_code == "99205"
    assert result.mdm_level == "high"


def test_calculate_mdm_default_established(diagnosis_mild):
    """Without is_new_patient argument, defaults to established (False)."""
    diagnoses = [diagnosis_mild]
    problems = []
    exam_findings = []

    result = calculate_mdm(diagnoses, problems, exam_findings)  # No is_new_patient arg

    assert result.is_new_patient is False
    assert result.suggested_em_code == "99212"  # Established straightforward


# ===========================================================================
# Test suggest_line_items() — Laterality Logic
# ===========================================================================


def test_suggest_line_items_laterality_right_eye(diagnosis_moderate_right_eye, diagnosis_moderate_left_eye):
    """92014 exam code gets -RT modifier when primary diagnosis ends in .1 (right eye)."""
    diagnoses = [diagnosis_moderate_right_eye, diagnosis_moderate_left_eye]
    mdm_result = MdmCalculationResult(
        mdm_level="moderate",
        suggested_em_code="99214",
        reasoning="test",
        problem_points=2,
        data_points=1,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=False, mdm_result=mdm_result)

    # Find the 92014 exam item
    exam_item = next((i for i in items if i["cpt_code"] == "92014"), None)
    assert exam_item is not None, "92014 item not found"
    assert "-RT" in exam_item["modifiers"], f"Expected -RT in {exam_item['modifiers']}"


def test_suggest_line_items_laterality_left_eye(diagnosis_moderate_left_eye):
    """92014 exam code gets -LT modifier when primary diagnosis ends in .2 (left eye)."""
    diagnoses = [diagnosis_moderate_left_eye, diagnosis_moderate_left_eye]
    mdm_result = MdmCalculationResult(
        mdm_level="moderate",
        suggested_em_code="99214",
        reasoning="test",
        problem_points=2,
        data_points=1,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=False, mdm_result=mdm_result)

    # Find the 92014 exam item
    exam_item = next((i for i in items if i["cpt_code"] == "92014"), None)
    assert exam_item is not None, "92014 item not found"
    assert "-LT" in exam_item["modifiers"], f"Expected -LT in {exam_item['modifiers']}"


def test_suggest_line_items_no_laterality_on_99xxx(diagnosis_mild):
    """E/M codes (99xxx) should NOT get laterality modifiers."""
    diagnoses = [diagnosis_mild]  # H52.13 = ends in 3 (bilateral, no modifier)
    mdm_result = MdmCalculationResult(
        mdm_level="straightforward",
        suggested_em_code="99213",
        reasoning="test",
        problem_points=1,
        data_points=0,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=False, mdm_result=mdm_result)

    # Find the 99213 E/M item
    em_item = next((i for i in items if i["cpt_code"] == "99213"), None)
    assert em_item is not None, "99213 item not found"
    assert len(em_item["modifiers"]) == 0, f"E/M codes should not have laterality modifiers, got {em_item['modifiers']}"


# ===========================================================================
# Test suggest_line_items() — Refraction Guard
# ===========================================================================


def test_suggest_line_items_refraction_patient_responsibility(diagnosis_mild):
    """92015 refraction item should have fee_source = 'patient_responsibility'."""
    diagnoses = [diagnosis_mild]
    mdm_result = MdmCalculationResult(
        mdm_level="straightforward",
        suggested_em_code="99213",
        reasoning="test",
        problem_points=1,
        data_points=0,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=True, mdm_result=mdm_result)

    # Find the 92015 refraction item
    refraction_item = next((i for i in items if i["cpt_code"] == "92015"), None)
    assert refraction_item is not None, "92015 refraction item not found"
    assert refraction_item["fee_source"] == "patient_responsibility", (
        f"Expected fee_source='patient_responsibility', got {refraction_item.get('fee_source')}"
    )


def test_suggest_line_items_refraction_laterality(diagnosis_moderate_right_eye):
    """92015 refraction should also get laterality modifier based on primary diagnosis."""
    diagnoses = [diagnosis_moderate_right_eye]
    mdm_result = MdmCalculationResult(
        mdm_level="straightforward",
        suggested_em_code="99213",
        reasoning="test",
        problem_points=1,
        data_points=0,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=True, mdm_result=mdm_result)

    # Find the 92015 refraction item
    refraction_item = next((i for i in items if i["cpt_code"] == "92015"), None)
    assert refraction_item is not None, "92015 refraction item not found"
    assert "-RT" in refraction_item["modifiers"], (
        f"Expected -RT modifier for right eye refraction, got {refraction_item['modifiers']}"
    )


def test_suggest_line_items_no_refraction(diagnosis_mild):
    """When has_refraction=False, 92015 should not be included."""
    diagnoses = [diagnosis_mild]
    mdm_result = MdmCalculationResult(
        mdm_level="straightforward",
        suggested_em_code="99213",
        reasoning="test",
        problem_points=1,
        data_points=0,
        risk_level="minimal",
        is_new_patient=False,
    )

    items = suggest_line_items(diagnoses, has_refraction=False, mdm_result=mdm_result)

    # Check that 92015 is NOT in the items
    refraction_item = next((i for i in items if i["cpt_code"] == "92015"), None)
    assert refraction_item is None, "92015 should not be included when has_refraction=False"


# ===========================================================================
# Test Integration: Full Superbill Suggestion
# ===========================================================================


def test_suggest_line_items_full_new_patient_moderate(diagnosis_moderate_right_eye, diagnosis_moderate_left_eye):
    """Full integration: new patient, moderate MDM, multiple diagnoses, with refraction."""
    diagnoses = [diagnosis_moderate_right_eye, diagnosis_moderate_left_eye]
    mdm_result = MdmCalculationResult(
        mdm_level="moderate",
        suggested_em_code="99204",
        reasoning="test",
        problem_points=2,
        data_points=1,
        risk_level="minimal",
        is_new_patient=True,
    )

    items = suggest_line_items(diagnoses, has_refraction=True, mdm_result=mdm_result, is_new_patient=True)

    # Should have: 99204 (E/M), 92014 (exam), 92015 (refraction) = 3 items
    assert len(items) == 3, f"Expected 3 line items, got {len(items)}"

    # Check E/M code
    em_item = next((i for i in items if i["cpt_code"] == "99204"), None)
    assert em_item is not None, "99204 E/M code not found"

    # Check exam code has laterality
    exam_item = next((i for i in items if i["cpt_code"] == "92014"), None)
    assert exam_item is not None, "92014 exam code not found"
    assert "-RT" in exam_item["modifiers"]

    # Check refraction has both laterality and patient responsibility flag
    refraction_item = next((i for i in items if i["cpt_code"] == "92015"), None)
    assert refraction_item is not None, "92015 refraction not found"
    assert "-RT" in refraction_item["modifiers"]
    assert refraction_item["fee_source"] == "patient_responsibility"
