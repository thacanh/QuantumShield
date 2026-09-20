"""Design and scoped execution capabilities."""
from .protocol import STAGES

CATALOG = {
    "schemaVersion": 1,
    "executionAvailable": True,
    "executionScopes": ["ideal_acquisition", "ideal_qkd", "software_acquisition", "software_qkd", "acquisition", "qkd"],
    "nodeTypes": ["participant", "key_distributor", "eavesdropper"],
    "edgeTypes": ["quantum_path", "data_link"],
    "protocols": ["direct_bb84", "trusted_distributor"],
    "providers": [
        {"id": "simulation", "models": ["ideal", "current_fso"], "supportsEve": True},
        {"id": "thorlabs", "models": [], "supportsEve": False},
    ],
    "stages": [{"id": id, "label": label} for id, label in STAGES],
    "limits": {"nodes": 100, "sessions": 100, "paths": 200, "dataLinks": 200, "hardwareStatesPerPath": 64, "hardwareTasksPerRun": 1024, "hardwareRuns": 8, "requestBytes": 2000000},
}
