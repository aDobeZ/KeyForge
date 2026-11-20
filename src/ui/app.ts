import {
  DEFAULT_OPTIONS,
  DEFAULT_SYMBOLS,
  FingerprintItem,
  generatePassword,
  getMasterPasswordFingerprint,
  normalizeSymbols,
} from '../core/lesspass';
import {
  SiteProfile,
  deleteProfile,
  loadProfiles,
  mergeImportedProfiles,
  upsertProfile,
} from '../core/storage';
import {
  DecryptPreviewResult,
  decryptBase64WithPreview,
  decryptBytesWithPreview,
  encryptProfilesToBase64,
  encryptProfilesToBytes,
} from '../core/crypto-sync';
import { getActiveTabDomain, isExtensionEnvironment } from '../core/extension-bridge';

type TabKey = 'generate' | 'profiles' | 'sync';

const FP_ICONS = ['★', '◆', '▲', '●', '■', '✦', '✚', '❖', '⬟', '☀', '❄', '⚡'];
const COMMON_SYMBOLS = '!@#$%^&*';

interface AppState {
  activeTab: TabKey;
  profiles: SiteProfile[];
  // Generator form state
  editingId: string | null;
  site: string;
  login: string;
  masterPassword: string;
  showMaster: boolean;
  counter: number;
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  customSymbols: string;
  showSymbolsEditor: boolean;
  // Output
  generatedPassword: string;
  showGenerated: boolean;
  fingerprint: FingerprintItem[];
  showSiteSuggestions: boolean;
  // Profiles tab
  searchQuery: string;
  // Sync tab
  exportPassword: string;
  exportBase64: string;
  importPassword: string;
  importBase64: string;
  importFileBytes: Uint8Array | null;
  importFileName: string;
  decryptPreview: DecryptPreviewResult | null;
  // UI feedback
  toastMessage: string;
  isExt: boolean;
}

const state: AppState = {
  activeTab: 'generate',
  profiles: [],
  editingId: null,
  site: '',
  login: '',
  masterPassword: '',
  showMaster: false,
  counter: DEFAULT_OPTIONS.counter,
  length: DEFAULT_OPTIONS.length,
  lowercase: DEFAULT_OPTIONS.lowercase,
  uppercase: DEFAULT_OPTIONS.uppercase,
  digits: DEFAULT_OPTIONS.digits,
  symbols: DEFAULT_OPTIONS.symbols,
  customSymbols: DEFAULT_SYMBOLS,
  showSymbolsEditor: false,
  generatedPassword: '',
  showGenerated: false,
  fingerprint: [],
  showSiteSuggestions: false,
  searchQuery: '',
  exportPassword: '',
  exportBase64: '',
  importPassword: '',
  importBase64: '',
  importFileBytes: null,
  importFileName: '',
  decryptPreview: null,
  toastMessage: '',
  isExt: isExtensionEnvironment(),
};

let toastTimer: number | undefined;
function showToast(msg: string) {
  state.toastMessage = msg;
  const existing = document.getElementById('toast-el');
  if (existing) {
    existing.textContent = msg;
    existing.style.display = 'block';
  } else {
    render();
  }
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toastMessage = '';
    const el = document.getElementById('toast-el');
    if (el) el.style.display = 'none';
  }, 2400);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyProfileToForm(p: SiteProfile) {
  state.editingId = p.id;
  state.site = p.site;
  state.login = p.login;
  state.counter = p.counter;
  state.length = p.length;
  state.lowercase = p.lowercase;
  state.uppercase = p.uppercase;
  state.digits = p.digits;
  state.symbols = p.symbols;
  state.customSymbols = p.customSymbols;
  state.generatedPassword = '';
}

async function computePassword(copyAfter = false) {
  if (!state.masterPassword) {
    state.generatedPassword = '';
    if (copyAfter) showToast('请先输入主密码');
    return;
  }
  try {
    const pwd = await generatePassword(state.masterPassword, {
      site: state.site.trim(),
      login: state.login.trim(),
      counter: state.counter,
      length: state.length,
      lowercase: state.lowercase,
      uppercase: state.uppercase,
      digits: state.digits,
      symbols: state.symbols,
      customSymbols: state.customSymbols,
    });
    state.generatedPassword = pwd;
    if (copyAfter) {
      await navigator.clipboard.writeText(pwd);
      showToast('已生成并复制到剪贴板');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '生成失败');
  }
}

