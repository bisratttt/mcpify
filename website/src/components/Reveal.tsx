import { type ReactNode } from 'react';
import { useReveal } from './useReveal';
import styles from './Reveal.module.css';

interface Props {
  children: ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
}

export default function Reveal({ children, delay = 0, className = '' }: Props) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.visible : ''} ${delay ? styles[`delay${delay}`] : ''} ${className}`}
    >
      {children}
    </div>
  );
}
