import { useI18n } from "./i18n";
import { Cpu, Monitor, Network, Palette, Sliders } from "lucide-react";
import type { Preferences } from "./preferences";

export type SettingsTab = "general" | "appearance" | "viewport" | "nodes" | "engine";
export function SettingsPanel({ value, onChange, tab, onTabChange }: {
  value: Preferences; onChange: (value: Preferences) => void;
  tab: SettingsTab; onTabChange: (tab: SettingsTab) => void;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const change = <K extends keyof Preferences>(key: K, next: Preferences[K]) => onChange({ ...value, [key]: next });
  return <div className="dialog-content settings-content">
    <div className="settings-overview-bar">{t("Alterações aplicadas imediatamente e salvas neste dispositivo.")}</div>
    <div className="settings-modal-layout">
      <nav className="settings-tabs-sidebar" aria-label={t("Categorias de configuração")}>
        {([
          ["general", "Geral", Sliders], ["appearance", "Aparência", Palette],
          ["viewport", "Viewport", Monitor], ["nodes", "Nós", Network], ["engine", "Motor", Cpu],
        ] as const).map(([id, label, Icon]) => <button key={id} className={"settings-tab-btn" + (tab === id ? " active" : "")}
          aria-pressed={tab === id} onClick={() => onTabChange(id)}><Icon size={15} /><span>{t(label)}</span></button>)}
      </nav>
      <div className="settings-tab-content">
        {tab === "general" && <section className="settings-section">
          <div className="settings-row"><label htmlFor="settings-language">{t("Idioma da interface")}</label>
            <select id="settings-language" value={value.language} onChange={e => change("language", e.target.value as Preferences["language"])}>
              <option value="pt-BR">Português (Brasil)</option><option value="en">English (US)</option>
            </select></div>
          <h3>{t("Projeto")}</h3>
          <div className="settings-check-row"><label><input type="checkbox" checked={value.confirmDeleteWithConnections}
            onChange={e => change("confirmDeleteWithConnections", e.target.checked)} />{t("Confirmar exclusão de nós conectados")}</label></div>
          <p className="field-help">{t("Alterações não salvas são protegidas ao fechar ou trocar de projeto.")}</p>
        </section>}
        {tab === "appearance" && <section className="settings-section">
          <h3>{t("Aparência")}</h3>
          <div className="settings-row"><label htmlFor="settings-theme">{t("Tema visual")}</label>
            <select id="settings-theme" value={value.theme} onChange={e => change("theme", e.target.value as Preferences["theme"])}>
              <option value="light">{t("Claro")}</option><option value="dark">{t("Escuro")}</option>
            </select></div>
        </section>}
        {tab === "viewport" && <section className="settings-section">
          <h3>{t("Navegação")}</h3>
          <div className="settings-row"><label htmlFor="settings-panmode">{t("Navegação e Pan")}</label>
            <select id="settings-panmode" value={value.panMode} onChange={e => change("panMode", e.target.value as Preferences["panMode"])}>
              <option value="space">{t("Espaço + arraste · H para Pan")}</option><option value="free">{t("Arraste livre no fundo")}</option>
            </select></div>
          <div className="settings-row"><label htmlFor="settings-gridstyle">{t("Grade visual")}</label>
            <select id="settings-gridstyle" value={value.gridStyle} onChange={e => change("gridStyle", e.target.value as Preferences["gridStyle"])}>
              <option value="dots">{t("Pontos")}</option><option value="lines">{t("Linhas")}</option><option value="none">{t("Sem grade")}</option>
            </select></div>
        </section>}
        {tab === "nodes" && <section className="settings-section">
          <h3>{t("Seleção e detalhes")}</h3>
          <div className="settings-row"><label htmlFor="settings-selcolor">{t("Cor de destaque do nó selecionado")}</label>
            <input type="color" id="settings-selcolor" value={value.selectionColorHex} onChange={e => change("selectionColorHex", e.target.value)} /></div>
          <div className="settings-check-row"><label><input type="checkbox" checked={value.selectionHalo}
            onChange={e => change("selectionHalo", e.target.checked)} />{t("Halo de seleção")}</label></div>
          <div className="settings-check-row"><label><input type="checkbox" checked={value.alwaysShowLabels}
            onChange={e => change("alwaysShowLabels", e.target.checked)} />{t("Rótulos na visão geral")}</label></div>
          <div className="settings-row"><label htmlFor="settings-doubleclick">{t("Duplo clique")}</label>
            <select id="settings-doubleclick" value={value.doubleClickAction} onChange={e => change("doubleClickAction", e.target.value as Preferences["doubleClickAction"])}>
              <option value="inspect">{t("Inspecionar nó")}</option><option value="subgraph">{t("Entrar no grupo do nó")}</option>
            </select></div>
        </section>}
        {tab === "engine" && <section className="settings-section">
          <h3>{t("Motor local")}</h3>
          <dl className="context-table"><div><dt>{t("Execução")}</dt><dd>{t("Processo isolado")}</dd></div>
            <div><dt>{t("Limite por requisição")}</dt><dd>{t("120 s")}</dd></div>
            <div><dt>{t("Tolerância")}</dt><dd>{t("Definida por referência")}</dd></div></dl>
          <p className="field-help">{t("Verificação manual por F5. Resultados são invalidados após editar o modelo.")}</p>
        </section>}
      </div>
    </div>
  </div>;
}
