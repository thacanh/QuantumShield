"""DATA consumes keys from the current run registry, never directly from QKD stages."""
import json

if __package__.startswith('backend.'):
    from backend.model import encrypt_message_aes_gcm, decrypt_message_aes_gcm
else:
    from model import encrypt_message_aes_gcm, decrypt_message_aes_gcm


def transmit_data(graph, sessions, registry, data_inputs):
    inputs = {item.edgeId: item.plaintext for item in data_inputs}
    by_id = {s['sessionId']: s for s in sessions}
    results = []
    for edge in graph.edges:
        requested = edge.id in inputs
        candidates = [s.id for s in graph.qkdSessions if set(s.participantIds) == {edge.source, edge.target}]
        session_id = (candidates[0] if len(candidates) == 1 else None) if edge.config.keySource == 'auto' else edge.config.keySource
        if edge.config.protection == 'none':
            session_id = None
        session = by_id.get(session_id)
        key = registry.resolve(registry.experiment_id, session_id, (edge.source, edge.target)) if session else None
        available = len(key.alice) if key else 0
        item = dict(edgeId=edge.id, sessionId=session_id, protection=edge.config.protection,
                    applicationStatus='not_requested', transmissionStatus='not_requested', diagnostic=None,
                    keyBitsAvailable=available, aesReady=bool(available >= 256), integrityVerified=False)
        if requested:
            if edge.config.protection == 'none':
                item.update(applicationStatus='ready', transmissionStatus='delivered', receivedPayload=inputs[edge.id])
            elif not session or session['qkdStatus'] != 'completed' or (session.get('finalKeyLength', 0) > 0 and not key):
                item.update(applicationStatus='failed', transmissionStatus='blocked', diagnostic='NO_VALID_SHARED_KEY')
            elif available < 256:
                item.update(applicationStatus='insufficient_key', transmissionStatus='blocked', diagnostic='INSUFFICIENT_AES_256_KEY_MATERIAL')
            elif key:
                try:
                    aad = json.dumps(['QuantumShield.DATA.v1', registry.experiment_id, edge.id, session_id, edge.source, edge.target], ensure_ascii=False, separators=(',', ':'))
                    sender = key.alice if edge.source == key.participants[0] else key.bob
                    receiver = key.bob if edge.target == key.participants[1] else key.alice
                    ciphertext, nonce, tag = encrypt_message_aes_gcm(inputs[edge.id], sender, aad)
                    decrypted = decrypt_message_aes_gcm(ciphertext, nonce, tag, receiver, aad)
                    if decrypted != inputs[edge.id]:
                        raise ValueError('INTEGRITY_MISMATCH')
                    item.update(applicationStatus='encrypted', transmissionStatus='delivered', integrityVerified=True,
                                ciphertext=ciphertext, nonce=nonce, authenticationTag=tag, decryptedPayload=decrypted)
                except Exception:
                    item.update(applicationStatus='failed', transmissionStatus='failed', diagnostic='AES_GCM_INTEGRITY_CHECK_FAILED')
            if session:
                priority = {'not_requested': 0, 'ready': 1, 'encrypted': 2, 'insufficient_key': 3, 'failed': 4}
                if priority[item['applicationStatus']] > priority[session['applicationStatus']]:
                    session['applicationStatus'] = item['applicationStatus']
        results.append(item)
    return results
