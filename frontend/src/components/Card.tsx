import { PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<{
  title: string;
}>;

export function Card({ title, children }: CardProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
