// Padrões sensíveis a mascarar
const SENSITIVE_PATTERNS = [
  /password\s*=\s*[^\s]+/gi,
  /passwd\s*=\s*[^\s]+/gi,
  /token\s*=\s*[^\s]+/gi,
  /secret\s*=\s*[^\s]+/gi,
  /authorization\s*:\s*bearer\s+[^\s]+/gi,
  /authorization\s*:\s*[^\s]+/gi,
  /session\s*=\s*[^\s]+/gi,
  /cookie\s*:\s*[^\s]+/gi,
  /snmp.?community\s*[:\s=]+[^\s]+/gi,
  /community.?string\s*[:\s=]+[^\s]+/gi,
];

// BGP community técnica (não é secret)
const BGP_COMMUNITY_PATTERN = /\b\d{1,5}:\d{1,5}\b/;

export function sanitizeEvidenceForExport(evidence: string): string {
  if (!evidence) return "";

  let sanitized = evidence;

  // Remover padrões sensíveis
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "***");
  }

  return sanitized;
}

export function isBgpCommunity(value: string): boolean {
  return BGP_COMMUNITY_PATTERN.test(value);
}

export function sanitizeValue(value: string): string {
  if (!value) return value;

  // BGP communities técnicas não são removidas
  if (isBgpCommunity(value)) {
    return value;
  }

  // Aplicar sanitização padrão
  return sanitizeEvidenceForExport(value);
}

export const SANITIZATION_RULES_APPLIED = [
  "password",
  "passwd",
  "token",
  "secret",
  "authorization",
  "session",
  "cookie",
  "snmp_community",
];
