export function EvidenceTooltip({ source, method, period, samples, limits }: {
  source: string; method?: string; period?: string; samples?: string; limits?: string;
}) {
  return <details className="v4-evidence">
    <summary>Provenienza e metodo</summary>
    <dl>
      <dt>Fonte</dt><dd>{source}</dd>
      {method && <><dt>Metodo</dt><dd>{method}</dd></>}
      {period && <><dt>Periodo</dt><dd>{period}</dd></>}
      {samples && <><dt>Campioni</dt><dd>{samples}</dd></>}
      {limits && <><dt>Limiti</dt><dd>{limits}</dd></>}
    </dl>
  </details>;
}
