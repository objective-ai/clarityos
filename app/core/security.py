from uuid import UUID

# Mock user for development so the Refraction Grid can "save" as a specific doctor
def get_current_user():
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "role": "doctor",
        "tenant_id": "clinic_sunview1"
    }