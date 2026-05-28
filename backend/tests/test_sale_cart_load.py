"""POS-01, POS-14 — cart prefill from Superbill (copay derivation) + OpticalOrder (line snapshot)."""

import pytest

try:
    from backend.services.sale_lifecycle import load_cart_from_sources
except ImportError:
    pytest.skip(
        "load_cart_from_sources not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_load_cart_from_sources_is_callable():
    assert callable(load_cart_from_sources)
