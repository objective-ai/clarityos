from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from app.db.session import get_db
from app.db.models.tenant.clinical import VitalsAndPretest
from app.schemas.vitals import VitalsCreate, VitalsResponse

router = APIRouter()

@router.put("/{encounter_id}/vitals", response_model=VitalsResponse)
def update_vitals(encounter_id: UUID, payload: VitalsCreate, db: Session = Depends(get_db)):
    vitals = db.query(VitalsAndPretest).filter(VitalsAndPretest.encounter_id == encounter_id).first()
    
    if not vitals:
        vitals = VitalsAndPretest(encounter_id=encounter_id)
        db.add(vitals)

    # Update fields from the Pydantic 'Rulebook'
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(vitals, field, value)

    db.commit()
    db.refresh(vitals)
    return vitals