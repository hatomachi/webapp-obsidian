/**
 * Obsidian AI Adapter
 * 
 * Formats Obsidian Markdown notes, sections, and metadata
 * into rich Markdown context suitable for LLM reasoning and code agents (Claude Code / Copilot CLI).
 */

import { ContextAttachment } from './aiRemoteTypes';

export interface QuickPrompt {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
}

/**
 * Pre-defined quick wall-bounce / inquiry prompts tailored for Obsidian Notes
 */
export const OBSIDIAN_QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'summarize',
    label: '3行要約',
    icon: '📝',
    description: 'このノートの要点・結論をコンパクトに整理',
    prompt: '添付されたObsidianノートを読み込み、要点と結論を3〜5行で端的にまとめてください。\n主なトピック、決定事項、重要なポイントを箇条書きで分かりやすく整理してください。',
  },
  {
    id: 'extract-todos',
    label: 'TODO・課題抽出',
    icon: '❓',
    description: '未完了のタスクや次のアクションをリストアップ',
    prompt: '添付されたノートから、未完了のタスク、次のアクション（Next Actions）、確認待ちの論点や課題を漏れなく抽出してリストアップしてください。必要に応じて優先度や担当者も付記してください。',
  },
  {
    id: 'improve-writing',
    label: '推敲・改善提案',
    icon: '💡',
    description: '文章の論理性・読みやすさの向上と加筆案を提案',
    prompt: 'このノートの構成や表現をレビューし、より明快で説得力のある文章にするための改善提案や加筆案を出してください。\n1. 【文章の推敲案】（表現のブラッシュアップ）\n2. 【構成・論理展開のアドバイス】（見出し構造や足りない視点）\nの2つの観点で整理してください。',
  },
  {
    id: 'brainstorm',
    label: 'アイデア・壁打ち',
    icon: '🔍',
    description: 'ノート内容を深掘りする新たな論点・切り口を提案',
    prompt: 'このノートに書かれている内容を踏まえ、さらに深掘りできる論点、関連する新しいアイデア、あるいは想定される懸念点や反論の切り口を箇条書きで提案してください。',
  },
];

/**
 * Format a timestamp into YYYY-MM-DD HH:mm:ss
 */
function formatFullTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format an active Obsidian Markdown note into a ContextAttachment object
 */
export function formatCurrentNoteToAttachment(params: {
  filePath: string;
  title: string;
  content: string;
  vaultName?: string;
}): ContextAttachment {
  const { filePath, title, content, vaultName = 'Obsidian' } = params;
  const fileName = filePath.split('/').pop() || filePath || 'untitled.md';
  const displayTitle = title || fileName;
  const chars = content.length;
  const lines = content ? content.split('\n').length : 0;
  const timeStr = formatFullTimestamp(Date.now());

  let md = `# Obsidian Note: ${displayTitle}\n\n`;
  md += `- ファイルパス: \`${filePath}\`\n`;
  md += `- Vault: ${vaultName}\n`;
  md += `- 取得日時: ${timeStr}\n`;
  md += `- ノート規模: ${lines}行 (${chars}文字)\n\n`;
  md += `---\n\n`;
  md += content.trim();

  return {
    id: `note_${filePath.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`,
    type: 'current_note',
    title: displayTitle,
    badge: vaultName,
    subtitle: filePath,
    contentMarkdown: md,
  };
}

/**
 * Compose full prompt with attached context attachments injected at the top
 */
export function composeFullPrompt(userPrompt: string, attachments?: ContextAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return userPrompt;
  }

  let prompt = `以下の Obsidian ノート / コンテキスト情報を読み込んで、ユーザーの質問や指示に答えてください。\n\n`;

  for (const att of attachments) {
    prompt += `========================================================\n`;
    prompt += `📎 添付コンテキスト: ${att.title}${att.badge ? ` (${att.badge})` : ''}\n`;
    if (att.subtitle) {
      prompt += `📁 パス: ${att.subtitle}\n`;
    }
    prompt += `========================================================\n`;
    prompt += att.contentMarkdown.trim() + '\n\n';
  }

  prompt += `========================================================\n`;
  prompt += `【ユーザーの指示・質問】\n`;
  prompt += `========================================================\n`;
  prompt += userPrompt;

  return prompt;
}
