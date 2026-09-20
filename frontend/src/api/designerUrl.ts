export function designerApiBase(configuredUrl: string): string {
  return configuredUrl.trim().replace(/\/+$/, '').replace(/\/(?:v1\/|api\/)?simulate$/, '') + '/v1/designer';
}
