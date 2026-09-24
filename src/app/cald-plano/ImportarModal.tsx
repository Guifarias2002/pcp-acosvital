'use client';
import { useState } from 'react';
import { postIdempotente } from '@/lib/api';
import { interpretarPlanilha, fmtData, type LinhaImport } from '@/lib/caldPlano';
import { C, Modal, Chip, nomeArea, fmtQtd, erroDe, SeletorEmpresa } from './comum';

// Importa / REIMPORTA a planilha do PCP da Caldeiraria (.xlsx). Lê no
// navegador, pede ao servidor uma SIMULAÇÃO (o que é novo, o que muda campo a
// campo, o que já está igual) e só grava depois da confirmação. Reimportar não
// duplica: só atualiza o que mudou (ver /api/cald-plano/importar).

interface Res { linha: number; pedido: string; material: string; tipo: 'novo' | 'atualizar' | 'igual' | 'cancelado' | 'invalida'; mudancas?: string[] }
interface Sim { resultado: Res[]; novos: number; atualizados: number; iguais: number; cancelados: number; invalidas: number }

const TIPO: Record<Res['tipo'], { txt: string; cor: string; bg: string }> = {
  novo:      { txt: 'Novo',         cor: '#166534', bg: '#dcfce7' },
  atualizar: { txt: 'Vai atualizar', cor: '#1d4ed8', bg: '#dbeafe' },
  igual:     { txt: 'Sem mudança',  cor: '#64748b', bg: '#f1f5f9' },
  cancelado: { txt: 'Cancelado no sistema — ignorado', cor: '#991b1b', bg: '#fee2e2' },
  invalida:  { txt: 'Linha inválida', cor: '#92400e', bg: '#fef3c7' },
};

