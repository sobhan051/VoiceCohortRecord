"""Declarative base shared by all ORM models."""
from sqlalchemy.ext.declarative import declarative_base

# The "Base" that app.models imports.
Base = declarative_base()
