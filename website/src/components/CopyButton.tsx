import { useState } from 'react';
import styles from './CopyButton.module.css';

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2v2a2 2 0 0 1-2
      2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm2 2H2v8h8v-2H6a2 2 0 0 1-2-2V4zm2-2v8h8V2H8z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06
      0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
  </svg>
);

interface Props {
  text: string;
  className?: string;
}

export default function CopyButton({ text, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={`${styles.btn} ${copied ? styles.copied : ''} ${className}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'copied!' : 'copy'}
    </button>
  );
}
