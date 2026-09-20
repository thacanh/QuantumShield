import json
from pydantic import ValidationError

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .hardware import HardwareError, hardware_store
from .catalog import CATALOG
from .schemas import MeasurementInput, ExperimentInput, SystemGraph, ValidationIssue, ValidationResult
from .validator import validate_graph, schema_issues
from .protocol import compile_protocol
from .experiments import acquisition_issues, run_experiment, store

router = APIRouter(prefix="/v1/designer", tags=["designer"])


@router.get("/catalog")
def catalog():
    return CATALOG


async def read_payload(request: Request, fields, optional=frozenset()):
    # Bound the actual streamed body, even without a trustworthy Content-Length.
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > CATALOG["limits"]["requestBytes"]:
            return JSONResponse(status_code=413, content={"detail": "DESIGN_REQUEST_TOO_LARGE"})
        body.extend(chunk)
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return JSONResponse(status_code=400, content={"detail": "INVALID_JSON"})
    if not isinstance(payload, dict) or not fields <= set(payload) or set(payload) - fields - optional:
        return JSONResponse(status_code=200 if fields == {'graph'} else 422, content=ValidationResult(valid=False, errors=[ValidationIssue(
            code="INVALID_REQUEST", message="Request có fields thiếu hoặc không được hỗ trợ.")]).model_dump())
    return payload


@router.post("/validate", response_model=ValidationResult)
async def validate(request: Request):
    payload = await read_payload(request, {'graph'})
    if isinstance(payload, JSONResponse):
        return payload
    return validate_graph(payload["graph"])


@router.post('/protocols')
async def protocols(request: Request):
    payload = await read_payload(request, {'graph'})
    if isinstance(payload, JSONResponse):
        return payload
    report = validate_graph(payload['graph'])
    if not report.valid:
        return JSONResponse(status_code=422, content=report.model_dump())
    graph = SystemGraph.model_validate(payload['graph'])
    return {'protocols': [compile_protocol(graph, s) for s in graph.qkdSessions]}


@router.post('/experiments')
async def experiments(request: Request):
    payload = await read_payload(request, {'graph', 'scope'}, {'input'})
    if isinstance(payload, JSONResponse):
        return payload
    if payload['scope'] not in ('ideal_acquisition', 'ideal_qkd', 'software_acquisition', 'software_qkd', 'acquisition', 'qkd'):
        return JSONResponse(status_code=422, content={'errors': [{'code': 'UNSUPPORTED_EXECUTION_SCOPE'}]})
    report = validate_graph(payload['graph'])
    if not report.valid:
        return JSONResponse(status_code=422, content=report.model_dump())
    graph = SystemGraph.model_validate(payload['graph'])
    if payload['scope'] in ('ideal_acquisition', 'software_acquisition', 'acquisition') and 'input' in payload:
        return JSONResponse(status_code=422, content={'errors': [{'code': 'INPUT_REQUIRES_FULL_QKD_SCOPE'}]})
    try:
        experiment_input = ExperimentInput.model_validate(payload.get('input', {}))
    except ValidationError as exc:
        return JSONResponse(status_code=422, content={'errors': [i.model_dump() for i in schema_issues(exc, ('input',))]})
    input_ids = [i.edgeId for i in experiment_input.dataInputs]
    if len(set(input_ids)) != len(input_ids) or any(id not in {e.id for e in graph.edges} for id in input_ids):
        return JSONResponse(status_code=422, content={'errors': [{'code': 'INVALID_DATA_INPUT_REFERENCE'}]})
    issues = acquisition_issues(graph, payload['scope'])
    if issues:
        return JSONResponse(status_code=422, content={'errors': issues})
    from .fso import FsoProviderUnavailable
    try:
        return await run_in_threadpool(run_experiment, graph, payload['scope'], experiment_input)
    except HardwareError as exc:
        return JSONResponse(status_code=exc.status, content={'detail': exc.code})
    except FsoProviderUnavailable:
        return JSONResponse(status_code=503, content={'errors': [{'code': 'FSO_PROVIDER_UNAVAILABLE'}]})


@router.get('/experiments/{experiment_id}')
def get_experiment(experiment_id: str):
    try:
        return hardware_store.get(experiment_id)
    except HardwareError:
        result = store.get(experiment_id)
        return result if result else JSONResponse(status_code=404, content={'detail': 'EXPERIMENT_NOT_FOUND_OR_EXPIRED'})


@router.post('/experiments/{experiment_id}/measurement')
async def submit_measurement(experiment_id: str, request: Request):
    payload = await read_payload(request, {'task_id', 'detector'})
    if isinstance(payload, JSONResponse):
        return payload
    try:
        measurement = MeasurementInput.model_validate(payload)
    except ValidationError as exc:
        return JSONResponse(status_code=422, content={'errors': [i.model_dump() for i in schema_issues(exc, ())]})
    try:
        return await run_in_threadpool(hardware_store.submit, experiment_id, measurement.task_id, measurement.detector)
    except HardwareError as exc:
        return JSONResponse(status_code=exc.status, content={'detail': exc.code})


@router.post('/experiments/{experiment_id}/cancel')
def cancel_experiment(experiment_id: str):
    try:
        return hardware_store.cancel(experiment_id)
    except HardwareError as exc:
        return JSONResponse(status_code=exc.status, content={'detail': exc.code})
