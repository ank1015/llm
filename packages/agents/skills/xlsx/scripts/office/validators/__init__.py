"""Validation entrypoints for Office document scripts."""

from .docx import DOCXSchemaValidator
from .pptx import PPTXSchemaValidator
from .redlining import RedliningValidator

__all__ = ["DOCXSchemaValidator", "PPTXSchemaValidator", "RedliningValidator"]