export default function ImportarModal({ onFechar, onImportado }: { onFechar: () => void; onImportado: (msg: string) => void }) {
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [verIguais, setVerIguais] = useState(false);
  // Empresa pros itens desta planilha que não têm coluna EMPRESA (e pros já
  // importados que ainda estão sem empresa).
  const [empresa, setEmpresa] = useState<string | null>(null);

  async function simular(ls: LinhaImport[], emp: string | null) {
    setOcupado(true); setErro('');
    try {
      const r = await postIdempotente<Sim>('/api/cald-plano/importar', { linhas: ls as unknown as Record<string, unknown>[], simular: true, empresa_padrao: emp } as Record<string, unknown>);
      setSim(r);
    } catch (e2) { setErro(erroDe(e2, 'Não foi possível comparar com o sistema.')); }
    finally { setOcupado(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro(''); setLinhas(null); setSim(null); setArquivo(file.name); setOcupado(true);
    try {
      const { read, utils } = await import('xlsx');
      const wb = read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      const r = interpretarPlanilha(rows);
      if (r.erro) { setErro(r.erro); return; }
      setLinhas(r.linhas);
      await simular(r.linhas, empresa);
    } catch (e2) {
      setErro(erroDe(e2, 'Erro ao ler o arquivo. Confirme que é um .xlsx válido.'));
    } finally { setOcupado(false); }
  }

  async function aplicar() {
    if (!linhas?.length) return;
    setOcupado(true); setErro('');
    try {
      const r = await postIdempotente<Sim>('/api/cald-plano/importar', { linhas: linhas as unknown as Record<string, unknown>[], empresa_padrao: empresa } as Record<string, unknown>);
      const partes = [`${r.novos} novo(s)`, `${r.atualizados} atualizado(s)`, `${r.iguais} sem mudança`];
      if (r.cancelados) partes.push(`${r.cancelados} cancelado(s) ignorado(s)`);
      onImportado(`Planilha aplicada: ${partes.join(' · ')}.`);
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível importar.'));
    } finally { setOcupado(false); }
  }

  const porLinha = new Map((linhas || []).map(l => [l.linha, l]));
  const vis = (sim?.resultado || []).filter(r => verIguais || r.tipo !== 'igual');
  const aAplicar = (sim?.novos || 0) + (sim?.atualizados || 0);

  return (
    <Modal
      largura={1100}
      onFechar={onFechar}
      titulo={<><i className="bi bi-file-earmark-arrow-up" style={{ marginRight: 8 }} />Importar / atualizar pela planilha</>}
      rodape={<>
        {erro && <span style={{ color: C.vermelho, fontSize: 13, fontWeight: 600, marginRight: 'auto', alignSelf: 'center' }}>{erro}</span>}
        <button className="cp-btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
        <button className="cp-btn pri" onClick={aplicar} disabled={!sim || !aAplicar || ocupado}>
          <i className="bi bi-cloud-upload" />{ocupado && sim ? 'Aplicando…' : aAplicar ? `Aplicar (${sim?.novos} novo(s), ${sim?.atualizados} atualização(ões))` : 'Nada a aplicar'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="cp-btn pri" style={{ cursor: 'pointer' }}>
          <i className="bi bi-folder2-open" />Escolher arquivo .xlsx
          <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {arquivo && <span style={{ fontSize: 13, color: C.texto }}>{arquivo}</span>}
        {ocupado && !sim && <span style={{ fontSize: 13, color: C.cinza }}>Comparando com o sistema…</span>}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.cinza, textTransform: 'uppercase', letterSpacing: .3, marginBottom: 5 }}>
          Empresa destes pedidos <span style={{ textTransform: 'none', fontWeight: 500 }}>(se a planilha não tiver a coluna EMPRESA — preenche só quem ainda está sem)</span>
        </div>
        <SeletorEmpresa valor={empresa} onChange={v => { setEmpresa(v); if (linhas) simular(linhas, v); }} />
      </div>
      <p style={{ fontSize: 12.5, color: C.cinza, margin: '0 0 12px' }}>
        Pode carregar a planilha quantas vezes precisar: <b>nada é duplicado</b>. Cada linha é comparada com o que já está no sistema
        (mesmo pedido + material) e <b>só o que mudou é atualizado</b> — data de entrada, área, material, quantidade, finalizado, faturado.
        Campo vazio na planilha <b>não apaga</b> nada do sistema (valor e previsões ficam). Datas das áreas = <b>dia em que o item entrou</b>; &quot;N/A&quot; = não passa por ela.
      </p>

      {sim && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <Chip cor={TIPO.novo.cor} bg={TIPO.novo.bg}>{sim.novos} novo(s)</Chip>
            <Chip cor={TIPO.atualizar.cor} bg={TIPO.atualizar.bg}>{sim.atualizados} vão atualizar</Chip>
            <Chip cor={TIPO.igual.cor} bg={TIPO.igual.bg}>{sim.iguais} sem mudança</Chip>
            {sim.cancelados > 0 && <Chip cor={TIPO.cancelado.cor} bg={TIPO.cancelado.bg}>{sim.cancelados} cancelado(s) no sistema</Chip>}
            {sim.invalidas > 0 && <Chip cor={TIPO.invalida.cor} bg={TIPO.invalida.bg}>{sim.invalidas} inválida(s)</Chip>}
            {sim.iguais > 0 && (
              <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', marginLeft: 6 }}>
                <input type="checkbox" checked={verIguais} onChange={e => setVerIguais(e.target.checked)} />Mostrar também as sem mudança
              </label>
            )}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '55vh', border: `1px solid ${C.borda}`, borderRadius: 8 }}>
            <table className="cp-tbl">
              <thead><tr><th>Lin.</th><th>Pedido</th><th>Material</th><th>O que acontece</th><th>Detalhe</th></tr></thead>
              <tbody>
                {vis.map(r => {
                  const l = porLinha.get(r.linha);
                  const t = TIPO[r.tipo];
                  return (
                    <tr key={r.linha}>
                      <td style={{ color: C.fraco }}>{r.linha}</td>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.pedido}</td>
                      <td>{r.material}{l ? <div style={{ fontSize: 11, color: C.cinza }}>{fmtQtd(l.quantidade, l.unidade)}{l.cliente ? ` · ${l.cliente}` : ''}</div> : null}</td>
                      <td><Chip cor={t.cor} bg={t.bg}>{t.txt}</Chip></td>
                      <td style={{ fontSize: 11.5 }}>
                        {r.tipo === 'atualizar' && r.mudancas?.map((m, i) => <div key={i}>• {m}</div>)}
                        {r.tipo === 'novo' && l && (
                          <span style={{ color: C.cinza }}>
                            {l.status === 'finalizado' ? `Finalizado ${fmtData(l.finalizado_em)}` : l.area_atual ? `Em ${nomeArea(l.area_atual)}` : 'A planejar'}
                            {' · '}{l.etapas.map(e => `${nomeArea(e.area)} ${e.entrada ? fmtData(e.entrada) : '—'}`).join(', ') || 'sem datas'}
                          </span>
                        )}
                        {l?.avisos.map((a, i) => <div key={`a${i}`} style={{ color: '#92400e', fontWeight: 700 }}><i className="bi bi-exclamation-triangle" /> {a}</div>)}
                      </td>
                    </tr>
                  );
                })}
                {!vis.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: C.fraco, padding: 20 }}>Tudo já está igual ao sistema — nada a atualizar.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
