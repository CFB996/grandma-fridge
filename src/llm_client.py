"""
The one file that knows which LLM answers. Everything else calls generate(messages)
and never needs to know if Gemini or Ollama produced the answer.
"""

import os
from openai import OpenAI

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_MODEL = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite")
DEFAULT_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", 2000))


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def build_gemini_client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    return OpenAI(api_key=key, base_url=GEMINI_BASE_URL, max_retries=5)


def build_ollama_client():
    return OpenAI(api_key="ollama", base_url=os.getenv("OLLAMA_URL", "http://ollama:11434") + "/v1")


def generate(messages, max_tokens=None, **kwargs):
    """
    Try Gemini; on any error fall back to Ollama. Returns (response, provider_name)
    so the caller can log which one actually answered.
    """
    max_tokens = max_tokens or DEFAULT_MAX_TOKENS

    client = build_gemini_client()
    if client is not None:
        try:
            resp = client.chat.completions.create(
                model=DEFAULT_MODEL, messages=messages, max_tokens=max_tokens, **kwargs
            )
            return resp, "gemini"
        except Exception:
            pass  # fall through to Ollama

    ollama = build_ollama_client()
    resp = ollama.chat.completions.create(
        model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
        messages=messages,
        max_tokens=max_tokens,
        **kwargs,
    )
    return resp, "ollama"


def describe() -> dict:
    return {
        "provider": "gemini (OpenAI-compatible endpoint), ollama fallback",
        "model": DEFAULT_MODEL,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "api_key_configured": is_configured(),
    }