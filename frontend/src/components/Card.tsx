import React from 'react';
import { PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<{
  title: string;
}>;

export function Card({ title, children }: CardProps) {
  return (
    <section className="mb-4 rounded-2xl border border-slate-300 bg-white/80 p-5 shadow-md backdrop-blur">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
