"""
schemas/refraction.py

Pydantic request and response schemas for the Refraction data model.

This is the most strictly validated schema in the entire system.  Prescription
values feed downstream into:
  - Physical optical lab orders (wrong values = wrong glasses manufactured)
  - Long-term clinical trend analysis (wrong values = incorrect medical history)
  - Insurance billing (wrong values = claim denials)

For this reason, every numeric field has both Python-level Pydantic validators
AND database-level CheckConstraints (defined in the ORM model).  Validation
is intentionally redundant — the API layer rejects bad data before it ever
reaches the database.

Optometric notation quick reference:
  Sphere   : Lens power in diopters.  Negative (-) = myopia (nearsighted).
             Positive (+) = hyperopia (farsighted).
             Clinical range: -25.00 to +25.00 D, in 0.25 D steps.

  Cylinder : Astigmatism correction power.  Almost always negative in
             minus-cylinder convention (the US standard).
             Clinical range: -8.00 to +8.00 D, in 0.25 D steps.
             0.00 means no astigmatism.

  Axis     : The orientation angle of the cylinder correction.
             Integer from 1 to 180 degrees (180 == 0, they wrap).
             Only meaningful when cylinder != 0.  We validate axis is
             present if cylinder is provided.

  Add      : Near-vision addition for bifocals / progressives.
             Always positive.  Range: +0.75 to +3.50 D, in 0.25 D steps.
             Only relevant for patients with presbyopia (typically 40+).

  Prism    : Corrects eye alignment (strabismus / binocular vision issues).
             Measured in prism diopters (Δ).

  Prism Base: Direction of the prism base (In, Out, Up, Down, or combined).

  PD       : Pupillary Distance — the distance between the pupils in mm.
             Required to grind and center the lenses correctly.
             Binocular PD range: 50–80 mm.  Monocular: 25–45 mm each.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, field_validator, model_validator

from app.db.models.tenant.clinical import RefractionType
from app.schemas.common import AppBaseModel, AuditInfo

# ---------------------------------------------------------------------------
# Custom annotated types — single source of truth for numeric constraints
# ---------------------------------------------------------------------------

# Sphere: ±25.00 D in 0.25 D steps.  Stored as Decimal to avoid float drift.
SphereValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("-25.00"),
        le=Decimal("25.00"),
        multiple_of=Decimal("0.25"),
        description="Lens power in diopters (±25.00 D, 0.25 D steps)",
    ),
]

# Cylinder: ±8.00 D in 0.25 D steps.
CylinderValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("-8.00"),
        le=Decimal("8.00"),
        multiple_of=Decimal("0.25"),
        description="Astigmatism correction in diopters (±8.00 D, 0.25 D steps)",
    ),
]

# Axis: 1–180 degrees, integer only.  No 0 — 180 and 0 are the same meridian.
AxisValue = Annotated[
    int,
    Field(
        ge=1,
        le=180,
        description="Cylinder axis in degrees (1–180)",
    ),
]

# Add: +0.75 to +3.50 D in 0.25 D steps.  Always positive.
AddValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("0.75"),
        le=Decimal("3.50"),
        multiple_of=Decimal("0.25"),
        description="Near addition in diopters (+0.75 to +3.50 D)",
    ),
]

# Prism: 0.50 to 20.00 Δ in 0.50 Δ steps.
PrismValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("0.00"),
        le=Decimal("20.00"),
        description="Prism in prism diopters (Δ)",
    ),
]

# PD: 50–80 mm binocular, 25–45 mm monocular.
PDBinocularValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("50.0"),
        le=Decimal("80.0"),
        description="Binocular pupillary distance in mm (50–80)",
    ),
]

PdMonocularValue = Annotated[
    Decimal,
    Field(
        ge=Decimal("25.0"),
        le=Decimal("45.0"),
        description="Monocular pupillary distance in mm (25–45)",
    ),
]

# Visual acuity string — Snellen or descriptive notation
VisualAcuityValue = Annotated[
    str,
    Field(
        max_length=20,
        description="Visual acuity in Snellen notation (e.g. '20/20', 'CF', 'HM', 'NLP')",
    ),
]


# ---------------------------------------------------------------------------
# Sub-schemas: one per eye (reduces repetition, improves error messages)
# ---------------------------------------------------------------------------


class EyeRxRequest(AppBaseModel):
    """
    Prescription values for a single eye.

    Used as a nested model in RefractionCreateRequest so that validation
    errors clearly identify which eye (OD or OS) has the invalid value,
    e.g.:  "od.axis — field required when cylinder is provided"

    Cylinder / Axis co-dependency:
      A cylinder value without an axis is clinically meaningless — the lab
      cannot fabricate the lens without knowing the orientation.
      Conversely, an axis of, say, 090 with cylinder = 0 is also invalid.
      The model_validator enforces this cross-field constraint.

    Sphere-only prescriptions (pure myopia / hyperopia with no astigmatism)
    are valid with cylinder = None and axis = None.
    """

    sphere: SphereValue | None = Field(
        default=None,
        description="Sphere power in diopters. Negative = myopia, positive = hyperopia.",
    )
    cylinder: CylinderValue | None = Field(
        default=None,
        description="Cylinder power for astigmatism correction. Usually negative (minus-cyl).",
    )
    axis: AxisValue | None = Field(
        default=None,
        description="Axis of cylinder correction, 1–180 degrees. Required if cylinder is set.",
    )
    add: AddValue | None = Field(
        default=None,
        description="Near addition power. Only applicable for presbyopic patients.",
    )
    prism: PrismValue | None = Field(
        default=None,
        description="Prismatic correction in prism diopters. Omit if not applicable.",
    )
    prism_base: str | None = Field(
        default=None,
        max_length=10,
        description="Base direction of prism: 'IN', 'OUT', 'UP', 'DOWN', or combined e.g. '2ΔIN, 1ΔUP'.",
    )
    visual_acuity: VisualAcuityValue | None = Field(
        default=None,
        description="Achieved visual acuity with this prescription.",
    )

    @model_validator(mode="after")
    def validate_cylinder_axis_pair(self) -> "EyeRxRequest":
        """
        Enforce the clinical rule: cylinder and axis must come as a pair.

        Cases:
          cylinder set, axis missing  → ERROR: cannot fabricate lens without axis
          axis set, cylinder missing  → ERROR: axis is meaningless without cylinder
          both set                    → OK
          neither set                 → OK (sphere-only prescription)
        """
        cyl = self.cylinder
        ax = self.axis

        if cyl is not None and cyl != Decimal("0.00") and ax is None:
            raise ValueError(
                "axis is required when cylinder is provided. "
                "A cylinder correction cannot be fabricated without an axis orientation."
            )

        if ax is not None and (cyl is None or cyl == Decimal("0.00")):
            raise ValueError(
                "cylinder must be provided (and non-zero) when axis is set. "
                "An axis value is meaningless without a corresponding cylinder."
            )

        return self

    @field_validator("prism_base")
    @classmethod
    def validate_prism_base(cls, v: str | None) -> str | None:
        """Normalize prism base direction to uppercase."""
        if v is None:
            return v
        return v.upper().strip()

    @model_validator(mode="after")
    def validate_prism_base_pair(self) -> "EyeRxRequest":
        """Prism value and base direction must also come as a pair."""
        if self.prism is not None and self.prism_base is None:
            raise ValueError(
                "prism_base (direction) is required when prism value is provided."
            )
        if self.prism_base is not None and self.prism is None:
            raise ValueError(
                "prism value is required when prism_base direction is set."
            )
        return self


class EyeRxResponse(AppBaseModel):
    """
    Read representation of a single eye's prescription values.

    Mirrors EyeRxRequest but all fields are nullable — historical records
    from before certain fields were introduced may have NULLs.
    """

    sphere: Decimal | None = None
    cylinder: Decimal | None = None
    axis: int | None = None
    add: Decimal | None = None
    prism: Decimal | None = None
    prism_base: str | None = None
    visual_acuity: str | None = None


# ---------------------------------------------------------------------------
# Refraction: Create Request
# ---------------------------------------------------------------------------


class RefractionCreateRequest(AppBaseModel):
    """
    Request body for POST /encounters/{id}/refractions

    Submits one complete prescription measurement for an encounter.
    Multiple measurements of different types (habitual, auto, manifest, final)
    can exist per encounter.

    The `od` and `os` nested objects carry the per-eye prescription values.
    At least one eye must have a sphere value — submitting a refraction with
    no actual prescription data is rejected.

    PD fields are binocular OR monocular (split left/right).  You cannot
    submit both binocular and monocular PD simultaneously — this would be
    ambiguous for the lab.

    is_final_rx: When True, this refraction is the one actually dispensed to
    the patient.  Only one FINAL refraction should exist per encounter —
    this is enforced at the service layer, not the schema layer, because it
    requires a database query.
    """

    refraction_type: RefractionType = Field(
        ...,
        description=(
            "Classification of this measurement: "
            "habitual (old glasses), auto (machine), manifest (exam), "
            "cycloplegic (post-dilation), or final (dispensed prescription)."
        ),
    )

    od: EyeRxRequest = Field(
        default_factory=EyeRxRequest,
        description="Right eye (Oculus Dexter) prescription values.",
    )
    os: EyeRxRequest = Field(
        default_factory=EyeRxRequest,
        description="Left eye (Oculus Sinister) prescription values.",
    )

    # Binocular PD (total distance between pupils)
    pd_distance: PDBinocularValue | None = Field(
        default=None,
        description="Binocular pupillary distance for distance vision (mm, 50–80).",
    )
    pd_near: PDBinocularValue | None = Field(
        default=None,
        description="Binocular pupillary distance for near vision (mm, 50–80).",
    )

    # Monocular PD (split per eye — more precise, preferred for progressive lenses)
    pd_od: PdMonocularValue | None = Field(
        default=None,
        description="Monocular PD right eye (mm, 25–45).",
    )
    pd_os: PdMonocularValue | None = Field(
        default=None,
        description="Monocular PD left eye (mm, 25–45).",
    )

    is_final_rx: bool = Field(
        default=False,
        description=(
            "True if this is the prescription that will be given to the patient. "
            "Setting this to True will demote any previous final Rx for this encounter."
        ),
    )

    notes: str | None = Field(
        default=None,
        max_length=1000,
        description="Clinical notes about this specific refraction measurement.",
    )

    @model_validator(mode="after")
    def validate_at_least_one_eye_has_sphere(self) -> "RefractionCreateRequest":
        """
        Reject a refraction where neither eye has any sphere value.
        This would be a data entry error — a prescription with no power values
        for either eye is clinically meaningless.
        """
        od_has_data = self.od.sphere is not None
        os_has_data = self.os.sphere is not None

        if not od_has_data and not os_has_data:
            raise ValueError(
                "At least one eye (OD or OS) must have a sphere value. "
                "A refraction with no lens power for either eye is not valid."
            )
        return self

    @model_validator(mode="after")
    def validate_pd_not_mixed(self) -> "RefractionCreateRequest":
        """
        Prevent submitting both binocular and monocular PD simultaneously.

        Binocular PD (pd_distance / pd_near) and monocular PD (pd_od / pd_os)
        measure the same thing two different ways.  Mixing them is ambiguous
        and would confuse the lab fabrication order.
        """
        has_binocular = self.pd_distance is not None or self.pd_near is not None
        has_monocular = self.pd_od is not None or self.pd_os is not None

        if has_binocular and has_monocular:
            raise ValueError(
                "Provide either binocular PD (pd_distance / pd_near) OR "
                "monocular PD (pd_od / pd_os), not both. "
                "Mixing PD measurement methods is ambiguous for lens fabrication."
            )
        return self

    @model_validator(mode="after")
    def validate_final_rx_has_pd(self) -> "RefractionCreateRequest":
        """
        Warn (as an error) if marking a prescription as final without any PD.
        A final prescription cannot be manufactured into glasses without PD.

        We allow FINAL refractions without PD only for contact lens prescriptions
        (which don't need PD), noted via the notes field.  The route handler
        enforces this more leniently; this validator catches the most common
        oversight.
        """
        if not self.is_final_rx:
            return self  # Only validate FINAL prescriptions

        has_any_pd = any([
            self.pd_distance,
            self.pd_near,
            self.pd_od,
            self.pd_os,
        ])

        if not has_any_pd:
            raise ValueError(
                "A final prescription (is_final_rx=True) requires pupillary "
                "distance (PD) values to fabricate ophthalmic lenses. "
                "If this is a contact lens prescription (no PD required), "
                "set is_final_rx=False and note 'Contact Lens Rx' in the notes field."
            )
        return self


# ---------------------------------------------------------------------------
# Refraction: Update Request (PATCH — partial fields only)
# ---------------------------------------------------------------------------


class RefractionUpdateRequest(AppBaseModel):
    """
    Request body for PATCH /encounters/{id}/refractions/{refraction_id}

    Allows partial updates to a refraction record.  Only the fields provided
    will be updated; omitted fields retain their current values.

    Note: refraction_type cannot be changed after creation — if the type
    is wrong, delete and re-create the record.

    Encounters that are finalized (is_finalized=True) reject all updates.
    This is enforced at the route level, not the schema level.
    """

    od: EyeRxRequest | None = None
    os: EyeRxRequest | None = None
    pd_distance: PDBinocularValue | None = None
    pd_near: PDBinocularValue | None = None
    pd_od: PdMonocularValue | None = None
    pd_os: PdMonocularValue | None = None
    is_final_rx: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------------------
# Refraction: Response
# ---------------------------------------------------------------------------


class RefractionResponse(AppBaseModel):
    """
    Full read representation of a Refraction record.

    Returned by:
      - POST /encounters/{id}/refractions   (201 Created)
      - GET  /encounters/{id}/refractions   (list, inside encounter detail)
      - GET  /encounters/{id}/refractions/{refraction_id}
    """

    id: uuid.UUID
    encounter_id: uuid.UUID
    refraction_type: RefractionType

    # Nested per-eye objects for clean response structure
    od: EyeRxResponse
    os: EyeRxResponse

    pd_distance: Decimal | None = None
    pd_near: Decimal | None = None
    pd_od: Decimal | None = None
    pd_os: Decimal | None = None

    is_final_rx: bool
    notes: str | None = None

    recorded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_model(cls, obj: object) -> "RefractionResponse":
        """
        Construct response from SQLAlchemy Refraction ORM object.

        The ORM model stores per-eye fields as flat columns (od_sphere,
        od_cylinder, etc.).  This factory method assembles them into the
        nested EyeRxResponse sub-objects that the API returns.

        This explicit factory is preferred over Pydantic's field aliases here
        because the transformation logic is non-trivial and benefits from
        being explicit and readable.
        """
        return cls(
            id=obj.id,
            encounter_id=obj.encounter_id,
            refraction_type=obj.refraction_type,
            od=EyeRxResponse(
                sphere=obj.od_sphere,
                cylinder=obj.od_cylinder,
                axis=obj.od_axis,
                add=obj.od_add,
                prism=obj.od_prism,
                prism_base=obj.od_prism_base,
                visual_acuity=obj.od_visual_acuity,
            ),
            os=EyeRxResponse(
                sphere=obj.os_sphere,
                cylinder=obj.os_cylinder,
                axis=obj.os_axis,
                add=obj.os_add,
                prism=obj.os_prism,
                prism_base=obj.os_prism_base,
                visual_acuity=obj.os_visual_acuity,
            ),
            pd_distance=obj.pd_distance,
            pd_near=obj.pd_near,
            pd_od=obj.pd_od,
            pd_os=obj.pd_os,
            is_final_rx=obj.is_final_rx,
            notes=obj.notes,
            recorded_by_id=obj.recorded_by_id,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class RefractionSummary(AppBaseModel):
    """
    Abbreviated refraction for embedding inside EncounterResponse.

    Shows only the most clinically important fields — the full detail
    is available at /encounters/{id}/refractions/{refraction_id}.
    """

    id: uuid.UUID
    refraction_type: RefractionType
    is_final_rx: bool

    # OD summary
    od_sphere: Decimal | None = None
    od_cylinder: Decimal | None = None
    od_axis: int | None = None

    # OS summary
    os_sphere: Decimal | None = None
    os_cylinder: Decimal | None = None
    os_axis: int | None = None

    created_at: datetime
