import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useGetFragranceChoice, getGetFragranceChoiceQueryKey, useSaveFragranceChoice, useDeleteFragranceChoice } from "@workspace/api-client-react";
import type { FragranceChoiceInput, FragranceChoiceInputOccasion } from "@workspace/api-client-react";
import type { Location } from "../lib/weather";
import { apiErrorMessage, loadCatalog, roundApprox } from "../lib/extras";
import type { Fragrance } from "../lib/extras";

const OCC: { id: FragranceChoiceInputOccasion; label: string }[] = [
  { id: "daily", label: "Día a día" }, { id: "work", label: "Trabajo" }, { id: "night", label: "Salida nocturna" }, { id: "special", label: "Ocasión especial" },
];

export function FragranceSurvey({ location }: { location: Location }) {
  const qc = useQueryClient();
  const survey = useGetFragranceChoice({ query: { queryKey: getGetFragranceChoiceQueryKey() } });
  const [catalog, setCatalog] = useState<Fragrance[]>([]);
  const [perfume, setPerfume] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [occasion, setOccasion] = useState<FragranceChoiceInputOccasion | "">("");
  const [consent, setConsent] = useState(false);
  const [cityConsent, setCityConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setCatalog([])); }, []);
  const onOk = (text: string) => () => { setMsg(text); setEditing(false); void qc.invalidateQueries({ queryKey: getGetFragranceChoiceQueryKey() }); };
  const save = useSaveFragranceChoice({ mutation: { onSuccess: onOk("Guardado. Gracias por sumarte.") } });
  const remove = useDeleteFragranceChoice({ mutation: { onSuccess: onOk("Borramos todas las respuestas de este navegador.") } });

  const choice = survey.data?.choice ?? null;
  const valid = perfume.trim().length >= 2 && perfume.trim().length <= 100 && consent;
  const submit = () => {
    if (!valid) return;
    const data: FragranceChoiceInput = { perfume: perfume.trim(), consent: true, ...(occasion ? { occasion } : {}) };
    if (cityConsent) Object.assign(data, { cityConsent: true, city: location.name.slice(0, 80), latitude: roundApprox(location.latitude), longitude: roundApprox(location.longitude) });
    setMsg(""); save.mutate({ data });
  };
  const startEdit = () => { setPerfume(choice?.perfume ?? ""); setEditing(true); setMsg(""); };

  return <section className="panel survey" aria-labelledby="survey-title">
    <p className="eyebrow">ENCUESTA OPCIONAL</p>
    <h2 id="survey-title">¿Y vos qué perfume vas a usar hoy?</h2>
    {survey.isLoading ? <div className="skeleton-panel short" />
      : survey.isError ? <div className="error-panel" role="alert"><AlertTriangle size={18} /><div><b>No pudimos cargar la encuesta.</b><span>{apiErrorMessage(survey.error)}</span></div><button className="retry-button" onClick={() => void survey.refetch()} data-testid="button-survey-retry">Reintentar</button></div>
      : <>
        {choice && !editing ? <div className="survey-current" data-testid="text-survey-choice">
          <p>Hoy elegiste <b>{choice.perfume}</b>{choice.occasion ? ` · ${OCC.find(o => o.id === choice.occasion)?.label ?? choice.occasion}` : ""}{choice.city ? ` · ${choice.city}` : ""}.</p>
          <small>{choice.weatherAvailable ? "Guardamos también el clima de tu ciudad en ese momento." : "Sin ciudad ni clima asociados."}</small>
          <div className="row-actions"><button className="chip" onClick={startEdit} data-testid="button-survey-edit">Cambiar</button><button className="chip danger" onClick={() => window.confirm("¿Borrar todas tus respuestas de este navegador?") && remove.mutate()} disabled={remove.isPending} data-testid="button-survey-delete"><Trash2 size={14} /> Borrar mis respuestas</button></div>
        </div> : <div className="survey-form">
          <label className="field-label">Perfume
            <input list={notFound ? undefined : "efg-fragrance-list"} value={perfume} maxLength={100} onChange={e => setPerfume(e.target.value)} placeholder={notFound ? "Escribí marca y nombre" : "Empezá a escribir…"} data-testid="input-survey-perfume" />
          </label>
          <datalist id="efg-fragrance-list">{catalog.map(f => <option key={f.id} value={f.name} />)}</datalist>
          <label className="check-line"><input type="checkbox" checked={notFound} onChange={e => setNotFound(e.target.checked)} data-testid="checkbox-survey-notfound" /> No lo encuentro en la lista</label>
          {notFound && <p className="hint-line">Solo el nombre del perfume: sin enlaces ni datos personales.</p>}
          <label className="field-label">Ocasión (opcional)<select value={occasion} onChange={e => setOccasion(e.target.value as FragranceChoiceInputOccasion | "")} data-testid="select-survey-occasion"><option value="">Sin indicar</option>{OCC.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label className="check-line"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-survey-consent" /> Acepto guardar mi respuesta de forma anónima para estadísticas.</label>
          <label className="check-line"><input type="checkbox" checked={cityConsent} onChange={e => setCityConsent(e.target.checked)} data-testid="checkbox-survey-city" /> Además, sumar mi ciudad ({location.name}). El servidor consulta el clima de la zona y no guarda coordenadas.</label>
          {save.isError && <p className="form-error" role="alert">{apiErrorMessage(save.error)}</p>}
          <div className="row-actions"><button className="primary-btn" disabled={!valid || save.isPending} onClick={submit} data-testid="button-survey-save">{save.isPending ? "Guardando…" : "Guardar respuesta"}</button>{editing && <button className="chip" onClick={() => setEditing(false)}>Cancelar</button>}</div>
        </div>}
        {msg && <p className="hint-line" role="status">{msg}</p>}
        {remove.isError && <p className="form-error" role="alert">{apiErrorMessage(remove.error)}</p>}
        <div className="aggregates">
          <h3>Lo que más se elige</h3>
          {survey.data && survey.data.aggregates.length ? <ol>{survey.data.aggregates.map(a => <li key={a.perfume}><span>{a.perfume}</span><b>{a.count}</b></li>)}</ol>
            : <p className="hint-line">Todavía no hay respuestas suficientes para mostrar resultados sin exponer a nadie.</p>}
        </div>
        <details className="privacy-details inline"><summary>Cómo cuidamos tus datos</summary><p>Mostramos totales solo con al menos 10 navegadores distintos en 30 días y 5 respuestas por perfume. Son navegadores anónimos, no personas verificadas, y no representan a la población. Sin tu permiso de ciudad no guardamos ciudad ni clima. El análisis privado está pendiente; no hay panel de administración.</p>{survey.data?.notice && <p>{survey.data.notice}</p>}</details>
      </>}
  </section>;
}
