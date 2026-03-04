from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # The name of the app shown in the browser documentation
    PROJECT_NAME: str = "Clarity Optometry EHR"
    
    # Database Configuration
    DATABASE_URL: str = "postgresql+psycopg://postgres:password@localhost:5432/clarity_db"
    DB_ECHO_SQL: bool = True  # <--- This fixes your AttributeError
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-for-us-saas-2026"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week    

# Create the instance that other files will import
settings = Settings()