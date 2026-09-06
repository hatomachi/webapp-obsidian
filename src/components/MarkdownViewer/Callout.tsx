import React from 'react';
import {
  Info,
  CheckSquare,
  Flame,
  AlertCircle,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  HelpCircle,
  Quote,
  Bug,
} from 'lucide-react';
import { CalloutType } from '../../utils/markdownUtils';

interface CalloutProps {
  type: CalloutType;
  title: string;
  children: React.ReactNode;
}

export const Callout: React.FC<CalloutProps> = ({ type, title, children }) => {
  const getCalloutMeta = (t: CalloutType) => {
    switch (t) {
      case 'tip':
      case 'hint':
        return {
          icon: <Flame className="w-4 h-4 text-teal-400 shrink-0" />,
          borderColor: 'border-teal-500/40',
          bgColor: 'bg-teal-950/20',
          titleColor: 'text-teal-300',
        };
      case 'important':
        return {
          icon: <AlertCircle className="w-4 h-4 text-purple-400 shrink-0" />,
          borderColor: 'border-purple-500/40',
          bgColor: 'bg-purple-950/20',
          titleColor: 'text-purple-300',
        };
      case 'warning':
      case 'caution':
      case 'attention':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
          borderColor: 'border-amber-500/40',
          bgColor: 'bg-amber-950/20',
          titleColor: 'text-amber-300',
        };
      case 'failure':
      case 'fail':
      case 'danger':
      case 'error':
        return {
          icon: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
          borderColor: 'border-rose-500/40',
          bgColor: 'bg-rose-950/20',
          titleColor: 'text-rose-300',
        };
      case 'bug':
        return {
          icon: <Bug className="w-4 h-4 text-rose-400 shrink-0" />,
          borderColor: 'border-rose-500/40',
          bgColor: 'bg-rose-950/20',
          titleColor: 'text-rose-300',
        };
      case 'success':
      case 'check':
      case 'done':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          borderColor: 'border-emerald-500/40',
          bgColor: 'bg-emerald-950/20',
          titleColor: 'text-emerald-300',
        };
      case 'question':
      case 'help':
      case 'faq':
        return {
          icon: <HelpCircle className="w-4 h-4 text-sky-400 shrink-0" />,
          borderColor: 'border-sky-500/40',
          bgColor: 'bg-sky-950/20',
          titleColor: 'text-sky-300',
        };
      case 'quote':
      case 'cite':
        return {
          icon: <Quote className="w-4 h-4 text-zinc-400 shrink-0" />,
          borderColor: 'border-zinc-500/40',
          bgColor: 'bg-zinc-900/30',
          titleColor: 'text-zinc-300',
        };
      case 'todo':
        return {
          icon: <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />,
          borderColor: 'border-indigo-500/40',
          bgColor: 'bg-indigo-950/20',
          titleColor: 'text-indigo-300',
        };
      case 'note':
      case 'info':
      default:
        return {
          icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
          borderColor: 'border-blue-500/40',
          bgColor: 'bg-blue-950/20',
          titleColor: 'text-blue-300',
        };
    }
  };

  const meta = getCalloutMeta(type);

  return (
    <div className={`my-3 rounded-lg border-l-4 p-3.5 ${meta.borderColor} ${meta.bgColor} backdrop-blur-sm`}>
      <div className="flex items-center gap-2 font-semibold text-sm mb-1.5 select-none">
        {meta.icon}
        <span className={meta.titleColor}>{title}</span>
      </div>
      <div className="text-sm text-zinc-300 leading-relaxed pl-6 space-y-1.5 [&>p]:m-0">
        {children}
      </div>
    </div>
  );
};
