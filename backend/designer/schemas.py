from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Identifier = Annotated[str, StringConstraints(min_length=1, max_length=120, pattern=r"\S")]
Name = Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r"\S")]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class EmptyConfig(Contract):
    pass


class Position(Contract):
    x: float = Field(ge=-100000, le=100000)
    y: float = Field(ge=-100000, le=100000)


class SystemNode(Contract):
    id: Identifier
    type: Literal["participant", "key_distributor", "eavesdropper"]
    name: Name
    position: Position
    config: EmptyConfig


class SessionConfig(Contract):
    sequenceLength: int = Field(ge=1, le=65536)
    masterSeed: int = Field(ge=0, le=4294967295)
    qberAbortThreshold: float = Field(ge=0.11, le=0.11)
    securityMarginBits: int = Field(ge=0, le=65536)


class QkdSession(Contract):
    id: Identifier
    protocol: Literal["direct_bb84", "trusted_distributor"]
    participantIds: list[Identifier] = Field(min_length=2, max_length=2)
    # Omission is allowed; explicit JSON null is not a node identifier.
    distributorId: Identifier = Field(default=None)
    pathIds: list[Identifier] = Field(max_length=2)
    config: SessionConfig


class SimulationConfig(Contract):
    model: Literal["ideal", "current_fso"]
    dataset: Literal["clearlowSI.csv", "clearhighSI.csv", "lightrain.csv"] = Field(default="clearlowSI.csv")
    windowStart: int = Field(default=0, ge=0, le=9007199254740991)
    Pt_dBm: float = Field(default=5, ge=-5, le=10)
    xi: float = Field(default=30, ge=0, le=60)
    thresholdMode: Literal["fixed", "adaptive"] = "adaptive"
    fixedRho: float = Field(default=1, ge=0, le=5)


class QuantumPath(Contract):
    id: Identifier
    sessionId: Identifier
    source: Identifier
    target: Identifier
    # Omission is allowed; explicit JSON null is not a node identifier.
    viaEveId: Identifier = Field(default=None)
    # Legacy wire name: an association at target, never an intermediate hop.
    eveOffsetMeters: float = Field(default=100, ge=0, le=200)
    provider: Literal["simulation", "thorlabs"]
    providerConfig: dict


class DataConfig(Contract):
    protection: Literal["none", "aes_256_gcm"]
    keySource: Identifier


class DataEdge(Contract):
    id: Identifier
    type: Literal["data_link"]
    source: Identifier
    target: Identifier
    config: DataConfig


class SystemGraph(Contract):
    schema_: Literal["quantumshield-system"] = Field(alias="schema")
    version: int = Field(ge=1, le=1)
    id: Identifier
    name: Name
    nodes: list[SystemNode] = Field(max_length=100)
    edges: list[DataEdge] = Field(max_length=200)
    quantumPaths: list[QuantumPath] = Field(max_length=200)
    qkdSessions: list[QkdSession] = Field(max_length=100)


class ValidationIssue(Contract):
    code: str
    message: str
    entityId: str | None = None
    path: list[str | int] = Field(default_factory=list)


class ValidationResult(Contract):
    valid: bool
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)


class DataInput(Contract):
    edgeId: Identifier
    plaintext: str = Field(max_length=500000)

    @field_validator('plaintext')
    @classmethod
    def limit_bytes(cls, value):
        if len(value.encode('utf-8')) > 500000:
            raise ValueError('PAYLOAD_TOO_LARGE')
        return value


class ExperimentInput(Contract):
    dataInputs: list[DataInput] = Field(default_factory=list, max_length=200)


class MeasurementInput(Contract):
    task_id: Identifier
    detector: Literal['D0', 'D1']
