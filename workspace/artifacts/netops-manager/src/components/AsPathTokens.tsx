// Segmenta AS-PATH por espaços, mostra cada token em badge
// Mesmo ASN = mesma cor | ASN diferente = cor diferente
// AS local em azul

function stripOriginSuffix(tok: string): string {
  return String(tok).replace(/[a-z?]$/i, '');
}

function isLocalAsToken(tok: string, localAsn?: string | number): boolean {
  if (localAsn == null || localAsn === '') return false;
  const base = stripOriginSuffix(tok);
  return base === String(localAsn);
}

// Cores variadas para AS-PATHs distintos
const AS_PATH_COLORS = [
  'bg-purple-500/10 border-purple-500/25 text-purple-300',   // roxo
  'bg-amber-500/10 border-amber-500/25 text-amber-300',      // âmbar
  'bg-pink-500/10 border-pink-500/25 text-pink-300',         // rosa
  'bg-cyan-500/10 border-cyan-500/25 text-cyan-300',         // ciano
  'bg-violet-500/10 border-violet-500/25 text-violet-300',   // violeta
  'bg-orange-500/10 border-orange-500/25 text-orange-300',   // laranja
  'bg-teal-500/10 border-teal-500/25 text-teal-300',         // teal
  'bg-indigo-500/10 border-indigo-500/25 text-indigo-300',   // índigo
];

interface AsPathTokensProps {
  asPath?: string | null;
  localAsn?: string | number;
  compact?: boolean;
}

export function AsPathTokens({ asPath, localAsn, compact = false }: AsPathTokensProps) {
  const s = asPath == null ? '' : String(asPath).trim();
  if (!s) return <span className="text-slate-400">—</span>;

  const tokens = s.split(/\s+/).filter(Boolean);
  const pad = compact ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]';
  const blue = `inline-flex items-center rounded border font-semibold font-mono ${pad} bg-blue-500/15 border-blue-500/30 text-blue-300`;

  // Mapear cada ASN único a uma cor consistente
  const asnColorMap = new Map<string, string>();
  let colorIndex = 0;

  tokens.forEach((tok) => {
    const base = stripOriginSuffix(tok);
    if (!asnColorMap.has(base) && !isLocalAsToken(tok, localAsn)) {
      asnColorMap.set(base, AS_PATH_COLORS[colorIndex % AS_PATH_COLORS.length]);
      colorIndex++;
    }
  });

  return (
    <ul className="flex flex-wrap items-center gap-1.5 list-none m-0 p-0">
      {tokens.map((tok, i) => {
        if (isLocalAsToken(tok, localAsn)) {
          return (
            <li key={`${i}-${tok}`} className="m-0 p-0">
              <span className={blue}>{tok}</span>
            </li>
          );
        }
        const base = stripOriginSuffix(tok);
        const colorClass = `inline-flex items-center rounded border font-semibold font-mono ${pad} ${asnColorMap.get(base)}`;
        return (
          <li key={`${i}-${tok}`} className="m-0 p-0">
            <span className={colorClass}>{tok}</span>
          </li>
        );
      })}
    </ul>
  );
}