async function saveCurrentProfile(silent = false) {
  if (!state.site.trim()) {
    if (!silent) showToast('请先填写平台名称（例如 github.com）');
    return;
  }
  const { profiles, saved } = await upsertProfile({
    id: state.editingId ?? undefined,
    site: state.site.trim(),
    login: state.login.trim(),
    counter: state.counter,
    length: state.length,
    lowercase: state.lowercase,
    uppercase: state.uppercase,
    digits: state.digits,
    symbols: state.symbols,
    customSymbols: normalizeSymbols(state.customSymbols),
  });
  state.profiles = profiles;
  state.editingId = saved.id;
  if (!silent) showToast(`已保存 ${saved.site}（第 ${saved.counter} 次随机）`);
  render();
}

function renderFingerprintHtml(): string {
  if (state.fingerprint.length === 0) {
    return `<span class="muted">输入主密码显示视觉指纹</span>`;
  }
  return `<span class="fingerprint" title="主密码视觉指纹：每次输入相同主密码，这3个图标和颜色固定不变">
    ${state.fingerprint
      .map(
        (item) =>
          `<span class="fp-dot" style="background:${item.color}">${FP_ICONS[item.iconIndex]}</span>`
      )
      .join('')}
  </span>`;
}

function renderSiteSuggestionsHtml(): string {
  if (!state.showSiteSuggestions) return '';
  const siteLower = state.site.trim().toLowerCase();
  const matchedProfiles = state.profiles
    .filter(
      (p) =>
        !siteLower ||
        p.site.toLowerCase().includes(siteLower) ||
        p.login.toLowerCase().includes(siteLower)
    )
    .slice(0, 8);

  if (matchedProfiles.length === 0) return '';

  return `<div class="autocomplete-list">
    ${matchedProfiles
      .map(
        (p) => `<button type="button" class="autocomplete-item ${p.id === state.editingId ? 'active' : ''}" data-pick-profile="${escapeHtml(p.id)}">
          <span class="autocomplete-main">${escapeHtml(p.site)}${p.login ? ` · ${escapeHtml(p.login)}` : ''}</span>
          <span class="autocomplete-meta">第${p.counter}次 · ${p.length}位</span>
        </button>`
      )
      .join('')}
  </div>`;
}

