from pydantic import ValidationError

from .schemas import EmptyConfig, SimulationConfig, SystemGraph, ValidationIssue, ValidationResult


def schema_issues(exc: ValidationError, prefix=(), entity_id=None):
    # Never return input values or exception context (possibly secret material).
    return [ValidationIssue(code="INVALID_SYSTEM_GRAPH", message="Trường thiếu, ngoài giới hạn hoặc không được hỗ trợ.",
                            entityId=entity_id, path=[*prefix, *e["loc"]])
            for e in exc.errors(include_input=False, include_context=False, include_url=False)]


def validate_graph(raw: object) -> ValidationResult:
    try:
        graph = SystemGraph.model_validate(raw)
    except ValidationError as exc:
        return ValidationResult(valid=False, errors=schema_issues(exc))
    errors = []
    warnings = []

    def error(code, message, entity):
        errors.append(ValidationIssue(code=code, message=message, entityId=entity))

    entities = [*graph.nodes, *graph.qkdSessions, *graph.quantumPaths, *graph.edges]
    seen = set()
    for item in entities:
        if item.id in seen:
            error("DUPLICATE_ID", "ID phải duy nhất trong sơ đồ.", item.id)
        seen.add(item.id)
    if errors:
        return ValidationResult(valid=False, errors=errors)

    nodes = {n.id: n for n in graph.nodes}
    sessions = {s.id: s for s in graph.qkdSessions}
    paths = {p.id: p for p in graph.quantumPaths}

    def role(node_id, kind):
        return node_id in nodes and nodes[node_id].type == kind

    for session in graph.qkdSessions:
        a, b = session.participantIds
        if a == b or not all(role(n, "participant") for n in (a, b)):
            error("INVALID_SESSION_PARTICIPANTS", "Session cần hai participant khác nhau và tồn tại.", session.id)
        linked = [paths.get(p) for p in session.pathIds]
        if len(set(session.pathIds)) != len(linked) or any(p is None or p.sessionId != session.id for p in linked):
            error("INVALID_SESSION_PATHS", "Tham chiếu session/path thiếu, trùng hoặc không khớp.", session.id)
            continue
        if session.protocol == "direct_bb84":
            if session.distributorId is not None or len(linked) != 1 or (linked[0].source, linked[0].target) != (a, b):
                error("INVALID_DIRECT_TOPOLOGY", "Direct BB84 cần một path từ participant đầu tới participant sau.", session.id)
        elif (not role(session.distributorId, "key_distributor") or len(linked) != 2
              or any(p.source != session.distributorId for p in linked)
              or {p.target for p in linked} != {a, b}):
            error("INVALID_TRUSTED_TOPOLOGY", "Trusted session cần hai path từ cùng distributor tới hai participant.", session.id)

    for index, path in enumerate(graph.quantumPaths):
        session = sessions.get(path.sessionId)
        if session is None or path.id not in session.pathIds:
            error("ORPHAN_QUANTUM_PATH", "Path phải được session tương ứng tham chiếu.", path.id)
        if path.source == path.target or path.source not in nodes or path.target not in nodes:
            error("INVALID_PATH_ENDPOINTS", "Hai đầu path phải tồn tại và khác nhau.", path.id)
        if path.viaEveId is not None and not role(path.viaEveId, "eavesdropper"):
            error("INVALID_EVE_REFERENCE", "viaEveId phải trỏ tới node Eve.", path.id)
        if path.viaEveId is not None and path.provider == "thorlabs":
            error("UNSUPPORTED_PHYSICAL_EVE", "MVP không hỗ trợ Eve trên path Thorlabs.", path.id)
        try:
            (SimulationConfig if path.provider == "simulation" else EmptyConfig).model_validate(path.providerConfig)
        except ValidationError as exc:
            errors.extend(schema_issues(exc, ("quantumPaths", index, "providerConfig"), path.id))

    for edge in graph.edges:
        if edge.source == edge.target or not all(role(n, "participant") for n in (edge.source, edge.target)):
            error("INVALID_DATA_ENDPOINTS", "DATA phải nối hai participant khác nhau.", edge.id)
            continue
        if edge.config.protection == "none":
            continue
        candidates = [s.id for s in graph.qkdSessions if set(s.participantIds) == {edge.source, edge.target}]
        if edge.config.keySource == "auto":
            if not candidates:
                error("NO_QKD_PATH", "DATA dùng AES cần một QKD session cho đúng cặp participant.", edge.id)
            elif len(candidates) > 1:
                error("AMBIGUOUS_KEY_SOURCE", "Có nhiều QKD sessions; chọn rõ nguồn khóa cho DATA.", edge.id)
        elif edge.config.keySource not in candidates:
            error("INVALID_KEY_SOURCE", "Nguồn khóa không tồn tại hoặc không thuộc cặp participant của DATA.", edge.id)

    if not graph.qkdSessions:
        warnings.append(ValidationIssue(code="NO_QKD_SESSION", message="Sơ đồ chưa có QKD session."))
    return ValidationResult(valid=not errors, errors=errors, warnings=warnings)
