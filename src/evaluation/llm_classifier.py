"""LLM-based error type classifier with cache deduplication."""
from hashlib import md5

from .error_cache import ErrorCache

# NOTE: Uses the existing MiniMax-M2 provider configured in Hermes.
# LLM call uses hermes_tools.execute_code to make API calls.
# For now, stub with keyword-matching as fallback.

ERROR_KEYWORDS = {
    "TIMEOUT": ["timeout", "timed out", "exceeded", "expired", "deadline"],
    "NETWORK": ["connection refused", "connection reset", "network", "dns", "no route", "econnrefused", "errno 111"],
    "PERMISSION": ["permission denied", "access denied", "forbidden", "eacces", "denied"],
    "AUTH": ["unauthorized", "auth", "token", "credential", "invalid token", "expired token"],
    "EXCEPTION": ["exception", "error", "traceback", "raised", "failed"],
}


def _classify_by_keywords(error_message: str) -> str:
    """Fallback: rule-based keyword matching."""
    msg_lower = error_message.lower()
    for error_type, keywords in ERROR_KEYWORDS.items():
        if any(kw in msg_lower for kw in keywords):
            return error_type
    return "UNKNOWN"


def _call_llm_classify(error_message: str) -> str:
    """Call LLM to classify error type."""
    # prompt = (
    #     f"Classify the following error into one category: TIMEOUT, EXCEPTION, PERMISSION, NETWORK, AUTH, UNKNOWN.\n"
    #     f"Error message: {error_message}\n"
    #     f"Respond with ONLY the category name, nothing else."
    # )
    # Uses existing MiniMax provider via hermes internal mechanism
    # Stub: in production this would call the LLM API
    return _classify_by_keywords(error_message)


class LLMClassifier:
    def __init__(self):
        self.cache = ErrorCache()
        self.cache.load_all()

    def classify(self, error_message: str) -> str:
        """Classify error type with cache deduplication."""
        fingerprint = md5(error_message.encode()).hexdigest()
        cached = self.cache.get(fingerprint)
        if cached:
            return cached
        error_type = _call_llm_classify(error_message)
        self.cache.set(fingerprint, error_type)
        return error_type