function renderGenerateTab(): string {
  const selectedSet = new Set(Array.from(state.customSymbols));
  const allSymbolChars = Array.from(DEFAULT_SYMBOLS);

  return `
    <div class="card">
      <div class="field">
        <div class="label-row">
          <label for="input-site">平台 / 域名 (Site)</label>
          ${
            state.editingId
              ? `<span class="muted">已关联本地记录</span>`
              : `<span class="muted">新平台</span>`
          }
        </div>
        <div class="autocomplete-wrap">
          <input id="input-site" type="text" placeholder="输入平台名，支持自动联想..." value="${escapeHtml(state.site)}" autocomplete="off" />
          <div id="site-suggestions">${renderSiteSuggestionsHtml()}</div>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="input-login">用户名 / 邮箱 (Login)</label>
        </div>
        <input id="input-login" type="text" placeholder="例如 user@example.com" value="${escapeHtml(state.login)}" autocomplete="off" />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="input-master">主密码 (Master Password)</label>
          <span id="fp-container">${renderFingerprintHtml()}</span>
        </div>
        <div class="input-wrap">
          <input id="input-master" type="${state.showMaster ? 'text' : 'password'}" placeholder="仅在本地内存中计算，永不保存" value="${escapeHtml(state.masterPassword)}" />
          <button type="button" class="btn btn-sm" id="btn-toggle-master">${state.showMaster ? '隐藏' : '显示'}</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row-2 field">
        <div>
          <div class="label-row"><label>第几次重随机 (Counter)</label></div>
          <div class="counter-group">
            <button type="button" class="btn btn-sm" id="btn-counter-dec">-</button>
            <input id="input-counter" type="number" min="1" max="999" value="${state.counter}" />
            <button type="button" class="btn btn-sm" id="btn-counter-inc">+</button>
            <button type="button" class="btn btn-sm btn-primary" id="btn-rerandom" title="将重随机次数 +1 并更新本地记录">🎲 重随机+1</button>
          </div>
        </div>
        <div>
          <div class="label-row"><label for="input-length">密码长度 (5~35)</label></div>
          <div class="counter-group">
            <input id="input-length" type="number" min="5" max="35" value="${state.length}" style="width:100%" />
          </div>
        </div>
      </div>

      <div class="field">
        <div class="label-row">
          <label>字符集规则</label>
          <button type="button" class="btn btn-sm" id="btn-toggle-symbols-editor">
            ${state.showSymbolsEditor ? '收起特殊符号' : `自定义特殊符号 (${selectedSet.size}/${allSymbolChars.length})`}
          </button>
        </div>
        <div class="toggles">
          <button type="button" class="toggle-pill ${state.lowercase ? 'active' : ''}" data-rule="lowercase">a-z</button>
          <button type="button" class="toggle-pill ${state.uppercase ? 'active' : ''}" data-rule="uppercase">A-Z</button>
          <button type="button" class="toggle-pill ${state.digits ? 'active' : ''}" data-rule="digits">0-9</button>
          <button type="button" class="toggle-pill ${state.symbols ? 'active' : ''}" data-rule="symbols">!@#</button>
        </div>

        ${
          state.showSymbolsEditor
            ? `<div class="symbols-panel">
                <div class="symbols-toolbar">
                  <span class="muted">点选该平台允许的特殊符号：</span>
                  <div class="actions-row">
                    <button type="button" class="btn btn-sm" id="btn-sym-all">全选 (兼容原版)</button>
                    <button type="button" class="btn btn-sm" id="btn-sym-common">常用 (!@#$%^&*)</button>
                    <button type="button" class="btn btn-sm" id="btn-sym-clear">清空</button>
                  </div>
                </div>
                <div class="symbols-grid">
                  ${allSymbolChars
                    .map(
                      (ch) => `<button type="button" class="sym-btn ${selectedSet.has(ch) ? 'active' : ''}" data-sym="${escapeHtml(ch)}">${escapeHtml(ch)}</button>`
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
      </div>
    </div>

    <div class="card">
      ${
        state.generatedPassword
          ? `<div class="result-box">
              <div class="result-pwd" id="pwd-output">${
                state.showGenerated
                  ? escapeHtml(state.generatedPassword)
                  : '•'.repeat(state.generatedPassword.length)
              }</div>
              <div class="actions-row">
                <button type="button" class="btn btn-sm" id="btn-toggle-pwd">${state.showGenerated ? '隐藏' : '查看'}</button>
                <button type="button" class="btn btn-sm btn-success" id="btn-copy-pwd">复制</button>
              </div>
            </div>`
          : ''
      }
      <div class="actions-row">
        <button type="button" class="btn btn-primary" style="flex:1" id="btn-generate">⚡ 生成并复制密码</button>
        <button type="button" class="btn" id="btn-save-profile">💾 保存平台</button>
      </div>
    </div>
  `;
}

function renderProfilesTab(): string {
  const q = state.searchQuery.trim().toLowerCase();
  const filtered = state.profiles.filter(
    (p) => !q || p.site.toLowerCase().includes(q) || p.login.toLowerCase().includes(q)
  );

  return `
    <div class="card">
      <div class="field">
        <input id="input-search-profiles" type="text" placeholder="搜索平台或用户名..." value="${escapeHtml(state.searchQuery)}" />
      </div>
      <div class="muted">共保存 ${state.profiles.length} 个平台配置（仅保存元数据，不保存任何密码）</div>
    </div>

    ${
      filtered.length === 0
        ? `<div class="card muted" style="text-align:center; padding:24px;">暂无匹配的平台记录</div>`
        : filtered
            .map(
              (p) => `<div class="profile-item" data-load-profile="${escapeHtml(p.id)}">
                <div class="profile-meta">
                  <div class="profile-site">${escapeHtml(p.site)}</div>
                  <div class="profile-sub">
                    账号: ${escapeHtml(p.login || '(空)')} · 第 <b>${p.counter}</b> 次随机 · 长度 ${p.length}
                    <br/>符号(${p.symbols ? p.customSymbols.length : 0}): ${
                      p.symbols ? escapeHtml(p.customSymbols) : '已关闭'
                    }
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-danger" data-del-profile="${escapeHtml(p.id)}">删除</button>
              </div>`
            )
            .join('')
    }
  `;
}

function renderSyncTab(): string {
  const preview = state.decryptPreview;

  return `
    <div class="card">
      <div class="label-row">
        <label>📤 导出加密备份（用于电脑与手机间传输）</label>
      </div>
      <div class="field">
        <input id="input-export-pwd" type="password" placeholder="输入主密码加密备份文件" value="${escapeHtml(state.exportPassword)}" />
      </div>
      <div class="actions-row field">
        <button type="button" class="btn btn-primary" id="btn-export-file">下载 .mlp 加密文件</button>
        <button type="button" class="btn" id="btn-export-text">生成加密文本</button>
      </div>
      ${
        state.exportBase64
          ? `<div class="field">
              <div class="label-row">
                <label>加密备份文本（可复制发送到手机）</label>
                <button type="button" class="btn btn-sm" id="btn-copy-export">复制文本</button>
              </div>
              <textarea rows="3" readonly>${escapeHtml(state.exportBase64)}</textarea>
            </div>`
          : ''
      }
    </div>

    <div class="card">
      <div class="label-row">
        <label>📥 导入加密备份（支持乱码解密检验）</label>
      </div>
      <div class="field">
        <input id="input-import-file" type="file" accept=".mlp,.txt,.enc" style="font-size:12px;" />
        ${state.importFileName ? `<div class="muted" style="margin-top:4px;">已选文件: ${escapeHtml(state.importFileName)}</div>` : ''}
      </div>
      <div class="field">
        <label for="input-import-text">或直接粘贴加密备份文本：</label>
        <textarea id="input-import-text" rows="2" placeholder="粘贴从其他设备复制的加密文本...">${escapeHtml(state.importBase64)}</textarea>
      </div>
      <div class="field">
        <input id="input-import-pwd" type="password" placeholder="输入导出时使用的主密码进行解密" value="${escapeHtml(state.importPassword)}" />
      </div>
      <div class="field">
        <button type="button" class="btn btn-primary btn-block" id="btn-decrypt-preview">🔍 解密并预览内容</button>
      </div>

      ${
        preview
          ? `<div class="field">
              <div class="status-banner ${preview.ok ? 'status-ok' : 'status-err'}">
                ${
                  preview.ok
                    ? `✅ 解密成功：共识别到 ${preview.profiles?.length ?? 0} 个平台配置，请确认后导入。`
                    : `⚠️ ${escapeHtml(preview.errorReason || '解密失败，密码可能不匹配（下方显示解密乱码）')}`
                }
              </div>
              <div class="label-row"><label>解密结果实时预览：</label></div>
              <div class="preview-box">${escapeHtml(preview.previewText || '(无输出内容)')}</div>
              ${
                preview.ok && preview.profiles
                  ? `<div class="actions-row" style="margin-top:10px;">
                      <button type="button" class="btn btn-success" style="flex:1" id="btn-confirm-merge">合并导入（保留较新）</button>
                      <button type="button" class="btn btn-danger" id="btn-confirm-replace">覆盖本地全部</button>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }
    </div>
  `;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="brand">
          <span>🔐 KeyForge</span>
          <span class="brand-badge">${state.isExt ? '插件版' : 'Web / PWA'}</span>
        </div>
      </div>

      <div class="tabs">
        <button type="button" class="tab-btn ${state.activeTab === 'generate' ? 'active' : ''}" data-tab="generate">🔑 生成密码</button>
        <button type="button" class="tab-btn ${state.activeTab === 'profiles' ? 'active' : ''}" data-tab="profiles">📚 已保存 (${state.profiles.length})</button>
        <button type="button" class="tab-btn ${state.activeTab === 'sync' ? 'active' : ''}" data-tab="sync">🔄 导入导出</button>
      </div>

      ${
        state.activeTab === 'generate'
          ? renderGenerateTab()
          : state.activeTab === 'profiles'
          ? renderProfilesTab()
          : renderSyncTab()
      }
    </div>
    <div id="toast-el" class="toast" style="display:${state.toastMessage ? 'block' : 'none'}">${escapeHtml(state.toastMessage)}</div>
  `;

  bindEvents();
}

function bindEvents() {
  // Tab switching
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
    el.onclick = () => {
      state.activeTab = el.dataset.tab as TabKey;
      render();
    };
  });

  if (state.activeTab === 'generate') {
    const bindSuggestionItems = () => {
      document.querySelectorAll<HTMLElement>('[data-pick-profile]').forEach((el) => {
        el.onmousedown = async (e) => {
          e.preventDefault();
          const found = state.profiles.find((p) => p.id === el.dataset.pickProfile);
          if (found) {
            applyProfileToForm(found);
            state.showSiteSuggestions = false;
            if (state.masterPassword) await computePassword(false);
            render();
          }
        };
      });
    };

    const updateSuggestions = () => {
      const box = document.getElementById('site-suggestions');
      if (box) {
        box.innerHTML = renderSiteSuggestionsHtml();
        bindSuggestionItems();
      }
    };

    const inputSite = document.getElementById('input-site') as HTMLInputElement | null;
    if (inputSite) {
      inputSite.onfocus = () => {
        state.showSiteSuggestions = true;
        updateSuggestions();
      };
      inputSite.oninput = () => {
        state.site = inputSite.value;
        state.editingId = null;
        state.showSiteSuggestions = true;
        updateSuggestions();
      };
      inputSite.onblur = () => {
        state.showSiteSuggestions = false;
        updateSuggestions();
      };
    }

    bindSuggestionItems();

    const inputLogin = document.getElementById('input-login') as HTMLInputElement | null;
    if (inputLogin) {
      inputLogin.oninput = () => {
        state.login = inputLogin.value;
      };
    }

    const inputMaster = document.getElementById('input-master') as HTMLInputElement | null;
    if (inputMaster) {
      inputMaster.oninput = async () => {
        const val = inputMaster.value;
        state.masterPassword = val;
        state.fingerprint = await getMasterPasswordFingerprint(val);
        const fpEl = document.getElementById('fp-container');
        if (fpEl) fpEl.innerHTML = renderFingerprintHtml();
      };
    }

    const btnToggleMaster = document.getElementById('btn-toggle-master');
    if (btnToggleMaster) {
      btnToggleMaster.onclick = () => {
        state.showMaster = !state.showMaster;
        render();
      };
    }

    const inputCounter = document.getElementById('input-counter') as HTMLInputElement | null;
    if (inputCounter) {
      inputCounter.onchange = () => {
        state.counter = Math.max(1, parseInt(inputCounter.value, 10) || 1);
        render();
      };
    }

    const btnDec = document.getElementById('btn-counter-dec');
    if (btnDec) {
      btnDec.onclick = async () => {
        state.counter = Math.max(1, state.counter - 1);
        if (state.masterPassword) await computePassword(false);
        render();
      };
    }

    const btnInc = document.getElementById('btn-counter-inc');
    if (btnInc) {
      btnInc.onclick = async () => {
        state.counter += 1;
        if (state.masterPassword) await computePassword(false);
        render();
      };
    }

    const btnRerandom = document.getElementById('btn-rerandom');
    if (btnRerandom) {
      btnRerandom.onclick = async () => {
        state.counter += 1;
        if (state.site.trim()) {
          await saveCurrentProfile(true);
        }
        if (state.masterPassword) {
          await computePassword(true);
        } else {
          showToast(`已重随机为第 ${state.counter} 次`);
        }
        render();
      };
    }

    const inputLength = document.getElementById('input-length') as HTMLInputElement | null;
    if (inputLength) {
      inputLength.onchange = () => {
        state.length = Math.max(5, Math.min(35, parseInt(inputLength.value, 10) || 16));
        render();
      };
    }

    document.querySelectorAll<HTMLElement>('[data-rule]').forEach((el) => {
      el.onclick = () => {
        const rule = el.dataset.rule as 'lowercase' | 'uppercase' | 'digits' | 'symbols';
        state[rule] = !state[rule];
        render();
      };
    });

    const btnToggleSymEditor = document.getElementById('btn-toggle-symbols-editor');
    if (btnToggleSymEditor) {
      btnToggleSymEditor.onclick = () => {
        state.showSymbolsEditor = !state.showSymbolsEditor;
        render();
      };
    }

    document.querySelectorAll<HTMLElement>('[data-sym]').forEach((el) => {
      el.onclick = () => {
        const ch = el.dataset.sym!;
        const set = new Set(Array.from(state.customSymbols));
        if (set.has(ch)) set.delete(ch);
        else set.add(ch);
        state.customSymbols = normalizeSymbols(Array.from(set).join(''));
        if (state.customSymbols.length > 0) state.symbols = true;
        render();
      };
    });

    const btnSymAll = document.getElementById('btn-sym-all');
    if (btnSymAll) {
      btnSymAll.onclick = () => {
        state.customSymbols = DEFAULT_SYMBOLS;
        state.symbols = true;
        render();
      };
    }

    const btnSymCommon = document.getElementById('btn-sym-common');
    if (btnSymCommon) {
      btnSymCommon.onclick = () => {
        state.customSymbols = normalizeSymbols(COMMON_SYMBOLS);
        state.symbols = true;
        render();
      };
    }

    const btnSymClear = document.getElementById('btn-sym-clear');
    if (btnSymClear) {
      btnSymClear.onclick = () => {
        state.customSymbols = '';
        state.symbols = false;
        render();
      };
    }

    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) {
      btnGenerate.onclick = async () => {
        await computePassword(true);
        render();
      };
    }

    const btnSave = document.getElementById('btn-save-profile');
    if (btnSave) {
      btnSave.onclick = async () => {
        await saveCurrentProfile(false);
      };
    }

    const btnTogglePwd = document.getElementById('btn-toggle-pwd');
    if (btnTogglePwd) {
      btnTogglePwd.onclick = () => {
        state.showGenerated = !state.showGenerated;
        render();
      };
    }

    const btnCopyPwd = document.getElementById('btn-copy-pwd');
    if (btnCopyPwd) {
      btnCopyPwd.onclick = async () => {
        if (state.generatedPassword) {
          await navigator.clipboard.writeText(state.generatedPassword);
          showToast('密码已复制到剪贴板');
        }
      };
    }
  }

  if (state.activeTab === 'profiles') {
    const searchEl = document.getElementById('input-search-profiles') as HTMLInputElement | null;
    if (searchEl) {
      searchEl.oninput = () => {
        state.searchQuery = searchEl.value;
        render();
        // Restore cursor focus after re-render
        const nextSearch = document.getElementById('input-search-profiles') as HTMLInputElement | null;
        if (nextSearch) {
          nextSearch.focus();
          nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
        }
      };
    }

    document.querySelectorAll<HTMLElement>('[data-load-profile]').forEach((el) => {
      el.onclick = async (e) => {
        if ((e.target as HTMLElement).closest('[data-del-profile]')) return;
        const found = state.profiles.find((p) => p.id === el.dataset.loadProfile);
        if (found) {
          applyProfileToForm(found);
          state.activeTab = 'generate';
          if (state.masterPassword) await computePassword(false);
          render();
          showToast(`已加载 ${found.site}`);
        }
      };
    });

    document.querySelectorAll<HTMLElement>('[data-del-profile]').forEach((el) => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const id = el.dataset.delProfile!;
        state.profiles = await deleteProfile(id);
        if (state.editingId === id) state.editingId = null;
        render();
        showToast('已删除该平台记录');
      };
    });
  }

  if (state.activeTab === 'sync') {
    const expPwd = document.getElementById('input-export-pwd') as HTMLInputElement | null;
    if (expPwd) {
      expPwd.oninput = () => {
        state.exportPassword = expPwd.value;
      };
    }

    const btnExportFile = document.getElementById('btn-export-file');
    if (btnExportFile) {
      btnExportFile.onclick = async () => {
        if (!state.exportPassword) {
          showToast('请输入主密码后再导出');
          return;
        }
        const bytes = await encryptProfilesToBytes(state.profiles, state.exportPassword);
        const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keyforge-backup-${new Date().toISOString().slice(0, 10)}.mlp`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${state.profiles.length} 个平台配置`);
      };
    }

    const btnExportText = document.getElementById('btn-export-text');
    if (btnExportText) {
      btnExportText.onclick = async () => {
        if (!state.exportPassword) {
          showToast('请输入主密码后再生成');
          return;
        }
        state.exportBase64 = await encryptProfilesToBase64(state.profiles, state.exportPassword);
        render();
        showToast('已生成加密文本');
      };
    }

    const btnCopyExport = document.getElementById('btn-copy-export');
    if (btnCopyExport) {
      btnCopyExport.onclick = async () => {
        await navigator.clipboard.writeText(state.exportBase64);
        showToast('加密文本已复制到剪贴板');
      };
    }

    const fileInput = document.getElementById('input-import-file') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        state.importFileBytes = new Uint8Array(buf);
        state.importFileName = file.name;
        state.importBase64 = '';
        state.decryptPreview = null;
        render();
      };
    }

    const impText = document.getElementById('input-import-text') as HTMLTextAreaElement | null;
    if (impText) {
      impText.oninput = () => {
        state.importBase64 = impText.value;
        if (impText.value.trim()) {
          state.importFileBytes = null;
          state.importFileName = '';
        }
      };
    }

    const impPwd = document.getElementById('input-import-pwd') as HTMLInputElement | null;
    if (impPwd) {
      impPwd.oninput = () => {
        state.importPassword = impPwd.value;
      };
    }

    const btnDecrypt = document.getElementById('btn-decrypt-preview');
    if (btnDecrypt) {
      btnDecrypt.onclick = async () => {
        if (!state.importPassword) {
          showToast('请输入主密码进行解密');
          return;
        }
        if (state.importFileBytes) {
          state.decryptPreview = await decryptBytesWithPreview(
            state.importFileBytes,
            state.importPassword
          );
        } else if (state.importBase64.trim()) {
          state.decryptPreview = await decryptBase64WithPreview(
            state.importBase64.trim(),
            state.importPassword
          );
        } else {
          showToast('请先选择 .mlp 文件或粘贴加密文本');
          return;
        }
        render();
      };
    }

    const btnMerge = document.getElementById('btn-confirm-merge');
    if (btnMerge) {
      btnMerge.onclick = async () => {
        const list = state.decryptPreview?.profiles;
        if (!list) return;
        state.profiles = await mergeImportedProfiles(list, 'merge');
        state.decryptPreview = null;
        state.importBase64 = '';
        state.importFileBytes = null;
        state.importFileName = '';
        state.activeTab = 'profiles';
        render();
        showToast('合并导入成功！');
      };
    }

    const btnReplace = document.getElementById('btn-confirm-replace');
    if (btnReplace) {
      btnReplace.onclick = async () => {
        const list = state.decryptPreview?.profiles;
        if (!list) return;
        state.profiles = await mergeImportedProfiles(list, 'replace');
        state.decryptPreview = null;
        state.importBase64 = '';
        state.importFileBytes = null;
        state.importFileName = '';
        state.activeTab = 'profiles';
        render();
        showToast('已覆盖本地配置！');
      };
    }
  }
}

async function init() {
  state.profiles = await loadProfiles();

  if (state.isExt) {
    const domain = await getActiveTabDomain();
    if (domain) {
      state.site = domain;
      const matched = state.profiles.find(
        (p) => p.site.toLowerCase() === domain.toLowerCase()
      );
      if (matched) {
        applyProfileToForm(matched);
      }
    }
  }

  // Register PWA service worker only in non-extension web context
  if (!state.isExt && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

init();
