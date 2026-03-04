from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.db.session import get_db
from app.db.models.tenant.clinical import Refraction, RefractionType
# This imports from your 'schemas' folder
from app.schemas.refraction import RefractionUpdateRequest, RefractionResponse

router = APIRouter()

COLUMN_MAP = {0: RefractionType.HABITUAL, 1: RefractionType.AUTO, 2: RefractionType.MANIFEST, 3: RefractionType.FINAL}

@router.patch("/{encounter_id}/column/{col_index}", response_model=RefractionResponse)
def sync_refraction(encounter_id: UUID, col_index: int, payload: RefractionUpdateRequest, db: Session = Depends(get_db)):
    rx_type = COLUMN_MAP.get(col_index)
    rx = db.query(Refraction).filter(Refraction.encounter_id == encounter_id, Refraction.refraction_type == rx_type).first()
    
    if not rx:
        rx = Refraction(encounter_id=encounter_id, refraction_type=rx_type)
        db.add(rx)

    # Use the 'Engine' to map the 'Rulebook' data to the DB
    if payload.od:
        rx.od_sphere, rx.od_cylinder, rx.od_axis = payload.od.sphere, payload.od.cylinder, payload.od.axis
    if payload.os:
        rx.os_sphere, rx.os_cylinder, rx.os_axis = payload.os.sphere, payload.os.cylinder, payload.os.axis

    db.commit()
    return RefractionResponse.from_orm_model(rx)