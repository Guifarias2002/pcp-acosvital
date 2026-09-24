'use client';
import { useState } from 'react';
import { postIdempotente } from '@/lib/api';
import { interpretarPlanilha, fmtData, type LinhaImport } from '@/lib/caldPlano';
import { C, Modal, Chip, STATUS_TXT, nomeArea, fmtQtd, erroDe } from './comum';

// Importa a planilha antiga do coordenador (.xlsx). Lê no navegador, mostra a
// pré-visualização com os AVISOS (textos que não viraram data) e só grava
// depois da confirmação. Linha já existente (mesmo pedido + material) é pulada.
export default function ImportarModal({ onFechar, onImportado }: { onFechar: () => void; onImportado: (msg: string) => void }) {
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [soAvisos, setSoAvisos] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro(''); setLinhas(null); setArquivo(file.name);
    try {
      const { read, utils } = await import('xlsx');
      const wb = read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      const r = interpretarPlanilha(rows);
      if (r.erro) { setErro(r.erro); return; }
      setLinhas(r.linhas);
    } catch {
      setErro('Erro ao ler o arquivo. Confirme que é um .xlsx válido.');
    }
  }

  async function importar() {
    if (!linhas?.length) return;
    setSalvando(true); setErro('');
    try {
      const r = await postIdempotente<{ inseridos: number; ignorados: number }>('/api/cald-plano/importar', { linhas: linhas as unknown as Record<string, unknown>[] } as Record<string, unknown>);
      onImportado(`${r.inseridos} item(ns) importado(s)${r.ignorados ? ` · ${r.ignorados} já existiam e foram pulados` : ''}.`);
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível importar.'));
    } finally { setSalvando(false); }
  }

  const comAviso = linhas?.filter(l => l.avisos.length).length || 0;
  const vis = (linhas || []).filter(l => !soAvisos || l.avisos.length);

  return (
    <Modal
      largura={1100}
      onFechar={onFechar}
      titulo={<><i className="bi bi-file-earmark-arrow-up" style={{ marginRight: 8 }} />Importar planilha antiga da Caldeiraria</>}
      rodape={<>
        {erro && <span style={{ color: C.vermelho, fontSize: 13, fontWeight: 600, marginRight: 'auto', alignSelf: 'center' }}>{erro}</span>}
        <button className="cp-btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="cp-btn pri" onClick={importar} disabled={!linhas?.length || salvando}>
          <i className="bi bi-cloud-upload" />{salvando ? 'Importando…' : `Importar ${linhas?.length || 0} linha(s)`}
        </button>
      </>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="cp-btn pri" style={{ cursor: 'pointer' }}>
          <i className="bi bi-folder2-open" />Escolher arquivo .xlsx
          <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {arquivo && <span style={{ fontSize: 13, color: C.texto }}>{arquivo}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: C.cinza, margin: '0 0 12px' }}>
        As datas das colunas de área são lidas como <b>dia em que o item entrou</b> na área. &quot;N/A&quot; = não passa por ela.
        A área atual é a de entrada mais recente; quem tem data em FINALIZADO entra como finalizado. Textos que não viram data vão pra observação (em amarelo abaixo).
        Pode importar de novo a mesma planilha: o que já existe (mesmo pedido + material) é pulado.
      </p>

      {linhas && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: C.azul }}>{linhas.length} linha(s) lida(s)</b>
            {comAviso > 0 && <Chip cor="#92400e" bg="#fef3c7"><i className="bi bi-exclamation-triangle" />{comAviso} com aviso</Chip>}
            {comAviso > 0 && (
              <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={soAvisos} onChange={e => setSoAvisos(e.target.checked)} />Mostrar só as com aviso
              </label>
            )}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '55vh', border: `1px solid ${C.borda}`, borderRadius: 8 }}>
            <table className="cp-tbl">
              <thead><tr><th>Lin.</th><th>Pedido</th><th>Vendedor</th><th>Cliente</th><th>Material</th><th>Qtd</th><th>Situação</th><th>Datas de entrada</th><th>Obs / avisos</th></tr></thead>
              <tbody>
                {vis.map(l => {
                  const st = STATUS_TXT[l.status];
                  return (
                    <tr key={l.linha} style={{ background: l.avisos.length ? '#fffbeb' : undefined }}>
                      <td style={{ color: C.fraco }}>{l.linha}</td>
                      <td style={{ fontWeight: 700 }}>{l.pedido}</td>
                      <td>{l.vendedor || '—'}</td>
                      <td>{l.cliente || '—'}</td>
                      <td>{l.material}{l.parcial && <> <Chip cor="#7c3aed" bg="#ede9fe">PARCIAL</Chip></>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtQtd(l.quantidade, l.unidade)}</td>
                      <td><Chip cor={st.cor} bg={st.bg}>{l.status === 'andamento' ? nomeArea(l.area_atual) : st.txt}</Chip>
                        {l.finalizado_em && <div style={{ fontSize: 11, color: C.cinza }}>fin. {fmtData(l.finalizado_em)}</div>}</td>
                      <td style={{ fontSize: 11.5 }}>
                        {l.etapas.map(e => (
                          <div key={e.area} style={{ whiteSpace: 'nowrap' }}>
                            <b>{nomeArea(e.area)}</b> {e.entrada ? fmtData(e.entrada) : <span style={{ color: C.fraco }}>sem data</span>}{e.fornecedor ? ` · ${e.fornecedor}` : ''}
                          </div>
                        ))}
                        {!l.etapas.length && <span style={{ color: C.fraco }}>—</span>}
                      </td>
                      <td style={{ fontSize: 11.5, maxWidth: 260 }}>
                        {l.avisos.map((a, i) => <div key={i} style={{ color: '#92400e', fontWeight: 700 }}><i className="bi bi-exclamation-triangle" /> {a}</div>)}
                        {l.obs && <div style={{ color: C.cinza }}>{l.obs}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
