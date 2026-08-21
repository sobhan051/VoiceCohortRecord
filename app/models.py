from sqlalchemy import Column, String, Integer, ForeignKey, Text, DateTime, Float, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    national_code = Column(String(20), nullable=False, unique=True)
    phone_number = Column(String(20))
    role = Column(Integer, default=1)  # 1=regular user, 2=admin, etc.
    created_at = Column(DateTime, server_default=func.now())


class Form(Base):
    __tablename__ = "forms"
    form_id = Column(Integer, primary_key=True, autoincrement=True)
    form_name = Column(String(255), nullable=False)
    category = Column(String(100))


class Section(Base):
    __tablename__ = "sections"
    section_id = Column(Integer, primary_key=True, autoincrement=True)
    form_id = Column(Integer, ForeignKey("forms.form_id"))
    section_key = Column(String(50))
    name_fa = Column(String(255))
    sort_order = Column(Integer, default=0)
    depends_on_vcode = Column(String(20), nullable=True)
    depends_on_value = Column(String, nullable=True)
    skip_if_vcode = Column(String(20), nullable=True)
    skip_if_value = Column(String, nullable=True)


class Question(Base):
    __tablename__ = "questions"
    question_id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey("sections.section_id"))
    v_code = Column(String(20), unique=True)
    variable_name = Column(String(100))
    question_text_fa = Column(Text)
    response_type = Column(String(50))
    coding_options = Column(JSONB)
    unit = Column(String(50))
    manual_prompt = Column(Text)
    sort_order = Column(Integer, default=0)


class Submission(Base):
    __tablename__ = "submissions"
    submission_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"))
    form_id = Column(Integer, ForeignKey("forms.form_id"))
    status = Column(String(20), default='draft')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class Response(Base):
    __tablename__ = "responses"
    response_id = Column(Integer, primary_key=True, autoincrement=True)
    # Made submission_id nullable so we can store responses without a full submission
    submission_id = Column(Integer, ForeignKey("submissions.submission_id"), nullable=True)
    question_id = Column(Integer, ForeignKey("questions.question_id"))
    v_code = Column(String(20))
    is_voice = Column(Boolean, default=True)          # missing before
    transcript = Column(Text)
    extracted_value = Column(Text)
    extracted_value_json = Column(JSONB)              # if you need structured data
    ai_confidence = Column(Float)                     # if you plan to store confidence
    processed_at = Column(DateTime, server_default=func.now())


class ApiLog(Base):
    __tablename__ = "api_logs"
    log_id = Column(Integer, primary_key=True, autoincrement=True)
    submission_id = Column(Integer, ForeignKey("submissions.submission_id"), nullable=True)
    section_key = Column(String(50))
    model_name = Column(String(100))
    prompt_sent = Column(Text)
    response_received = Column(Text)
    tokens_used = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
