"""Simulated SIP-call attributes for the user-side driver.

LiveKit's SIP gateway sets a fixed vocabulary of ``sip.*`` attributes on an
inbound SIP participant: trunk + caller phone numbers, a call id, the
dispatch rule that matched, the call status. Production voice agents
typically branch on these — pick a flow by ``sip.trunkPhoneNumber``, log
by ``sip.callID``, gate on ``sip.callStatus``.

A test driver that mints its JWT with ``with_kind("sip")`` and the same
``sip.*`` attributes lands in the room as an indistinguishable SIP
participant, so the agent's existing SIP code path runs unchanged against
a scripted replay or a live mic session — no SIP-bypass branch on the
agent side.

This dataclass carries each attribute as an optional field;
:meth:`to_attributes` projects it to the wire dict
:func:`xray.runtime.livekit.mint_user_token` merges alongside the ``xray``
token attribute. Arbitrary additional keys — anything the agent reads that
isn't in the standard ``sip.*`` set, including custom keys promoted via a
trunk's ``headers_to_attributes`` map — live in ``extra_attrs``.

Reference: https://docs.livekit.io/sip/sip-participant — canonical
``sip.*`` attribute list. Casing matters (``sip.callID``, not
``sip.callId``); ``to_attributes`` emits the docs spelling verbatim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, TypeAlias

# Closed picklist per the LiveKit SIP docs. Narrower than `str` so a typo at
# the call site fails pyright instead of becoming an inert attribute the
# agent never matches against.
SipCallStatus: TypeAlias = Literal["active", "automation", "dialing", "hangup", "ringing"]


@dataclass(frozen=True)
class SimulatedSipCall:
    """Attributes the driver projects onto its JWT to appear as an inbound
    SIP participant.

    Every field is optional — populate only the attributes the agent under
    test reads. An empty SimulatedSipCall is rejected at construction; pass
    ``simulated_sip=None`` for a non-SIP run instead of an empty object.
    """

    caller_phone: str | None = None
    trunk_phone: str | None = None
    call_id: str | None = None
    call_id_full: str | None = None
    call_status: SipCallStatus | None = None
    rule_id: str | None = None
    trunk_id: str | None = None
    # Free-form passthrough for arbitrary additional keys the agent reads —
    # anything outside the standard ``sip.*`` set above. A named field wins
    # on collision so a dev can't accidentally shadow a typed attribute by
    # spelling it twice.
    extra_attrs: dict[str, str] = field(default_factory=dict[str, str])

    def __post_init__(self) -> None:
        if not self._has_any():
            raise ValueError(
                "SimulatedSipCall requires at least one attribute. "
                "Pass simulated_sip=None for a non-SIP run."
            )

    def _has_any(self) -> bool:
        return (
            any(
                v is not None
                for v in (
                    self.caller_phone,
                    self.trunk_phone,
                    self.call_id,
                    self.call_id_full,
                    self.call_status,
                    self.rule_id,
                    self.trunk_id,
                )
            )
            or len(self.extra_attrs) > 0
        )

    def to_attributes(self) -> dict[str, str]:
        """Project to the ``sip.*`` dict the JWT carries. Keys match the
        LiveKit SIP-participant docs exactly (casing included)."""
        attrs: dict[str, str] = {}
        if self.caller_phone is not None:
            attrs["sip.phoneNumber"] = self.caller_phone
        if self.trunk_phone is not None:
            attrs["sip.trunkPhoneNumber"] = self.trunk_phone
        if self.call_id is not None:
            attrs["sip.callID"] = self.call_id
        if self.call_id_full is not None:
            attrs["sip.callIDFull"] = self.call_id_full
        if self.call_status is not None:
            attrs["sip.callStatus"] = self.call_status
        if self.rule_id is not None:
            attrs["sip.ruleID"] = self.rule_id
        if self.trunk_id is not None:
            attrs["sip.trunkID"] = self.trunk_id
        for k, v in self.extra_attrs.items():
            attrs.setdefault(k, v)
        return attrs


__all__ = ["SimulatedSipCall", "SipCallStatus"]
