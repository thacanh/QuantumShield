"""Run from the repository root: python -m backend.verify_release.

Uses installed requirements and real Gradio/Spaces (no mocks). Writes only
metadata to stdout; synthetic payloads/keys are never logged.
"""
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys


def main():
    os.environ['FORCE_CPU'] = '1'
    os.environ['GRADIO_ANALYTICS_ENABLED'] = 'False'
    from packaging.requirements import Requirement
    versions = {}
    for line in Path(__file__).with_name('requirements.txt').read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        requirement = Requirement(line)
        if requirement.marker and not requirement.marker.evaluate():
            continue
        version = importlib.metadata.version(requirement.name)
        if not requirement.specifier.contains(version):
            raise RuntimeError(f'REQUIREMENT_MISMATCH: {requirement.name} {version} does not satisfy {requirement.specifier}')
        versions[requirement.name] = version
    print(json.dumps({'python': platform.python_version(), 'platform': platform.platform(), 'requirements': versions}, indent=2), flush=True)
    modules = ['quantumshield', 'designer', 'ideal', 'security', 'fso', 'hardware', 'eve']
    subprocess.run([sys.executable, '-m', 'unittest', *(f'backend.test_{name}' for name in modules), '-v'], check=True)

    # Import in this process after the isolated suite, so its legacy mocks cannot leak.
    from fastapi.testclient import TestClient
    from .app import app
    from .test_designer import direct
    with TestClient(app) as client:
        for route in ['/v1/health', '/v1/designer/catalog', '/', '/config', '/info', '/openapi.json']:
            response = client.get(route)
            assert response.status_code == 200, (route, response.status_code)
            print(f'PASS real entrypoint GET {route}')
        graph = direct()
        graph['qkdSessions'][0]['config']['sequenceLength'] = 8192
        response = client.post('/v1/designer/experiments', json={
            'graph': graph, 'scope': 'qkd', 'input': {'dataInputs': [{'edgeId': 'd', 'plaintext': 'Release smoke test'}]}})
        assert response.status_code == 200
        result = response.json()
        assert result['sessions'][0]['qkdStatus'] == 'completed'
        assert result['dataResults'][0]['decryptedPayload'] == 'Release smoke test'
        assert result['dataResults'][0]['integrityVerified']
        saved = client.get('/v1/designer/experiments/' + result['id']).json()
        assert 'decryptedPayload' not in saved['dataResults'][0]
        assert 'ciphertext' not in saved['dataResults'][0]
        print('PASS real entrypoint QKD / AES / sanitized GET')
        graph['qkdSessions'][0]['config']['sequenceLength'] = 1
        graph['quantumPaths'][0].update(provider='thorlabs', providerConfig={})
        pending = client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'qkd'}).json()
        assert pending['state'] == 'waiting_for_hardware'
        route = '/v1/designer/experiments/' + pending['id']
        body = {'task_id': pending['currentTask']['taskId'], 'detector': 'D0'}
        first = client.post(route+'/measurement', json=body)
        assert first.status_code == 200
        assert client.post(route+'/measurement', json=body).json() == first.json()
        assert client.post(route+'/measurement', json={**body, 'detector': 'D1'}).status_code == 409
        print('PASS real entrypoint manual task / replay / conflict (synthetic observation)')
    # Also exercise the Space layout where backend files are the repository root.
    root_layout_check = '''
from fastapi.testclient import TestClient
from app import app
with TestClient(app) as client:
    for route in ['/v1/health', '/v1/designer/catalog', '/', '/config', '/info']:
        response = client.get(route)
        assert response.status_code == 200, (route, response.status_code)
print('PASS real Space root-layout imports and routes')
'''
    subprocess.run([sys.executable, '-c', root_layout_check], cwd=Path(__file__).parent, check=True)
    print('RELEASE_SOFTWARE_CHECKS_PASS')


if __name__ == '__main__':
    main()
